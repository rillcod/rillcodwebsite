-- notification_preferences had RLS enabled and not one policy.
--
-- Row level security denies by default: with the flag on and no policy, every
-- SELECT returns nothing and every INSERT/UPDATE is rejected for `anon` and
-- `authenticated`. The GRANT ALL the baseline hands those roles does not help,
-- because grants are checked before RLS, not instead of it.
--
-- Nothing surfaced because the only caller is a browser component. Its read
-- treats "no row" as "use the defaults", so the screen always rendered the
-- defaults; its write caught the refusal, logged to the console and reverted
-- the toggle. The switch flipped, flipped back, and said nothing. Reload, and
-- the setting was gone — because it had never been stored.
--
-- Every other user-owned table in this schema scopes with `= auth.uid()`, and
-- portal_users.id is the auth user id, so portal_user_id compares directly.
-- Admins keep the same override they have on notifications, via is_admin().

DROP POLICY IF EXISTS "notification_preferences_own" ON public.notification_preferences;
CREATE POLICY "notification_preferences_own" ON public.notification_preferences
  FOR ALL TO PUBLIC
  USING (portal_user_id = auth.uid())
  WITH CHECK (portal_user_id = auth.uid());

DROP POLICY IF EXISTS "notification_preferences_admin" ON public.notification_preferences;
CREATE POLICY "notification_preferences_admin" ON public.notification_preferences
  FOR ALL TO PUBLIC
  USING (public.is_admin())
  WITH CHECK (public.is_admin());
