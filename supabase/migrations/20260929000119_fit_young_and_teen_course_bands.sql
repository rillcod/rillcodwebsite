-- Give the Young Innovators and Teen Developers catalogues a real progression
-- order, and put Bayflower's Teen Dev class on the programme its name says.
--
-- ── What this deliberately does NOT do ───────────────────────────────────────
--
-- An earlier draft also wrote `metadata.grade_levels` for all twelve courses.
-- That has been removed on purpose, because it created a second source of truth
-- for data the application already owns.
--
-- src/lib/courses/school-pathway.ts holds the canonical bands, and
-- recommend-server.ts already reads them as the fallback whenever a course
-- carries no metadata:
--
--     gradeLevels: gradeLevelsOf(row.metadata).length
--       ? gradeLevelsOf(row.metadata)      -- an admin's explicit override
--       : canonicalGradeLevels(...)        -- the product default, in code
--
-- So writing the same values into the database changes no behaviour today, and
-- freezes them tomorrow: every course would carry a copy, and a later edit to
-- the defaults in code would silently stop applying to any of them. The layering
-- is worth keeping as it is — code supplies the default, the course editor at
-- /dashboard/courses/new supplies a per-course override when a school needs one.
--
-- ── Why level_order IS written here ──────────────────────────────────────────
--
-- Because it is missing, not duplicated. All twelve rows currently sit at
-- level_order = 1 in production, so the catalogue has no sequence at all:
-- teaching-workspace orders by it, and progression path-view and
-- student-level-enrollments both read it. Every course looking like "level 1"
-- is a real defect, and this is the fix.
--
-- Matching on title is acceptable in a one-time repair like this: it runs once
-- against today's catalogue. It is not a pattern to reach for in application
-- code, which has to survive a course being renamed.

BEGIN;

-- Note on shape: the title match lives in WHERE, not in a JOIN ... ON. Postgres
-- does not allow the UPDATE target (c) to be referenced from a join condition
-- inside the FROM list — it fails with "invalid reference to FROM-clause entry
-- for table c". Listing both sources in FROM and matching in WHERE is the
-- supported form and reads no worse.
UPDATE courses AS c
SET
  level_order = s.level_order,
  updated_at = now()
FROM programs AS p,
(
  VALUES
    ('Young Innovators', 'Hello World: Introduction to Computers', 1),
    ('Young Innovators', 'Creative Coding with Scratch', 2),
    ('Young Innovators', 'Internet Safety & Digital Citizenship', 3),
    ('Young Innovators', 'Fun with Robots: Introduction to Robotics', 4),
    ('Young Innovators', 'Digital Art & Animation', 5),
    ('Young Innovators', 'Mini-Maker Showcase', 6),
    ('Teen Developers', 'Python for Beginners', 1),
    ('Teen Developers', 'Introduction to Web Pages: HTML & CSS', 2),
    ('Teen Developers', 'JavaScript Fundamentals', 3),
    ('Teen Developers', 'Electronics & Circuits Fundamentals', 4),
    ('Teen Developers', 'Building Smart Robots with Arduino', 5),
    ('Teen Developers', 'App Ideas & Prototyping', 6)
) AS s(programme, title, level_order)
WHERE c.program_id = p.id
  AND s.programme = p.name
  AND s.title = c.title
  AND c.is_active = true;

-- Bayflower's class is named "Teen Dev · JSS 1-3" but is stored against the
-- Data Analysis with Python programme with no course at all — confirmed live
-- before writing this. Put it where its name says and give it the first Teen
-- Developers course. Learner marks and submissions are not touched, and
-- coalesce means an existing course assignment is never overwritten.
UPDATE classes
SET
  program_id = teen.id,
  current_course_id = coalesce(classes.current_course_id, python.id),
  updated_at = now()
FROM programs AS teen
JOIN courses AS python
  ON python.program_id = teen.id
 AND python.title = 'Python for Beginners'
 AND python.is_active = true
JOIN programs AS data_analysis
  ON data_analysis.name = 'Data Analysis with Python'
WHERE teen.name = 'Teen Developers'
  AND classes.name = 'Bayflower · Teen Dev · JSS 1-3'
  AND classes.program_id = data_analysis.id;

COMMIT;
