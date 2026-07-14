-- Batch B public online fee is ₦50,000 (2nd cohort).
-- Batch A attendees who were charged ₦60,000 stay locked via payment total_tuition / heuristics.
UPDATE public.special_program_pages
SET online_fee = 50000,
    updated_at = now()
WHERE online_fee IS DISTINCT FROM 50000;
