-- Migration to add participation metrics and quota tracking
-- Date: 2026-03-12

-- 1. Add rillcod_quota_percent to schools
ALTER TABLE schools 
ADD COLUMN IF NOT EXISTS rillcod_quota_percent NUMERIC DEFAULT 0;

-- 2. Add participation metrics to student_progress_reports
ALTER TABLE student_progress_reports
ADD COLUMN IF NOT EXISTS participation_score NUMERIC DEFAULT 0,
ADD COLUMN IF NOT EXISTS engagement_metrics JSONB DEFAULT '{}'::jsonb;

-- 3. Add direct enrollment flag to handle summer school / bootcamps
ALTER TABLE portal_users
ADD COLUMN IF NOT EXISTS is_direct_enrollment BOOLEAN DEFAULT FALSE;

-- Comments for documentation
COMMENT ON COLUMN schools.rillcod_quota_percent IS 'Percentage of school fees that belongs to Rillcod for services rendered.';
COMMENT ON COLUMN student_progress_reports.participation_score IS 'Numerical score representing student activity and engagement.';
COMMENT ON COLUMN portal_users.is_direct_enrollment IS 'True if the student registered directly (Bootcamp, Summer School) vs through a partner school.';
