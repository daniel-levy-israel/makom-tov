const { Pool } = require('pg');
const otp019 = require('../../lib/otp019');
let pool;
function getPool() {
  if (!process.env.DATABASE_URL) return null;
  if (!pool) pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: process.env.NODE_ENV === 'development' ? undefined : { rejectUnauthorized: false }, max: 3 });
  return pool;
}
function clean(value, max) { return typeof value === 'string' ? value.trim().slice(0, max) : ''; }
function sameOrigin(req) {
  const origin = req.headers.origin; if (!origin) return true;
  try { return new URL(origin).host === String(req.headers['x-forwarded-host'] || req.headers.host || '').split(',')[0].trim(); } catch { return false; }
}
async function audit(client, claimId, event, detail) {
  await client.query('INSERT INTO property_claim_verification_audit (claim_id,event,detail) VALUES ($1,$2,$3)', [claimId, event, detail || null]);
}
module.exports = async function handler(req, res) {
  if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return res.status(405).json({ error: 'method_not_allowed' }); }
  if (!sameOrigin(req)) return res.status(403).json({ error: 'origin_not_allowed' });
  const reference = clean(req.body?.reference, 40); const code = clean(req.body?.code, 12);
  if (!/^MT-[A-Z0-9-]+$/.test(reference) || !/^\d{6}$/.test(code)) return res.status(400).json({ error: 'invalid_request' });
  const db = getPool(); if (!db) return res.status(503).json({ error: 'verification_unavailable' });
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const result = await client.query(`SELECT id,status,verification_method,verification_destination,verification_code_expires_at,verification_attempts
      FROM property_claims WHERE reference=$1 FOR UPDATE`, [reference]);
    const claim = result.rows[0];
    if (!claim || claim.verification_method !== 'phone' || !claim.verification_destination || !claim.verification_code_expires_at) {
      await client.query('ROLLBACK'); return res.status(409).json({ error: 'code_not_issued' });
    }
    if (claim.verified_at || claim.status === 'approved') { await client.query('ROLLBACK'); return res.status(200).json({ status: 'verified_pending_access' }); }
    if (claim.verification_attempts >= 5 || new Date(claim.verification_code_expires_at) < new Date()) {
      await audit(client, claim.id, 'verify_blocked', 'expired_or_attempt_limit'); await client.query('COMMIT');
      return res.status(410).json({ error: 'code_expired' });
    }
    try { await otp019.validateOtp(claim.verification_destination, code); }
    catch (error) {
      await client.query('UPDATE property_claims SET verification_attempts=verification_attempts+1 WHERE id=$1', [claim.id]);
      await audit(client, claim.id, 'verify_failed', error.code || 'provider_rejected'); await client.query('COMMIT');
      return res.status(error.code === 'not_configured' ? 503 : 401).json({ error: error.code === 'not_configured' ? 'verification_unavailable' : 'invalid_code' });
    }
    await client.query("UPDATE property_claims SET status='reviewing', verified_at=now(), verification_delivery_status='verified' WHERE id=$1", [claim.id]);
    await audit(client, claim.id, 'verified', 'sms019'); await client.query('COMMIT');
    return res.status(200).json({ status: 'verified_pending_access' });
  } catch (error) { await client.query('ROLLBACK'); console.error('claim_verification_failed', error); return res.status(500).json({ error: 'verification_failed' }); }
  finally { client.release(); }
};
