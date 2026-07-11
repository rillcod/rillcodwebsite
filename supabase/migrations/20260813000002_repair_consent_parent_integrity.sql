-- Deterministic repair of legacy consent/parent patterns. The preflights reject
-- malformed or many-to-one legacy state rather than selecting an arbitrary row.
BEGIN;

LOCK TABLE public.form_leads IN SHARE ROW EXCLUSIVE MODE;
LOCK TABLE public.parent_student_links IN SHARE ROW EXCLUSIVE MODE;
LOCK TABLE public.students IN SHARE ROW EXCLUSIVE MODE;
LOCK TABLE public.audit_logs IN ROW EXCLUSIVE MODE;

-- Deterministically dedupe legacy child_matches before strict preflight checks.
-- Same student on multiple slots → keep the lowest child_index.
-- Same slot with multiple students → keep the first array entry.
CREATE TEMP TABLE _consent_child_matches_deduped ON COMMIT DROP AS
SELECT
  lead.id AS lead_id,
  lead.response_data->'child_matches' AS old_child_matches,
  COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'childIndex', deduped.child_index,
        'studentId', deduped.student_id::text,
        'studentName', deduped.student_name,
        'studentClass', deduped.student_class,
        'confidence', deduped.confidence
      )
      ORDER BY deduped.child_index
    ) FILTER (WHERE deduped.student_id IS NOT NULL),
    '[]'::jsonb
  ) AS new_child_matches
FROM public.form_leads lead
CROSS JOIN LATERAL (
  SELECT DISTINCT ON (slot.child_index)
    slot.child_index,
    slot.student_id,
    slot.student_name,
    slot.student_class,
    slot.confidence,
    slot.ordinal
  FROM (
    SELECT
      (item->>'childIndex')::integer AS child_index,
      (item->>'studentId')::uuid AS student_id,
      item->>'studentName' AS student_name,
      item->>'studentClass' AS student_class,
      item->>'confidence' AS confidence,
      ordinal,
      row_number() OVER (
        PARTITION BY (item->>'studentId')::uuid
        ORDER BY (item->>'childIndex')::integer, ordinal
      ) AS student_rank
    FROM jsonb_array_elements(
      COALESCE(lead.response_data->'child_matches', '[]'::jsonb)
    ) WITH ORDINALITY AS entries(item, ordinal)
    WHERE jsonb_typeof(item) = 'object'
      AND jsonb_typeof(item->'childIndex') = 'number'
      AND (item->>'childIndex') ~ '^[0-9]+$'
      AND jsonb_typeof(item->'studentId') = 'string'
      AND (item->>'studentId') ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
  ) slot
  WHERE slot.student_rank = 1
  ORDER BY slot.child_index, slot.ordinal
) deduped
WHERE lead.response_data ? 'child_matches'
GROUP BY lead.id, lead.response_data->'child_matches'
HAVING COALESCE(
  jsonb_agg(
    jsonb_build_object(
      'childIndex', deduped.child_index,
      'studentId', deduped.student_id::text,
      'studentName', deduped.student_name,
      'studentClass', deduped.student_class,
      'confidence', deduped.confidence
    )
    ORDER BY deduped.child_index
  ) FILTER (WHERE deduped.student_id IS NOT NULL),
  '[]'::jsonb
) IS DISTINCT FROM lead.response_data->'child_matches';

WITH deduped AS (
  UPDATE public.form_leads lead
  SET response_data = jsonb_set(
    lead.response_data,
    '{child_matches}',
    repair.new_child_matches,
    true
  )
  FROM _consent_child_matches_deduped repair
  WHERE lead.id = repair.lead_id
  RETURNING lead.id
)
INSERT INTO public.audit_logs (
  action, table_name, record_id, resource_type, resource_id,
  old_values, new_values, created_at
)
SELECT
  'duplicate_consent_child_matches_deduped',
  'form_leads',
  repair.lead_id,
  'form_lead',
  repair.lead_id::text,
  jsonb_build_object('child_matches', repair.old_child_matches),
  jsonb_build_object('child_matches', repair.new_child_matches),
  now()
FROM _consent_child_matches_deduped repair
JOIN deduped ON deduped.id = repair.lead_id;

-- When the scalar primary cache and JSON slot zero disagree, keep matched_student_id
-- authoritative and rewrite child_matches[0] before strict preflight checks.
CREATE TEMP TABLE _consent_primary_child_alignment ON COMMIT DROP AS
SELECT
  lead.id AS lead_id,
  lead.matched_student_id,
  lead.response_data->'child_matches' AS old_child_matches,
  CASE
    WHEN json_primary.student_id IS NULL THEN
      CASE
        WHEN lead.response_data ? 'child_matches' THEN lead.response_data->'child_matches'
        ELSE NULL
      END
    ELSE
      COALESCE(
        (
          SELECT jsonb_agg(
            CASE
              WHEN (item->>'childIndex')::integer = 0 THEN
                jsonb_strip_nulls(
                  jsonb_build_object(
                    'childIndex', 0,
                    'studentId', lead.matched_student_id::text,
                    'studentName', COALESCE(item->>'studentName', student_user.full_name),
                    'studentClass', COALESCE(item->>'studentClass', student_user.section_class),
                    'confidence', item->>'confidence'
                  )
                )
              ELSE item
            END
            ORDER BY (item->>'childIndex')::integer
          )
          FROM jsonb_array_elements(
            COALESCE(lead.response_data->'child_matches', '[]'::jsonb)
          ) item
        ),
        jsonb_build_array(
          jsonb_strip_nulls(
            jsonb_build_object(
              'childIndex', 0,
              'studentId', lead.matched_student_id::text,
              'studentName', student_user.full_name,
              'studentClass', student_user.section_class
            )
          )
        )
      )
  END AS new_child_matches
FROM public.form_leads lead
JOIN public.portal_users student_user
  ON student_user.id = lead.matched_student_id
 AND student_user.role = 'student'
LEFT JOIN LATERAL (
  SELECT (item->>'studentId')::uuid AS student_id
  FROM jsonb_array_elements(
    COALESCE(lead.response_data->'child_matches', '[]'::jsonb)
  ) item
  WHERE (item->>'childIndex')::integer = 0
  LIMIT 1
) json_primary ON true
WHERE lead.matched_student_id IS NOT NULL
  AND (
    json_primary.student_id IS NULL
    OR json_primary.student_id <> lead.matched_student_id
  );

WITH aligned AS (
  UPDATE public.form_leads lead
  SET response_data = jsonb_set(
    lead.response_data,
    '{child_matches}',
    repair.new_child_matches,
    true
  )
  FROM _consent_primary_child_alignment repair
  WHERE lead.id = repair.lead_id
    AND repair.new_child_matches IS NOT NULL
  RETURNING lead.id
)
INSERT INTO public.audit_logs (
  action, table_name, record_id, resource_type, resource_id,
  old_values, new_values, created_at
)
SELECT
  'consent_primary_child_cache_aligned',
  'form_leads',
  repair.lead_id,
  'form_lead',
  repair.lead_id::text,
  jsonb_build_object(
    'matched_student_id', repair.matched_student_id,
    'child_matches', repair.old_child_matches
  ),
  jsonb_build_object(
    'matched_student_id', repair.matched_student_id,
    'child_matches', repair.new_child_matches
  ),
  now()
FROM _consent_primary_child_alignment repair
JOIN aligned ON aligned.id = repair.lead_id;

DO $$
DECLARE
  v_count bigint;
  v_sample text;
BEGIN
  SELECT count(*)
    INTO v_count
  FROM (
    SELECT user_id
    FROM public.students
    WHERE user_id IS NOT NULL
    GROUP BY user_id
    HAVING count(*) > 1
  ) duplicate_users;

  IF v_count > 0 THEN
    SELECT string_agg(user_id::text, ', ' ORDER BY user_id)
      INTO v_sample
    FROM (
      SELECT user_id
      FROM public.students
      WHERE user_id IS NOT NULL
      GROUP BY user_id
      HAVING count(*) > 1
      ORDER BY user_id
      LIMIT 10
    ) samples;

    RAISE EXCEPTION
      'Consent repair is ambiguous: % portal student id(s) resolve to multiple students rows (sample: %)',
      v_count, v_sample;
  END IF;

  SELECT count(*)
    INTO v_count
  FROM public.parent_student_links psl
  JOIN public.portal_users parent_user ON parent_user.id = psl.parent_id
  WHERE parent_user.role <> 'parent';

  IF v_count > 0 THEN
    RAISE EXCEPTION
      'Consent repair found % parent_student_links row(s) whose parent_id is not a parent-role portal user',
      v_count;
  END IF;

  SELECT count(*)
    INTO v_count
  FROM public.form_leads lead
  JOIN public.portal_users parent_user ON parent_user.id = lead.matched_parent_id
  WHERE lead.matched_parent_id IS NOT NULL
    AND parent_user.role <> 'parent';

  IF v_count > 0 THEN
    RAISE EXCEPTION
      'Consent repair found % form_leads row(s) whose matched_parent_id is not a parent-role portal user',
      v_count;
  END IF;

  SELECT count(*)
    INTO v_count
  FROM public.form_leads lead
  WHERE lead.response_data ? 'child_matches'
    AND jsonb_typeof(lead.response_data->'child_matches') <> 'array';

  IF v_count > 0 THEN
    RAISE EXCEPTION
      'Consent repair found % child_matches value(s) that are not arrays',
      v_count;
  END IF;

  SELECT count(*)
    INTO v_count
  FROM public.form_leads lead
  CROSS JOIN LATERAL jsonb_array_elements(
    COALESCE(lead.response_data->'child_matches', '[]'::jsonb)
  ) item
  WHERE jsonb_typeof(item) IS DISTINCT FROM 'object'
     OR jsonb_typeof(item->'childIndex') IS DISTINCT FROM 'number'
     OR (item->>'childIndex') !~ '^[0-9]+$'
     OR jsonb_typeof(item->'studentId') IS DISTINCT FROM 'string'
     OR (item->>'studentId') !~
        '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$';

  IF v_count > 0 THEN
    RAISE EXCEPTION
      'Consent repair found % malformed child_matches entrie(s); each entry must have a non-negative integer childIndex and UUID studentId',
      v_count;
  END IF;

  SELECT count(*)
    INTO v_count
  FROM (
    SELECT lead.id, (item->>'childIndex')::integer
    FROM public.form_leads lead
    CROSS JOIN LATERAL jsonb_array_elements(
      COALESCE(lead.response_data->'child_matches', '[]'::jsonb)
    ) item
    GROUP BY lead.id, (item->>'childIndex')::integer
    HAVING count(*) > 1
  ) duplicate_slots;

  IF v_count > 0 THEN
    RAISE EXCEPTION
      'Consent repair found % lead/child-index duplicate group(s) in child_matches',
      v_count;
  END IF;

  SELECT count(*)
    INTO v_count
  FROM (
    SELECT lead.id, (item->>'studentId')::uuid
    FROM public.form_leads lead
    CROSS JOIN LATERAL jsonb_array_elements(
      COALESCE(lead.response_data->'child_matches', '[]'::jsonb)
    ) item
    GROUP BY lead.id, (item->>'studentId')::uuid
    HAVING count(*) > 1
  ) duplicate_students;

  IF v_count > 0 THEN
    RAISE EXCEPTION
      'Consent repair found % lead/student duplicate group(s) in child_matches',
      v_count;
  END IF;

  SELECT count(*)
    INTO v_count
  FROM public.form_leads lead
  CROSS JOIN LATERAL (
    SELECT (item->>'studentId')::uuid AS student_id
    FROM jsonb_array_elements(
      COALESCE(lead.response_data->'child_matches', '[]'::jsonb)
    ) item
    WHERE (item->>'childIndex')::integer = 0
  ) json_primary
  WHERE lead.matched_student_id IS NOT NULL
    AND lead.matched_student_id <> json_primary.student_id;

  IF v_count > 0 THEN
    RAISE EXCEPTION
      'Consent repair found % lead(s) whose scalar and JSON primary child disagree',
      v_count;
  END IF;
END
$$;

CREATE TEMP TABLE _consent_legacy_child_refs ON COMMIT DROP AS
SELECT DISTINCT
  refs.lead_id,
  refs.child_index,
  refs.student_portal_user_id
FROM (
  SELECT
    lead.id AS lead_id,
    0 AS child_index,
    lead.matched_student_id AS student_portal_user_id
  FROM public.form_leads lead
  WHERE lead.matched_student_id IS NOT NULL

  UNION ALL

  SELECT
    lead.id,
    (item->>'childIndex')::integer,
    (item->>'studentId')::uuid
  FROM public.form_leads lead
  CROSS JOIN LATERAL jsonb_array_elements(
    COALESCE(lead.response_data->'child_matches', '[]'::jsonb)
  ) item
) refs;

CREATE INDEX ON _consent_legacy_child_refs (lead_id, child_index);
CREATE INDEX ON _consent_legacy_child_refs (student_portal_user_id);

CREATE TEMP TABLE _consent_ownership_conflicts ON COMMIT DROP AS
SELECT
  lead.id AS lead_id,
  refs.student_portal_user_id AS candidate_id,
  lead.matched_student_id AS old_matched_student_id,
  lead.match_candidate_id AS old_match_candidate_id,
  lead.matched_parent_id AS old_matched_parent_id,
  lead.match_status AS old_match_status,
  psl.parent_id AS authoritative_parent_id
FROM _consent_legacy_child_refs refs
JOIN public.form_leads lead ON lead.id = refs.lead_id
JOIN public.students student_row
  ON student_row.user_id = refs.student_portal_user_id
JOIN public.portal_users student_user
  ON student_user.id = refs.student_portal_user_id
 AND student_user.role = 'student'
JOIN public.parent_student_links psl
  ON psl.student_id = student_row.id
WHERE lead.matched_parent_id IS NOT NULL
  AND lead.matched_parent_id <> psl.parent_id;

DO $$
DECLARE
  v_count bigint;
BEGIN
  SELECT count(*)
    INTO v_count
  FROM (
    SELECT lead_id
    FROM _consent_ownership_conflicts
    GROUP BY lead_id
    HAVING count(DISTINCT candidate_id) > 1
  ) ambiguous_conflicts;

  IF v_count > 0 THEN
    RAISE EXCEPTION
      'Consent repair found % lead(s) with multiple ownership-conflicting child candidates',
      v_count;
  END IF;

  SELECT count(*)
    INTO v_count
  FROM _consent_ownership_conflicts conflict
  JOIN _consent_legacy_child_refs refs
    ON refs.lead_id = conflict.lead_id
   AND refs.student_portal_user_id = conflict.candidate_id
  WHERE refs.child_index <> 0;

  IF v_count > 0 THEN
    RAISE EXCEPTION
      'Consent repair found % non-primary ownership conflict(s) that cannot be represented safely by match_candidate_id',
      v_count;
  END IF;

  SELECT count(*)
    INTO v_count
  FROM _consent_ownership_conflicts conflict
  WHERE conflict.old_match_candidate_id IS NOT NULL
    AND conflict.old_match_candidate_id <> conflict.candidate_id;

  IF v_count > 0 THEN
    RAISE EXCEPTION
      'Consent repair found % ownership conflict(s) with a different existing match candidate',
      v_count;
  END IF;
END
$$;

WITH repaired AS (
  UPDATE public.form_leads lead
  SET match_status = 'pending_review',
      match_candidate_id = conflict.candidate_id,
      matched_student_id = NULL,
      matched_parent_id = NULL,
      match_notes = concat_ws(
        E'\n',
        NULLIF(lead.match_notes, ''),
        'Ownership conflict preserved for staff review; parent_student_links remains authoritative.'
      )
  FROM _consent_ownership_conflicts conflict
  WHERE lead.id = conflict.lead_id
  RETURNING lead.id
)
INSERT INTO public.audit_logs (
  action, table_name, record_id, resource_type, resource_id,
  old_values, new_values, created_at
)
SELECT
  'consent_ownership_conflict_preserved',
  'form_leads',
  conflict.lead_id,
  'form_lead',
  conflict.lead_id::text,
  jsonb_build_object(
    'match_status', conflict.old_match_status,
    'matched_student_id', conflict.old_matched_student_id,
    'match_candidate_id', conflict.old_match_candidate_id,
    'matched_parent_id', conflict.old_matched_parent_id
  ),
  jsonb_build_object(
    'match_status', 'pending_review',
    'match_candidate_id', conflict.candidate_id,
    'authoritative_parent_id', conflict.authoritative_parent_id,
    'parent_link_changed', false
  ),
  now()
FROM _consent_ownership_conflicts conflict
JOIN repaired ON repaired.id = conflict.lead_id;

CREATE TEMP TABLE _consent_safe_missing_parent_links ON COMMIT DROP AS
SELECT
  refs.student_portal_user_id,
  student_row.id AS student_id,
  lead.matched_parent_id AS parent_id,
  array_agg(DISTINCT lead.id ORDER BY lead.id) AS lead_ids
FROM _consent_legacy_child_refs refs
JOIN public.form_leads lead ON lead.id = refs.lead_id
JOIN public.portal_users parent_user
  ON parent_user.id = lead.matched_parent_id
 AND parent_user.role = 'parent'
JOIN public.portal_users student_user
  ON student_user.id = refs.student_portal_user_id
 AND student_user.role = 'student'
JOIN public.students student_row
  ON student_row.user_id = refs.student_portal_user_id
CROSS JOIN LATERAL (
  SELECT
    COALESCE(
      NULLIF(lower(btrim(lead.response_data->>'parent_email')), ''),
      NULLIF(lower(btrim(lead.email)), '')
    ) AS submitted_email,
    COALESCE(
      NULLIF(regexp_replace(
        COALESCE(lead.response_data->>'parent_whatsapp', ''),
        '\D', '', 'g'
      ), ''),
      NULLIF(regexp_replace(
        COALESCE(lead.response_data->>'parent_phone', ''),
        '\D', '', 'g'
      ), '')
    ) AS submitted_phone
) contact
WHERE NOT EXISTS (
    SELECT 1
    FROM public.parent_student_links existing_link
    WHERE existing_link.student_id = student_row.id
  )
  AND (
    (
      contact.submitted_email IS NOT NULL
      AND lower(btrim(parent_user.email)) = contact.submitted_email
    )
    OR
    (
      contact.submitted_phone IS NOT NULL
      AND regexp_replace(COALESCE(parent_user.phone, ''), '\D', '', 'g') =
          contact.submitted_phone
    )
  )
GROUP BY
  refs.student_portal_user_id,
  student_row.id,
  lead.matched_parent_id;

DO $$
DECLARE
  v_count bigint;
BEGIN
  SELECT count(*)
    INTO v_count
  FROM (
    SELECT student_id
    FROM _consent_safe_missing_parent_links
    GROUP BY student_id
    HAVING count(DISTINCT parent_id) > 1
  ) ambiguous_parents;

  IF v_count > 0 THEN
    RAISE EXCEPTION
      'Consent repair found % unlinked student(s) with contact-confirmed matches to multiple lead parents',
      v_count;
  END IF;
END
$$;

WITH inserted AS (
  INSERT INTO public.parent_student_links (parent_id, student_id)
  SELECT parent_id, student_id
  FROM _consent_safe_missing_parent_links
  ON CONFLICT (parent_id, student_id) DO NOTHING
  RETURNING id, parent_id, student_id
)
INSERT INTO public.audit_logs (
  action, table_name, record_id, resource_type, resource_id,
  old_values, new_values, created_at
)
SELECT
  'consent_missing_parent_link_repaired',
  'parent_student_links',
  inserted.id,
  'parent_student_link',
  inserted.id::text,
  NULL,
  jsonb_build_object(
    'parent_id', inserted.parent_id,
    'student_id', inserted.student_id,
    'source_lead_ids', missing.lead_ids,
    'reason', 'submitted contact matched matched_parent_id'
  ),
  now()
FROM inserted
JOIN _consent_safe_missing_parent_links missing
  ON missing.parent_id = inserted.parent_id
 AND missing.student_id = inserted.student_id;

CREATE TEMP TABLE _consent_parent_mirror_repairs ON COMMIT DROP AS
SELECT
  student_row.id AS student_id,
  student_row.parent_email AS old_parent_email,
  student_row.parent_name AS old_parent_name,
  student_row.parent_phone AS old_parent_phone,
  parent_user.email AS new_parent_email,
  parent_user.full_name AS new_parent_name,
  parent_user.phone AS new_parent_phone,
  psl.id AS parent_link_id,
  parent_user.id AS parent_id
FROM public.parent_student_links psl
JOIN public.students student_row ON student_row.id = psl.student_id
JOIN public.portal_users parent_user
  ON parent_user.id = psl.parent_id
 AND parent_user.role = 'parent'
WHERE student_row.parent_email IS DISTINCT FROM parent_user.email
   OR student_row.parent_name IS DISTINCT FROM parent_user.full_name
   OR student_row.parent_phone IS DISTINCT FROM parent_user.phone;

WITH repaired AS (
  UPDATE public.students student_row
  SET parent_email = repair.new_parent_email,
      parent_name = repair.new_parent_name,
      parent_phone = repair.new_parent_phone,
      updated_at = now()
  FROM _consent_parent_mirror_repairs repair
  WHERE student_row.id = repair.student_id
  RETURNING student_row.id
)
INSERT INTO public.audit_logs (
  action, table_name, record_id, resource_type, resource_id,
  old_values, new_values, created_at
)
SELECT
  'linked_student_parent_mirror_repaired',
  'students',
  repair.student_id,
  'student',
  repair.student_id::text,
  jsonb_build_object(
    'parent_email', repair.old_parent_email,
    'parent_name', repair.old_parent_name,
    'parent_phone', repair.old_parent_phone
  ),
  jsonb_build_object(
    'parent_email', repair.new_parent_email,
    'parent_name', repair.new_parent_name,
    'parent_phone', repair.new_parent_phone,
    'parent_id', repair.parent_id,
    'parent_link_id', repair.parent_link_id
  ),
  now()
FROM _consent_parent_mirror_repairs repair
JOIN repaired ON repaired.id = repair.student_id;

CREATE TEMP TABLE _consent_stale_child_json_repairs ON COMMIT DROP AS
SELECT
  lead.id AS lead_id,
  lead.response_data->'child_matches' AS old_child_matches,
  COALESCE(
    jsonb_agg(item ORDER BY ordinal)
      FILTER (
        WHERE student_user.id IS NOT NULL
          AND student_user.role = 'student'
          AND student_row.id IS NOT NULL
      ),
    '[]'::jsonb
  ) AS new_child_matches
FROM public.form_leads lead
CROSS JOIN LATERAL jsonb_array_elements(
  COALESCE(lead.response_data->'child_matches', '[]'::jsonb)
) WITH ORDINALITY AS entries(item, ordinal)
LEFT JOIN public.portal_users student_user
  ON student_user.id = (item->>'studentId')::uuid
LEFT JOIN public.students student_row
  ON student_row.user_id = student_user.id
WHERE lead.response_data ? 'child_matches'
GROUP BY lead.id, lead.response_data->'child_matches'
HAVING COALESCE(
  jsonb_agg(item ORDER BY ordinal)
    FILTER (
      WHERE student_user.id IS NOT NULL
        AND student_user.role = 'student'
        AND student_row.id IS NOT NULL
    ),
  '[]'::jsonb
) IS DISTINCT FROM lead.response_data->'child_matches';

WITH repaired AS (
  UPDATE public.form_leads lead
  SET response_data = jsonb_set(
    lead.response_data,
    '{child_matches}',
    repair.new_child_matches,
    true
  )
  FROM _consent_stale_child_json_repairs repair
  WHERE lead.id = repair.lead_id
  RETURNING lead.id
)
INSERT INTO public.audit_logs (
  action, table_name, record_id, resource_type, resource_id,
  old_values, new_values, created_at
)
SELECT
  'stale_consent_child_ids_pruned',
  'form_leads',
  repair.lead_id,
  'form_lead',
  repair.lead_id::text,
  jsonb_build_object('child_matches', repair.old_child_matches),
  jsonb_build_object('child_matches', repair.new_child_matches),
  now()
FROM _consent_stale_child_json_repairs repair
JOIN repaired ON repaired.id = repair.lead_id;

CREATE TEMP TABLE _consent_invalid_approved_leads ON COMMIT DROP AS
SELECT
  lead.id AS lead_id,
  lead.match_status AS old_match_status,
  lead.matched_student_id AS old_matched_student_id,
  lead.match_candidate_id AS old_match_candidate_id,
  CASE
    WHEN candidate_user.role = 'student'
         AND candidate_student.id IS NOT NULL
      THEN lead.match_candidate_id
    ELSE NULL
  END AS valid_candidate_id
FROM public.form_leads lead
LEFT JOIN public.portal_users primary_user
  ON primary_user.id = lead.matched_student_id
 AND primary_user.role = 'student'
LEFT JOIN public.students primary_student
  ON primary_student.user_id = primary_user.id
LEFT JOIN LATERAL (
  SELECT (item->>'studentId')::uuid AS student_id
  FROM jsonb_array_elements(
    COALESCE(lead.response_data->'child_matches', '[]'::jsonb)
  ) item
  WHERE (item->>'childIndex')::integer = 0
) json_primary ON true
LEFT JOIN public.portal_users json_primary_user
  ON json_primary_user.id = json_primary.student_id
 AND json_primary_user.role = 'student'
LEFT JOIN public.students json_primary_student
  ON json_primary_student.user_id = json_primary_user.id
LEFT JOIN public.portal_users candidate_user
  ON candidate_user.id = lead.match_candidate_id
LEFT JOIN public.students candidate_student
  ON candidate_student.user_id = candidate_user.id
WHERE lead.match_status = 'approved'
  AND primary_student.id IS NULL
  AND json_primary_student.id IS NULL;

WITH repaired AS (
  UPDATE public.form_leads lead
  SET match_status = CASE
        WHEN invalid.valid_candidate_id IS NOT NULL
          THEN 'pending_review'
        ELSE 'new_prospect'
      END,
      matched_student_id = NULL,
      match_candidate_id = invalid.valid_candidate_id,
      match_notes = concat_ws(
        E'\n',
        NULLIF(lead.match_notes, ''),
        'Approved lead had no valid primary student and was downgraded by integrity migration.'
      )
  FROM _consent_invalid_approved_leads invalid
  WHERE lead.id = invalid.lead_id
  RETURNING lead.id, lead.match_status
)
INSERT INTO public.audit_logs (
  action, table_name, record_id, resource_type, resource_id,
  old_values, new_values, created_at
)
SELECT
  'invalid_consent_approval_downgraded',
  'form_leads',
  invalid.lead_id,
  'form_lead',
  invalid.lead_id::text,
  jsonb_build_object(
    'match_status', invalid.old_match_status,
    'matched_student_id', invalid.old_matched_student_id,
    'match_candidate_id', invalid.old_match_candidate_id
  ),
  jsonb_build_object(
    'match_status', repaired.match_status,
    'match_candidate_id', invalid.valid_candidate_id
  ),
  now()
FROM _consent_invalid_approved_leads invalid
JOIN repaired ON repaired.id = invalid.lead_id;

DO $$
DECLARE
  v_count bigint;
BEGIN
  SELECT count(*)
    INTO v_count
  FROM (
    SELECT student_row.id
    FROM public.students student_row
    JOIN public.portal_users parent_user
      ON parent_user.role = 'parent'
     AND (
       (
         NULLIF(lower(btrim(COALESCE(student_row.parent_email, ''))), '') IS NOT NULL
         AND lower(btrim(parent_user.email)) =
             lower(btrim(student_row.parent_email))
       )
       OR
       (
         NULLIF(regexp_replace(COALESCE(student_row.parent_phone, ''), '\D', '', 'g'), '') IS NOT NULL
         AND regexp_replace(COALESCE(parent_user.phone, ''), '\D', '', 'g') =
             regexp_replace(student_row.parent_phone, '\D', '', 'g')
       )
     )
    WHERE NOT EXISTS (
      SELECT 1
      FROM public.parent_student_links psl
      WHERE psl.student_id = student_row.id
    )
    GROUP BY student_row.id
    HAVING count(DISTINCT parent_user.id) > 1
  ) ambiguous_legacy_parents;

  IF v_count > 0 THEN
    RAISE EXCEPTION
      'Consent repair found % unlinked legacy student(s) matching multiple parent portal accounts',
      v_count;
  END IF;
END
$$;

CREATE TEMP TABLE _consent_orphan_parent_field_repairs ON COMMIT DROP AS
SELECT
  student_row.id AS student_id,
  student_row.parent_email AS old_parent_email,
  student_row.parent_name AS old_parent_name,
  student_row.parent_phone AS old_parent_phone
FROM public.students student_row
WHERE (
    NULLIF(btrim(COALESCE(student_row.parent_email, '')), '') IS NOT NULL
    OR NULLIF(btrim(COALESCE(student_row.parent_name, '')), '') IS NOT NULL
    OR NULLIF(btrim(COALESCE(student_row.parent_phone, '')), '') IS NOT NULL
  )
  AND NOT EXISTS (
    SELECT 1
    FROM public.parent_student_links psl
    WHERE psl.student_id = student_row.id
  )
  AND NOT EXISTS (
    SELECT 1
    FROM public.portal_users parent_user
    WHERE parent_user.role = 'parent'
      AND (
        (
          NULLIF(lower(btrim(COALESCE(student_row.parent_email, ''))), '') IS NOT NULL
          AND lower(btrim(parent_user.email)) =
              lower(btrim(student_row.parent_email))
        )
        OR
        (
          NULLIF(regexp_replace(COALESCE(student_row.parent_phone, ''), '\D', '', 'g'), '') IS NOT NULL
          AND regexp_replace(COALESCE(parent_user.phone, ''), '\D', '', 'g') =
              regexp_replace(student_row.parent_phone, '\D', '', 'g')
        )
      )
  );

WITH repaired AS (
  UPDATE public.students student_row
  SET parent_email = NULL,
      parent_name = NULL,
      parent_phone = NULL,
      updated_at = now()
  FROM _consent_orphan_parent_field_repairs repair
  WHERE student_row.id = repair.student_id
  RETURNING student_row.id
)
INSERT INTO public.audit_logs (
  action, table_name, record_id, resource_type, resource_id,
  old_values, new_values, created_at
)
SELECT
  'legacy_parent_fields_archived_and_cleared',
  'students',
  repair.student_id,
  'student',
  repair.student_id::text,
  jsonb_build_object(
    'parent_email', repair.old_parent_email,
    'parent_name', repair.old_parent_name,
    'parent_phone', repair.old_parent_phone
  ),
  jsonb_build_object(
    'parent_email', NULL,
    'parent_name', NULL,
    'parent_phone', NULL,
    'reason', 'no parent_student_links row and no matching parent portal account'
  ),
  now()
FROM _consent_orphan_parent_field_repairs repair
JOIN repaired ON repaired.id = repair.student_id;

COMMIT;
