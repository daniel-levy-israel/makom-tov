-- Permanently remove the legacy catalog image field and all third-party URLs
-- stored in it. Owner uploads live in property_owner_photos; Google Places
-- media is fetched by its own gated integration.
BEGIN;
ALTER TABLE properties DROP COLUMN IF EXISTS images;
COMMIT;
