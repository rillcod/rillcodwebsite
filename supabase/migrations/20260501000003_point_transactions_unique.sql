-- Migration: point_transactions unique constraint + total_points backfill
-- Requirements: Req 4.1, 4.5

-- Req 4.1: Add unique constraint to prevent duplicate point awards
--          for the same (portal_user_id, activity_type, reference_id) tuple.
ALTER TABLE point_transactions
  ADD CONSTRAINT uq_pt_user_activity_ref
    UNIQUE (portal_user_id, activity_type, reference_id);

-- Req 4.5: Add total_points column to track cumulative points
ALTER TABLE portal_users
  ADD COLUMN IF NOT EXISTS total_points INTEGER DEFAULT 0;

-- Backfill total_points for all existing portal_users
UPDATE portal_users
  SET total_points = (
    SELECT COALESCE(SUM(points), 0)
    FROM point_transactions
    WHERE portal_user_id = portal_users.id
  );


