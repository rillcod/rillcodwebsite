-- The inbox conversation-meta upsert targets conversation_id (one meta row per
-- conversation) but the table only had a PK on id, so `on conflict (conversation_id)`
-- failed with "no unique or exclusion constraint matching". Add the unique index.
create unique index if not exists uq_comm_conv_meta_conversation
  on public.communication_conversation_meta (conversation_id);
