-- Migration to enhance lesson_plans table
ALTER TABLE public.lesson_plans ADD COLUMN IF NOT EXISTS plan_data JSONB DEFAULT '{}'::jsonb;
ALTER TABLE public.lesson_plans ADD COLUMN IF NOT EXISTS covers_full_course BOOLEAN DEFAULT FALSE;
