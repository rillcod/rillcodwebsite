-- Add structured response data to consent form signatures
ALTER TABLE consent_responses
  ADD COLUMN IF NOT EXISTS response_data JSONB;
