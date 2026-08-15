-- Gallery media that can actually be fetched, and shared without a login.
--
-- Two problems, one migration.
--
-- The upload stored `/api/storage/r2?key=…` as the media URL and that route does
-- not exist anywhere in the codebase. Every photograph and clip a teacher
-- uploaded was written to the bucket and then pointed at by a URL that 404s. The
-- rest of this codebase stores the R2 key and signs it on read, which is the
-- pattern the billing proofs, CRM attachments and certificates all use.
--
-- And a capstone clip is the thing a QR code on a printed school report points
-- at. A board member holding that page has no account and never will, so the
-- clip needs an address that works without one — a random token, exactly as the
-- partnership documents do it, never the row id.

alter table public.school_gallery_media
  add column if not exists r2_key text,
  add column if not exists share_token uuid not null default gen_random_uuid();

create unique index if not exists uq_school_gallery_media_share_token
  on public.school_gallery_media (share_token);

comment on column public.school_gallery_media.r2_key is
  'Object key in the R2 bucket. Signed on read; never served through a stored URL, which expires or 404s.';
comment on column public.school_gallery_media.share_token is
  'Secret for the public /c/<token> view. What a QR code on a printed report resolves to, for a reader with no account.';
