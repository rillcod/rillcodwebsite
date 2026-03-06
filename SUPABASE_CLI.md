# Supabase CLI — Migration Guide

## Why this exists
The remote DB host (`db.akaorqukdoawacvxsdij.supabase.co`) only resolves to an **IPv6 address**.
This machine has no IPv6 routing, so direct `psql` connections and the `postgres` npm package both fail.
The **Supabase CLI** (`npx supabase`) uses the **connection pooler** (IPv4) and works fine.

---

## One-time setup (already done — skip if `supabase/config.toml` exists)

```bash
npx supabase init --force
npx supabase link --project-ref akaorqukdoawacvxsdij --password "rillcod12345."
```

This creates `supabase/config.toml` and saves the project link locally.

---

## Apply pending migrations

```bash
echo "Y" | npx supabase db push --password "rillcod12345." --include-all
```

- `--include-all` picks up migrations not yet recorded in the remote history table
- `echo "Y"` auto-confirms the prompt
- Safe to re-run — already-applied migrations are skipped with NOTICE

### Check sync status (no changes made)

```bash
echo "Y" | npx supabase db push --password "rillcod12345." --include-all
# Outputs: "Remote database is up to date." if all migrations are applied
```

---

## Regenerate TypeScript types

Run this after any schema change so `src/types/supabase.ts` stays accurate:

```bash
npx supabase gen types typescript --project-id akaorqukdoawacvxsdij > src/types/supabase.ts
```

---

## Writing idempotent migrations

All migration files must be safe to re-run. Common patterns:

```sql
-- Tables
CREATE TABLE IF NOT EXISTS public.my_table (...);

-- Columns
ALTER TABLE public.my_table ADD COLUMN IF NOT EXISTS my_col text;

-- Constraints (ADD CONSTRAINT IF NOT EXISTS is NOT valid PostgreSQL)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'my_constraint_name'
  ) THEN
    ALTER TABLE public.my_table ADD CONSTRAINT my_constraint_name UNIQUE (col);
  END IF;
END $$;

-- Policies (CREATE POLICY has no IF NOT EXISTS)
DROP POLICY IF EXISTS "My policy" ON public.my_table;
CREATE POLICY "My policy" ON public.my_table ...;

-- Functions / Views
CREATE OR REPLACE FUNCTION ...
CREATE OR REPLACE VIEW ...
```

---

## Project reference

| Key | Value |
|-----|-------|
| Project ref | `akaorqukdoawacvxsdij` |
| Supabase URL | `https://akaorqukdoawacvxsdij.supabase.co` |
| DB password | `rillcod12345.` |
| Dashboard | https://supabase.com/dashboard/project/akaorqukdoawacvxsdij |
