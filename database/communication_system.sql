-- Communication and Chat System for Rillcod Academy
-- Advanced messaging, announcements, and live communication features

-- ========================================
-- COMMUNICATION & CHAT TABLES
-- ========================================

-- Chat Rooms (for group discussions, classes, etc.)
create table if not exists chat_rooms (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  room_type text check (room_type in ('class', 'group', 'support', 'announcement', 'live_session')),
  program_id uuid references programs(id) on delete cascade,
  class_id uuid references classes(id) on delete cascade,
  created_by uuid references portal_users(id),
  is_public boolean default false,
  is_active boolean default true,
  max_participants integer,
  allow_anonymous boolean default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Chat Room Participants
create table if not exists chat_room_participants (
  id uuid primary key default gen_random_uuid(),
  room_id uuid references chat_rooms(id) on delete cascade,
  user_id uuid references portal_users(id) on delete cascade,
  role text check (role in ('admin', 'moderator', 'participant', 'viewer')) default 'participant',
  joined_at timestamptz default now(),
  last_seen timestamptz default now(),
  is_muted boolean default false,
  is_banned boolean default false,
  unique(room_id, user_id)
);

-- Chat Messages
create table if not exists chat_messages (
  id uuid primary key default gen_random_uuid(),
  room_id uuid references chat_rooms(id) on delete cascade,
  sender_id uuid references portal_users(id) on delete cascade,
  message_type text check (message_type in ('text', 'image', 'file', 'system', 'announcement', 'reaction')) default 'text',
  content text not null,
  file_url text,
  file_name text,
  file_size integer,
  file_type text,
  reply_to_id uuid references chat_messages(id),
  is_edited boolean default false,
  edited_at timestamptz,
  is_deleted boolean default false,
  deleted_at timestamptz,
  deleted_by uuid references portal_users(id),
  created_at timestamptz default now()
);

-- Message Reactions
create table if not exists message_reactions (
  id uuid primary key default gen_random_uuid(),
  message_id uuid references chat_messages(id) on delete cascade,
  user_id uuid references portal_users(id) on delete cascade,
  reaction_type text not null, -- emoji or reaction type
  created_at timestamptz default now(),
  unique(message_id, user_id, reaction_type)
);

-- Direct Messages (private conversations)
create table if not exists direct_messages (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid references portal_users(id) on delete cascade,
  recipient_id uuid references portal_users(id) on delete cascade,
  message_type text check (message_type in ('text', 'image', 'file', 'voice', 'video')) default 'text',
  content text not null,
  file_url text,
  file_name text,
  file_size integer,
  file_type text,
  is_read boolean default false,
  read_at timestamptz,
  is_deleted boolean default false,
  deleted_at timestamptz,
  created_at timestamptz default now()
);

-- Announcements (system-wide or targeted)
create table if not exists announcements (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  content text not null,
  announcement_type text check (announcement_type in ('general', 'academic', 'event', 'emergency', 'maintenance')) default 'general',
  priority text check (priority in ('low', 'normal', 'high', 'urgent')) default 'normal',
  target_audience text check (target_audience in ('all', 'students', 'teachers', 'admins', 'parents')) default 'all',
  program_id uuid references programs(id) on delete cascade,
  class_id uuid references classes(id) on delete cascade,
  author_id uuid references portal_users(id),
  is_published boolean default false,
  published_at timestamptz,
  expires_at timestamptz,
  is_sticky boolean default false, -- Sticky announcements stay at top
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Announcement Recipients (for tracking who has seen announcements)
create table if not exists announcement_recipients (
  id uuid primary key default gen_random_uuid(),
  announcement_id uuid references announcements(id) on delete cascade,
  user_id uuid references portal_users(id) on delete cascade,
  is_read boolean default false,
  read_at timestamptz,
  created_at timestamptz default now(),
  unique(announcement_id, user_id)
);

-- Live Sessions (for virtual classrooms)
create table if not exists live_sessions (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  class_id uuid references classes(id) on delete cascade,
  host_id uuid references portal_users(id),
  session_type text check (session_type in ('lecture', 'discussion', 'workshop', 'q&a', 'presentation')) default 'lecture',
  meeting_url text, -- Zoom, Google Meet, etc.
  meeting_id text,
  meeting_password text,
  start_time timestamptz not null,
  end_time timestamptz,
  max_participants integer,
  is_recording boolean default false,
  recording_url text,
  status text check (status in ('scheduled', 'live', 'ended', 'cancelled')) default 'scheduled',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Live Session Participants
create table if not exists live_session_participants (
  id uuid primary key default gen_random_uuid(),
  session_id uuid references live_sessions(id) on delete cascade,
  user_id uuid references portal_users(id) on delete cascade,
  role text check (role in ('host', 'co-host', 'participant', 'viewer')) default 'participant',
  joined_at timestamptz,
  left_at timestamptz,
  duration_minutes integer,
  is_muted boolean default false,
  is_video_off boolean default false,
  created_at timestamptz default now()
);

-- Video Calls (for one-on-one or small group calls)
create table if not exists video_calls (
  id uuid primary key default gen_random_uuid(),
  caller_id uuid references portal_users(id) on delete cascade,
  recipient_id uuid references portal_users(id) on delete cascade,
  call_type text check (call_type in ('audio', 'video', 'screen_share')) default 'video',
  status text check (status in ('initiated', 'ringing', 'answered', 'ended', 'missed', 'declined')) default 'initiated',
  start_time timestamptz,
  end_time timestamptz,
  duration_seconds integer,
  is_recorded boolean default false,
  recording_url text,
  notes text,
  created_at timestamptz default now()
);

-- Communication Preferences
create table if not exists communication_preferences (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references portal_users(id) on delete cascade unique,
  email_notifications boolean default true,
  push_notifications boolean default true,
  sms_notifications boolean default false,
  chat_notifications boolean default true,
  announcement_notifications boolean default true,
  live_session_reminders boolean default true,
  quiet_hours_start time,
  quiet_hours_end time,
  timezone text default 'Africa/Lagos',
  language text default 'en',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Notification Templates
create table if not exists notification_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  type text check (type in ('email', 'push', 'sms', 'in_app')) not null,
  subject text,
  content text not null,
  variables jsonb, -- Template variables like {{user_name}}, {{class_name}}
  is_active boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Sent Notifications (for tracking delivery)
create table if not exists sent_notifications (
  id uuid primary key default gen_random_uuid(),
  template_id uuid references notification_templates(id) on delete cascade,
  recipient_id uuid references portal_users(id) on delete cascade,
  notification_type text check (notification_type in ('email', 'push', 'sms', 'in_app')) not null,
  subject text,
  content text not null,
  status text check (status in ('sent', 'delivered', 'read', 'failed')) default 'sent',
  sent_at timestamptz default now(),
  delivered_at timestamptz,
  read_at timestamptz,
  error_message text,
  created_at timestamptz default now()
);

-- ========================================
-- INDEXES FOR PERFORMANCE
-- ========================================

-- Chat indexes
create index if not exists idx_chat_rooms_type on chat_rooms(room_type);
create index if not exists idx_chat_rooms_program on chat_rooms(program_id);
create index if not exists idx_chat_rooms_class on chat_rooms(class_id);
create index if not exists idx_chat_rooms_active on chat_rooms(is_active);

create index if not exists idx_chat_participants_room on chat_room_participants(room_id);
create index if not exists idx_chat_participants_user on chat_room_participants(user_id);
create index if not exists idx_chat_participants_last_seen on chat_room_participants(last_seen);

create index if not exists idx_chat_messages_room on chat_messages(room_id);
create index if not exists idx_chat_messages_sender on chat_messages(sender_id);
create index if not exists idx_chat_messages_created on chat_messages(created_at);
create index if not exists idx_chat_messages_reply on chat_messages(reply_to_id);

create index if not exists idx_message_reactions_message on message_reactions(message_id);
create index if not exists idx_message_reactions_user on message_reactions(user_id);

create index if not exists idx_direct_messages_sender on direct_messages(sender_id);
create index if not exists idx_direct_messages_recipient on direct_messages(recipient_id);
create index if not exists idx_direct_messages_read on direct_messages(is_read);
create index if not exists idx_direct_messages_created on direct_messages(created_at);

-- Announcement indexes
create index if not exists idx_announcements_type on announcements(announcement_type);
create index if not exists idx_announcements_priority on announcements(priority);
create index if not exists idx_announcements_audience on announcements(target_audience);
create index if not exists idx_announcements_published on announcements(is_published);
create index if not exists idx_announcements_expires on announcements(expires_at);
create index if not exists idx_announcements_sticky on announcements(is_sticky);

create index if not exists idx_announcement_recipients_announcement on announcement_recipients(announcement_id);
create index if not exists idx_announcement_recipients_user on announcement_recipients(user_id);
create index if not exists idx_announcement_recipients_read on announcement_recipients(is_read);

-- Live session indexes
create index if not exists idx_live_sessions_class on live_sessions(class_id);
create index if not exists idx_live_sessions_host on live_sessions(host_id);
create index if not exists idx_live_sessions_status on live_sessions(status);
create index if not exists idx_live_sessions_start_time on live_sessions(start_time);

create index if not exists idx_live_participants_session on live_session_participants(session_id);
create index if not exists idx_live_participants_user on live_session_participants(user_id);

-- Video call indexes
create index if not exists idx_video_calls_caller on video_calls(caller_id);
create index if not exists idx_video_calls_recipient on video_calls(recipient_id);
create index if not exists idx_video_calls_status on video_calls(status);

-- Notification indexes
create index if not exists idx_sent_notifications_recipient on sent_notifications(recipient_id);
create index if not exists idx_sent_notifications_type on sent_notifications(notification_type);
create index if not exists idx_sent_notifications_status on sent_notifications(status);
create index if not exists idx_sent_notifications_sent_at on sent_notifications(sent_at);

-- ========================================
-- TRIGGERS
-- ========================================

-- Triggers for updated_at
create trigger update_chat_rooms_updated_at before update on chat_rooms for each row execute function update_updated_at_column();
create trigger update_announcements_updated_at before update on announcements for each row execute function update_updated_at_column();
create trigger update_communication_preferences_updated_at before update on communication_preferences for each row execute function update_updated_at_column();
create trigger update_live_sessions_updated_at before update on live_sessions for each row execute function update_updated_at_column();
create trigger update_notification_templates_updated_at before update on notification_templates for each row execute function update_updated_at_column();

-- Function to create communication preferences when user is created
create or replace function create_communication_preferences()
returns trigger as $$
begin
  insert into communication_preferences (user_id)
  values (new.id)
  on conflict (user_id) do nothing;
  return new;
end;
$$ language plpgsql;

-- Trigger to create communication preferences
create trigger create_communication_preferences_on_user_insert
  after insert on portal_users
  for each row
  execute function create_communication_preferences();

-- Function to update last_seen when user sends message
create or replace function update_last_seen_on_message()
returns trigger as $$
begin
  update chat_room_participants 
  set last_seen = now()
  where room_id = new.room_id and user_id = new.sender_id;
  return new;
end;
$$ language plpgsql;

-- Trigger to update last_seen
create trigger update_last_seen_on_message_send
  after insert on chat_messages
  for each row
  execute function update_last_seen_on_message();

-- ========================================
-- ENABLE RLS
-- ========================================

-- Enable RLS on all communication tables
alter table chat_rooms enable row level security;
alter table chat_room_participants enable row level security;
alter table chat_messages enable row level security;
alter table message_reactions enable row level security;
alter table direct_messages enable row level security;
alter table announcements enable row level security;
alter table announcement_recipients enable row level security;
alter table live_sessions enable row level security;
alter table live_session_participants enable row level security;
alter table video_calls enable row level security;
alter table communication_preferences enable row level security;
alter table notification_templates enable row level security;
alter table sent_notifications enable row level security;

-- Basic RLS policies (expand based on your needs)
create policy "Allow all operations for now" on chat_rooms for all using (true) with check (true);
create policy "Allow all operations for now" on chat_room_participants for all using (true) with check (true);
create policy "Allow all operations for now" on chat_messages for all using (true) with check (true);
create policy "Allow all operations for now" on message_reactions for all using (true) with check (true);
create policy "Allow all operations for now" on direct_messages for all using (true) with check (true);
create policy "Allow all operations for now" on announcements for all using (true) with check (true);
create policy "Allow all operations for now" on announcement_recipients for all using (true) with check (true);
create policy "Allow all operations for now" on live_sessions for all using (true) with check (true);
create policy "Allow all operations for now" on live_session_participants for all using (true) with check (true);
create policy "Allow all operations for now" on video_calls for all using (true) with check (true);
create policy "Allow all operations for now" on communication_preferences for all using (true) with check (true);
create policy "Allow all operations for now" on notification_templates for all using (true) with check (true);
create policy "Allow all operations for now" on sent_notifications for all using (true) with check (true);

-- ========================================
-- GRANT PERMISSIONS
-- ========================================

-- Grant permissions for all communication tables
grant all on chat_rooms to anon, authenticated;
grant all on chat_room_participants to anon, authenticated;
grant all on chat_messages to anon, authenticated;
grant all on message_reactions to anon, authenticated;
grant all on direct_messages to anon, authenticated;
grant all on announcements to anon, authenticated;
grant all on announcement_recipients to anon, authenticated;
grant all on live_sessions to anon, authenticated;
grant all on live_session_participants to anon, authenticated;
grant all on video_calls to anon, authenticated;
grant all on communication_preferences to anon, authenticated;
grant all on notification_templates to anon, authenticated;
grant all on sent_notifications to anon, authenticated;

-- ========================================
-- SAMPLE DATA
-- ========================================

-- Insert sample notification templates
insert into notification_templates (name, type, subject, content, variables) values
('Welcome Email', 'email', 'Welcome to Rillcod Academy!', 'Hi {{user_name}}, welcome to Rillcod Academy! We''re excited to have you join our community.', '{"user_name": "string"}'),
('Class Reminder', 'push', 'Class Reminder', 'Your class {{class_name}} starts in 30 minutes!', '{"class_name": "string"}'),
('Assignment Due', 'email', 'Assignment Due Soon', 'Hi {{student_name}}, your assignment {{assignment_name}} is due in {{time_left}}.', '{"student_name": "string", "assignment_name": "string", "time_left": "string"}'),
('Live Session', 'sms', 'Live Session Starting', 'Your live session {{session_title}} is starting now. Join at {{meeting_url}}', '{"session_title": "string", "meeting_url": "string"}')
on conflict do nothing;

-- Display all communication tables
select 
  tablename,
  tableowner
from pg_tables 
where schemaname = 'public' 
  and (tablename like 'chat%' or tablename like '%announcement%' or tablename like '%live%' or tablename like '%video%' or tablename like '%notification%' or tablename like '%communication%')
order by tablename; 