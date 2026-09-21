const crypto = require('crypto');

function normalize(value) {
  return String(value || '').toLocaleLowerCase('he').normalize('NFKD')
    .replace(/[\u0591-\u05c7]/g, '').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}
function tokens(value) { return new Set(normalize(value).split(/\s+/).filter((x) => x.length > 1)); }
function scoreName(expected, actual) {
  const a = tokens(expected); const b = tokens(actual);
  if (!a.size || !b.size) return 0;
  let shared = 0; a.forEach((x) => { if (b.has(x)) shared += 1; });
  return shared / Math.max(a.size, b.size);
}
function signingSecret() { return process.env.PLACES_PHOTO_SIGNING_SECRET || process.env.GOOGLE_MAPS_API_KEY || ''; }
function signResource(resource) {
  const secret = signingSecret(); if (!secret) throw new Error('places_not_configured');
  const encoded = Buffer.from(resource).toString('base64url');
  const mac = crypto.createHmac('sha256', secret).update(encoded).digest('base64url');
  return `${encoded}.${mac}`;
}
function verifyResource(token) {
  const secret = signingSecret(); const [encoded, mac] = String(token || '').split('.');
  if (!secret || !encoded || !mac) return '';
  const expected = crypto.createHmac('sha256', secret).update(encoded).digest();
  let supplied; try { supplied = Buffer.from(mac, 'base64url'); } catch { return ''; }
  if (supplied.length !== expected.length || !crypto.timingSafeEqual(supplied, expected)) return '';
  const resource = Buffer.from(encoded, 'base64url').toString('utf8');
  return /^places\/[A-Za-z0-9_-]+\/photos\/[A-Za-z0-9_-]+$/.test(resource) ? resource : '';
}
async function searchProperty(property) {
  const key = process.env.GOOGLE_MAPS_API_KEY; if (!key) return null;
  const query = [property.name, property.town, 'ישראל'].filter(Boolean).join(' ');
  const response = await fetch('https://places.googleapis.com/v1/places:searchText', {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': key,
      'X-Goog-FieldMask': 'places.id,places.displayName,places.formattedAddress,places.googleMapsUri,places.photos' },
    body: JSON.stringify({ textQuery: query, languageCode: 'he', regionCode: 'IL', pageSize: 5 })
  });
  if (!response.ok) throw new Error(`places_search_${response.status}`);
  const places = (await response.json()).places || [];
  const town = normalize(property.town); const expected = property.name;
  const candidates = places.map((place) => ({ place, nameScore: scoreName(expected, place.displayName?.text), townMatch: !town || normalize(place.formattedAddress).includes(town) }))
    .filter((x) => x.nameScore >= 0.75 && x.townMatch && x.place.photos?.length)
    .sort((a, b) => b.nameScore - a.nameScore);
  if (!candidates.length || (candidates[1] && candidates[0].nameScore === candidates[1].nameScore)) return null;
  return candidates[0].place;
}
module.exports = { searchProperty, signResource, verifyResource };
