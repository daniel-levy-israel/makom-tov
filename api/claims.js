const crypto = require('crypto');
const { Pool } = require('pg');

let pool;
function getPool() {
  if (!process.env.DATABASE_URL) return null;
  if (!pool) pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'development' ? undefined : { rejectUnauthorized: false },
    max: 3,
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 5_000
  });
  return pool;
}

function clean(value, max) {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

function validEmail(value) {
  return !value || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function validPhone(value) {
  return !value || /^[+0-9()\-\s]{7,30}$/.test(value);
}

function requestOriginAllowed(req) {
  const origin = req.headers.origin;
  if (!origin) return true;
  try {
    const originHost = new URL(origin).host;
    const requestHost = String(req.headers['x-forwarded-host'] || req.headers.host || '').split(',')[0].trim();
    return originHost === requestHost;
  } catch {
    return false;
  }
}

async function ensureTable(db) {
  await db.query(`
    CREATE TABLE IF NOT EXISTS property_claims (
      id uuid PRIMARY KEY,
      reference text UNIQUE NOT NULL,
      property_id integer NOT NULL,
      property_name text NOT NULL,
      property_town text,
      verification_method text NOT NULL DEFAULT 'manual' CHECK (verification_method IN ('email','phone','manual')),
      verification_destination_mask text,
      verification_code_hash text,
      verification_code_expires_at timestamptz,
      verification_attempts integer NOT NULL DEFAULT 0,
      verified_at timestamptz,
      full_name text NOT NULL,
      relationship text NOT NULL CHECK (relationship IN ('owner','manager','marketing','other')),
      phone text,
      email text,
      note text,
      status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','reviewing','approved','rejected')),
      submitted_at timestamptz NOT NULL DEFAULT now(),
      reviewed_at timestamptz,
      review_note text
    );
    CREATE INDEX IF NOT EXISTS property_claims_status_submitted_idx ON property_claims (status, submitted_at DESC);
    CREATE INDEX IF NOT EXISTS property_claims_property_idx ON property_claims (property_id, submitted_at DESC);
    ALTER TABLE property_claims ADD COLUMN IF NOT EXISTS verification_method text NOT NULL DEFAULT 'manual';
    ALTER TABLE property_claims ADD COLUMN IF NOT EXISTS verification_destination_mask text;
    ALTER TABLE property_claims ADD COLUMN IF NOT EXISTS verification_code_hash text;
    ALTER TABLE property_claims ADD COLUMN IF NOT EXISTS verification_code_expires_at timestamptz;
    ALTER TABLE property_claims ADD COLUMN IF NOT EXISTS verification_attempts integer NOT NULL DEFAULT 0;
    ALTER TABLE property_claims ADD COLUMN IF NOT EXISTS verified_at timestamptz;
  `);
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'method_not_allowed' });
  }
  if (!requestOriginAllowed(req)) return res.status(403).json({ error: 'origin_not_allowed' });
  const body = req.body && typeof req.body === 'object' ? req.body : {};
  if (clean(body.website, 100)) return res.status(200).json({ reference: 'MT-PENDING' });

  const propertyId = Number.parseInt(body.propertyId, 10);
  const fullName = clean(body.fullName, 100);
  const relationship = clean(body.relationship, 20);
  const phone = clean(body.phone, 30);
  const email = clean(body.email, 160).toLowerCase();
  const note = clean(body.note, 600);
  const consent = body.consent === 'on' || body.consent === true;
  if (!Number.isInteger(propertyId) || propertyId < 1 || !fullName || !['owner','manager','marketing','other'].includes(relationship) || !consent) {
    return res.status(400).json({ error: 'invalid_request' });
  }
  if ((!phone && !email) || !validPhone(phone) || !validEmail(email)) return res.status(400).json({ error: 'invalid_contact' });

  const db = getPool();
  if (!db) return res.status(503).json({ error: 'claims_unavailable' });
  try {
    await ensureTable(db);
    const propertyResult = await db.query("SELECT id, name, town, phone, whatsapp, owner_email FROM properties WHERE id = $1 AND status = 'published' LIMIT 1", [propertyId]);
    let property = propertyResult.rows[0];
    if (!property) {
      const staticProperty = require('../properties.json').find((item) => Number(item.id) === propertyId);
      if (!staticProperty) return res.status(404).json({ error: 'property_not_found' });
      const restoredEmail = require('../owner-emails.json').find((entry) => Number(entry.id) === Number(propertyId))?.email || '';
      property = { id: staticProperty.id, name: staticProperty.name, town: staticProperty.town || '', phone: staticProperty.phone || '', whatsapp: staticProperty.whatsapp || '', owner_email: staticProperty.email || restoredEmail };
    }
    const duplicate = await db.query(`
      SELECT reference FROM property_claims
      WHERE property_id = $1 AND status IN ('pending','reviewing')
        AND submitted_at > now() - interval '7 days'
        AND (($2 <> '' AND phone = $2) OR ($3 <> '' AND email = $3))
      LIMIT 1
    `, [propertyId, phone, email]);
    if (duplicate.rowCount) return res.status(409).json({ error: 'duplicate_claim' });

    // Verification is routed only from contact data already held on the catalog record.
    // Self-entered contact details above are callback details and never establish ownership.
    const catalogEmail = clean(property.owner_email, 160).toLowerCase();
    const catalogPhone = clean(property.phone || property.whatsapp, 30);
    const verificationMethod = catalogEmail ? 'email' : catalogPhone ? 'phone' : 'manual';
    const digits = catalogPhone.replace(/\D/g, '');
    const destinationMask = verificationMethod === 'email' ? catalogEmail.replace(/^(.{1,2}).*(@.*)$/, '$1***$2') : verificationMethod === 'phone' && digits.length >= 4 ? `***-${digits.slice(-4)}` : null;
    const id = crypto.randomUUID();
    const reference = `MT-${Date.now().toString(36).toUpperCase()}-${crypto.randomBytes(2).toString('hex').toUpperCase()}`;
    await db.query(`
      INSERT INTO property_claims
        (id, reference, property_id, property_name, property_town, verification_method, verification_destination_mask, full_name, relationship, phone, email, note)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
    `, [id, reference, propertyId, property.name, property.town || '', verificationMethod, destinationMask, fullName, relationship, phone || null, email || null, note || null]);
    res.setHeader('Cache-Control', 'no-store');
    return res.status(201).json({ reference, status: 'pending', verification: { method: verificationMethod, destinationMask, delivery: verificationMethod === 'phone' ? 'pending' : 'manual_review' } });
  } catch (error) {
    console.error('claim_submission_failed', error);
    return res.status(500).json({ error: 'claim_submission_failed' });
  }
};
