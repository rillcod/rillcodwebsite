-- WhatsApp Opt-In/Opt-Out Compliance Migration
-- Created: 2026-04-18
-- Purpose: Add opt-in/opt-out tracking and rich metadata for WhatsApp communications

-- 1. Add opt-out columns to whatsapp_conversations table
ALTER TABLE whatsapp_conversations 
ADD COLUMN IF NOT EXISTS opted_out BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS opted_out_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS opted_in_at TIMESTAMPTZ;

-- 2. Add opt-in column to portal_users table
ALTER TABLE portal_users 
ADD COLUMN IF NOT EXISTS whatsapp_opt_in BOOLEAN DEFAULT FALSE;

-- 3. Add metadata column to whatsapp_messages for rich status tracking
-- This stores API errors, rate limiting info, and sender details
ALTER TABLE whatsapp_messages
ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb;

-- 4. Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_whatsapp_conversations_opted_out 
ON whatsapp_conversations(opted_out) 
WHERE opted_out = TRUE;

CREATE INDEX IF NOT EXISTS idx_portal_users_whatsapp_opt_in 
ON portal_users(whatsapp_opt_in) 
WHERE whatsapp_opt_in = TRUE;

-- 5. Add comments documentation
COMMENT ON COLUMN whatsapp_conversations.opted_out IS 'User has opted out of WhatsApp notifications (replied STOP)';
COMMENT ON COLUMN whatsapp_conversations.opted_out_at IS 'Timestamp when user opted out';
COMMENT ON COLUMN whatsapp_conversations.opted_in_at IS 'Timestamp when user opted in (or first messaged us)';
COMMENT ON COLUMN portal_users.whatsapp_opt_in IS 'User has consented to receive WhatsApp notifications';
COMMENT ON COLUMN whatsapp_messages.metadata IS 'Rich metadata for message status (API errors, rate limits, sender info)';

-- 6. Seed initial opt-in data
UPDATE whatsapp_conversations 
SET opted_in_at = created_at 
WHERE opted_in_at IS NULL AND created_at IS NOT NULL;

-- Migration complete
-- Users can now opt-out by replying "STOP" and opt-in by replying "START"
