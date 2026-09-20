const crypto = require('crypto');
const { Pool } = require('pg');
let pool;
function getPool() {
  if (!process.env.DATABASE_URL) return null;
  if (!pool) pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: process.env.NODE_ENV === 'development' ? undefined : { rejectUnauthorized: false }, max: 3 });
  return pool;
}
function clean(value, max) { return typeof value === 'string' ? value.trim().slice(0, max) : ''; }
function sameOrigin(req) {
  const origin = req.headers.origin;
  if (!origin) return true;
  try { return new URL(origin).host === String(req.headers['x-forwarded-host'] || req.headers.host || '').split(',')[0].trim(); } catch { return false; }
}
function safeEqual(a, b) {
  const left = Buffer.from(a || ''); const right = Buffer.from(b || '');
  return left.length === right.length && crypto.timingSafeEqual(left, right);
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
    const result = await client.query('SELECT id, status, verification_code_hash, verification_code_expires_at, verification_attempts FROM property_claims WHERE reference=$1 FOR UPDATE', [reference]);
    const claim = result.rows[0];
    if (!claim || !claim.verification_code_hash || !claim.verification_code_expires_at) { await client.query('ROLLBACK'); return res.status(409).json({ error: 'code_not_issued' }); }
    if (claim.status === 'approved') { await client.query('ROLLBACK'); return res.status(200).json({ status: 'verified' }); }
    if (claim.verification_attempts >= 5 || new Date(claim.verification_code_expires_at) < new Date()) { await client.query('ROLLBACK'); return res.status(410).json({ error: 'code_expired' }); }
    const hash = crypto.createHash('sha256').update(`${reference}:${code}:${process.env.CLAIM_CODE_SECRET || ''}`).digest('hex');
    if (!safeEqual(hash, claim.verification_code_hash)) {
      await client.query('UPDATE property_claims SET verification_attempts=verification_attempts+1 WHERE id=$1', [claim.id]); await client.query('COMMIT');
      return res.status(401).json({ error: 'invalid_code' });
    }
    // Verification succeeds, but editor access is intentionally a separate grant not implemented here.
    await client.query("UPDATE property_claims SET status='reviewing', verified_at=now(), verification_code_hash=NULL WHERE id=$1", [claim.id]);
    await client.query('COMMIT');
    return res.status(200).json({ status: 'verified_pending_access' });
  } catch (error) { await client.query('ROLLBACK'); console.error('claim_verification_failed', error); return res.status(500).json({ error: 'verification_failed' }); }
  finally { client.release(); }
};
