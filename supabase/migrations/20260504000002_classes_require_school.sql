-- Classes must always belong to a school.
-- Remove any orphaned classes (school_id IS NULL) that have no students,
-- then add the NOT NULL constraint going forward.

-- 1. Delete empty orphaned classes (safe: no students enrolled)
DELETE FROM classes
WHERE school_id IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM portal_users
    WHERE portal_users.class_id = classes.id
  );

-- 2. For any remaining null-school classes (has students), assign them to the
--    student's school as best-effort recovery before enforcing the constraint.
UPDATE classes c
SET school_id = (
  SELECT pu.school_id
  FROM portal_users pu
  WHERE pu.class_id = c.id
    AND pu.school_id IS NOT NULL
  LIMIT 1
)
WHERE c.school_id IS NULL;

-- 3. Enforce NOT NULL — will fail if any school_id is still null after the above.
ALTER TABLE classes ALTER COLUMN school_id SET NOT NULL;
