-- Newsletter scheduling: let a newsletter be queued to publish/push later. A cron sweep
-- (/api/cron/publish-newsletters) publishes those whose scheduled_for has passed, delivering
-- to the stored target audience. (The dedupe unique index on newsletter_delivery
-- (newsletter_id, user_id) already exists — push now upserts on it instead of insert.)
ALTER TABLE newsletters ADD COLUMN IF NOT EXISTS scheduled_for timestamptz;
ALTER TABLE newsletters ADD COLUMN IF NOT EXISTS scheduled_target text;      -- 'all'|'students'|'teachers'|'schools'
ALTER TABLE newsletters ADD COLUMN IF NOT EXISTS scheduled_send_email boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN newsletters.scheduled_for IS 'When a scheduled newsletter should auto-publish/push. NULL = not scheduled.';
