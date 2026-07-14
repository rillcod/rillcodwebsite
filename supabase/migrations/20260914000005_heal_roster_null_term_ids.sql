-- Heal class_term_rosters that were created without term_id so live-session
-- roster filters (.eq('term_id', class.term_id)) include them.
-- Do NOT rewrite historical rows that already belong to a prior term.

-- Drop untagged rows that already have a properly tagged twin for the class's term
-- (avoids unique (class_id, student_id, term_id) collisions on the update below).
DELETE FROM class_term_rosters r
USING classes c, class_term_rosters twin
WHERE r.class_id = c.id
  AND r.term_id IS NULL
  AND c.term_id IS NOT NULL
  AND twin.class_id = r.class_id
  AND twin.student_id = r.student_id
  AND twin.term_id = c.term_id
  AND twin.id <> r.id;

-- Stamp remaining null term_id rows from their class's current term.
UPDATE class_term_rosters r
SET term_id = c.term_id
FROM classes c
WHERE r.class_id = c.id
  AND r.term_id IS NULL
  AND c.term_id IS NOT NULL;
