-- Live sessions: school accounts must be able to create/update sessions for their school.
-- Token/list APIs use the service role (bypass RLS), but realtime + any user-scoped writes
-- still hit these policies. Without this, school logins look like "nobody can start/join"
-- when a path doesn't use the admin client.
--
-- Also let teachers update sessions for their assigned school (go-live), not only the host row.

DROP POLICY IF EXISTS "live_sessions_insert" ON public.live_sessions;
CREATE POLICY "live_sessions_insert" ON public.live_sessions
  FOR INSERT TO PUBLIC
  WITH CHECK (
    host_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.portal_users pu
      WHERE pu.id = auth.uid()
        AND pu.role = ANY (ARRAY['admin'::text, 'teacher'::text, 'school'::text])
        AND (
          pu.role = 'admin'::text
          OR live_sessions.school_id IS NULL
          OR pu.school_id = live_sessions.school_id
          OR EXISTS (
            SELECT 1 FROM public.teacher_schools ts
            WHERE ts.teacher_id = pu.id AND ts.school_id = live_sessions.school_id
          )
        )
    )
  );

DROP POLICY IF EXISTS "live_sessions_update" ON public.live_sessions;
CREATE POLICY "live_sessions_update" ON public.live_sessions
  FOR UPDATE TO PUBLIC
  USING (
    host_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.portal_users pu
      WHERE pu.id = auth.uid()
        AND (
          pu.role = 'admin'::text
          OR (
            pu.role = 'school'::text
            AND pu.school_id IS NOT NULL
            AND pu.school_id = live_sessions.school_id
          )
          OR (
            pu.role = 'teacher'::text
            AND (
              pu.school_id = live_sessions.school_id
              OR EXISTS (
                SELECT 1 FROM public.teacher_schools ts
                WHERE ts.teacher_id = pu.id AND ts.school_id = live_sessions.school_id
              )
            )
          )
        )
    )
  )
  WITH CHECK (
    host_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.portal_users pu
      WHERE pu.id = auth.uid()
        AND (
          pu.role = 'admin'::text
          OR (
            pu.role = 'school'::text
            AND pu.school_id IS NOT NULL
            AND pu.school_id = live_sessions.school_id
          )
          OR (
            pu.role = 'teacher'::text
            AND (
              pu.school_id = live_sessions.school_id
              OR EXISTS (
                SELECT 1 FROM public.teacher_schools ts
                WHERE ts.teacher_id = pu.id AND ts.school_id = live_sessions.school_id
              )
            )
          )
        )
    )
  );

-- Staff attendance management: include teachers assigned via teacher_schools, not only portal school_id.
DROP POLICY IF EXISTS "Staff manage live session attendance" ON public.live_session_attendance;
CREATE POLICY "Staff manage live session attendance" ON public.live_session_attendance
  FOR ALL TO PUBLIC
  USING (
    EXISTS (
      SELECT 1
      FROM public.portal_users pu
      JOIN public.live_sessions ls ON ls.id = live_session_attendance.session_id
      WHERE pu.id = auth.uid()
        AND pu.role = ANY (ARRAY['admin'::text, 'teacher'::text, 'school'::text])
        AND (
          pu.role = 'admin'::text
          OR pu.school_id = ls.school_id
          OR EXISTS (
            SELECT 1 FROM public.teacher_schools ts
            WHERE ts.teacher_id = pu.id AND ts.school_id = ls.school_id
          )
        )
    )
  );
