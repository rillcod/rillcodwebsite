-- Migration: Add multi-user support to WhatsApp conversations
-- Date: 2026-04-18
-- Purpose: Add school_name and assigned_staff_id columns for better conversation management

-- 1. Add school_name column to store school information for external contacts
ALTER TABLE public.whatsapp_conversations 
ADD COLUMN IF NOT EXISTS school_name TEXT;

-- 2. Add assigned_staff_id column to track which staff member is handling the conversation
ALTER TABLE public.whatsapp_conversations 
ADD COLUMN IF NOT EXISTS assigned_staff_id UUID REFERENCES public.portal_users(id) ON DELETE SET NULL;

-- 3. Create index for faster queries on assigned staff
CREATE INDEX IF NOT EXISTS idx_whatsapp_conversations_assigned_staff 
ON public.whatsapp_conversations(assigned_staff_id) 
WHERE assigned_staff_id IS NOT NULL;

-- 4. Create index for school name searches
CREATE INDEX IF NOT EXISTS idx_whatsapp_conversations_school_name 
ON public.whatsapp_conversations(school_name) 
WHERE school_name IS NOT NULL;

-- 5. Add comments documentation
COMMENT ON COLUMN public.whatsapp_conversations.school_name IS 'School name for external contacts not linked to portal_users';
COMMENT ON COLUMN public.whatsapp_conversations.assigned_staff_id IS 'Staff member (teacher/admin) assigned to handle this conversation';

-- 6. Update RLS Policies for multi-user support
-- First, drop the old broad policy
DROP POLICY IF EXISTS "Staff can view WA conversations" ON public.whatsapp_conversations;

-- New SELECT policy: 
-- Admins/Schools can see everything.
-- Teachers see their assigned conversations OR unassigned external conversations.
CREATE POLICY "Staff view WA conversations" ON public.whatsapp_conversations
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.portal_users 
      WHERE id = auth.uid() 
      AND (
        role IN ('admin', 'school') OR
        (role = 'teacher' AND (assigned_staff_id = auth.uid() OR portal_user_id IS NULL))
      )
    )
  );

-- Add UPDATE policy so staff can assign themselves/others and update counts
CREATE POLICY "Staff update WA conversations" ON public.whatsapp_conversations
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM public.portal_users WHERE id = auth.uid() AND role IN ('admin', 'teacher', 'school'))
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.portal_users WHERE id = auth.uid() AND role IN ('admin', 'teacher', 'school'))
  );

-- Add INSERT policy so staff can start new quick chats
CREATE POLICY "Staff insert WA conversations" ON public.whatsapp_conversations
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM public.portal_users WHERE id = auth.uid() AND role IN ('admin', 'teacher', 'school'))
  );

-- 7. Add trigger to keep school_name in sync when portal_user_id is linked
CREATE OR REPLACE FUNCTION public.sync_whatsapp_conversation_school()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.portal_user_id IS NOT NULL THEN
    SELECT school_name INTO NEW.school_name
    FROM public.portal_users
    WHERE id = NEW.portal_user_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sync_wa_conv_school ON public.whatsapp_conversations;
CREATE TRIGGER trg_sync_wa_conv_school
  BEFORE INSERT OR UPDATE OF portal_user_id ON public.whatsapp_conversations
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_whatsapp_conversation_school();

-- 8. Backfill school_name from linked portal_users where available
UPDATE public.whatsapp_conversations wc
SET school_name = pu.school_name
FROM public.portal_users pu
WHERE wc.portal_user_id = pu.id 
  AND wc.school_name IS NULL 
  AND pu.school_name IS NOT NULL;

