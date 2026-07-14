-- Align special-programme onsite fee with current in-person Summer product (₦35,000 duration).
UPDATE public.special_program_pages
SET onsite_fee = 35000,
    updated_at = now()
WHERE onsite_fee IS DISTINCT FROM 35000;
