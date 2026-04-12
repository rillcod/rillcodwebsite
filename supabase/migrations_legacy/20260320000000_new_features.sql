-- ============================================================
-- Migration: New features — CBT metadata/school_id, engage_posts, vault_items
-- Created: 2026-03-20
-- ============================================================

-- 1. Add metadata and school_id columns to cbt_exams
--    metadata: stores section_weights and any future exam-level config (JSONB)
--    school_id: allows scoping exams to a specific school
ALTER TABLE public.cbt_exams
  ADD COLUMN IF NOT EXISTS metadata      JSONB    DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS school_id     UUID     REFERENCES public.schools(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_cbt_exams_school ON public.cbt_exams USING btree (school_id);

-- 2. Add section column to cbt_questions (stored inside existing metadata JSONB)
--    No schema change needed — section is stored in metadata->>'section'
--    This comment documents the convention.

-- 3. Create engage_posts table — community code/discussion posts
CREATE TABLE IF NOT EXISTS public.engage_posts (
  id           UUID        DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
  user_id      UUID        NOT NULL REFERENCES public.portal_users(id) ON DELETE CASCADE,
  author_name  TEXT        NOT NULL,
  content      TEXT        NOT NULL,
  code_snippet TEXT        DEFAULT NULL,
  language     TEXT        DEFAULT NULL,
  likes        INTEGER     NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.engage_posts OWNER TO postgres;

-- RLS
ALTER TABLE public.engage_posts ENABLE ROW LEVEL SECURITY;

-- Any authenticated user can read posts
CREATE POLICY "engage_posts_select" ON public.engage_posts
  FOR SELECT USING (auth.role() = 'authenticated');

-- Only owner can insert their own posts
CREATE POLICY "engage_posts_insert" ON public.engage_posts
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Only owner can update their own posts (e.g. likes optimistic update is done via service role or RPC; for simplicity allow all authenticated for likes)
CREATE POLICY "engage_posts_update" ON public.engage_posts
  FOR UPDATE USING (auth.role() = 'authenticated');

-- Only owner can delete
CREATE POLICY "engage_posts_delete" ON public.engage_posts
  FOR DELETE USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_engage_posts_user    ON public.engage_posts USING btree (user_id);
CREATE INDEX IF NOT EXISTS idx_engage_posts_created ON public.engage_posts USING btree (created_at DESC);

-- 4. Create vault_items table — personal code snippet vault
CREATE TABLE IF NOT EXISTS public.vault_items (
  id          UUID        DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
  user_id     UUID        NOT NULL REFERENCES public.portal_users(id) ON DELETE CASCADE,
  title       TEXT        NOT NULL,
  language    TEXT        NOT NULL DEFAULT 'javascript',
  code        TEXT        NOT NULL,
  description TEXT        DEFAULT NULL,
  tags        TEXT[]      DEFAULT NULL,
  created_at  TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.vault_items OWNER TO postgres;

-- RLS
ALTER TABLE public.vault_items ENABLE ROW LEVEL SECURITY;

-- Only owner can access their own vault items
CREATE POLICY "vault_items_owner" ON public.vault_items
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_vault_items_user    ON public.vault_items USING btree (user_id);
CREATE INDEX IF NOT EXISTS idx_vault_items_created ON public.vault_items USING btree (created_at DESC);

-- 5. Add lesson_id to assignments (links an assignment to a specific lesson)
ALTER TABLE public.assignments ADD COLUMN IF NOT EXISTS lesson_id UUID REFERENCES public.lessons(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_assignments_lesson_id ON public.assignments USING btree (lesson_id);

-- 6. Expression index on certificates.metadata->>'school_id' to speed up
--    filtered queries (was causing ~1200ms SLOW_REQUEST on GET /api/certificates)
CREATE INDEX IF NOT EXISTS idx_certificates_metadata_school_id
  ON public.certificates ((metadata->>'school_id'));

CREATE INDEX IF NOT EXISTS idx_certificates_created_at
  ON public.certificates USING btree (created_at DESC);
