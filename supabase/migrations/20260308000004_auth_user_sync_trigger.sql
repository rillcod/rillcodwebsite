-- ─────────────────────────────────────────────────────────────────────────────
-- Auth ↔ portal_users sync trigger
--
-- Fires AFTER INSERT on auth.users and ensures every authenticated user
-- always has a matching row in portal_users — even if created via the
-- Supabase dashboard, magic link, or any path outside the signup API.
--
-- Uses ON CONFLICT (id) DO NOTHING so the admin signup flow (which sets
-- role, school_id, etc. explicitly) is never overwritten.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER          -- runs as the DB owner, can write to portal_users
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.portal_users (
    id,
    email,
    full_name,
    role,
    is_active,
    created_at,
    updated_at
  )
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(
      NEW.raw_user_meta_data->>'full_name',
      split_part(NEW.email, '@', 1)   -- fallback: use email prefix as name
    ),
    COALESCE(NEW.raw_user_meta_data->>'role', 'student'),
    true,
    NOW(),
    NOW()
  )
  ON CONFLICT (id) DO NOTHING;  -- admin-created rows already have full data

  RETURN NEW;
END;
$$;

-- Drop and recreate to ensure it's always up to date
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_auth_user();


-- ─────────────────────────────────────────────────────────────────────────────
-- Backfill: create portal_users rows for any auth users that are missing one.
-- Safe to run multiple times (ON CONFLICT DO NOTHING).
-- ─────────────────────────────────────────────────────────────────────────────

INSERT INTO public.portal_users (id, email, full_name, role, is_active, created_at, updated_at)
SELECT
  au.id,
  au.email,
  COALESCE(au.raw_user_meta_data->>'full_name', split_part(au.email, '@', 1)),
  COALESCE(au.raw_user_meta_data->>'role', 'student'),
  true,
  au.created_at,
  NOW()
FROM auth.users au
WHERE NOT EXISTS (
  SELECT 1 FROM public.portal_users pu WHERE pu.id = au.id
);
