const { Pool } = require('pg');
const otp019 = require('../../lib/otp019');
let pool;
function dbPool() { if (!process.env.DATABASE_URL) return null; if (!pool) pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: process.env.NODE_ENV === 'development' ? undefined : { rejectUnauthorized: false }, max: 3 }); return pool; }
function clean(v,m){ return typeof v === 'string' ? v.trim().slice(0,m) : ''; }
function sameOrigin(req){ const o=req.headers.origin;if(!o)return true;try{return new URL(o).host===String(req.headers['x-forwarded-host']||req.headers.host||'').split(',')[0].trim();}catch{return false;} }
module.exports = async function handler(req,res){
  if(req.method!=='POST'){res.setHeader('Allow','POST');return res.status(405).json({error:'method_not_allowed'});} if(!sameOrigin(req))return res.status(403).json({error:'origin_not_allowed'});
  const reference=clean(req.body?.reference,40);if(!/^MT-[A-Z0-9-]+$/.test(reference))return res.status(400).json({error:'invalid_request'});
  const db=dbPool();if(!db)return res.status(503).json({error:'verification_unavailable'});const client=await db.connect();
  try{await client.query('BEGIN');const r=await client.query(`SELECT id,verification_method,verification_destination,verification_last_sent_at,verified_at FROM property_claims WHERE reference=$1 FOR UPDATE`,[reference]);const c=r.rows[0];
    if(!c||c.verification_method!=='phone'||!c.verification_destination||c.verified_at){await client.query('ROLLBACK');return res.status(409).json({error:'resend_not_available'});}
    if(c.verification_last_sent_at&&Date.now()-new Date(c.verification_last_sent_at).getTime()<60000){await client.query('ROLLBACK');return res.status(429).json({error:'resend_cooldown'});}
    await otp019.sendOtp(c.verification_destination);await client.query(`UPDATE property_claims SET verification_last_sent_at=now(),verification_code_expires_at=now()+interval '5 minutes',verification_attempts=0,verification_delivery_status='sent' WHERE id=$1`,[c.id]);
    await client.query("INSERT INTO property_claim_verification_audit(claim_id,event,detail) VALUES($1,'resent','sms019')",[c.id]);await client.query('COMMIT');return res.status(200).json({status:'sent'});
  }catch(e){await client.query('ROLLBACK');console.error('claim_resend_failed',e);return res.status(e.code==='not_configured'?503:502).json({error:e.code==='not_configured'?'verification_unavailable':'delivery_failed'});}finally{client.release();}
};
