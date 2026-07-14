-- Public Summer online fee moves to ₦60,000 for new registrations (ads).
-- Onsite stays ₦35,000. Existing partial payers keep their locked total_tuition
-- from payment metadata / legacy ₦50k inference in app code.
UPDATE public.special_program_pages
SET online_fee = 60000,
    updated_at = now()
WHERE online_fee IS DISTINCT FROM 60000;
