-- Migration: notification_preferences new category columns
-- Requirements: Req 8.1, NF-5.4

-- Req 8.1: Add four new preference category columns for payments, reports,
--          attendance, and weekly summaries. All default to true so existing
--          users continue receiving notifications after the migration.
-- NF-5.4: Add streak_reminder column required by the streak reminder cron
--         route to respect per-user opt-out preferences.

alter table public.notification_preferences
  add column if not exists payment_updates    boolean not null default true,
  add column if not exists report_published   boolean not null default true,
  add column if not exists attendance_alerts  boolean not null default true,
  add column if not exists weekly_summary     boolean not null default true,
  add column if not exists streak_reminder    boolean not null default true;
