-- Native device push tokens (FCM Android / APNs iOS) for Capacitor shells.
-- Web Push remains in web_push_subscriptions.

CREATE TABLE IF NOT EXISTS device_push_tokens (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  portal_user_id   UUID        NOT NULL REFERENCES portal_users(id) ON DELETE CASCADE,
  token            TEXT        NOT NULL,
  platform         TEXT        NOT NULL CHECK (platform IN ('android', 'ios')),
  device_hint      TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (token)
);

CREATE INDEX IF NOT EXISTS idx_dpt_portal_user
  ON device_push_tokens(portal_user_id);

CREATE INDEX IF NOT EXISTS idx_dpt_platform
  ON device_push_tokens(platform);

ALTER TABLE device_push_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users read own device tokens"
  ON device_push_tokens
  FOR SELECT
  USING (portal_user_id = auth.uid());

CREATE POLICY "users delete own device tokens"
  ON device_push_tokens
  FOR DELETE
  USING (portal_user_id = auth.uid());

CREATE POLICY "service role all device tokens"
  ON device_push_tokens
  USING (auth.role() = 'service_role');
