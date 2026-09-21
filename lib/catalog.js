const { Pool } = require('pg');

let pool;
let staticCatalog;

function getPool() {
  if (!process.env.DATABASE_URL) return null;
  if (!pool) {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.NODE_ENV === 'development' ? undefined : { rejectUnauthorized: false },
      max: 3,
      idleTimeoutMillis: 10_000,
      connectionTimeoutMillis: 5_000
    });
  }
  return pool;
}

function getStaticCatalog() {
  if (!staticCatalog) {
    staticCatalog = require('../properties.json');
  }
  return staticCatalog;
}

function integer(value, fallback, min, max) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? Math.min(max, Math.max(min, parsed)) : fallback;
}

function text(value, maxLength = 100) {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : '';
}

function parseQuery(query = {}) {
  const amenities = (Array.isArray(query.amenity) ? query.amenity : query.amenity ? [query.amenity] : [])
    .flatMap((item) => String(item).split(','))
    .map((item) => text(item, 80))
    .filter(Boolean)
    .slice(0, 20);

  return {
    q: text(query.q),
    region: text(query.region, 80),
    category: text(query.category, 80),
    town: text(query.town, 80),
    priceMin: integer(query.priceMin, 0, 0, 100000),
    priceMax: integer(query.priceMax, 100000, 0, 100000),
    guests: integer(query.guests, 0, 0, 1000),
    amenities,
    page: integer(query.page, 1, 1, 10000),
    limit: integer(query.limit, 24, 1, 6000)
  };
}

function toApi(row) {
  return {
    id: Number(row.id), name: row.name, town: row.town || '', region: row.region || '',
    category: row.category || '', priceMin: row.price_min ?? 0, priceMax: row.price_max ?? 0,
    units: row.units ?? 0, guests: row.guests ?? 0, lat: row.lat == null ? null : Number(row.lat),
    lng: row.lng == null ? null : Number(row.lng), googleRating: row.google_rating == null ? null : Number(row.google_rating),
    googleReviews: row.google_reviews ?? 0, maps: row.maps || '', website: row.website || '', instagram: row.instagram_url || '',
    book: Boolean(row.book), amenities: row.amenities || [], desc: row.description || '',
    images: row.owner_images || [], phone: row.phone || '', whatsapp: row.whatsapp || ''
  };
}

async function queryDatabase(filters) {
  const values = [];
  const where = ["p.status = 'published'"];
  const bind = (value) => { values.push(value); return `$${values.length}`; };

  if (filters.q) {
    const p = bind(`%${filters.q}%`);
    where.push(`(name ILIKE ${p} OR town ILIKE ${p} OR region ILIKE ${p} OR description ILIKE ${p})`);
  }
  if (filters.region) where.push(`region = ${bind(filters.region)}`);
  if (filters.category) where.push(`category = ${bind(filters.category)}`);
  if (filters.town) where.push(`town = ${bind(filters.town)}`);
  if (filters.priceMin) where.push(`COALESCE(price_max, price_min, 0) >= ${bind(filters.priceMin)}`);
  if (filters.priceMax < 100000) where.push(`COALESCE(price_min, 0) <= ${bind(filters.priceMax)}`);
  if (filters.guests) where.push(`COALESCE(guests, 0) >= ${bind(filters.guests)}`);
  if (filters.amenities.length) where.push(`amenities @> ${bind(filters.amenities)}::jsonb`);

  const whereSql = where.join(' AND ');
  const countValues = values.slice();
  const limit = bind(filters.limit);
  const offset = bind((filters.page - 1) * filters.limit);
  const db = getPool();
  let itemsResult;
  try {
    itemsResult = await db.query(`SELECT p.*, COALESCE((SELECT jsonb_agg('/api/owner-photos/' || op.id ORDER BY op.uploaded_at) FROM property_owner_photos op WHERE op.property_id=p.id AND op.removed_at IS NULL), '[]'::jsonb) AS owner_images FROM properties p WHERE ${whereSql} ORDER BY featured DESC, id ASC LIMIT ${limit} OFFSET ${offset}`, values);
  } catch (error) {
    if (error.code !== '42P01') throw error;
    itemsResult = await db.query(`SELECT p.*, '[]'::jsonb AS owner_images FROM properties p WHERE ${whereSql} ORDER BY featured DESC, id ASC LIMIT ${limit} OFFSET ${offset}`, values);
  }
  const countResult = await db.query(`SELECT count(*)::int AS total FROM properties p WHERE ${whereSql}`, countValues);
  const total = countResult.rows[0].total;
  if (total === 0) return queryStatic(filters);
  return { items: itemsResult.rows.map(toApi), total, source: 'database' };
}

function queryStatic(filters) {
  let rows = getStaticCatalog();
  const q = filters.q.toLocaleLowerCase('he');
  if (q) rows = rows.filter((p) => [p.name, p.town, p.region, p.desc].some((v) => String(v || '').toLocaleLowerCase('he').includes(q)));
  if (filters.region) rows = rows.filter((p) => p.region === filters.region);
  if (filters.category) rows = rows.filter((p) => p.category === filters.category);
  if (filters.town) rows = rows.filter((p) => p.town === filters.town);
  if (filters.priceMin) rows = rows.filter((p) => (p.priceMax || p.priceMin || 0) >= filters.priceMin);
  if (filters.priceMax < 100000) rows = rows.filter((p) => (p.priceMin || 0) <= filters.priceMax);
  if (filters.guests) rows = rows.filter((p) => (p.guests || 0) >= filters.guests);
  if (filters.amenities.length) rows = rows.filter((p) => filters.amenities.every((a) => (p.amenities || []).includes(a)));
  const total = rows.length;
  const start = (filters.page - 1) * filters.limit;
  return { items: rows.slice(start, start + filters.limit).map((item) => ({ ...item, images: [] })), total, source: 'static-fallback' };
}

async function listProperties(rawQuery) {
  const filters = parseQuery(rawQuery);
  const result = getPool() ? await queryDatabase(filters) : queryStatic(filters);
  return { ...result, page: filters.page, limit: filters.limit, pages: Math.ceil(result.total / filters.limit) };
}

async function getProperty(id) {
  const numericId = integer(id, 0, 1, Number.MAX_SAFE_INTEGER);
  if (!numericId) return null;
  const db = getPool();
  if (db) {
    let result;
    try {
      result = await db.query("SELECT p.*, COALESCE((SELECT jsonb_agg('/api/owner-photos/' || op.id ORDER BY op.uploaded_at) FROM property_owner_photos op WHERE op.property_id=p.id AND op.removed_at IS NULL), '[]'::jsonb) AS owner_images FROM properties p WHERE p.id = $1 AND p.status = 'published' LIMIT 1", [numericId]);
    } catch (error) {
      if (error.code !== '42P01') throw error;
      result = await db.query("SELECT p.*, '[]'::jsonb AS owner_images FROM properties p WHERE p.id = $1 AND p.status = 'published' LIMIT 1", [numericId]);
    }
    return result.rows[0] ? toApi(result.rows[0]) : null;
  }
  const item = getStaticCatalog().find((entry) => Number(entry.id) === numericId);
  return item ? { ...item, images: [] } : null;
}

module.exports = { listProperties, getProperty };
