# Supabase — consolidated schema

The 231 incremental migration files that used to live in `migrations/` have been
squashed into a single baseline:

```
migrations/00000000000000_baseline_schema.sql
```

It was reconstructed from the **live** database catalogs of project
`akaorqukdoawacvxsdij` (not by concatenating the old files), so it reflects the
database as it actually is — including any change ever made by hand in the SQL
Editor that never made it into a migration.

The old files remain in git history if you ever need to read one:

```bash
git log --diff-filter=D --name-only -- supabase/migrations/
git show <commit>^:supabase/migrations/<file>.sql
```

## Verification status

The baseline has been checked two independent ways:

1. **Content** — parsed back and diffed against the live catalogs. All 2373 columns
   (type + NOT NULL), all 467 RLS policy predicates *verbatim*, 964 defaults, 929
   constraints, 120 function signatures, 769 grants. Zero missing, zero fabricated.
2. **Executability** — the whole file was replayed into a throwaway schema on the
   remote inside a transaction that rolled back. **All 4278 statements executed
   cleanly.** Nothing was left behind and `public` was untouched.

That replay caught three real ordering/keyword bugs that content checks alone
could not see. If you regenerate this file, replay it again before trusting it.

## What the baseline contains

Schema only — **no data**. Verified object-for-object against the live database:

| Object | Count |
|---|---|
| Tables | 192 |
| Columns | 2373 |
| Views / materialized views | 3 / 1 |
| Functions | 120 |
| RLS policies | 467 |
| Tables with RLS enabled | 190 of 192 |
| Triggers | 95 |
| Indexes | 487 |
| Constraints (PK/unique/check) | 470 |
| Foreign keys | 459 |
| Table grants / function grants | 769 / 576 |
| Realtime publication tables | 3 |

The `auth`, `storage`, and `realtime` schemas are managed by Supabase and are
deliberately excluded — they were never in the migrations either.

The counts above are the snapshot as generated. Since then, migration
`20260927000001` enabled RLS on the last two tables (`email_events` and
`dismissed_duplicate_pairs`), so **all 192 tables now have RLS enabled**, and
`20260927000003` added 102 indexes.

Neither of those two tables has policies, which is deliberate: with RLS on and no
policy, Postgres denies `anon`/`authenticated` by default while `service_role`
still bypasses RLS. Every caller of both uses the service-role client.

## Two deliberate ordering rules

If you edit or regenerate this file, these are easy to break and the failure only
shows up when replaying onto an empty database:

1. **Four functions must follow the `TABLES` section** — `claim_whatsapp_outbox`,
   `decide_student_transfer_request`, `staff_can_access_assignment` and
   `upsert_enrollment_term_grade` take or return a table's row type. That is part
   of the function *signature*, so `check_function_bodies = false` does not help;
   the table must already exist. They live in their own section after the tables.
2. **`ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin` is omitted.** The
   `postgres` role that `supabase db push` connects as is not a member of
   `supabase_admin`, so those statements fail with "permission denied to change
   default privileges". Supabase provisions them on every project. The omitted
   lines are listed as comments in the DEFAULT PRIVILEGES section.

Comments also use the correct keyword per relation kind (`COMMENT ON VIEW` for
views, not `COMMENT ON TABLE`) — Postgres rejects the wrong one.

## Migration history — already repaired

The remote used to list all 231 old versions, which would have made
`supabase db push` report drift. That was collapsed on 2026-07-27: the old rows
were copied to `supabase_migrations.schema_migrations_backup_squash` (231 rows,
still there if ever needed) and replaced with the single `00000000000000` row.

`REPAIR_MIGRATION_HISTORY.sql` is kept for reference only — **do not run it
again**, it would wipe the history of the migrations applied since.

Current state, local and remote in agreement:

```
00000000000000  baseline_schema
20260927000001  enable_rls_email_events
20260927000002  pin_function_search_path
20260927000003  index_foreign_keys
```

## Day-to-day from here

New changes go in a new dated migration as usual:

```bash
npx supabase migration new my_change
npx supabase db push
```

Do not edit the baseline to make a schema change — it is a snapshot, not a
changelog.

## Regenerating types

`src/types/supabase.ts` is generated from the live schema:

```bash
npm run db:types:linked
```

Note the checked-in file uses CRLF line endings; the CLI emits LF, so convert
before committing or the diff will show all 14k lines as changed.

## Other files here

- `functions/` — Supabase Edge Functions (`paystack-webhook`)
- `diagnostics/` — ad-hoc read-only check queries, not migrations
- `seed_parent.sql` — seed data helper
