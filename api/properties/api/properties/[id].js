const { getProperty } = require('../../lib/catalog');

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'method_not_allowed' });
  }
  try {
    const property = await getProperty(req.query.id);
    if (!property) return res.status(404).json({ error: 'property_not_found' });
    res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=3600');
    return res.status(200).json({ property });
  } catch (error) {
    console.error('property_read_failed', error);
    return res.status(500).json({ error: 'catalog_unavailable' });
  }
};
