-- ─────────────────────────────────────────────────────────────────────────────
-- Assignment program scoping
--
-- Problem this fixes:
--   1. Cross-program leak — assignments with no course_id skipped the only program
--      gate, so they showed to every student regardless of programme/track.
--   2. Admin assignments tagged to a programme (e.g. AI Engineering) were hidden
--      from students who were enrolled in a flagship programme by default rather
--      than their real online/bootcamp track.
--
-- This migration makes "programme" a first-class, explicit scope on assignments,
-- backfills it from the course→programme relationship, and (conservatively)
-- re-points online/summer students who were defaulted into a flagship programme
-- onto the programme that matches their chosen track.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Explicit programme scope (authoritative cohort tag).
ALTER TABLE assignments
  ADD COLUMN IF NOT EXISTS program_id uuid REFERENCES programs(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_assignments_program_id ON assignments(program_id);

-- 2. Backfill program_id from the course's programme so existing rows keep working.
UPDATE assignments a
SET    program_id = c.program_id
FROM   courses c
WHERE  a.course_id = c.id
  AND  a.program_id IS NULL
  AND  c.program_id IS NOT NULL;

-- 3. Conservative enrolment repair for online / summer-school students.
--    These learners are auto-enrolled into a flagship programme (Teen Developer /
--    Young Innovator) at onboarding time, which hid programme-tagged bootcamp
--    assignments from them. Re-point them onto the programme that matches the
--    track they actually signed up for (students.course_interest), and only when:
--      - the student is an online/summer enrolment,
--      - they currently sit on a flagship programme (so we never clobber a
--        deliberately-set programme), and
--      - a programme whose name matches their course_interest exists.
WITH online_students AS (
  SELECT e.id              AS enrollment_id,
         e.user_id         AS user_id,
         s.course_interest AS course_interest
  FROM   enrollments e
  JOIN   portal_users pu ON pu.id = e.user_id
  JOIN   programs cur     ON cur.id = e.program_id
  LEFT   JOIN students s   ON s.user_id = pu.id
  WHERE  pu.enrollment_type IN ('summer_school', 'online', 'online_school', 'bootcamp')
    AND  lower(cur.name) ~ '(teen developer|young innovator)'
    -- The programme enrolment is only a DEFAULT — an admin can override it. Never
    -- clobber a deliberate choice: skip any learner who ALREADY holds a
    -- non-flagship (i.e. admin-set / real-track) enrolment. We only repair the
    -- untouched flagship default.
    AND  NOT EXISTS (
           SELECT 1
           FROM   enrollments e2
           JOIN   programs p2 ON p2.id = e2.program_id
           WHERE  e2.user_id = e.user_id
             AND  lower(p2.name) !~ '(teen developer|young innovator)'
         )
),
matched AS (
  -- Match course_interest to a programme in BOTH directions, because the chosen
  -- track is often a shorthand of the full programme name (e.g. course_interest
  -- "AI Engineering" → programme "AI Engineering & Automation") or vice versa.
  -- When several programmes match, prefer the longest (most specific) name so a
  -- short interest can't be captured by an unrelated shorter programme.
  SELECT DISTINCT ON (os.enrollment_id)
         os.enrollment_id,
         p.id AS target_program_id
  FROM   online_students os
  JOIN   programs p
    ON   p.is_active IS NOT FALSE
   AND   os.course_interest IS NOT NULL
   AND   length(trim(os.course_interest)) >= 4
   AND   ( lower(os.course_interest) LIKE '%' || lower(p.name) || '%'
        OR lower(p.name)             LIKE '%' || lower(trim(os.course_interest)) || '%' )
  ORDER  BY os.enrollment_id, length(p.name) DESC
)
UPDATE enrollments e
SET    program_id = m.target_program_id
FROM   matched m
WHERE  e.id = m.enrollment_id
  AND  e.program_id IS DISTINCT FROM m.target_program_id;
