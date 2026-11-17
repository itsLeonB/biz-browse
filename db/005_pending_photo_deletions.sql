CREATE TABLE pending_photo_deletions (
  photo_id uuid PRIMARY KEY,
  object_key uuid NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX pending_photo_deletions_created_idx ON pending_photo_deletions(created_at, photo_id);
