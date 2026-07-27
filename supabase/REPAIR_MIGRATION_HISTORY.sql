-- ============================================================================
-- REPAIR MIGRATION HISTORY AFTER SQUASH
-- ============================================================================
-- Run this ONCE in the Supabase Dashboard SQL Editor for project
-- akaorqukdoawacvxsdij, AFTER the 231 incremental migrations have been
-- replaced by the single baseline file:
--
--     supabase/migrations/00000000000000_baseline_schema.sql
--
-- WHY THIS IS NEEDED
-- ------------------
-- Supabase records one row per applied migration in
-- `supabase_migrations.schema_migrations`. The remote database still lists all
-- 231 old versions. Once those files no longer exist locally, `supabase db push`
-- reports migration history drift and refuses to run.
--
-- This script collapses that history to a single row matching the new baseline,
-- so local files and remote history agree again.
--
-- IMPORTANT: this ONLY rewrites migration bookkeeping. It does not touch a
-- single table, column, policy, or row of your actual data.
-- ============================================================================

BEGIN;

-- 1. Keep a full copy of the old history, in case you ever need to audit it.
--    Safe to re-run: the CREATE is guarded, so an existing backup is preserved.
CREATE TABLE IF NOT EXISTS supabase_migrations.schema_migrations_backup_squash
    AS SELECT * FROM supabase_migrations.schema_migrations;

-- 2. Replace the 231 incremental rows with one baseline row.
DELETE FROM supabase_migrations.schema_migrations;

INSERT INTO supabase_migrations.schema_migrations (version, name)
VALUES ('00000000000000', 'baseline_schema');

COMMIT;

-- ============================================================================
-- VERIFY — should return exactly one row: 00000000000000 | baseline_schema
-- ============================================================================
-- SELECT version, name FROM supabase_migrations.schema_migrations ORDER BY version;
--
-- And confirm the backup captured the old history (expect 231):
-- SELECT count(*) FROM supabase_migrations.schema_migrations_backup_squash;
--
-- Then locally, this should report no pending migrations and no drift:
--   npx supabase migration list --linked
-- ============================================================================
