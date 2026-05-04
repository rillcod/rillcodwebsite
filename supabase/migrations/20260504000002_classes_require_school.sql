-- Classes must always belong to a school.
-- Best-effort recovery of orphaned (school_id IS NULL) classes,
-- then cleanup of any that are still unrecoverable.
-- NOTE: NOT NULL is enforced at the application layer (API) rather than DB
-- to avoid breaking any edge-case legacy rows.

-- 1. Recover from enrolled students
UPDATE classes c
SET school_id = (
  SELECT pu.school_id FROM portal_users pu
  WHERE pu.class_id = c.id AND pu.school_id IS NOT NULL LIMIT 1
)
WHERE c.school_id IS NULL;

-- 2. Recover from lesson_plans.school_id
UPDATE classes c
SET school_id = (
  SELECT lp.school_id FROM lesson_plans lp
  WHERE lp.class_id = c.id AND lp.school_id IS NOT NULL LIMIT 1
)
WHERE c.school_id IS NULL;

-- 3. Recover from lesson_plans creator's school
UPDATE classes c
SET school_id = (
  SELECT pu.school_id
  FROM lesson_plans lp JOIN portal_users pu ON pu.id = lp.created_by
  WHERE lp.class_id = c.id AND pu.school_id IS NOT NULL LIMIT 1
)
WHERE c.school_id IS NULL;

-- 4. Delete truly unrecoverable orphans (no students, no lesson_plans)
DELETE FROM classes
WHERE school_id IS NULL
  AND NOT EXISTS (SELECT 1 FROM portal_users WHERE portal_users.class_id = classes.id)
  AND NOT EXISTS (SELECT 1 FROM lesson_plans  WHERE lesson_plans.class_id  = classes.id);
