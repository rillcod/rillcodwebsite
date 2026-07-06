-- Class band placement: numeric band bounds + tier on classes so fixed bands
-- (Basic 1-3 / 4-6, JSS 1-3, SS 1-3) and teacher-chosen single/custom bands can coexist,
-- and a student's grade is placed into whichever class band covers its number.
-- A per-school default granularity controls how new classes are auto-split.

ALTER TABLE classes ADD COLUMN IF NOT EXISTS tier text;            -- explicit programme (never age-derived)
ALTER TABLE classes ADD COLUMN IF NOT EXISTS band_lvl text;        -- 'Basic' | 'Primary' | 'JSS' | 'SS' | …
ALTER TABLE classes ADD COLUMN IF NOT EXISTS band_low integer;     -- inclusive lower grade number
ALTER TABLE classes ADD COLUMN IF NOT EXISTS band_high integer;    -- inclusive upper grade number

-- Per-school default: 'fixed' (banded) or 'single' (one class per grade). Overridable per class.
ALTER TABLE schools ADD COLUMN IF NOT EXISTS default_band_granularity text DEFAULT 'fixed';

-- Placement lookup: find a class in a school whose tier + band covers a grade.
CREATE INDEX IF NOT EXISTS idx_classes_placement
  ON classes(school_id, band_lvl, band_low, band_high);
