BEGIN;
LOCK TABLE listings IN ACCESS EXCLUSIVE MODE;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM listings WHERE published) THEN
    RAISE EXCEPTION 'Unpublish existing listings before adding required price details';
  END IF;
END $$;
ALTER TABLE listings ADD COLUMN price_includes text NOT NULL DEFAULT '';
ALTER TABLE listings ADD COLUMN price_excludes text NOT NULL DEFAULT '';
COMMIT;
