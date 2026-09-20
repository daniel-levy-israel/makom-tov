const { verifyResource } = require('../lib/google-places');
module.exports = async function handler(req, res) {
  if (req.method !== 'GET') { res.setHeader('Allow', 'GET'); return res.status(405).end(); }
  const resource = verifyResource(req.query.token); if (!resource) return res.status(400).end();
  try {
    const url = `https://places.googleapis.com/v1/${resource}/media?maxWidthPx=1200&maxHeightPx=900&skipHttpRedirect=true&key=${encodeURIComponent(process.env.GOOGLE_MAPS_API_KEY)}`;
    const response = await fetch(url); if (!response.ok) return res.status(response.status).end();
    const data = await response.json(); if (!/^https:\/\/[^\s]+$/.test(data.photoUri || '')) return res.status(502).end();
    res.setHeader('Cache-Control', 'private, no-store'); return res.redirect(302, data.photoUri);
  } catch (error) { console.error('google_place_photo_media_failed', error); return res.status(502).end(); }
};
