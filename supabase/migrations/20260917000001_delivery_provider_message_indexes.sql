-- Delivery + case-event lookup by provider message id alone (webhook fallbacks).
CREATE INDEX IF NOT EXISTS communication_delivery_log_provider_message_id_idx
  ON public.communication_delivery_log(provider_message_id)
  WHERE provider_message_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS communication_case_events_provider_message_id_idx
  ON public.communication_case_events(provider_message_id)
  WHERE provider_message_id IS NOT NULL;
