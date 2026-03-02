-- Migration: Create notification_templates table
-- Required by templates.service.ts for sendEmail/sendSMS template rendering

CREATE TABLE IF NOT EXISTS notification_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  type TEXT CHECK (type IN ('email', 'push', 'sms', 'in_app')) NOT NULL,
  subject TEXT,
  content TEXT NOT NULL,
  variables JSONB,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (name, type)
);

-- RLS
ALTER TABLE notification_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can read active templates"
  ON notification_templates FOR SELECT
  TO authenticated
  USING (is_active = true);

CREATE POLICY "Admins can manage templates"
  ON notification_templates FOR ALL
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM portal_users WHERE id = auth.uid() AND role = 'admin')
  );

GRANT SELECT ON notification_templates TO authenticated;
GRANT ALL ON notification_templates TO service_role;

-- Seed standard templates used by the system
INSERT INTO notification_templates (name, type, subject, content, variables) VALUES
(
  'Assignment Reminder',
  'email',
  'Reminder: Assignment {{assignment_name}} is due soon',
  '<p>Hi {{user_name}},</p><p>This is a reminder that your assignment <strong>{{assignment_name}}</strong> is due on {{due_date}}.</p><p>Please ensure you submit it on time.</p>',
  '{"user_name": "string", "assignment_name": "string", "due_date": "string"}'
),
(
  'Grade Published',
  'email',
  'New Grade Published: {{course_name}}',
  '<p>Hi {{user_name}},</p><p>A new grade has been published for your work in <strong>{{course_name}}</strong>.</p><p>Grade: {{grade}}</p><p>Comment: {{notes}}</p>',
  '{"user_name": "string", "course_name": "string", "grade": "string", "notes": "string"}'
),
(
  'New Announcement',
  'email',
  'New Announcement: {{title}}',
  '<p>A new announcement has been posted:</p><h3>{{title}}</h3><p>{{content}}</p>',
  '{"title": "string", "content": "string"}'
),
(
  'Announcement SMS',
  'sms',
  NULL,
  'LMS Announcement: {{title}}. Check your portal for details.',
  '{"title": "string"}'
)
ON CONFLICT (name, type) DO NOTHING;
