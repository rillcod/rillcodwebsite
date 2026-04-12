HARMONISED MIGRATIONS — REMOTE SYNC (read this after pulling this repo)
================================================================================

WHAT CHANGED
-----------
All incremental shard SQL files that used to live in `supabase/migrations/` were
merged into ONE file (kept in active migrations):

  supabase/migrations/20260412000000_harmonised_consolidated_increments.sql

The original shards are preserved here for audit/history only. Supabase CLI does
NOT execute this folder.

ACTIVE MIGRATIONS (what `supabase db push` / `db reset` uses)
-------------------------------------------------------------
  1) 00000000000000_complete_schema.sql          — baseline dump
  2) 20260412000000_harmonised_consolidated_increments.sql — all former shards in order


IF YOUR REMOTE ALREADY RAN THE OLD SHARD FILENAMES
--------------------------------------------------
Supabase stores one row per migration version in `supabase_migrations.schema_migrations`.
If production has entries like `20260317000000_registration_history` but this repo no
longer ships those files, the CLI will report migration history drift.

Options (pick what matches your situation):

A) Remote already has all objects (you ran shards + SQL in Dashboard)
   - Prefer: `npx supabase db pull` to generate a NEW migration that matches reality,
     then reconcile with this harmonised file (may need manual merge).
   - Or use `npx supabase migration repair` to mark removed versions reverted, then
     `db push` only if the consolidated file has not been applied yet.

B) Brand-new database / you can reset
   - `npx supabase db reset` (local) applies baseline + harmonised cleanly.

C) Editor-only changes not in git
   - Add them at the END of `20260412000000_harmonised_consolidated_increments.sql`
     (or create a new dated migration after it) so repo stays the single source of truth.


REGENERATE TypeScript types (harmonise `src/types/supabase.ts`)
---------------------------------------------------------------
  Local stack running:
    npm run supabase:start
    npm run db:types:local

  Linked to hosted project (after `supabase link` + login):
    npm run db:types:linked

  Or one-off with project ref:
    npx supabase gen types typescript --project-id <YOUR_REF> > src/types/supabase.ts


DOCS
----
https://supabase.com/docs/reference/cli/supabase-migration-repair
https://supabase.com/docs/reference/cli/supabase-gen-types-typescript
