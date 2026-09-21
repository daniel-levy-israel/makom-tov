const crypto = require('crypto'); const { Pool } = require('pg'); let pool;
function db() { if (!process.env.DATABASE_URL) return null; if (!pool) pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: process.env.NODE_ENV === 'development' ? undefined : { rejectUnauthorized: false }, max: 3 }); return pool; }
function hash(v) { return crypto.createHash('sha256').update(String(v || '')).digest('hex'); }
function clean(v, n) { return typeof v === 'string' ? v.trim().slice(0, n) : ''; }
function sameOrigin(req) { const o=req.headers.origin;if(!o)return true;try{return new URL(o).host===String(req.headers['x-forwarded-host']||req.headers.host||'').split(',')[0].trim();}catch{return false;} }
module.exports = async function handler(req,res) {
  if (!['GET','POST'].includes(req.method)) { res.setHeader('Allow','GET, POST'); return res.status(405).json({error:'method_not_allowed'}); }
  if (!sameOrigin(req)) return res.status(403).json({error:'origin_not_allowed'});
  const reference=clean(req.method==='GET'?req.query.reference:req.body?.reference,40), token=clean(req.method==='GET'?req.query.token:req.body?.token,200);
  if (!/^MT-[A-Z0-9-]+$/.test(reference)||token.length<24) return res.status(401).json({error:'access_denied'});
  const database=db(); if(!database)return res.status(503).json({error:'uploads_unavailable'});
  const claimResult=await database.query(`SELECT id,property_id,property_name,full_name,relationship,status,owner_access_token_hash FROM property_claims WHERE reference=$1 LIMIT 1`,[reference]);
  const claim=claimResult.rows[0];
  if(!claim||claim.status!=='approved'||!claim.owner_access_token_hash||!crypto.timingSafeEqual(Buffer.from(hash(token)),Buffer.from(claim.owner_access_token_hash))) return res.status(401).json({error:'access_denied'});
  if(req.method==='GET') { const rows=await database.query(`SELECT id,alt_text,mime_type,byte_size,uploaded_at FROM property_owner_photos WHERE claim_id=$1 AND removed_at IS NULL ORDER BY uploaded_at`,[claim.id]); res.setHeader('Cache-Control','private, no-store'); return res.json({property:{id:claim.property_id,name:claim.property_name},items:rows.rows}); }
  const dataUrl=clean(req.body?.dataUrl,3500000), alt=clean(req.body?.altText,180), grant=req.body?.rightsGrant===true;
  const match=/^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl);
  if(!grant||!match)return res.status(400).json({error:'invalid_upload'}); const content=Buffer.from(match[2],'base64');
  if(!content.length||content.length>2500000)return res.status(413).json({error:'file_too_large'});
  const id=crypto.randomUUID(); await database.query(`INSERT INTO property_owner_photos(id,property_id,claim_id,mime_type,byte_size,content,alt_text,uploader_name,uploader_relationship,rights_grant_version) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,'owner-display-v1-2026-09-20')`,[id,claim.property_id,claim.id,match[1],content.length,content,alt||null,claim.full_name,claim.relationship]);
  return res.status(201).json({id,status:'stored_with_provenance'});
};
