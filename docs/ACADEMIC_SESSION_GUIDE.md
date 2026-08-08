# The academic session — how it works, how it broke, how to fix it

Read this before publishing a curriculum, before rolling classes into a new
term, or if anything on the platform is showing the wrong school year.

Written in August 2026, after a curriculum was published under the wrong
session and it took a new tool to undo. Everything here was learned from that.

---

## The one idea you have to hold

The platform is always thinking about **two different school years at once**,
and almost every problem in this area comes from mixing them up.

| | What it means | Example in August 2026 |
|---|---|---|
| **The live session** | The term running right now, worked out from today's date | Third Term 2025/2026 (it ended 5 August) |
| **The session you are preparing for** | The term you are writing curriculum and lesson plans for | First Term 2026/2027 (starts 1 September) |

In the middle of a term these are the same thing, so nothing goes wrong. In the
holidays they are different, and that is exactly when you sit down to prepare
next term. **That is the trap.**

A session is always a **pair**: the year *and* the term. "First Term" on its
own means nothing. "First Term 2025/2026" and "First Term 2026/2027" are a
whole year apart and are never interchangeable.

---

## What actually went wrong

The Rollout screen has a box labelled "Academic session". It used to be
**read-only**. It filled itself in from the platform setting, which said
`2025/2026` — the live session.

So in August 2026, someone preparing First Term for the coming year was shown
**First Term 2025/2026**: a term that had ended eight months earlier. There was
no way to change it. They published.

That one value then spread on its own:

- 2 curriculum editions stamped with the wrong year
- **58 school adoptions** — every partner school
- **56 classes**
- **49 teaching plans**
- every lesson, flashcard deck and assignment generated underneath them
- assignments landed with **due dates in May 2026**, months in the past

None of this was a careless mistake. The screen offered one answer and no way
to disagree with it.

And there was **nowhere to correct it**. Settings could say what the current
year was, but nothing could reach work already filed under the wrong one. The
only options left were hand-written database commands or living with it.

---

## What was fixed

### 1. You can now choose the session when you publish

The box on **Academic Office → 2 · Rollout** is now a dropdown. It still
defaults to the platform year, so nothing changes for normal use during term.
When you are preparing for the year ahead, you pick it.

### 2. There is now one place to correct a session everywhere

**Settings → Academic Rules → Calendar & Settings → "Correct an Academic
Session"** (admin only).

Choose the term to move work **off**, and the term to move it **on to**. Press
**"Check what would change"** — it shows exact numbers and writes nothing.
If it looks right, press **"Apply the correction"**.

There is a terminal version for operators, driven by the same code so the two
can never disagree:

```bash
npx tsx scripts/correct-academic-session.ts --list
npx tsx scripts/correct-academic-session.ts --from "Third Term 2025/2026" --to "First Term 2026/2027"
npx tsx scripts/correct-academic-session.ts --from "Third Term 2025/2026" --to "First Term 2026/2027" --apply
```

Without `--apply` it only reports.

### 3. Re-publishing a withdrawn curriculum now reaches schools

Explained below under "Withdrawing a curriculum".

---

## What the correction moves, and what it never touches

This is the most important rule in the whole feature.

**Preparation moves.** These describe teaching that has not happened yet, so
re-stamping them changes a plan, not a record:

- school adoptions of a curriculum
- which term a class is sitting in
- teaching plans (their term, their dates, the session shown at the top)
- the lessons, flashcard decks and assignments generated from those plans
- class rosters — **copied** forward, not moved

**History never moves.** These are the record of what was actually taught and
marked. Rewriting them would destroy the evidence behind reports already sent
to parents:

- student progress reports
- attendance
- class sessions
- timetables

This is not a rule someone has to remember. The correction tool physically
cannot reach those tables.

### Two details worth knowing

**Withdrawn learners stay withdrawn.** Only *active* roster rows are carried
into the new term. Someone taken off a class does not quietly reappear.

**Work already handed in stays put.** An assignment with a submission against
it keeps its term, even though the plan above it moves. A submission is a
record, not a plan.

---

## How to publish a curriculum for next session

You must be signed in as an **admin**. The whole Academic Office menu is
admin-only — if you cannot see it, that is why.

1. **Academic Office → 2 · Rollout**
2. Pick the curriculum
3. **Academic session** — set it to the year you are preparing for, not
   necessarily the one showing by default
4. **Effective term** — First, Second or Third
5. Check quality, then publish

Publishing also distributes. There is no separate "send to schools" step.

### Get the session right the first time

If you publish under the wrong session, the classes will not find the
curriculum, because a class only matches an adoption for **its own** school
year. The correction tool exists for when this happens, but it is much less
work to pick the right year up front.

---

## Withdrawing a curriculum (and putting it back)

Withdrawing an edition **pauses every school's adoption of it**. That is fine
in itself. The problem was what happened next.

Re-publishing appeared to work — a new edition was created and the screen said
so — but the rollout then **skipped every school**, because it read "paused" as
*"this school switched off automatic updates"*. No school had switched anything
off. The platform had paused them, on their behalf, during the withdrawal.

The result: 29 schools, every Teen Developers class with no curriculum, and the
one remedy the error messages pointed at could not fix it.

Now only a school's **own** setting (`auto_update`) can make publishing skip
it. A paused adoption is resumed by a new publication, which is what publishing
a replacement means. An unresolved conflict still blocks, as it should.

---

## Rules the database will enforce on you

You will hit these. They are deliberate, and none of them are bugs.

### A published curriculum edition can never be edited

Not its title, not its session, not its term. An edition is the exact thing
schools agreed to adopt, so changing it would rewrite what they agreed to.

**This means the session correction tool cannot relabel an edition.** If a
title still says the old year, the fix is to publish a **new edition** through
Curriculum Governance. Only the wording is stale — teaching is resolved from
adoptions, and those do get corrected.

### A plan cannot move to a new term while its curriculum is withdrawn

A class cannot walk into a new term following curriculum the Academic Office
has taken away. The correction tool checks this **before** it starts, and
reports those plans instead of trying to move them.

It learned this the hard way: on the first real run, 40 plans moved and 9 were
rejected part-way, leaving those 9 classes sitting in a different term from
their own teaching plans.

### A progress report cannot belong to a term that has not started

You can write up a term that has finished. You cannot record marks for one that
has not begun.

---

## Writing up a term after it has ended

You can. Reports follow the **calendar**, not the curriculum, and the session
correction never touches them.

One thing to know: once the calendar rolls over on 1 September, a Third Term
report is a *past* session. The report builder now keeps the session you chose
instead of quietly refiling it into the new year. Before this fix, Third Term
reports written in September would have silently landed in First Term of the
next session.

---

## If something still looks wrong

Start here, in this order:

1. **What term is the class in?** A class only sees curriculum adopted for its
   own school year and term.
2. **Is the school's adoption `active`?** Paused or conflicted adoptions
   resolve to nothing.
3. **Is the curriculum edition `published`?** A retired edition gives every
   class beneath it no direction at all.
4. **Do the class and its teaching plan agree on the term?** If not, run the
   correction tool — it can finish a job that was only half applied.

---

## Where the code lives

| Purpose | File |
|---|---|
| The decisions (pure, tested) | `src/lib/academic/session-rollover.ts` |
| Reading and writing the database | `src/lib/academic/session-rollover-server.ts` |
| Admin endpoint | `src/app/api/settings/academic-session/rollover/route.ts` |
| The screen | `src/app/dashboard/settings/panel.tsx` → Academic Rules |
| Terminal version | `scripts/correct-academic-session.ts` |
| Session identity helpers | `src/lib/reports/academic-period.ts` |
| Publishing a curriculum | `src/app/api/curriculum-studio/official-directions/route.ts` |
| Rollout screen | `src/app/dashboard/academic/rollout/page.tsx` |

`academic_terms` is the single source of truth for every year-and-term pair.
Nothing should invent its own.

Related: [`src/lib/academic/README.md`](../src/lib/academic/README.md) for how
weekly teaching content is generated, shared and corrected.
