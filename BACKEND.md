# Catalog backend

The existing Hebrew RTL interface stays unchanged. Its catalogue now loads through `/api/properties`; if an environment has not been connected to Postgres yet, the API reads `properties.json`. The browser retains a direct JSON fallback so the current V1 remains usable during a failed API deployment.

## Runtime

- `GET /api/properties` returns paginated published properties.
- Filters: `q`, `region`, `category`, `town`, `priceMin`, `priceMax`, `guests`, repeated/comma-separated `amenity`, `page`, `limit`.
- `GET /api/properties/:id` returns one published property.
- Responses use a short shared CDN cache. Only GET is allowed.
- When `DATABASE_URL` exists, API reads Postgres. Without it, it uses the committed catalogue as a zero-setup migration fallback.

## Database setup

Use a free-tier serverless Postgres project (Neon is the recommended default because the app is already on Vercel). Add its pooled connection string to Vercel as `DATABASE_URL`, then run:

```bash
npm install
DATABASE_URL='postgresql://…' npm run db:migrate
DATABASE_URL='postgresql://…' npm run db:seed
```

`db/schema.sql` is idempotent. The importer upserts in transactions of 100 records, so it can safely be rerun when the catalogue changes.

No image is copied or proxied by this work. Existing third-party image URLs are preserved pending the product decision on owner consent and replacement images.
