# Weekly teaching content — how it is written, shared and corrected

Read this before changing anything under `src/app/api/lesson-plans/[id]/generate-*`
or the migrations `20260929000041`–`20260929000047`.

It exists because every rule below was learned by breaking something, and none
of them are guessable from the code alone.

---

## The shape in one paragraph

A curriculum release is written once. Many classes adopt it. Each class needs
five things per week — a **lesson**, its **slides**, its **flashcards**, an
**assignment** and a **project**. The first class to reach a week generates
them with AI. Every class after that **copies** what already exists. The lesson
and assignment bodies stay **linked** to the first copy, so correcting the
original corrects every class. Slides and decks cannot be linked that way, so
they are **marked stale** and rebuilt instead.

---

## The five rules

### 1. Never write copy logic in a route

All copying goes through `reuseWeekContent()` in `content-reuse-server.ts`.
The pure decision rules live next door in `content-reuse.ts`.

`content-reuse-central.test.ts` **fails the build** if a route calls
`buildCopy`, `decideReuse` or `canBeCopied` itself, or if one of the five
generators stops trying to reuse.

This guard exists because the rules started inline in `generate-lessons`, and
generalising them turned up two bugs that had already shipped in that one copy.
Pasted into four routes first, both would have been fixed once and left wrong
three times — which is what happened to model queues (6 files), auto-generate
settings (4), cron cadence (5) and the file-kind check (3).

### 2. A copy takes its identity from the TARGET, never the source

Every content table carries `school_id`, a term column, `course_id`,
`created_by` and the `academic_offering_id` / `offering_period_id` pair.
`buildCopy` only repoints the plan and the class. Everything else **must** be
passed in `scope`.

This shipped wrong: copied lessons wore **another school's** id and name.
Nothing looked wrong on the page that made them — the teacher sees their own
class either way. It is school filters, RLS, reports and the offering spine
that see the wrong row.

> The offering pair matters especially for special programmes, which run **two
> active classes on separate offerings**. A copy carrying the source's offering
> lands in a programme that never taught it.

The tables disagree on names — `lessons` uses `academic_term_id`, the others
use `term_id` — so `IDENTITY_COLUMNS` maps them per table. A new table added to
`ReuseTable` without an entry there fails the build.

### 3. Filter before you limit

Assignments and projects share the `assignments` table. Match filters are
applied **before** `.order()` and `.limit()`. Applied after, the twenty
candidates are chosen first and narrowed second — so a project could be copied
over homework whenever a week held both.

### 4. `is_customized` means "hands off", in both directions

A row a teacher edited is:
- never used as a **source** for another class, and
- never **overwritten** by a correction to the master, and
- never **marked stale**.

One school's rewrite must not leak to the others, and must not be silently
reverted in front of a class that has already been taught it.

### 5. Reuse may make a week cheaper. It may never break one.

Every failure path in `reuseWeekContent` returns `{ copied: false, reason }`
and the caller generates exactly as before. Keep it that way.

> This is also how a real bug hid for a while: decks and slides were failing to
> copy because `buildCopy` wrote lock columns those tables do not have, and the
> failure fell back to generating. Safe, but the saving was never being made.
> **If reuse is silently never happening, check the `reason`** — it is returned,
> not thrown.

---

## What propagates, and what does not

| | Copied | Correction propagates | Rebuilt when the lesson changes |
|---|---|---|---|
| Lesson | ✅ | ✅ `shared_master_id` | — |
| Assignment | ✅ | ✅ `shared_master_id` | — |
| Project | ✅ | ✅ (same table) | — |
| Slides | ✅ | ❌ | ✅ `content_stale_at` |
| Flashcards | ✅ | ❌ | ✅ `content_stale_at` |

**Why slides and decks are different.** A lesson's body is columns on its own
row, so a trigger can push a correction down. A deck's body is its child
`flashcard_cards` rows; a slide deck's is R2 objects each class owns copies of.
Neither can be updated by writing a column, so they are flagged and rebuilt on
the next sweep — a copy from the master for every class after the first, not an
AI call each.

**Slides get their own storage objects, deliberately.** Sharing keys would mean
one school regenerating (which deletes the old files) silently blanks the slides
of every school that copied from it, leaving a row that still looks healthy.
`r2Copy` duplicates them server-side; the AI call — the expensive part — is
still skipped.

---

## Things that will bite you

- **`flashcard_decks` and `lesson_materials` have no lock columns.** They are
  frozen through the lesson they belong to. `UNSUPPORTED_COLUMNS` strips the
  lock fields for them; writing a column a table lacks rejects the whole insert.
- **Regenerate the Supabase types after a migration**, or the next person casts
  around a column that is really there. `npm run db:types:linked` — it writes
  `src/types/supabase.ts`. Confirm the new columns actually appear in the output
  before committing it; a truncated response is worse than a stale file.
  (The casts left in the generators are for `reuseWeekContent`'s structural
  `db` parameter, not for missing columns.)
- **"Already exists" is not "still correct".** A generator that skips on
  existence alone will skip stale content forever. Check `content_stale_at`.
- **Uniqueness is enforced by indexes, not by app checks.** `20260929000030`
  records where app-side checks end: `maybeSingle()` errors on more than one
  row, the error read as "nothing there", and one class reached four copies of
  its Week 1 lesson.
- **`schema_migrations` is not evidence.** `20260929000024` was absent from it
  *and* absent from the database; `20260929000041` was absent from it and fully
  present. An unapplied migration does not fail — it is simply missing, and
  every later file that assumed it carries on assuming. **Ask the schema, not
  the history.**

  A full audit was run on 2026-08-07 — every object every migration declares,
  checked against the live database. Result: **one real gap**, `...024`, since
  restored by `...045`. Everything else that looked missing was superseded on
  purpose (`guard_class_qa_control` by `...030`, `duration_offering_needs_its_owner`
  by `...029`, `ensure_class_term_teaching_plan` by `...003`, the accountability
  matview indexes by `...011`–`...014`) or a temp helper dropped by its own
  migration (`_rill_rebind_fk`). History was then backfilled: 102 versions
  against 102 files.

  If you re-run that audit, expect two false positives: quoted schema names
  (`"public"."x"`) and indexes on materialised views, which `pg_indexes` does
  not list — query `pg_class`/`pg_index` for those.

---

## Verifying a change end to end

Reasoning about triggers is not enough — the `metadata` column that
`20260929000046` assumed did not exist, and only running it showed that. Wrap a
scenario in a `DO $$ ... $$` block, assert with `raise exception`, and let the
exception roll it back so nothing persists.
