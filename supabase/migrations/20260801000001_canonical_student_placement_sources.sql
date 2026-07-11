-- Canonical student placement: IDs are authoritative; labels are cached projections.
CREATE OR REPLACE FUNCTION public.sync_portal_student_placement() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_class classes%ROWTYPE; v_school_name text; v_grade text;
BEGIN
 IF NEW.role <> 'student' THEN RETURN NEW; END IF;
 IF NEW.class_id IS NOT NULL THEN
  SELECT * INTO v_class FROM classes WHERE id=NEW.class_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Selected class is not registered'; END IF;
  IF v_class.school_id IS NULL THEN RAISE EXCEPTION 'Selected class has no registered school'; END IF;
  NEW.school_id:=v_class.school_id; NEW.section:=v_class.name;
  v_grade:=COALESCE(NULLIF(btrim(v_class.qa_grade_band),''),NULLIF(btrim(v_class.name),''));
  NEW.grade:=v_grade; NEW.primary_teacher_id:=v_class.teacher_id;
 END IF;
 IF NEW.school_id IS NOT NULL THEN
  SELECT name INTO v_school_name FROM schools WHERE id=NEW.school_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Selected school is not registered'; END IF;
  NEW.school_name:=v_school_name;
 ELSIF NEW.school_name IS NOT NULL AND btrim(NEW.school_name)<>'' THEN
  RAISE EXCEPTION 'A registered school selection is required; school names cannot be typed';
 END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_sync_portal_student_placement ON public.portal_users;
CREATE TRIGGER trg_sync_portal_student_placement BEFORE INSERT OR UPDATE OF school_id,school_name,class_id,section_class,grade ON public.portal_users FOR EACH ROW EXECUTE FUNCTION public.sync_portal_student_placement();

CREATE OR REPLACE FUNCTION public.sync_student_registry_placement() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_class classes%ROWTYPE; v_school_name text; v_class_id uuid;
BEGIN
 SELECT class_id INTO v_class_id FROM portal_users WHERE id=NEW.user_id AND role='student';
 IF v_class_id IS NOT NULL THEN
  SELECT * INTO v_class FROM classes WHERE id=v_class_id;
  IF FOUND THEN
   NEW.school_id:=v_class.school_id; NEW.section:=v_class.name; NEW.current_class:=v_class.name;
   NEW.grade_level:=COALESCE(NULLIF(btrim(v_class.qa_grade_band),''),NULLIF(btrim(v_class.name),''));
  END IF;
 END IF;
 IF NEW.school_id IS NOT NULL THEN
  SELECT name INTO v_school_name FROM schools WHERE id=NEW.school_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Selected school is not registered'; END IF;
  NEW.school_name:=v_school_name;
 ELSIF NEW.school_name IS NOT NULL AND btrim(NEW.school_name)<>'' THEN
  RAISE EXCEPTION 'A registered school selection is required; school names cannot be typed';
 END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_sync_student_registry_placement ON public.students;
CREATE TRIGGER trg_sync_student_registry_placement BEFORE INSERT OR UPDATE OF school_id,school_name,section,current_class,grade_level ON public.students FOR EACH ROW EXECUTE FUNCTION public.sync_student_registry_placement();
UPDATE portal_users p SET school_name=s.name FROM schools s WHERE p.school_id=s.id AND p.school_name IS DISTINCT FROM s.name;
UPDATE students st SET school_name=s.name FROM schools s WHERE st.school_id=s.id AND st.school_name IS DISTINCT FROM s.name;
UPDATE students st SET school_id=s.id,school_name=s.name FROM schools s WHERE lower(regexp_replace(btrim(st.school_name),'\s+',' ','g'))='quincy academy' AND upper(s.name)='QUINCY PREPARATORY SECONDARY SCHOOL';
CREATE UNIQUE INDEX IF NOT EXISTS schools_normalized_name_unique ON public.schools(lower(regexp_replace(btrim(name),'\s+',' ','g')));