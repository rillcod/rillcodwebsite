-- Widen storage_provider check to include 'r2' (Cloudflare R2, S3-compatible)
-- The original constraint only allowed 's3' | 'cloudinary'
ALTER TABLE files DROP CONSTRAINT IF EXISTS files_storage_provider_check;
ALTER TABLE files ADD CONSTRAINT files_storage_provider_check
  CHECK (storage_provider = ANY (ARRAY['s3'::"text", 'r2'::"text", 'cloudinary'::"text"]));

-- Normalise any rows inserted with 'r2' before the code was fixed to use 's3'
UPDATE files SET storage_provider = 's3' WHERE storage_provider = 'r2';
