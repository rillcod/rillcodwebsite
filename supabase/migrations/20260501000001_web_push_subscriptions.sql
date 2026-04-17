-- Migration: 20260501000001_web_push_subscriptions
-- Purpose: Create web_push_subscriptions table, RLS, index;
--          migrate legacy push_sub_* keys from system_settings

-- ─────────────────────────────────────────────
-- 1. Create table
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS web_push_subscriptions (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  portal_user_id   UUID        NOT NULL REFERENCES portal_users(id) ON DELETE CASCADE,
  endpoint         TEXT        NOT NULL UNIQUE,
  subscription_json JSONB      NOT NULL,
  device_hint      TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─────────────────────────────────────────────
-- 2. Index for fast per-user lookups
-- ─────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_wps_portal_user
  ON web_push_subscriptions(portal_user_id);

-- ─────────────────────────────────────────────
-- 3. Row-Level Security
-- ─────────────────────────────────────────────
ALTER TABLE web_push_subscriptions ENABLE ROW LEVEL SECURITY;

-- Users may read their own subscriptions
CREATE POLICY "users read own"
  ON web_push_subscriptions
  FOR SELECT
  USING (portal_user_id = auth.uid());

-- Users may delete their own subscriptions
CREATE POLICY "users delete own"
  ON web_push_subscriptions
  FOR DELETE
  USING (portal_user_id = auth.uid());

-- Service role has full access (needed by server-side push.ts)
CREATE POLICY "service role all"
  ON web_push_subscriptions
  USING (auth.role() = 'service_role');

-- ─────────────────────────────────────────────
-- 4. Migrate legacy push_sub_* keys
--    Keys have the form: push_sub_{portal_user_id}
--    setting_value contains stringified PushSubscription JSON
--    (endpoint is nested inside the JSON object)
-- ─────────────────────────────────────────────
DO $$
DECLARE
  rec          RECORD;
  sub_json     JSONB;
  user_id_text TEXT;
  user_id_uuid UUID;
BEGIN
  FOR rec IN
    SELECT setting_key, setting_value
    FROM   system_settings
    WHERE  setting_key LIKE 'push_sub_%'
  LOOP
    BEGIN
      -- Extract the user UUID from the key: strip 'push_sub_' prefix
      user_id_text := SUBSTRING(rec.setting_key FROM LENGTH('push_sub_') + 1);
      user_id_uuid := user_id_text::UUID;

      -- Parse the stored subscription JSON
      sub_json := rec.setting_value::JSONB;

      -- Insert into the new table; skip if endpoint already exists
      INSERT INTO web_push_subscriptions
        (portal_user_id, endpoint, subscription_json)
      VALUES (
        user_id_uuid,
        sub_json->>'endpoint',
        sub_json
      )
      ON CONFLICT (endpoint) DO NOTHING;

      -- Delete the legacy key regardless of whether we inserted
      DELETE FROM system_settings
      WHERE  setting_key = rec.setting_key;

    EXCEPTION WHEN others THEN
      -- Log problematic keys but continue migrating the rest
      RAISE WARNING 'web_push_subscriptions migration: skipping key % due to error: %',
        rec.setting_key, SQLERRM;
    END;
  END LOOP;
END;
$$;
