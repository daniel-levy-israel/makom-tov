const { Pool } = require('pg');
let pool;
function getPool() {
  if (!process.env.DATABASE_URL) return null;
  if (!pool) pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: process.env.NODE_ENV === 'development' ? undefined : { rejectUnauthorized: false }, max: 3, connectionTimeoutMillis: 5000 });
  return pool;
}
function clean(value, max = 100) { return typeof value === 'string' ? value.trim().slice(0, max) : ''; }
function maskPhone(value) {
  const digits = clean(value, 30).replace(/\D/g, '');
  return digits.length >= 4 ? `***-${digits.slice(-4)}` : '';
}
function item(row) {
  const storedPhone = row.phone || row.whatsapp || '';
  const phoneMask = maskPhone(storedPhone);
  // Email is intentionally future-ready. The current catalog schema contains no owner email field.
  const emailMask = row.owner_email_mask || '';
  const method = emailMask ? 'email' : phoneMask ? 'phone' : 'manual';
  return {
    id: Number(row.id), name: row.name, town: row.town || '', region: row.region || '', category: row.category || '',
    verification: { method, phoneMask: method === 'phone' ? phoneMask : '', emailMask: method === 'email' ? emailMask : '' }
  };
}
module.exports = async function handler(req, res) {
  if (req.method !== 'GET') { res.setHeader('Allow', 'GET'); return res.status(405).json({ error: 'method_not_allowed' }); }
  const q = clean(req.query.q).toLocaleLowerCase('he');
  if (q.length < 2) return res.status(400).json({ error: 'query_too_short' });
  try {
    const db = getPool();
    let rows;
    if (db) {
      const result = await db.query(`SELECT id,name,town,region,category,phone,whatsapp FROM properties WHERE status='published' AND (name ILIKE $1 OR town ILIKE $1 OR region ILIKE $1) ORDER BY featured DESC,id ASC LIMIT 12`, [`%${q}%`]);
      rows = result.rows;
      if (!rows.length) rows = require('../properties.json').filter((p) => [p.name,p.town,p.region].some((v) => String(v || '').toLocaleLowerCase('he').includes(q))).slice(0,12);
    } else {
      rows = require('../properties.json').filter((p) => [p.name,p.town,p.region].some((v) => String(v || '').toLocaleLowerCase('he').includes(q))).slice(0,12);
    }
    res.setHeader('Cache-Control', 'private, no-store');
    return res.status(200).json({ items: rows.map(item) });
  } catch (error) {
    console.error('owner_property_search_failed', error);
    return res.status(500).json({ error: 'search_unavailable' });
  }
};
