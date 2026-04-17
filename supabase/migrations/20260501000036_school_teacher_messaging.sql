-- School-Teacher Messaging System
-- Replaces the parent-teacher system with proper school-to-teacher communication

-- School-Teacher Conversations
CREATE TABLE IF NOT EXISTS public.school_teacher_conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  teacher_id uuid NOT NULL REFERENCES public.portal_users(id) ON DELETE CASCADE,
  subject text NOT NULL,
  created_by uuid NOT NULL REFERENCES public.portal_users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  is_archived boolean NOT NULL DEFAULT false,
  UNIQUE(school_id, teacher_id)
);

-- School-Teacher Messages
CREATE TABLE IF NOT EXISTS public.school_teacher_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.school_teacher_conversations(id) ON DELETE CASCADE,
  sender_id uuid NOT NULL REFERENCES public.portal_users(id) ON DELETE CASCADE,
  body text NOT NULL,
  is_read boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_st_conversations_school ON public.school_teacher_conversations(school_id);
CREATE INDEX IF NOT EXISTS idx_st_conversations_teacher ON public.school_teacher_conversations(teacher_id);
CREATE INDEX IF NOT EXISTS idx_st_conversations_updated ON public.school_teacher_conversations(updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_st_messages_conversation ON public.school_teacher_messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_st_messages_sender ON public.school_teacher_messages(sender_id);
CREATE INDEX IF NOT EXISTS idx_st_messages_created ON public.school_teacher_messages(created_at);
CREATE INDEX IF NOT EXISTS idx_st_messages_unread ON public.school_teacher_messages(conversation_id, is_read) WHERE is_read = false;

-- Row Level Security
ALTER TABLE public.school_teacher_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.school_teacher_messages ENABLE ROW LEVEL SECURITY;

-- Policies for school_teacher_conversations
DROP POLICY IF EXISTS "school_teacher_conversations_select" ON public.school_teacher_conversations;
CREATE POLICY "school_teacher_conversations_select" ON public.school_teacher_conversations
  FOR SELECT USING (
    -- Schools can see their own conversations
    (school_id IN (
      SELECT school_id FROM public.portal_users 
      WHERE id = auth.uid() AND role = 'school'
    ))
    OR
    -- Teachers can see conversations they're part of
    (teacher_id = auth.uid())
    OR
    -- Admins can see all
    (EXISTS (
      SELECT 1 FROM public.portal_users 
      WHERE id = auth.uid() AND role = 'admin'
    ))
  );

DROP POLICY IF EXISTS "school_teacher_conversations_insert" ON public.school_teacher_conversations;
CREATE POLICY "school_teacher_conversations_insert" ON public.school_teacher_conversations
  FOR INSERT WITH CHECK (
    -- Schools can create conversations for their school
    (school_id IN (
      SELECT school_id FROM public.portal_users 
      WHERE id = auth.uid() AND role = 'school'
    ))
    OR
    -- Teachers can create conversations
    (teacher_id = auth.uid())
    OR
    -- Admins can create any conversation
    (EXISTS (
      SELECT 1 FROM public.portal_users 
      WHERE id = auth.uid() AND role = 'admin'
    ))
  );

DROP POLICY IF EXISTS "school_teacher_conversations_update" ON public.school_teacher_conversations;
CREATE POLICY "school_teacher_conversations_update" ON public.school_teacher_conversations
  FOR UPDATE USING (
    -- Same as select policy
    (school_id IN (
      SELECT school_id FROM public.portal_users 
      WHERE id = auth.uid() AND role = 'school'
    ))
    OR
    (teacher_id = auth.uid())
    OR
    (EXISTS (
      SELECT 1 FROM public.portal_users 
      WHERE id = auth.uid() AND role = 'admin'
    ))
  );

-- Policies for school_teacher_messages
DROP POLICY IF EXISTS "school_teacher_messages_select" ON public.school_teacher_messages;
CREATE POLICY "school_teacher_messages_select" ON public.school_teacher_messages
  FOR SELECT USING (
    conversation_id IN (
      SELECT id FROM public.school_teacher_conversations
      WHERE 
        (school_id IN (
          SELECT school_id FROM public.portal_users 
          WHERE id = auth.uid() AND role = 'school'
        ))
        OR
        (teacher_id = auth.uid())
        OR
        (EXISTS (
          SELECT 1 FROM public.portal_users 
          WHERE id = auth.uid() AND role = 'admin'
        ))
    )
  );

DROP POLICY IF EXISTS "school_teacher_messages_insert" ON public.school_teacher_messages;
CREATE POLICY "school_teacher_messages_insert" ON public.school_teacher_messages
  FOR INSERT WITH CHECK (
    -- Can only send messages to conversations they have access to
    conversation_id IN (
      SELECT id FROM public.school_teacher_conversations
      WHERE 
        (school_id IN (
          SELECT school_id FROM public.portal_users 
          WHERE id = auth.uid() AND role = 'school'
        ))
        OR
        (teacher_id = auth.uid())
        OR
        (EXISTS (
          SELECT 1 FROM public.portal_users 
          WHERE id = auth.uid() AND role = 'admin'
        ))
    )
    AND sender_id = auth.uid()
  );

DROP POLICY IF EXISTS "school_teacher_messages_update" ON public.school_teacher_messages;
CREATE POLICY "school_teacher_messages_update" ON public.school_teacher_messages
  FOR UPDATE USING (
    -- Can update messages in conversations they have access to
    conversation_id IN (
      SELECT id FROM public.school_teacher_conversations
      WHERE 
        (school_id IN (
          SELECT school_id FROM public.portal_users 
          WHERE id = auth.uid() AND role = 'school'
        ))
        OR
        (teacher_id = auth.uid())
        OR
        (EXISTS (
          SELECT 1 FROM public.portal_users 
          WHERE id = auth.uid() AND role = 'admin'
        ))
    )
  );

-- Function to update conversation timestamp when message is sent
CREATE OR REPLACE FUNCTION update_conversation_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE public.school_teacher_conversations 
  SET updated_at = NEW.created_at 
  WHERE id = NEW.conversation_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to automatically update conversation timestamp
DROP TRIGGER IF EXISTS trigger_update_conversation_timestamp ON public.school_teacher_messages;
CREATE TRIGGER trigger_update_conversation_timestamp
  AFTER INSERT ON public.school_teacher_messages
  FOR EACH ROW
  EXECUTE FUNCTION update_conversation_timestamp();