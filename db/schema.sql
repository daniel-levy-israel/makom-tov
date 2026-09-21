CREATE TABLE IF NOT EXISTS properties (
  id integer PRIMARY KEY,
  name text NOT NULL,
  town text,
  region text,
  category text,
  price_min integer CHECK (price_min IS NULL OR price_min >= 0),
  price_max integer CHECK (price_max IS NULL OR price_max >= 0),
  units integer CHECK (units IS NULL OR units >= 0),
  guests integer CHECK (guests IS NULL OR guests >= 0),
  lat double precision,
  lng double precision,
  google_rating numeric(2,1),
  google_reviews integer,
  maps text,
  website text,
  instagram_url text,
  book boolean NOT NULL DEFAULT false,
  amenities jsonb NOT NULL DEFAULT '[]'::jsonb,
  description text,
  phone text,
  whatsapp text,
  owner_email text,
  status text NOT NULL DEFAULT 'published' CHECK (status IN ('draft', 'published', 'archived')),
  featured boolean NOT NULL DEFAULT false,
  source_updated_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS properties_status_id_idx ON properties (status, id);
CREATE INDEX IF NOT EXISTS properties_region_idx ON properties (region) WHERE status = 'published';
CREATE INDEX IF NOT EXISTS properties_category_idx ON properties (category) WHERE status = 'published';
CREATE INDEX IF NOT EXISTS properties_town_idx ON properties (town) WHERE status = 'published';
CREATE INDEX IF NOT EXISTS properties_price_min_idx ON properties (price_min) WHERE status = 'published';
CREATE INDEX IF NOT EXISTS properties_amenities_gin_idx ON properties USING gin (amenities);
CREATE INDEX IF NOT EXISTS properties_search_idx ON properties USING gin (
  to_tsvector('simple', coalesce(name, '') || ' ' || coalesce(town, '') || ' ' || coalesce(region, '') || ' ' || coalesce(description, ''))
);

-- Owner-claim verification delivery and audit state.
CREATE TABLE IF NOT EXISTS property_claims (
  id uuid PRIMARY KEY,
  reference text UNIQUE NOT NULL,
  property_id integer NOT NULL,
  property_name text NOT NULL,
  property_town text,
  verification_method text NOT NULL DEFAULT 'manual' CHECK (verification_method IN ('email','phone','manual')),
  verification_destination_mask text,
  verification_destination text,
  verification_last_sent_at timestamptz,
  verification_delivery_status text,
  verification_code_hash text,
  verification_code_expires_at timestamptz,
  verification_attempts integer NOT NULL DEFAULT 0,
  verified_at timestamptz,
  full_name text NOT NULL,
  relationship text NOT NULL CHECK (relationship IN ('owner','manager','marketing','other')),
  phone text,
  email text,
  note text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','reviewing','approved','rejected')),
  submitted_at timestamptz NOT NULL DEFAULT now(),
  reviewed_at timestamptz,
  review_note text
);
CREATE INDEX IF NOT EXISTS property_claims_status_submitted_idx ON property_claims (status, submitted_at DESC);
CREATE INDEX IF NOT EXISTS property_claims_property_idx ON property_claims (property_id, submitted_at DESC);
ALTER TABLE IF EXISTS property_claims ADD COLUMN IF NOT EXISTS verification_destination text;
ALTER TABLE IF EXISTS property_claims ADD COLUMN IF NOT EXISTS verification_last_sent_at timestamptz;
ALTER TABLE IF EXISTS property_claims ADD COLUMN IF NOT EXISTS verification_delivery_status text;
CREATE TABLE IF NOT EXISTS property_claim_verification_audit (
  id bigserial PRIMARY KEY,
  claim_id uuid NOT NULL REFERENCES property_claims(id) ON DELETE CASCADE,
  event text NOT NULL,
  detail text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS property_claim_verification_audit_claim_idx
  ON property_claim_verification_audit (claim_id, created_at DESC);

-- Licensed owner-supplied photos. Binary storage is intentionally separate from the catalog JSON;
-- every row retains who uploaded it and the exact rights grant they accepted.
CREATE TABLE IF NOT EXISTS property_owner_photos (
  id uuid PRIMARY KEY,
  property_id integer NOT NULL,
  claim_id uuid NOT NULL REFERENCES property_claims(id) ON DELETE RESTRICT,
  mime_type text NOT NULL CHECK (mime_type IN ('image/jpeg','image/png','image/webp')),
  byte_size integer NOT NULL CHECK (byte_size > 0 AND byte_size <= 2500000),
  content bytea NOT NULL,
  alt_text text,
  uploader_name text NOT NULL,
  uploader_relationship text NOT NULL,
  rights_grant_version text NOT NULL,
  source_type text NOT NULL DEFAULT 'owner_upload' CHECK (source_type = 'owner_upload'),
  uploaded_at timestamptz NOT NULL DEFAULT now(),
  removed_at timestamptz
);
CREATE INDEX IF NOT EXISTS property_owner_photos_property_idx ON property_owner_photos(property_id, uploaded_at) WHERE removed_at IS NULL;
ALTER TABLE IF EXISTS property_claims ADD COLUMN IF NOT EXISTS owner_access_token_hash text;
ALTER TABLE IF EXISTS property_claims ADD COLUMN IF NOT EXISTS owner_access_granted_at timestamptz;
