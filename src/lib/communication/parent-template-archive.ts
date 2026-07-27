/**
 * Parent Communication Template Archive & Emotional Intelligence Engine
 * Rich, culturally resonant, warm, humanised templates for Nigerian parents.
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
  categoryIcon: string;
  title: string;
  description: string;
  subject: string;
  body: string;
  requiredVariables: string[];
};

export const CATEGORY_METADATA: Record<ParentTemplateCategory, { label: string; icon: string; description: string }> = {
  academic_results: {
    label: '🎓 Academic Progress & Term Reports',
    icon: 'AcademicCapIcon',
    description: 'Celebrating milestones, term result releases, and supportive academic check-ins.',
  },
  onboarding_claim: {
    label: '👋 Warm Onboarding & Account Access',
    icon: 'UserIcon',
    description: 'Welcoming parents to the school family and guiding portal setup.',
  },
  billing_fees: {
    label: '💳 Bursary, Fees & Financial Courtesies',
    icon: 'CreditCardIcon',
    description: 'Respectful fee statements, instant receipts, and appreciative financial check-ins.',
  },
  attendance_care: {
    label: '🏥 Welfare, Health & Attendance Care',
    icon: 'HeartIcon',
    description: 'Caring absence inquiries, get-well wishes, and morning punctuality notes.',
  },
  events_community: {
    label: '📅 School Community, PTA & Events',
    icon: 'CalendarIcon',
    description: 'PTA invitations, open day showcases, holiday blessings, and resumption notes.',
  },
  conduct_support: {
    label: '💬 Homework, Character & Talent Praise',
    icon: 'SparklesIcon',
    description: 'Praising character growth, sports/art distinctions, and home study guidance.',
  },
};

export const PARENT_TEMPLATE_ARCHIVE: ParentTemplate[] = [
  // ── 1. ACADEMIC & RESULTS ───────────────────────────────────────────────────
  {
    key: 'result_published_warm_ei',
    category: 'academic_results',
    categoryLabel: 'Academic Progress & Term Reports',
    categoryIcon: '🎓',
    title: 'Heartfelt Term Result Release & Celebration',
    description: 'Warm, respectful notification celebrating the child\'s term effort.',
    subject: '🎓 {{student_name}}\'s Term Progress Report is ready — {{school_name}}',
    body: `Dear Esteemed Parent/Guardian ({{parent_name}}),

Greetings of peace and joy to you and your family!

We are delighted to inform you that {{student_name}}\'s official Academic Progress Report for {{class_name}} is now ready for your review.

Our dedicated teachers have worked closely with {{student_name}} throughout this term. Every score represents hard work, curiosity, and growth. As we know, education is a joint journey between home and school, and we truly appreciate your constant encouragement of {{student_name}}.

👉 Tap here to view & download {{student_name}}\'s Report: {{access_link}}

Please take a moment to sit with {{student_name}}, celebrate their successes, and encourage them for the coming term. Should you wish to discuss any aspect of this report, our teachers are always available for you.

Warmest regards and blessings,
The Academic Team
{{school_name}}`,
    requiredVariables: ['parent_name', 'student_name', 'class_name', 'school_name', 'access_link'],
  },
  {
    key: 'academic_growth_encouragement',
    category: 'academic_results',
    categoryLabel: 'Academic Progress & Term Reports',
    categoryIcon: '🎓',
    title: 'Gentle Study Guidance & Academic Partnership',
    description: 'Empathetic note when a child needs extra encouragement in specific subjects.',
    subject: '💙 Academic Partnering & Support for {{student_name}}',
    body: `Dear {{parent_name}},

We hope this message finds you well and in good spirits.

At {{school_name}}, we believe that every child learns at their own pace and that challenges are simply stepping stones to greater mastery. We are reaching out regarding {{student_name}}\'s recent progress in {{class_name}}.

We have noticed that {{student_name}} could benefit from a little extra guidance in certain subject areas. With the right encouragement both in class and at home, we are confident {{student_name}} will shine brightly.

We would love to coordinate a brief, supportive check-in with {{student_name}}\'s class teacher so we can align on simple, stress-free study routines at home.

👉 Schedule a Brief Teacher Check-in: {{meeting_link}}

Thank you for your trusting partnership in {{student_name}}\'s growth!

Warmly,
The Academic Guidance Desk
{{school_name}}`,
    requiredVariables: ['parent_name', 'student_name', 'class_name', 'school_name', 'meeting_link'],
  },
  {
    key: 'praise_distinction_excellence',
    category: 'academic_results',
    categoryLabel: 'Academic Progress & Term Reports',
    categoryIcon: '🌟',
    title: 'Special Academic & Conduct Excellence Praise',
    description: 'Heartfelt commendation for exemplary academic and behavioral performance.',
    subject: '🌟 Special Commendation for {{student_name}} — {{school_name}}',
    body: `Dear {{parent_name}},

We have wonderful news that will bring a smile to your face today! 🌟

We are writing to formally commend {{student_name}} for outstanding effort, intellectual curiosity, and exemplary character in {{class_name}}. {{student_name}}\'s teachers have consistently praised their focus, politeness, and leadership among peers.

A child\'s excellence is a reflection of the love, discipline, and values nurtured at home. We thank you for raising such a promising young mind and partnering so faithfully with us.

Please join us in giving {{student_name}} a warm hug of celebration today!

With deep respect and admiration,
School Leadership Desk
{{school_name}}`,
    requiredVariables: ['parent_name', 'student_name', 'class_name', 'school_name'],
  },

  // ── 2. ONBOARDING & PARENT CLAIM ───────────────────────────────────────────
  {
    key: 'parent_portal_welcome_ei',
    category: 'onboarding_claim',
    categoryLabel: 'Warm Onboarding & Account Access',
    categoryIcon: '👋',
    title: 'Heartfelt Welcome to the School Family',
    description: 'Inviting parents to claim their digital portal account with ease.',
    subject: '👋 Welcome to {{school_name}} — Connect to {{student_name}}\'s Portal',
    body: `Dear {{parent_name}},

A very warm welcome to the {{school_name}} family! 

We are honored that you have entrusted us with {{student_name}}\'s educational journey. To ensure you stay seamlessly connected with {{student_name}}\'s daily school life, we invite you to set up your Parent Portal account.

Through your personal Parent Portal, you can conveniently check:
• Real-time academic progress and term report cards
• Teacher notes, attendance updates, and fee receipts
• School calendar dates and direct message announcements

👉 Claim & Connect Your Parent Account (Takes 1 min): {{claim_link}}

It takes just a minute, and once connected, all your children enrolled with us will appear in one easy view.

Warm regards and welcome aboard!
Parent Relations Desk
{{school_name}}`,
    requiredVariables: ['parent_name', 'student_name', 'school_name', 'claim_link'],
  },
  {
    key: 'credentials_resend_reassurance',
    category: 'onboarding_claim',
    categoryLabel: 'Warm Onboarding & Account Access',
    categoryIcon: '🔑',
    title: 'Secure Account Login Details & Assistance',
    description: 'Delivering login credentials with personal support reassurance.',
    subject: '🔑 Your Parent Access Details for {{student_name}} — {{school_name}}',
    body: `Dear {{parent_name}},

Here are your requested Parent Portal access details for {{school_name}}, linked to {{student_name}}.

Access Summary:
• Portal URL: {{portal_url}}
• Registered Email/Username: {{parent_email}}
• Temporary Password: {{temporary_password}}

👉 Direct 1-Click Sign-In: {{direct_login_link}}

Once you log in, you may change your password to any personal secret you prefer. If you ever need help navigating the portal, please reply directly to this email or send us a message — we are always here to assist you.

Warm regards,
ICT & Support Desk
{{school_name}}`,
    requiredVariables: ['parent_name', 'student_name', 'school_name', 'portal_url', 'parent_email', 'temporary_password', 'direct_login_link'],
  },

  // ── 3. BURSARY & FEES ───────────────────────────────────────────────────────
  {
    key: 'term_fee_statement_respectful',
    category: 'billing_fees',
    categoryLabel: 'Bursary, Fees & Financial Courtesies',
    categoryIcon: '🧾',
    title: 'Polite Term Fee Statement & Direct Payment Link',
    description: 'Respectful breakdown acknowledging parent investment.',
    subject: '🧾 Term Fee Statement for {{student_name}} — {{school_name}}',
    body: `Dear Esteemed Parent ({{parent_name}}),

We hope you are having a peaceful and prosperous week.

We write to share {{student_name}}\'s fee statement for the active academic term at {{school_name}}. We deeply appreciate the sacrifices every family makes to provide quality education, and we remain committed to offering maximum value to {{student_name}}.

Statement Breakdown:
• Pupil Name: {{student_name}} ({{class_name}})
• Amount Due: {{amount_due}}
• Due Date: {{due_date}}

👉 Make Secure Online Payment: {{payment_link}}

Your timely fee settlement enables us to maintain top-grade learning facilities, digital tools, and experienced teachers for {{student_name}}. Should you require any fee clarification or payment plan arrangements, our Bursar is ready to assist you privately.

With warm regards and appreciation,
Bursary & Finance Desk
{{school_name}}`,
    requiredVariables: ['parent_name', 'student_name', 'class_name', 'school_name', 'amount_due', 'due_date', 'payment_link'],
  },
  {
    key: 'payment_receipt_heartfelt_thanks',
    category: 'billing_fees',
    categoryLabel: 'Bursary, Fees & Financial Courtesies',
    categoryIcon: '✅',
    title: 'Gratitude & Official Payment Receipt',
    description: 'Heartfelt thank-you note sent instantly after fee payment.',
    subject: '✅ Thank You! Payment Receipt for {{student_name}}',
    body: `Dear {{parent_name}},

Thank you so much for your prompt payment! 

We confirm that we have received your payment of {{amount_paid}} for {{student_name}} at {{school_name}}.

Receipt Details:
• Receipt Reference: {{receipt_ref}}
• Amount Received: {{amount_paid}}
• Payment Date: {{payment_date}}
• Remaining Balance: {{remaining_balance}}

👉 Download Official Digital Receipt: {{receipt_link}}

Thank you for your trust, promptness, and steadfast partnership in {{student_name}}\'s education. We pray for continued open doors and blessings upon your endeavors!

Warmest appreciation,
Accounts & Bursary Services
{{school_name}}`,
    requiredVariables: ['parent_name', 'student_name', 'school_name', 'amount_paid', 'receipt_ref', 'payment_date', 'remaining_balance', 'receipt_link'],
  },

  // ── 4. ATTENDANCE & WELFARE ─────────────────────────────────────────────────
  {
    key: 'caring_absence_checkin',
    category: 'attendance_care',
    categoryLabel: 'Welfare, Health & Attendance Care',
    categoryIcon: '❤️',
    title: 'Caring Absence & Wellness Inquire',
    description: 'Reaching out in care when a child is absent from morning class.',
    subject: '❤️ Checking in regarding {{student_name}}\'s absence today',
    body: `Dear {{parent_name}},

We noticed {{student_name}}\'s empty seat in class today, and we wanted to quickly reach out to ensure your family is doing well!

Your child\'s safety, health, and well-being are our highest priorities. If {{student_name}} is feeling unwell or away for a family matter, please let us know so we can update our records and prepare any makeup lesson notes {{student_name}} might need.

👉 Send Quick Absence Reason Note: {{absence_link}}

We send our warm thoughts and pray for a quick return to school for {{student_name}}!

Warmly,
Student Care & Attendance Team
{{school_name}}`,
    requiredVariables: ['parent_name', 'student_name', 'school_name', 'absence_link'],
  },
  {
    key: 'sick_leave_warm_support',
    category: 'attendance_care',
    categoryLabel: 'Welfare, Health & Attendance Care',
    categoryIcon: '🏥',
    title: 'Get-Well Wishes & Lesson Notes Package',
    description: 'Warm healing prayers and academic makeup support for a sick child.',
    subject: '💐 Get Well Soon, {{student_name}}! — {{school_name}}',
    body: `Dear {{parent_name}},

We were so sorry to learn that {{student_name}} is unwell. Please accept our warmest get-well wishes from all teachers and classmates at {{school_name}}!

Please do not worry about missed schoolwork at all right now. {{student_name}}\'s health and restful recovery come first. We have put together a light work package that {{student_name}} can look through whenever they feel strong enough.

👉 Access Makeup Study Package: {{absence_link}}

We are praying for {{student_name}}\'s speedy and complete recovery. Please let us know if there is anything at all we can do to support your family during this time.

With love and prayers,
The School Health & Welfare Team
{{school_name}}`,
    requiredVariables: ['parent_name', 'student_name', 'school_name', 'absence_link'],
  },

  // ── 5. EVENTS & COMMUNITY ───────────────────────────────────────────────────
  {
    key: 'pta_meeting_personal_invite',
    category: 'events_community',
    categoryLabel: 'School Community, PTA & Events',
    categoryIcon: '📅',
    title: 'Warm Invitation to Parent-Teacher Forum',
    description: 'Personal invite to discuss school improvements and child development.',
    subject: '📅 Invitation: Parent-Teacher Forum — {{school_name}}',
    body: `Dear {{parent_name}},

You are warmly invited to our upcoming Parent-Teacher Forum for {{school_name}}.

As valuable members of our school community, your insights and feedback shape the environment we build for {{student_name}}. This meeting will give us an opportunity to share academic updates, discuss upcoming school projects, and hear your thoughts directly.

Event Details:
• Date: {{event_date}}
• Time: {{event_time}}
• Venue: {{event_location}}

👉 RSVP / Confirm Attendance: {{rsvp_link}}

We look forward to enjoying warm fellowship with you and working together for {{student_name}}\'s bright future!

Warm regards,
School Management & PTA Executive
{{school_name}}`,
    requiredVariables: ['parent_name', 'student_name', 'school_name', 'event_date', 'event_time', 'event_location', 'rsvp_link'],
  },

  // ── 6. CHARACTER & TALENT ───────────────────────────────────────────────────
  {
    key: 'homework_collaboration_nudge',
    category: 'conduct_support',
    categoryLabel: 'Homework, Character & Talent Praise',
    categoryIcon: '💬',
    title: 'Home Study & Evening Assignment Nudge',
    description: 'Gentle, supportive nudge encouraging 20 mins of home reading/homework.',
    subject: '📖 Evening Homework & Study Partnering for {{student_name}}',
    body: `Dear {{parent_name}},

Greetings to you!

We are reaching out with a gentle note regarding {{student_name}}\'s home assignments for {{class_name}}. Consistent daily revision helps solidify what is taught in class and builds lifelong discipline.

We kindly request your support in setting aside just 20 to 30 quiet minutes this evening for {{student_name}} to complete their tasks and review today\'s lessons.

👉 View Active Homework & Tasks: {{access_link}}

Thank you for your active involvement in {{student_name}}\'s daily progress. Together, we are building a shining leader!

Warmly,
Class Teacher & Mentorship Desk
{{school_name}}`,
    requiredVariables: ['parent_name', 'student_name', 'class_name', 'school_name', 'access_link'],
  },
];
