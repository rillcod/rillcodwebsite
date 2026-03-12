-- =============================================
-- FIX: Allow all authenticated users to read portal_users for messaging
-- =============================================

DROP POLICY IF EXISTS "Authenticated users can view portal_users" ON public.portal_users;
CREATE POLICY "Authenticated users can view portal_users" ON public.portal_users
  FOR SELECT TO authenticated USING (true);

-- Ensure users can also view messages effectively
DROP POLICY IF EXISTS "Users can view their messages" ON public.messages;
CREATE POLICY "Users can view their messages" ON public.messages 
  FOR SELECT USING (sender_id = auth.uid() OR recipient_id = auth.uid());

DROP POLICY IF EXISTS "Users can send messages" ON public.messages;
CREATE POLICY "Users can send messages" ON public.messages 
  FOR INSERT WITH CHECK (sender_id = auth.uid());

DROP POLICY IF EXISTS "Users can update own messages (read status)" ON public.messages;
CREATE POLICY "Users can update own messages (read status)" ON public.messages 
  FOR UPDATE USING (recipient_id = auth.uid()) WITH CHECK (recipient_id = auth.uid());
