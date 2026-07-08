-- Canonical per-student grade on the portal column.
--
-- Why: grade signals were scattered and dirty across portal_users.section_class and
-- students.grade / grade_level / current_class (each polluted with class names, programme
-- labels, and free text). This adds ONE canonical column so every student carries a specific,
-- consistent grade tied to their portal account — the single source of truth for band-fit
-- checks, placement, and reporting. section_class is left untouched (the roster section
-- fallback still keys on it).
--
-- Values written by the backfill:
--   • a specific single grade  ("Basic 5", "JSS 2", "Grade 5")  where recoverable
--   • a band label             ("Basic 3-4", "SS 1-3")          where only the band is known
--   • NULL                                                       for online cohorts (n/a)

ALTER TABLE portal_users ADD COLUMN IF NOT EXISTS grade text;

COMMENT ON COLUMN portal_users.grade IS
  'Canonical student grade ("Basic 5" / "JSS 2") or band label ("Basic 3-4") where only a band is known. NULL for online cohorts. Set on creation and by the grade backfill.';
