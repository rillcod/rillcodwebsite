-- Auto-derive portal_users.grade at the schema level, so EVERY entry point (bulk register,
-- consent onboarding, approvals, summer school, CRM edits, student edits, report builder,
-- future code we haven't written yet) yields a consistent canonical grade — even when the
-- calling code only sets section_class. This is the belt to the app-layer suspenders.
--
-- canonical_grade(text): SQL port of src/lib/classes/naming.ts → canonicalGrade().
--   • takes the last "·" segment of a composed class name
--   • extracts level+number grade tokens, normalises synonyms (JS→JSS, SSS→SS, Primary→Basic)
--   • returns a SPECIFIC single grade ("Basic 5" / "JSS 1"), or NULL. A range (class band like
--     "JSS 1-3") collapses to the band's LOWEST grade — grade is a specific value kept separate
--     from the section/class, never a band label.

CREATE OR REPLACE FUNCTION canonical_grade(input text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  parts text[];
  seg text;
  rec record;
  first_norm text;
  norm_lvl text;
  nums int[] := '{}';
  rng text[];
  lo int;
BEGIN
  IF input IS NULL OR btrim(input) = '' THEN RETURN NULL; END IF;

  -- Last "·" segment (a composed class name describes a class; its band is the last part).
  parts := regexp_split_to_array(input, '\s*·\s*');
  seg := upper(btrim(parts[array_upper(parts, 1)]));

  -- Collect level+number tokens in order; keep only those matching the first level seen.
  FOR rec IN
    SELECT m[1] AS lvl_raw, (m[2])::int AS n
    FROM regexp_matches(
      seg,
      '(SSS|SS|JSS|JS|BASIC|PRIMARY|PRY|ELEMENTARY|ELEM|NURSERY|NUR|CRECHE|KINDERGARTEN|KG|RECEPTION|GRADE|YEAR)\s*0*([0-9]+)',
      'g'
    ) AS m
  LOOP
    norm_lvl := CASE rec.lvl_raw
      WHEN 'JS' THEN 'JSS' WHEN 'JSS' THEN 'JSS'
      WHEN 'SSS' THEN 'SS' WHEN 'SS' THEN 'SS'
      WHEN 'BASIC' THEN 'Basic' WHEN 'PRIMARY' THEN 'Basic' WHEN 'PRY' THEN 'Basic'
      WHEN 'ELEMENTARY' THEN 'Basic' WHEN 'ELEM' THEN 'Basic'
      -- Pre-primary is "Nursery" throughout (KG/Kindergarten/Reception all map to Nursery).
      WHEN 'NURSERY' THEN 'Nursery' WHEN 'NUR' THEN 'Nursery' WHEN 'CRECHE' THEN 'Nursery'
      WHEN 'KG' THEN 'Nursery' WHEN 'KINDERGARTEN' THEN 'Nursery' WHEN 'RECEPTION' THEN 'Nursery'
      -- Grade collapses to Basic ("Grade 2" == "Basic 2"). "Year N" adopts the level of the
      -- student's class (primary school → Basic, secondary → JSS); in practice grade is derived
      -- from the class band which already carries the level, so JSS is only a bare fallback.
      WHEN 'GRADE' THEN 'Basic' WHEN 'YEAR' THEN 'JSS'
      ELSE initcap(rec.lvl_raw)
    END;
    IF first_norm IS NULL THEN first_norm := norm_lvl; END IF;
    IF norm_lvl = first_norm THEN nums := nums || rec.n; END IF;
  END LOOP;

  IF first_norm IS NULL THEN RETURN NULL; END IF;

  -- Range → the band's LOWEST grade; otherwise the lowest token of the dominant level.
  -- grade is always a specific single value (never a band label).
  rng := regexp_match(seg, '([0-9]+)\s*[-–]\s*([0-9]+)');
  IF rng IS NOT NULL THEN
    lo := least(rng[1]::int, rng[2]::int);
  ELSE
    SELECT min(x) INTO lo FROM unnest(nums) AS x;
  END IF;

  RETURN first_norm || ' ' || lo;
END;
$$;

-- Fill grade ONLY when the writer didn't set it (NEW.grade IS NULL). On a normal UPDATE that
-- doesn't touch grade, NEW.grade carries the existing value, so an already-good grade is never
-- clobbered. Explicitly nulling grade re-derives it from section_class.
CREATE OR REPLACE FUNCTION trg_portal_users_fill_grade()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.role = 'student' AND NEW.grade IS NULL THEN
    NEW.grade := canonical_grade(NEW.section_class);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS portal_users_fill_grade ON portal_users;
CREATE TRIGGER portal_users_fill_grade
  BEFORE INSERT OR UPDATE ON portal_users
  FOR EACH ROW
  EXECUTE FUNCTION trg_portal_users_fill_grade();
