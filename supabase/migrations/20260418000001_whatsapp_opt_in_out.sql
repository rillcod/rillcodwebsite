-- WhatsApp Opt-In/Opt-Out Compliance Migration
-- Created: 2026-04-18
-- Purpose: Add opt-in/opt-out tracking for WhatsApp communications

-- Add opt-out columns to whatsapp_conversations table
ALTER TABLE whatsapp_conversations 
ADD COLUMN IF NOT EXISTS opted_out BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS opted_out_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS opted_in_at TIMESTAMPTZ;

-- Add opt-in column to portal_users table
ALTER TABLE portal_users 
ADD COLUMN IF NOT EXISTS whatsapp_opt_in BOOLEAN DEFAULT FALSE;

-- Create index for faster opt-out checks
CREATE INDEX IF NOT EXISTS idx_whatsapp_conversations_opted_out 
ON whatsapp_conversations(opted_out) 
WHERE opted_out = TRUE;

-- Create index for portal user opt-in
CREATE INDEX IF NOT EXISTS idx_portal_users_whatsapp_opt_in 
ON portal_users(whatsapp_opt_in) 
WHERE whatsapp_opt_in = TRUE;

-- Add comment to document the columns
COMMENT ON COLUMN whatsapp_conversations.opted_out IS 'User has opted out of WhatsApp notifications (replied STOP)';
COMMENT ON COLUMN whatsapp_conversations.opted_out_at IS 'Timestamp when user opted out';
COMMENT ON COLUMN whatsapp_conversations.opted_in_at IS 'Timestamp when user opted in (or first messaged us)';
COMMENT ON COLUMN portal_users.whatsapp_opt_in IS 'User has consented to receive WhatsApp notifications';

-- Set default opt-in timestamp for existing conversations (they messaged us first)
UPDATE whatsapp_conversations 
SET opted_in_at = created_at 
WHERE opted_in_at IS NULL AND created_at IS NOT NULL;

-- Migration complete
-- Users can now opt-out by replying "STOP" and opt-in by replying "START"
