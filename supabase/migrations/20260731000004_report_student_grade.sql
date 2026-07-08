-- Isolate a student's CLASS (grade level, e.g. "Basic 1") from their SECTION (the Rillcod
-- cohort/programme group, e.g. "Quincy · Teen Dev · JSS 1-3") on progress reports. Reports
-- already store section_class (the cohort); this adds the grade so the report card can show
-- the two as separate, clearly-labelled fields instead of one merged "Class / Section".
ALTER TABLE student_progress_reports ADD COLUMN IF NOT EXISTS student_grade text;

COMMENT ON COLUMN student_progress_reports.student_grade IS
  'Student grade level ("Basic 1" / "JSS 2") shown as "Class" on the report — distinct from section_class (the cohort, shown as "Section").';
