const { put } = require('@vercel/blob');
const crypto = require('node:crypto');
module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' });
  if (!process.env.MIGRATION_SECRET || req.headers.authorization !== `Bearer ${process.env.MIGRATION_SECRET}`) return res.status(401).json({ error: 'unauthorized' });
  const { data, sourceKey } = req.body || {};
  if (!data || !sourceKey) return res.status(400).json({ error: 'missing_payload' });
  const bytes = Buffer.from(data, 'base64');
  if (bytes.length > 500000) return res.status(413).json({ error: 'file_too_large' });
  const filename = `${crypto.createHash('sha256').update(sourceKey).digest('hex').slice(0,32)}.webp`;
  const blob = await put(`catalog/${filename}`, bytes, { access: 'public', contentType: 'image/webp', addRandomSuffix: false });
  res.status(200).json({ url: blob.url });
};
