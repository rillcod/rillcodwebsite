-- Make bulk-register archive cleanup AUTOMATIC at the database level: whenever a
-- portal_users row is deleted (by any path — app, bulk delete, SQL, auth cascade),
-- the matching registration_results history rows (keyed by email) are removed and
-- any batch left empty is pruned, with counts kept accurate. This guarantees the
-- archive always reflects live students without relying on application code.
CREATE OR REPLACE FUNCTION purge_registration_archive_on_user_delete()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  affected text[];
BEGIN
  IF OLD.email IS NULL THEN
    RETURN OLD;
  END IF;

  SELECT array_agg(DISTINCT batch_id::text)
    INTO affected
    FROM registration_results
   WHERE lower(email) = lower(OLD.email);

  DELETE FROM registration_results
   WHERE lower(email) = lower(OLD.email);

  IF affected IS NOT NULL THEN
    -- prune batches that are now empty
    DELETE FROM registration_batches b
     WHERE b.id::text = ANY(affected)
       AND NOT EXISTS (SELECT 1 FROM registration_results r WHERE r.batch_id = b.id);
    -- keep counts accurate on the rest
    UPDATE registration_batches b
       SET student_count = (SELECT count(*) FROM registration_results r WHERE r.batch_id = b.id)
     WHERE b.id::text = ANY(affected);
  END IF;

  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_purge_registration_archive ON portal_users;
CREATE TRIGGER trg_purge_registration_archive
  BEFORE DELETE ON portal_users
  FOR EACH ROW
  EXECUTE FUNCTION purge_registration_archive_on_user_delete();
