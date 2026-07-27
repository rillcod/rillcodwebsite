/**
 * Parent Communication Template Archive & Machine
 * A rich, humanised, warm collection of email & message templates for every scenario.
 */

export type ParentTemplateCategory =
  | 'academic_results'
  | 'onboarding_claim'
  | 'billing_fees'
  | 'attendance_care'
  | 'events_community'
  | 'conduct_support';

export type ParentTemplate = {
  key: string;
  category: ParentTemplateCategory;
  categoryLabel: string;
  title: string;
  description: string;
  subject: string;
  body: string;
  requiredVariables: string[];
};

export const PARENT_TEMPLATE_ARCHIVE: ParentTemplate[] = [
  // ── 1. ACADEMIC & RESULTS ───────────────────────────────────────────────────
  {
    key: 'result_published_warm',
    category: 'academic_results',
    categoryLabel: 'Academic Progress & Reports',
    title: 'Warm Result Notification & Report Card Link',
    description: 'Sent when term results are published to celebrate student progress.',
    subject: '🎓 Progress Report for {{student_name}} is now available — {{school_name}}',
    body: `Dear {{parent_name}},

We hope this message finds you well! 

We are delighted to inform you that {{student_name}}'s official Academic Progress Report for {{class_name}} has been published and is ready for your review.

Our teachers have worked closely with {{student_name}} throughout the term, and we encourage you to go through the feedback together to celebrate achievements and discuss areas for growth.

👉 View & Download Progress Report: {{access_link}}

If you have any questions or would like to schedule a brief follow-up with {{student_name}}'s class teacher, please feel free to reply directly to this message.

Warm regards,
Academic Operations Team
{{school_name}}`,
    requiredVariables: ['parent_name', 'student_name', 'class_name', 'school_name', 'access_link'],
  },
  {
    key: 'academic_concern_care',
    category: 'academic_results',
    categoryLabel: 'Academic Progress & Reports',
    title: 'Gentle Academic Care & Support Offer',
    description: 'Sent when a student needs extra guidance or academic encouragement.',
    subject: '💙 Academic Check-in & Support for {{student_name}}',
    body: `Dear {{parent_name}},

Warm greetings from {{school_name}}!

We are reaching out to share a quick update regarding {{student_name}}'s recent coursework in {{class_name}}. 

We noticed that {{student_name}} has faced some difficulties with recent learning objectives. We view every challenge as a learning opportunity, and we are committed to providing {{student_name}} with the personalized guidance needed to succeed.

We would love to coordinate a brief 10-minute check-in call with you and {{student_name}}'s subject teacher to align on supportive study habits at home.

👉 Schedule a Brief Check-in: {{meeting_link}}

Thank you for your ongoing partnership in {{student_name}}'s education!

Warmly,
The Academic Guidance Team
{{school_name}}`,
    requiredVariables: ['parent_name', 'student_name', 'class_name', 'school_name', 'meeting_link'],
  },
  {
    key: 'praise_and_distinction',
    category: 'academic_results',
    categoryLabel: 'Academic Progress & Reports',
    title: 'Star Performance & Excellence Praise',
    description: 'Sent to commend exceptional academic performance or improvement.',
    subject: '🌟 Commendation for {{student_name}} — {{school_name}}',
    body: `Dear {{parent_name}},

We have some wonderful news to share! 🌟

We want to formally commend {{student_name}} for demonstrating outstanding academic dedication, initiative, and positive attitude in {{class_name}}.

{{student_name}}'s teachers have highlighted their exceptional effort, leadership, and curiosity during recent lessons. Thank you for fostering such a supportive learning environment at home.

Please join us in congratulating {{student_name}} on this splendid accomplishment!

Warmest regards,
School Leadership Team
{{school_name}}`,
    requiredVariables: ['parent_name', 'student_name', 'class_name', 'school_name'],
  },

  // ── 2. ONBOARDING & PARENT CLAIM ───────────────────────────────────────────
  {
    key: 'parent_claim_invite_warm',
    category: 'onboarding_claim',
    categoryLabel: 'Onboarding & Account Access',
    title: 'Parent Portal Onboarding & Claim Invitation',
    description: 'Sent to invite parents to link their student account and access the portal.',
    subject: '👋 Welcome to {{school_name}} — Connect to {{student_name}}\'s Portal',
    body: `Dear {{parent_name}},

Welcome to the {{school_name}} family! 

We are excited to invite you to complete your Parent Portal registration. Through your secure Parent Account, you can monitor {{student_name}}'s real-time academic progress, term reports, attendance records, and direct school communications.

👉 Claim & Connect Parent Account: {{claim_link}}

This setup takes less than 2 minutes. Once connected, your account will stay automatically linked to {{student_name}} and any siblings enrolled with us.

If you experience any difficulties, our support desk is available to assist you immediately.

Warm regards,
Parent Relations Team
{{school_name}}`,
    requiredVariables: ['parent_name', 'student_name', 'school_name', 'claim_link'],
  },
  {
    key: 'credentials_reset_secure',
    category: 'onboarding_claim',
    categoryLabel: 'Onboarding & Account Access',
    title: 'Secure Account Credential Resend & Access Link',
    description: 'Sent when a parent requests credential resend or assistance logging in.',
    subject: '🔑 Your Parent Portal Access Details — {{school_name}}',
    body: `Dear {{parent_name}},

Here are your requested Parent Portal login details for {{school_name}}, associated with {{student_name}}.

Login Details:
• Portal Address: {{portal_url}}
• Registered Email/Username: {{parent_email}}
• Temporary Password: {{temporary_password}}

👉 Direct 1-Click Login: {{direct_login_link}}

For security purposes, please update your password upon your initial sign-in. If you did not request this update, please inform our IT desk right away.

Warm regards,
IT Operations & Support
{{school_name}}`,
    requiredVariables: ['parent_name', 'student_name', 'school_name', 'portal_url', 'parent_email', 'temporary_password', 'direct_login_link'],
  },

  // ── 3. BILLING & FEES ───────────────────────────────────────────────────────
  {
    key: 'term_fee_notice_polite',
    category: 'billing_fees',
    categoryLabel: 'Billing, Fees & Receipts',
    title: 'Polite Term Fee Statement & Online Payment',
    description: 'Sent to provide term fee statements with direct online payment link.',
    subject: '🧾 Term Fee Statement for {{student_name}} — {{school_name}}',
    body: `Dear {{parent_name}},

We hope you are having a pleasant week.

Please find attached the term fee statement for {{student_name}} for the active academic term at {{school_name}}.

Statement Summary:
• Student Name: {{student_name}} ({{class_name}})
• Amount Due: {{amount_due}}
• Due Date: {{due_date}}

👉 Pay Securely Online: {{payment_link}}

We appreciate your prompt attention to this notice as it enables us to maintain uninterrupted educational facilities and learning resources for {{student_name}}.

Warm regards,
Bursary & Accounts Desk
{{school_name}}`,
    requiredVariables: ['parent_name', 'student_name', 'class_name', 'school_name', 'amount_due', 'due_date', 'payment_link'],
  },
  {
    key: 'payment_receipt_acknowledgment',
    category: 'billing_fees',
    categoryLabel: 'Billing, Fees & Receipts',
    title: 'Instant Payment Acknowledgment & Official Receipt',
    description: 'Sent immediately following a successful fee payment.',
    subject: '✅ Receipt Acknowledgment — Payment for {{student_name}}',
    body: `Dear {{parent_name}},

Thank you for your payment! 

We have successfully received your payment of {{amount_paid}} for {{student_name}} at {{school_name}}.

Receipt Summary:
• Receipt Reference: {{receipt_ref}}
• Amount Received: {{amount_paid}}
• Date Received: {{payment_date}}
• Remaining Balance: {{remaining_balance}}

👉 View & Download Official Receipt: {{receipt_link}}

Thank you for your continued support and commitment to {{student_name}}'s educational journey with us.

Warmly,
Accounts & Financial Services
{{school_name}}`,
    requiredVariables: ['parent_name', 'student_name', 'school_name', 'amount_paid', 'receipt_ref', 'payment_date', 'remaining_balance', 'receipt_link'],
  },

  // ── 4. ATTENDANCE & CARE ────────────────────────────────────────────────────
  {
    key: 'unexcused_absence_care',
    category: 'attendance_care',
    categoryLabel: 'Attendance & Absence Care',
    title: 'Caring Unexcused Absence Check-in',
    description: 'Sent when a student is absent without prior notification.',
    subject: '❤️ Checking in regarding {{student_name}}\'s absence today',
    body: `Dear {{parent_name}},

We missed {{student_name}} in class today!

We are reaching out to ensure that {{student_name}} and your family are safe and well. If {{student_name}} is unwell or away for a family emergency, please let us know so we can update our attendance records and help {{student_name}} catch up on missed classwork.

👉 Confirm Absence Reason: {{absence_link}}

Wishing {{student_name}} a quick return to school!

Warmly,
Student Care & Attendance Team
{{school_name}}`,
    requiredVariables: ['parent_name', 'student_name', 'school_name', 'absence_link'],
  },

  // ── 5. EVENTS & COMMUNITY ───────────────────────────────────────────────────
  {
    key: 'pta_event_invitation',
    category: 'events_community',
    categoryLabel: 'Events & School Community',
    title: 'Parent-Teacher Meeting & Open Day Invitation',
    description: 'Sent to invite parents to upcoming school events or PTA meetings.',
    subject: '📅 Invitation: Parent-Teacher Conference — {{school_name}}',
    body: `Dear {{parent_name}},

You are cordially invited to our upcoming Parent-Teacher Conference for {{school_name}}.

This gathering provides a valuable opportunity to discuss {{student_name}}'s academic development, social growth, and upcoming school initiatives.

Event Details:
• Date: {{event_date}}
• Time: {{event_time}}
• Location: {{event_location}}

👉 Confirm Attendance / Reserve Time Slot: {{rsvp_link}}

We look forward to seeing you and celebrating {{student_name}}'s progress together!

Warm regards,
School Management
{{school_name}}`,
    requiredVariables: ['parent_name', 'student_name', 'school_name', 'event_date', 'event_time', 'event_location', 'rsvp_link'],
  },
];
