ALTER TABLE pending_photo_deletions ADD COLUMN next_attempt_at timestamptz NOT NULL DEFAULT now();
CREATE INDEX pending_photo_deletions_retry_idx ON pending_photo_deletions(next_attempt_at, photo_id);
