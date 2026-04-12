-- Weighted grading: each assignment/project has a "weight" (report contribution in points)
-- and each submission stores a computed weighted_score

-- Add weight to assignments (0 = not counted toward report)
ALTER TABLE assignments ADD COLUMN IF NOT EXISTS weight INTEGER NOT NULL DEFAULT 0;

-- Add weighted_score to assignment_submissions
-- Computed as: round((grade / max_points) * weight) — always a whole number
ALTER TABLE assignment_submissions ADD COLUMN IF NOT EXISTS weighted_score INTEGER;
