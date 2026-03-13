-- Migration to add gamification features for students
ALTER TABLE public.portal_users ADD COLUMN IF NOT EXISTS xp INTEGER DEFAULT 0;
ALTER TABLE public.portal_users ADD COLUMN IF NOT EXISTS level INTEGER DEFAULT 1;
ALTER TABLE public.portal_users ADD COLUMN IF NOT EXISTS streak INTEGER DEFAULT 0;
ALTER TABLE public.portal_users ADD COLUMN IF NOT EXISTS last_active_at TIMESTAMPTZ DEFAULT NOW();

-- Add XP tracking to lesson completion (trigger or logic-based)
-- We'll handlexp increments in the API for now.
