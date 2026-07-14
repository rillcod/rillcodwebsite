-- Stamp attendance rows missing term_id so leaderboard / overview live filters
-- do not rely on include-untagged forever.

UPDATE attendance a
SET term_id = COALESCE(
  (
    SELECT r.term_id
    FROM class_term_rosters r
    WHERE r.id = a.class_term_roster_id
      AND r.term_id IS NOT NULL
    LIMIT 1
  ),
  public.live_academic_term_id()
)
WHERE a.term_id IS NULL
  AND public.live_academic_term_id() IS NOT NULL;
