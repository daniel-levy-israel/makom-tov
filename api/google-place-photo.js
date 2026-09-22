const { getProperty } = require('../lib/catalog');
const { searchProperty, signResource } = require('../lib/google-places');
module.exports = async function handler(req, res) {
  if (req.method !== 'GET') { res.setHeader('Allow', 'GET'); return res.status(405).json({ error: 'method_not_allowed' }); }
  if (!process.env.GOOGLE_MAPS_API_KEY) return res.status(404).json({ error: 'photo_not_configured' });
  try {
    const property = await getProperty(req.query.id); if (!property) return res.status(404).json({ error: 'property_not_found' });
    const place = await searchProperty(property); if (!place) return res.status(404).json({ error: 'safe_match_not_found' });
    const photo = place.photos.find((item) => item.googleMapsUri) || place.photos[0];
    if (!photo.googleMapsUri) return res.status(404).json({ error: 'photo_source_unavailable' });
    const authors = (photo.authorAttributions || []).map((a) => ({ name: a.displayName || '', uri: a.uri || '', photoUri: a.photoUri || '' }));
    res.setHeader('Cache-Control', 'private, no-store');
    return res.status(200).json({ imageUrl: `/api/google-place-photo-media?token=${encodeURIComponent(signResource(photo.name))}`, sourceUrl: photo.googleMapsUri, authors, provider: 'Google Maps' });
  } catch (error) { console.error('google_place_photo_failed', error); return res.status(502).json({ error: 'photo_lookup_failed' }); }
};
