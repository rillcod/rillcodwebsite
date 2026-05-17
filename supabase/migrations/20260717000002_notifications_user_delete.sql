-- Allow users to delete their own notifications (dismiss/clear from inbox).
-- Previously only admins could delete; non-admin deletes silently failed.
CREATE POLICY "Users can delete their own notifications"
  ON "public"."notifications"
  FOR DELETE
  USING (user_id = auth.uid());
