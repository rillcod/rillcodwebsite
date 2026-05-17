-- Enable Realtime for the notifications table so client-side
-- postgres_changes subscriptions receive INSERT/UPDATE events.
ALTER PUBLICATION supabase_realtime ADD TABLE notifications;
