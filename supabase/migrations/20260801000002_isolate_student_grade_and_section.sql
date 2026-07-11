-- Keep grade and section independent while retaining canonical ID-backed placement.
CREATE OR REPLACE FUNCTION public.sync_portal_student_placement() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_class classes%ROWTYPE; v_school_name text;
BEGIN
 IF NEW.role <> 'student' THEN RETURN NEW; END IF;
 IF NEW.class_id IS NOT NULL THEN
  SELECT * INTO v_class FROM classes WHERE id=NEW.class_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Selected class is not registered'; END IF;
  IF v_class.school_id IS NULL THEN RAISE EXCEPTION 'Selected class has no registered school'; END IF;
  NEW.school_id:=v_class.school_id; NEW.section_class:=v_class.name; NEW.primary_teacher_id:=v_class.teacher_id;
  IF NEW.grade IS NULL OR btrim(NEW.grade)='' THEN NEW.grade:=COALESCE(NULLIF(btrim(v_class.qa_grade_key),''),NULLIF(btrim(v_class.name),'')); END IF;
 END IF;
 IF NEW.school_id IS NOT NULL THEN
  SELECT name INTO v_school_name FROM schools WHERE id=NEW.school_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Selected school is not registered'; END IF;
  NEW.school_name:=v_school_name;
 ELSIF NEW.school_name IS NOT NULL AND btrim(NEW.school_name)<>'' THEN RAISE EXCEPTION 'A registered school selection is required; school names cannot be typed';
 END IF;
 RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.sync_student_registry_placement() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_class classes%ROWTYPE; v_portal_grade text; v_class_id uuid; v_school_name text;
BEGIN
 SELECT class_id,grade INTO v_class_id,v_portal_grade FROM portal_users WHERE id=NEW.user_id AND role='student';
 IF v_class_id IS NOT NULL THEN
  SELECT * INTO v_class FROM classes WHERE id=v_class_id;
  IF FOUND THEN NEW.school_id:=v_class.school_id; NEW.section:=v_class.name; NEW.current_class:=v_class.name; END IF;
 END IF;
 IF v_portal_grade IS NOT NULL AND btrim(v_portal_grade)<>'' THEN NEW.grade:=v_portal_grade; NEW.grade_level:=v_portal_grade; END IF;
 IF NEW.school_id IS NOT NULL THEN
  SELECT name INTO v_school_name FROM schools WHERE id=NEW.school_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Selected school is not registered'; END IF;
  NEW.school_name:=v_school_name;
 ELSIF NEW.school_name IS NOT NULL AND btrim(NEW.school_name)<>'' THEN RAISE EXCEPTION 'A registered school selection is required; school names cannot be typed';
 END IF;
 RETURN NEW;
END $$;