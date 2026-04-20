-- Fix notifications_type_check constraint.
-- The original constraint only allowed 'info'|'success'|'warning'|'error',
-- but the codebase also inserts 'achievement', 'streak', 'celebration',
-- 'announcement', 'feedback', and 'email_sent'. Every one of those caused
-- "new row violates check constraint notifications_type_check" errors.

ALTER TABLE public.notifications
  DROP CONSTRAINT IF EXISTS notifications_type_check;

ALTER TABLE public.notifications
  ADD CONSTRAINT notifications_type_check
    CHECK (type = ANY (ARRAY[
      'info',
      'success',
      'warning',
      'error',
      'achievement',
      'streak',
      'celebration',
      'announcement',
      'feedback',
      'email_sent'
    ]));
