-- ─────────────────────────────────────────────────────────────────────────────
-- Diagnostics for assignment program scoping (migration 20260501000061)
--
-- Read-only. Run these BEFORE applying the migration to understand the blast
-- radius, and AFTER to confirm the fix. None of these statements mutate data.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. BUG 1 — untagged assignments that previously leaked to every student.
--    Pre-migration: program_id does not exist yet, so check course_id only.
--    Post-migration: rows still untagged after backfill (no programme AND no course)
--    are the ones now hidden from learners unless metadata->>'visibility' = 'all'.
SELECT count(*) AS untagged_assignments
FROM   assignments
WHERE  course_id IS NULL;        -- pre-migration form

-- Post-migration variant (run after the migration is applied):
-- SELECT count(*) AS still_untagged
-- FROM   assignments
-- WHERE  program_id IS NULL AND course_id IS NULL;

-- List them so you can decide which (if any) should be flagged platform-wide.
SELECT id, title, created_by, created_at,
       metadata->>'visibility' AS visibility
FROM   assignments
WHERE  course_id IS NULL
ORDER  BY created_at DESC
LIMIT  50;


-- 2. BUG 2 — online/summer students sitting on a flagship programme instead of
--    their real track. These are the learners whose programme-tagged assignments
--    were hidden. (This is exactly the set the migration's step 3 re-points.)
SELECT pu.email,
       pu.full_name,
       pu.enrollment_type,
       cur.name             AS enrolled_program,
       s.course_interest    AS chosen_track
FROM   enrollments e
JOIN   portal_users pu ON pu.id = e.user_id
JOIN   programs cur     ON cur.id = e.program_id
LEFT   JOIN students s   ON s.user_id = pu.id
WHERE  pu.enrollment_type IN ('summer_school', 'online', 'online_school', 'bootcamp')
  AND  lower(cur.name) ~ '(teen developer|young innovator)'
ORDER  BY pu.full_name;


-- 3. Preview of what migration step 3 WILL re-point (dry run of the same join).
--    Empty result = course_interest values don't textually match any programme
--    name, so review your programme names vs. students.course_interest.
WITH online_students AS (
  SELECT e.id AS enrollment_id, s.course_interest, pu.email
  FROM   enrollments e
  JOIN   portal_users pu ON pu.id = e.user_id
  JOIN   programs cur     ON cur.id = e.program_id
  LEFT   JOIN students s   ON s.user_id = pu.id
  WHERE  pu.enrollment_type IN ('summer_school', 'online', 'online_school', 'bootcamp')
    AND  lower(cur.name) ~ '(teen developer|young innovator)'
)
SELECT DISTINCT ON (os.email)
       os.email, os.course_interest, p.name AS would_move_to
FROM   online_students os
JOIN   programs p
  ON   p.is_active IS NOT FALSE
 AND   os.course_interest IS NOT NULL
 AND   length(trim(os.course_interest)) >= 4
 AND   ( lower(os.course_interest) LIKE '%' || lower(p.name) || '%'
      OR lower(p.name)             LIKE '%' || lower(trim(os.course_interest)) || '%' )
ORDER  BY os.email, length(p.name) DESC;


-- 4. Sanity: which programmes exist, and how many assignments / courses each has.
SELECT p.name,
       p.is_active,
       count(DISTINCT c.id) AS courses,
       count(DISTINCT a.id) AS assignments_tagged   -- meaningful only post-migration
FROM   programs p
LEFT   JOIN courses c     ON c.program_id = p.id
LEFT   JOIN assignments a ON a.program_id = p.id    -- column exists after migration
GROUP  BY p.id, p.name, p.is_active
ORDER  BY p.name;
