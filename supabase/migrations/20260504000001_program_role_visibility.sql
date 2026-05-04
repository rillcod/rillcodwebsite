-- Add per-role visibility toggles to programs.
-- visible_to_teachers: admin can release a program to teacher dashboards
-- visible_to_students: admin can release a program to student/parent portals
-- Public website and admin always see all active programs regardless of these flags.

ALTER TABLE programs
  ADD COLUMN IF NOT EXISTS visible_to_teachers boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS visible_to_students boolean NOT NULL DEFAULT false;

-- Flagship programmes are on by default for both roles
UPDATE programs
SET visible_to_teachers = true,
    visible_to_students = true
WHERE name ILIKE '%young innovator%'
   OR name ILIKE '%teen developer%';
