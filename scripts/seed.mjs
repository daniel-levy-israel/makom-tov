import fs from 'node:fs/promises';
import pg from 'pg';
if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');
const rows = JSON.parse(await fs.readFile(new URL('../properties.json', import.meta.url), 'utf8'));
const instagram = JSON.parse(await fs.readFile(new URL('../instagram.json', import.meta.url), 'utf8'));
const ownerEmails = Object.fromEntries(JSON.parse(await fs.readFile(new URL('../owner-emails.json', import.meta.url), 'utf8')).map((entry) => [String(entry.id), entry.email]));
const client = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await client.connect();
try {
  for (let start = 0; start < rows.length; start += 100) {
    await client.query('BEGIN');
    try {
      for (const p of rows.slice(start, start + 100)) {
        await client.query(`INSERT INTO properties
          (id,name,town,region,category,price_min,price_max,units,guests,lat,lng,google_rating,google_reviews,maps,website,instagram_url,book,amenities,description,images,phone,whatsapp,owner_email,source_updated_at)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18::jsonb,$19,$20::jsonb,$21,$22,$23,now())
          ON CONFLICT (id) DO UPDATE SET name=excluded.name,town=excluded.town,region=excluded.region,category=excluded.category,
          price_min=excluded.price_min,price_max=excluded.price_max,units=excluded.units,guests=excluded.guests,
          lat=excluded.lat,lng=excluded.lng,google_rating=excluded.google_rating,google_reviews=excluded.google_reviews,
          maps=excluded.maps,website=excluded.website,instagram_url=excluded.instagram_url,book=excluded.book,amenities=excluded.amenities,
          description=excluded.description,images=excluded.images,phone=excluded.phone,whatsapp=excluded.whatsapp,owner_email=excluded.owner_email,
          source_updated_at=now(),updated_at=now()`,
          [p.id,p.name,p.town,p.region,p.category,p.priceMin,p.priceMax,p.units,p.guests,p.lat,p.lng,p.googleRating,p.googleReviews,p.maps,p.website,p.instagram || instagram[p.id] || null,p.book,JSON.stringify(p.amenities||[]),p.desc,JSON.stringify(p.images||[]),p.phone,p.whatsapp,p.email || ownerEmails[String(p.id)] || null]);
      }
      await client.query('COMMIT');
      console.log(`Imported ${Math.min(start + 100, rows.length)} / ${rows.length}`);
    } catch (error) { await client.query('ROLLBACK'); throw error; }
  }
} finally { await client.end(); }
