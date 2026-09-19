const { listProperties } = require('../lib/catalog');

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'method_not_allowed' });
  }
  try {
    const result = await listProperties(req.query);
    res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=3600');
    return res.status(200).json(result);
  } catch (error) {
    console.error('properties_list_failed', error);
    return res.status(500).json({ error: 'catalog_unavailable' });
  }
};
