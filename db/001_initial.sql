-- Up Migration
CREATE TABLE categories (id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, name text NOT NULL UNIQUE);
CREATE TABLE cities (id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, name text NOT NULL UNIQUE);
CREATE TABLE listings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_name text NOT NULL DEFAULT '',
  description text NOT NULL DEFAULT '',
  asking_price numeric(18,0) CHECK (asking_price >= 0),
  whatsapp text NOT NULL DEFAULT '',
  address text NOT NULL DEFAULT '',
  category_id bigint REFERENCES categories(id) ON DELETE RESTRICT,
  city_id bigint REFERENCES cities(id) ON DELETE RESTRICT,
  revenue_amount numeric(18,0) CHECK (revenue_amount >= 0),
  revenue_period text NOT NULL DEFAULT '', revenue_meaning text NOT NULL DEFAULT '',
  profit_amount numeric(18,0) CHECK (profit_amount >= 0),
  profit_period text NOT NULL DEFAULT '', profit_meaning text NOT NULL DEFAULT '',
  updated_at timestamptz NOT NULL DEFAULT now(),
  published boolean NOT NULL DEFAULT false,
  price_includes text NOT NULL DEFAULT '',
  price_excludes text NOT NULL DEFAULT ''
);
CREATE INDEX listings_category_idx ON listings(category_id);
CREATE INDEX listings_city_idx ON listings(city_id);
CREATE TABLE listing_photos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id uuid NOT NULL REFERENCES listings(id) ON DELETE RESTRICT,
  object_key uuid NOT NULL UNIQUE,
  content_type text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX listing_photos_listing_idx ON listing_photos(listing_id);
CREATE TABLE pending_photo_deletions (
  photo_id uuid PRIMARY KEY,
  object_key uuid NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  next_attempt_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX pending_photo_deletions_created_idx ON pending_photo_deletions(created_at, photo_id);
CREATE INDEX pending_photo_deletions_retry_idx ON pending_photo_deletions(next_attempt_at, photo_id);
