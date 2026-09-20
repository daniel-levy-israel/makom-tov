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
  images jsonb NOT NULL DEFAULT '[]'::jsonb,
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
