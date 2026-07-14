-- Batch B in-person centre fee aligned closer to online: ₦40,000 (online remains ₦50,000).
UPDATE public.special_program_pages
SET onsite_fee = 40000,
    updated_at = now()
WHERE onsite_fee IS DISTINCT FROM 40000;
