-- Consent forms can now target a specific class. Students created from the form's
-- leads are placed in this class (not just a grade-derived one). Nullable + ON
-- DELETE SET NULL so deleting a class never breaks a form.
ALTER TABLE consent_forms
  ADD COLUMN IF NOT EXISTS class_id uuid REFERENCES classes(id) ON DELETE SET NULL;

COMMENT ON COLUMN consent_forms.class_id IS
  'Optional class the form was created for; students onboarded from this form''s leads are placed here.';
