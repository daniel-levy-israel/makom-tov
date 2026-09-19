const crypto = require('node:crypto');
const { Pool } = require('pg');
const { put } = require('@vercel/blob');
const sharp = require('sharp');
const catalog = require('../../properties.json');

const sourceUrls = [...new Set(catalog.flatMap((property) => property.images || []).filter(Boolean))];
let pool;
function database() {
  if (!pool) pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 4 });
  return pool;
}
async function convertAndStore(sourceUrl) {
  const response = await fetch(sourceUrl, { signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw new Error(`source_${response.status}`);
  const source = Buffer.from(await response.arrayBuffer());
  const image = await sharp(source, { failOn: 'none' }).rotate().resize({ width: 720, height: 720, fit: 'inside', withoutEnlargement: true }).webp({ quality: 68 }).toBuffer();
  const filename = crypto.createHash('sha256').update(sourceUrl).digest('hex').slice(0, 32);
  const blob = await put(`catalog/${filename}.webp`, image, { access: 'public', contentType: 'image/webp', addRandomSuffix: false, allowOverwrite: true });
  return { url: blob.url, bytes: image.length };
}
async function worker(items, db) {
  while (items.length) {
    const sourceUrl = items.shift();
    try {
      const result = await convertAndStore(sourceUrl);
      await db.query(`INSERT INTO image_migrations (source_url, blob_url, byte_size, status, migrated_at)
        VALUES ($1,$2,$3,'done',now()) ON CONFLICT (source_url) DO UPDATE SET blob_url=excluded.blob_url,byte_size=excluded.byte_size,status='done',error=NULL,migrated_at=now()`, [sourceUrl, result.url, result.bytes]);
    } catch (error) {
      await db.query(`INSERT INTO image_migrations (source_url,status,error,attempts)
        VALUES ($1,'failed',$2,1) ON CONFLICT (source_url) DO UPDATE SET status='failed',error=excluded.error,attempts=image_migrations.attempts+1`, [sourceUrl, String(error.message).slice(0, 200)]);
    }
  }
}
module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' });
  if (!process.env.MIGRATION_SECRET || req.headers.authorization !== `Bearer ${process.env.MIGRATION_SECRET}`) return res.status(401).json({ error: 'unauthorized' });
  const db = database();
  await db.query(`CREATE TABLE IF NOT EXISTS image_migrations (
    source_url text PRIMARY KEY, blob_url text, byte_size integer, status text NOT NULL DEFAULT 'pending',
    error text, attempts integer NOT NULL DEFAULT 0, migrated_at timestamptz, updated_at timestamptz NOT NULL DEFAULT now())`);
  const records = new Map((await db.query("SELECT source_url,status,attempts FROM image_migrations")).rows.map((row) => [row.source_url, row]));
  const limit = Math.min(250, Math.max(1, Number(req.query.limit) || 160));
  const pending = sourceUrls.filter((url) => { const row = records.get(url); return !row || (row.status === 'failed' && row.attempts < 3); }).slice(0, limit);
  const queue = pending.slice();
  await Promise.all(Array.from({ length: Math.min(12, queue.length) }, () => worker(queue, db)));
  const counts = (await db.query("SELECT status,count(*)::int AS count,coalesce(sum(byte_size),0)::bigint AS bytes FROM image_migrations GROUP BY status")).rows;
  const completed = counts.find((row) => row.status === 'done')?.count || 0;
  const errors = (await db.query("SELECT error,count(*)::int AS count FROM image_migrations WHERE status='failed' GROUP BY error ORDER BY count DESC LIMIT 10")).rows;
  return res.status(200).json({ total: sourceUrls.length, processed: pending.length, completed, remaining: sourceUrls.length - completed, counts, errors });
};
module.exports.config = { maxDuration: 60 };
