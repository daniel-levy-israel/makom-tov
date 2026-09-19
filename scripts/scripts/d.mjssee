import fs from 'node:fs/promises';
import pg from 'pg';

if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');
const rows = JSON.parse(await fs.readFile(new URL('../properties.json', import.meta.url), 'utf8'));
const client = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await client.connect();
try {
  for (let start = 0; start < rows.length; start += 100) {
    await client.query('BEGIN');
    try {
      for (const p of rows.slice(start, start + 100)) {
        await client.query(`INSERT INTO properties
          (id,name,town,region,category,price_min,price_max,units,guests,lat,lng,google_rating,google_reviews,maps,website,book,amenities,description,images,phone,whatsapp,source_updated_at)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17::jsonb,$18,$19::jsonb,$20,$21,now())
          ON CONFLICT (id) DO UPDATE SET
          name=excluded.name,town=excluded.town,region=excluded.region,category=excluded.category,
          price_min=excluded.price_min,price_max=excluded.price_max,units=excluded.units,guests=excluded.guests,
          lat=excluded.lat,lng=excluded.lng,google_rating=excluded.google_rating,google_reviews=excluded.google_reviews,
          maps=excluded.maps,website=excluded.website,book=excluded.book,amenities=excluded.amenities,
          description=excluded.description,images=excluded.images,phone=excluded.phone,whatsapp=excluded.whatsapp,
          source_updated_at=now(),updated_at=now()`,
          [p.id,p.name,p.town,p.region,p.category,p.priceMin,p.priceMax,p.units,p.guests,p.lat,p.lng,p.googleRating,p.googleReviews,p.maps,p.website,p.book,JSON.stringify(p.amenities||[]),p.desc,JSON.stringify(p.images||[]),p.phone,p.whatsapp]);
      }
      await client.query('COMMIT');
      console.log(`Imported ${Math.min(start + 100, rows.length)} / ${rows.length}`);
    } catch (error) { await client.query('ROLLBACK'); throw error; }
  }
} finally { await client.end(); }
