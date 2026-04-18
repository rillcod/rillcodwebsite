-- Migration: Create WhatsApp Inbox schema
-- Handles conversations and individual messages for the 1-to-1 Webhook

CREATE TABLE IF NOT EXISTS public.whatsapp_conversations (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  phone_number text NOT NULL UNIQUE, -- E.164 formatted without '+' 
  contact_name text,
  portal_user_id uuid REFERENCES public.portal_users(id),
  last_message_at timestamptz DEFAULT now(),
  last_message_preview text,
  unread_count int DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.whatsapp_messages (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  conversation_id uuid NOT NULL REFERENCES public.whatsapp_conversations(id) ON DELETE CASCADE,
  direction text NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  meta_message_id text UNIQUE, -- Meta's wamid
  message_type text DEFAULT 'text',
  body text,
  media_url text,
  status text DEFAULT 'delivered',
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_wa_conv_phone ON public.whatsapp_conversations(phone_number);
CREATE INDEX IF NOT EXISTS idx_wa_msg_conv ON public.whatsapp_messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_wa_msg_meta_id ON public.whatsapp_messages(meta_message_id);

-- Add RLS Policies so admins/teachers can view conversations
ALTER TABLE public.whatsapp_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can view WA conversations" ON public.whatsapp_conversations
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM portal_users WHERE id = auth.uid() AND role IN ('admin', 'teacher', 'school'))
  );

CREATE POLICY "Staff can view WA messages" ON public.whatsapp_messages
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM portal_users WHERE id = auth.uid() AND role IN ('admin', 'teacher', 'school'))
  );
