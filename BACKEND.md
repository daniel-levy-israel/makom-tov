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

The legacy catalog image field and all imported third-party image URLs have been removed. Run `db/remove_legacy_competitor_images.sql` once against an existing database before activation. New environments never create or seed that field.

## Licensed photo sources

The catalog contains no legacy/hotlinked image URLs. Public images come from two licensed routes:

1. `property_owner_photos`: approved owners upload JPEG/PNG/WebP images after claim approval. Each row records the claim, uploader, relationship, rights-grant version, timestamp and source type.
2. Google Places fallback: when a property has no owner photo and `GOOGLE_MAPS_API_KEY` is configured, `/api/google-place-photo?id=...` performs a strict name + town match and returns an on-demand, signed, no-store photo URL with the individual Google Maps source link and author attribution.

Required production variables:

- `GOOGLE_MAPS_API_KEY`: Places API (New), restricted to the production project and API.
- `PLACES_PHOTO_SIGNING_SECRET`: long random secret used to sign short photo-resource routes. Do not reuse the API key in production.
- `OWNER_ADMIN_TOKEN`: long random bearer token for approving an already-verified owner claim and issuing its upload link.

After deployment, run `npm run db:migrate` once against the production `DATABASE_URL`. The migration is idempotent. Google fallback remains off until its key is configured; this is deliberate to prevent accidental billing.
