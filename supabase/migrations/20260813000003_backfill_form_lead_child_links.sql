-- Move valid legacy scalar/JSON consent-child provenance into the canonical
-- table. Deprecated child_matches JSON is removed only after relational parity.
BEGIN;

LOCK TABLE public.form_leads IN SHARE ROW EXCLUSIVE MODE;
LOCK TABLE public.form_lead_child_links IN SHARE ROW EXCLUSIVE MODE;
LOCK TABLE public.audit_logs IN ROW EXCLUSIVE MODE;

CREATE TEMP TABLE _consent_child_link_sources ON COMMIT DROP AS
SELECT
  source_rows.lead_id,
  source_rows.child_index,
  source_rows.student_portal_user_id,
  source_rows.status,
  source_rows.source,
  source_rows.metadata,
  source_rows.priority
FROM (
  SELECT
    lead.id AS lead_id,
    0 AS child_index,
    lead.matched_student_id AS student_portal_user_id,
    CASE
      WHEN lead.match_status = 'approved' THEN 'approved'
      ELSE 'candidate'
    END AS status,
    'legacy_primary'::text AS source,
    jsonb_build_object(
      'legacy_match_status', lead.match_status,
      'migrated_at', now()
    ) AS metadata,
    1 AS priority
  FROM public.form_leads lead
  JOIN public.portal_users student_user
    ON student_user.id = lead.matched_student_id
   AND student_user.role = 'student'
  JOIN public.students student_row
    ON student_row.user_id = student_user.id

  UNION ALL

  SELECT
    lead.id,
    (item->>'childIndex')::integer,
    (item->>'studentId')::uuid,
    CASE
      WHEN lead.match_status = 'approved' THEN 'approved'
      ELSE 'candidate'
    END,
    'legacy_child_matches',
    jsonb_strip_nulls(
      jsonb_build_object(
        'legacy_confidence', item->>'confidence',
        'legacy_student_name', item->>'studentName',
        'legacy_student_class', item->>'studentClass',
        'legacy_match_status', lead.match_status,
        'migrated_at', now()
      )
    ),
    2
  FROM public.form_leads lead
  CROSS JOIN LATERAL jsonb_array_elements(
    COALESCE(lead.response_data->'child_matches', '[]'::jsonb)
  ) item
  JOIN public.portal_users student_user
    ON student_user.id = (item->>'studentId')::uuid
   AND student_user.role = 'student'
  JOIN public.students student_row
    ON student_row.user_id = student_user.id

  UNION ALL

  SELECT
    lead.id,
    0,
    lead.match_candidate_id,
    'candidate',
    'legacy_match_candidate',
    jsonb_build_object(
      'legacy_match_status', lead.match_status,
      'migrated_at', now()
    ),
    3
  FROM public.form_leads lead
  JOIN public.portal_users student_user
    ON student_user.id = lead.match_candidate_id
   AND student_user.role = 'student'
  JOIN public.students student_row
    ON student_row.user_id = student_user.id
  WHERE lead.matched_student_id IS NULL
) source_rows;

DO $$
DECLARE
  v_count bigint;
BEGIN
  SELECT count(*)
    INTO v_count
  FROM (
    SELECT lead_id, child_index
    FROM _consent_child_link_sources
    GROUP BY lead_id, child_index
    HAVING count(DISTINCT student_portal_user_id) > 1
  ) ambiguous_slots;

  IF v_count > 0 THEN
    RAISE EXCEPTION
      'Canonical consent backfill found % lead/child slot(s) with multiple valid students',
      v_count;
  END IF;

  SELECT count(*)
    INTO v_count
  FROM (
    SELECT lead_id, student_portal_user_id
    FROM _consent_child_link_sources
    GROUP BY lead_id, student_portal_user_id
    HAVING count(DISTINCT child_index) > 1
  ) ambiguous_students;

  IF v_count > 0 THEN
    RAISE NOTICE
      'Canonical consent backfill deduped % lead/student pair(s) that appeared on multiple child slots',
      v_count;
  END IF;
END
$$;

CREATE TEMP TABLE _consent_expected_child_links ON COMMIT DROP AS
WITH deduped_students AS (
  SELECT DISTINCT ON (lead_id, student_portal_user_id)
    lead_id,
    child_index,
    student_portal_user_id,
    status,
    source,
    metadata,
    priority
  FROM _consent_child_link_sources
  ORDER BY lead_id, student_portal_user_id, child_index, priority
)
SELECT DISTINCT ON (lead_id, child_index)
  lead_id,
  child_index,
  student_portal_user_id,
  status,
  source,
  metadata
FROM deduped_students
ORDER BY lead_id, child_index, priority;

CREATE UNIQUE INDEX ON _consent_expected_child_links (lead_id, child_index);
CREATE UNIQUE INDEX ON _consent_expected_child_links (
  lead_id, student_portal_user_id
);

DO $$
DECLARE
  v_count bigint;
BEGIN
  SELECT count(*)
    INTO v_count
  FROM _consent_expected_child_links expected
  JOIN public.form_lead_child_links existing
    ON existing.lead_id = expected.lead_id
   AND existing.child_index = expected.child_index
  WHERE existing.student_portal_user_id <> expected.student_portal_user_id;

  IF v_count > 0 THEN
    RAISE EXCEPTION
      'Canonical consent backfill would replace % existing child slot(s) with a different student',
      v_count;
  END IF;

  SELECT count(*)
    INTO v_count
  FROM _consent_expected_child_links expected
  JOIN public.form_lead_child_links existing
    ON existing.lead_id = expected.lead_id
   AND existing.student_portal_user_id = expected.student_portal_user_id
  WHERE existing.child_index <> expected.child_index;

  IF v_count > 0 THEN
    RAISE EXCEPTION
      'Canonical consent backfill would move % existing lead/student link(s) to a different child slot',
      v_count;
  END IF;
END
$$;

WITH inserted AS (
  INSERT INTO public.form_lead_child_links (
    lead_id,
    child_index,
    student_portal_user_id,
    status,
    source,
    linked_at,
    metadata
  )
  SELECT
    expected.lead_id,
    expected.child_index,
    expected.student_portal_user_id,
    expected.status,
    expected.source,
    CASE
      WHEN expected.status = 'approved' THEN now()
      ELSE NULL
    END,
    expected.metadata
  FROM _consent_expected_child_links expected
  ON CONFLICT (lead_id, child_index) DO NOTHING
  RETURNING *
)
INSERT INTO public.audit_logs (
  action, table_name, record_id, resource_type, resource_id,
  old_values, new_values, created_at
)
SELECT
  'consent_child_link_backfilled',
  'form_lead_child_links',
  inserted.id,
  'form_lead_child_link',
  inserted.id::text,
  NULL,
  jsonb_build_object(
    'lead_id', inserted.lead_id,
    'child_index', inserted.child_index,
    'student_portal_user_id', inserted.student_portal_user_id,
    'status', inserted.status,
    'source', inserted.source,
    'metadata', inserted.metadata
  ),
  now()
FROM inserted;

DO $$
DECLARE
  v_count bigint;
  v_sample text;
BEGIN
  SELECT count(*)
    INTO v_count
  FROM _consent_expected_child_links expected
  LEFT JOIN public.form_lead_child_links canonical
    ON canonical.lead_id = expected.lead_id
   AND canonical.child_index = expected.child_index
   AND canonical.student_portal_user_id =
       expected.student_portal_user_id
  WHERE canonical.id IS NULL;

  IF v_count > 0 THEN
    SELECT string_agg(
      expected.lead_id::text || ':' || expected.child_index::text,
      ', '
      ORDER BY expected.lead_id, expected.child_index
    )
      INTO v_sample
    FROM (
      SELECT expected.lead_id, expected.child_index
      FROM _consent_expected_child_links expected
      LEFT JOIN public.form_lead_child_links canonical
        ON canonical.lead_id = expected.lead_id
       AND canonical.child_index = expected.child_index
       AND canonical.student_portal_user_id =
           expected.student_portal_user_id
      WHERE canonical.id IS NULL
      ORDER BY expected.lead_id, expected.child_index
      LIMIT 10
    ) expected;

    RAISE EXCEPTION
      'Canonical consent parity failed for % child link(s) (sample lead:index: %)',
      v_count, v_sample;
  END IF;
END
$$;

CREATE TEMP TABLE _consent_child_matches_retirement ON COMMIT DROP AS
SELECT
  lead.id AS lead_id,
  lead.response_data->'child_matches' AS old_child_matches
FROM public.form_leads lead
WHERE lead.response_data ? 'child_matches';

WITH repaired AS (
  UPDATE public.form_leads lead
  SET response_data = lead.response_data - 'child_matches'
  FROM _consent_child_matches_retirement retirement
  WHERE lead.id = retirement.lead_id
  RETURNING lead.id
)
INSERT INTO public.audit_logs (
  action, table_name, record_id, resource_type, resource_id,
  old_values, new_values, created_at
)
SELECT
  'legacy_consent_child_matches_retired',
  'form_leads',
  retirement.lead_id,
  'form_lead',
  retirement.lead_id::text,
  jsonb_build_object(
    'child_matches', retirement.old_child_matches
  ),
  jsonb_build_object(
    'canonical_child_link_count',
    (
      SELECT count(*)
      FROM public.form_lead_child_links canonical
      WHERE canonical.lead_id = retirement.lead_id
    ),
    'child_matches_removed', true
  ),
  now()
FROM _consent_child_matches_retirement retirement
JOIN repaired ON repaired.id = retirement.lead_id;

COMMIT;
