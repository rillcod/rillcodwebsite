-- R2 is S3-compatible so we use 's3' as the storage_provider value.
-- This migration is a no-op safety net — all new inserts already use 's3'.
-- If any rows were previously inserted with 'r2' during testing, update them.
UPDATE files SET storage_provider = 's3' WHERE storage_provider = 'r2';
