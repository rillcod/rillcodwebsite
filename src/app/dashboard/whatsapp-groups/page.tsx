'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import {
  Search, Plus, Trash2, Send, Copy, Check, RefreshCw, X, Pencil,
  Users, MessageSquare, Layers, ChevronRight, Clock, Archive,
  RotateCcw, BookOpen, School, Tag, Filter, BarChart2, Globe,
  ChevronDown, AlertCircle, CheckCircle2, Loader2, History,
  FileText, Zap, CalendarDays, BookMarked, Megaphone,
} from 'lucide-react';

// ── Constants ────────────────────────────────────────────────────────────────
const GROUP_TYPES = [
  { value: 'parents',       label: 'Parents',        desc: 'Parent & guardian communication',   color: '#7c3aed' },
  { value: 'teachers',      label: 'Teachers',        desc: 'Staff & teacher coordination',      color: '#0284c7' },
  { value: 'students',      label: 'Students',        desc: 'Student group',                     color: '#00a884' },
  { value: 'class',         label: 'Class',           desc: 'Mixed class (students + parents)',   color: '#d97706' },
  { value: 'announcements', label: 'Announcements',   desc: 'One-way school announcements',      color: '#dc2626' },
  { value: 'emergency',     label: 'Emergency',       desc: 'Urgent alerts & safety notices',    color: '#ef4444' },
  { value: 'staff',         label: 'All Staff',       desc: 'Full staff broadcast channel',      color: '#6366f1' },
  { value: 'general',       label: 'General',         desc: 'General purpose',                   color: '#6b7280' },
] as const;

const TERMS    = ['Term 1', 'Term 2', 'Term 3', 'All Terms'];
const STATUSES = ['active', 'inactive', 'archived'] as const;

type GroupType = typeof GROUP_TYPES[number]['value'];
type Status    = typeof STATUSES[number];

// ── Types ────────────────────────────────────────────────────────────────────
interface Group {
  id: string;
  name: string;
  link: string;
  description: string | null;
  group_type: string;
  class_name: string | null;
  term: string | null;
  status: string;
  member_count: number | null;
  last_broadcast_at: string | null;
  school_id: string | null;
  school_name: string | null;
  created_by: string | null;
  created_at: string;
  creator?: { full_name: string | null } | null;
}

interface Broadcast {
  id: string;
  group_id: string | null;
  group_name: string | null;
  school_name: string | null;
  sent_by_name: string | null;
  message: string;
  sent_at: string;
}

interface School { id: string; name: string; }

interface Assignment {
  id: string;
  title: string;
  description: string | null;
  instructions: string | null;
  due_date: string | null;
  max_points: number | null;
  assignment_type: string | null;
  is_active: boolean;
  metadata?: { target_class_name?: string; visibility?: string } | null;
  courses?: { id: string; title: string } | null;
}

interface NewsletterTpl { id: string; icon: string; title: string; category: string; body: string; }

const NEWSLETTER_TPLS: NewsletterTpl[] = [
  // ── Academic ──────────────────────────────────────────────────────────────
  {
    id: 'term_open', icon: '🎒', title: 'Term Opening', category: 'Academic',
    body: `🏫 *New Term — Welcome Back!*\n\nDear Parent/Guardian,\n\nWe are delighted to welcome all students back for the new term! Please ensure your ward:\n\n✅ Reports by 7:45 AM on the first day\n✅ Comes with all required textbooks and materials\n✅ Has settled any outstanding fees before resumption\n\nAll lesson plans, assignments, and class schedules are now live on the *Rillcod portal*.\n\n👉 Log in at rillcod.com\n\nLet's make this a great term together!\n\n— School Management\n_Rillcod Technologies_`,
  },
  {
    id: 'term_close', icon: '🏆', title: 'Term Closing', category: 'Academic',
    body: `🎉 *End of Term — Well Done Everyone!*\n\nDear Parent/Guardian,\n\nAnother term has come to a successful end. We are proud of every student's effort and growth!\n\n📋 *Before the holiday:*\n• Report cards are now available on the Rillcod portal\n• CBT and assignment results have been published\n• Review teacher remarks with your ward\n\n🗓 School resumes next term on: [DATE]\n\nThank you for your continued support and partnership.\n\nHave a wonderful break! 🌟\n\n— School Management\n_Rillcod Technologies_`,
  },
  {
    id: 'exam_timetable', icon: '📝', title: 'Exam Timetable Released', category: 'Academic',
    body: `📝 *Examination Timetable Released*\n\nDear Students & Parents,\n\nThe end-of-term examination timetable is now available on the Rillcod portal.\n\n📅 *Exams begin:* [DATE]\n⏰ *Reporting time:* 7:30 AM daily\n📍 *Venue:* School Examination Hall\n\n*Exam rules:*\n• No mobile phones in the hall\n• Bring your student ID and stationery\n• Latecomers (after 8:00 AM) will not be admitted\n• Review all topics on your portal dashboard\n\n👉 Download the full timetable: rillcod.com\n\nBest of luck! 💪\n\n— School Management`,
  },
  {
    id: 'cbt_exam', icon: '💻', title: 'CBT Online Exam Notice', category: 'Academic',
    body: `💻 *CBT Online Exam — Important Notice*\n\nDear Student/Parent,\n\nAn online CBT examination is scheduled on the Rillcod platform.\n\n📅 *Date:* [DATE]\n⏰ *Start time:* [TIME]\n⌛ *Duration:* [DURATION]\n📖 *Subject:* [SUBJECT]\n\n*Before the exam:*\n✅ Charge your device fully\n✅ Use a stable internet connection (Wi-Fi preferred)\n✅ Log in 10 minutes early at rillcod.com\n✅ Do NOT refresh or close the browser mid-exam\n✅ Have your student login details ready\n\nContact your teacher immediately if you encounter any issues.\n\nGood luck! 🎯\n\n— School Management`,
  },
  {
    id: 'results_ready', icon: '📊', title: 'Report Card Ready', category: 'Academic',
    body: `📊 *Term Results Now Available*\n\nDear Parent/Guardian,\n\nYour ward's end-of-term report card is ready on the Rillcod parent portal!\n\n📋 *Log in to view:*\n• Subject scores and grades\n• Overall position in class\n• Teacher remarks\n• Attendance record\n• Recommended areas for improvement\n\n👉 rillcod.com → My Children → Report Card\n\nPlease review the results with your ward and contact the class teacher if you have questions.\n\n— School Management\n_Rillcod Technologies_`,
  },
  {
    id: 'assignment_reminder', icon: '📚', title: 'Assignment Reminder', category: 'Academic',
    body: `📚 *Assignment Deadline Reminder*\n\nDear Parent/Guardian,\n\nYour ward has a pending assignment due soon. Please encourage them to submit before the deadline to avoid grade penalties.\n\n👉 *Log in to the Rillcod portal to:*\n• View the full assignment details and instructions\n• Submit work directly online\n• Track submission status\n• Read any teacher feedback\n\n🔗 rillcod.com\n\nEarly submission is always appreciated and allows time for teacher feedback!\n\n— School Management\n_Rillcod Technologies_`,
  },
  {
    id: 'coding_project', icon: '🖥️', title: 'Coding Project Deadline', category: 'Academic',
    body: `🖥️ *Coding Project Submission Deadline*\n\nDear Students & Parents,\n\nThe coding project submission deadline is approaching! Don't leave it to the last minute.\n\n📅 *Due Date:* [DATE]\n🔗 *Submit via:* Rillcod portal → Assignments\n\n*Submission checklist:*\n✅ Working code or project link (GitHub/Replit)\n✅ Brief project description (what it does & how)\n✅ Screenshots or a short demo video\n✅ List of technologies/tools used\n\nLate submissions attract a -10% grade penalty per day.\n\n👉 Log in now: rillcod.com\n\nBuild something amazing! 🚀\n\n— School Management`,
  },
  {
    id: 'resumption', icon: '🗓️', title: 'Resumption Date Reminder', category: 'Academic',
    body: `🗓️ *School Resumption Reminder*\n\nDear Parent/Guardian,\n\nThis is a reminder that the new term begins very soon!\n\n📅 *Resumption Date:* [DATE]\n⏰ *Reporting Time:* 7:45 AM\n📋 *Term:* [TERM] — [ACADEMIC YEAR]\n\n*Before resumption, please ensure your ward:*\n✅ Has paid all outstanding fees\n✅ Has all required textbooks and materials\n✅ Logs in to the Rillcod portal to check new assignments and schedules\n✅ Arrives in full school uniform\n\nWe can't wait to welcome everyone back!\n\n— School Management\n_Rillcod Technologies_`,
  },

  // ── Finance ───────────────────────────────────────────────────────────────
  {
    id: 'fee_remind', icon: '💰', title: 'Fee Reminder — First Notice', category: 'Finance',
    body: `💰 *School Fee Reminder*\n\nDear Parent/Guardian,\n\nThis is a friendly reminder that school fees for the current term are now due.\n\n💳 *How to pay:*\n1. Log in to the Rillcod portal at rillcod.com\n2. Go to *Billing → Invoices*\n3. Select your invoice and pay securely\n\nAccepted methods: Bank transfer, Paystack, debit/credit card\n\n⚠️ Students with unpaid fees may be restricted from upcoming exams and portal access.\n\nFor assistance, contact the school admin office.\n\n— School Management`,
  },
  {
    id: 'fee_urgent', icon: '⚠️', title: 'Fee Reminder — Final Notice', category: 'Finance',
    body: `⚠️ *FINAL NOTICE — Outstanding School Fees*\n\nDear Parent/Guardian,\n\nOur records show that school fees for your ward are still unpaid. This is our final notice before further action is taken.\n\n*Please settle immediately:*\n👉 rillcod.com → Billing → Pay Now\n\n🚫 *Students with unpaid fees will be:*\n• Barred from upcoming examinations\n• Suspended from portal and class access\n• Reported to class teacher\n\nIf you have already paid, please upload your receipt on the portal or contact admin urgently.\n\nDo not ignore this notice.\n\n— School Admin\n_Rillcod Technologies_`,
  },
  {
    id: 'payment_confirmed', icon: '✅', title: 'Payment Received', category: 'Finance',
    body: `✅ *Payment Confirmed — Thank You!*\n\nDear Parent/Guardian,\n\nWe have successfully received your school fee payment. Your account is now up to date!\n\n🧾 *Your receipt is available on the Rillcod portal:*\n👉 rillcod.com → Billing → Receipts\n\nPlease save your receipt for your records.\n\nIf you notice any discrepancy in your account balance, contact the school admin office immediately.\n\nWe appreciate your prompt payment! 🙏\n\n— School Management\n_Rillcod Technologies_`,
  },
  {
    id: 'scholarship', icon: '🎓', title: 'Scholarship / Bursary Notice', category: 'Finance',
    body: `🎓 *Scholarship & Fee Support Available*\n\nDear Parent/Guardian,\n\nWe are pleased to announce that limited scholarship and bursary positions are available for qualifying students this term.\n\n📋 *Eligibility:*\n• Consistently strong academic performance\n• Demonstrated financial need\n• Good attendance and conduct record\n\n📝 *How to apply:*\nVisit the school admin office or apply via the Rillcod portal under *Support → Scholarship Application*.\n\n📅 *Application deadline:* [DATE]\n\nWe believe every child deserves quality education. Encourage eligible students to apply!\n\n— School Management\n_Rillcod Technologies_`,
  },

  // ── Events ────────────────────────────────────────────────────────────────
  {
    id: 'pta_meeting', icon: '👨‍👩‍👧', title: 'Parent-Teacher Meeting', category: 'Events',
    body: `👨‍👩‍👧 *Parent-Teacher Meeting (PTA)*\n\nDear Parent/Guardian,\n\nYou are cordially invited to our Parent-Teacher Meeting.\n\n📅 *Date:* [DATE]\n⏰ *Time:* [TIME]\n📍 *Venue:* [VENUE / School Hall]\n\n*Agenda:*\n• Term performance review per class\n• Upcoming events and school calendar\n• Fee structure and payment updates\n• Questions and open discussion\n\nYour attendance helps us better support your ward's education. We strongly encourage all parents to attend.\n\nPlease confirm attendance by replying ✅ with your ward's *name and class*.\n\n— School Management`,
  },
  {
    id: 'prize_giving', icon: '🏆', title: 'Prize Giving / Graduation', category: 'Events',
    body: `🏆 *Prize Giving Day & Graduation Ceremony*\n\nDear Parent/Guardian,\n\nYou are warmly invited to our annual Prize Giving Day and Graduation Ceremony!\n\n📅 *Date:* [DATE]\n⏰ *Time:* [TIME]\n📍 *Venue:* [VENUE]\n👗 *Dress Code:* [DRESS CODE]\n\n🎉 *Programme highlights:*\n• Awards for academic excellence & best coder\n• STEM and coding project showcase\n• Student performances\n• Graduation for outgoing students\n\nPlease arrive 30 minutes before the ceremony begins. Light refreshments will be served.\n\nCome celebrate our students' achievements! 🎓\n\n— School Management`,
  },
  {
    id: 'hackathon', icon: '🚀', title: 'Coding Hackathon / Competition', category: 'Events',
    body: `🚀 *Coding Hackathon — Registration Open!*\n\nDear Students & Parents,\n\nWe are excited to announce our *Inter-Class Coding Hackathon*!\n\n📅 *Date:* [DATE]\n⏰ *Time:* [TIME]\n📍 *Venue:* Computer Lab / Online via Rillcod\n\n🏅 *Awards for:*\n• Best App / Project\n• Most Creative Solution\n• Best Team Collaboration\n• Best Presenter\n\n📝 *How to register:*\n👉 Rillcod portal → Events → Hackathon Registration\n\n📅 *Registration closes:* [DATE]\n\nThis is your chance to showcase your coding skills and win prizes! Teams of 2–4 students.\n\nSign up today! 💡\n\n— School Management`,
  },
  {
    id: 'excursion', icon: '🚌', title: 'School Excursion', category: 'Events',
    body: `🚌 *School Excursion Notice*\n\nDear Parent/Guardian,\n\nA school excursion has been planned for your ward's class.\n\n📅 *Date:* [DATE]\n📍 *Destination:* [DESTINATION]\n⏰ *Departure:* [TIME] from school premises\n🕐 *Return:* [RETURN TIME]\n💰 *Excursion fee:* ₦[AMOUNT]\n📅 *Payment deadline:* [DATE]\n\n*Please note:*\n• Full school uniform must be worn\n• Pack a light meal and water bottle\n• No valuables or electronics for junior classes\n• A signed consent form is required\n\n👉 Download the consent form on the Rillcod portal and return it by [DATE].\n\n— School Management`,
  },
  {
    id: 'open_day', icon: '📣', title: 'School Open Day / Event', category: 'Events',
    body: `📣 *Upcoming School Event*\n\n*[EVENT NAME]*\n\n📅 *Date:* [DATE]\n⏰ *Time:* [TIME]\n📍 *Venue:* [VENUE]\n\n[BRIEF DESCRIPTION OF EVENT]\n\nAll students, parents, and guardians are warmly invited to attend.\n\nFor enquiries or more information, contact the school admin office or message us here.\n\nWe look forward to seeing you! 🌟\n\n— School Management\n_Rillcod Technologies_`,
  },

  // ── Admin ─────────────────────────────────────────────────────────────────
  {
    id: 'portal_onboarding', icon: '📱', title: 'Portal Onboarding Reminder', category: 'Admin',
    body: `📱 *Rillcod Portal — Action Required*\n\nDear Parent/Guardian,\n\nWe noticed that your ward's Rillcod account has not been fully set up. Please complete your setup today!\n\n👉 *Log in at rillcod.com to:*\n• Complete your profile (name, class, school)\n• View assignments, grades, and timetables\n• Pay fees and download receipts\n• Receive real-time school updates\n• Access digital report cards\n\n*Need help getting started?*\nContact us at support@rillcod.com or reply to this message.\n\nAll school communications are now delivered through the Rillcod platform.\n\n— School Management\n_Rillcod Technologies_`,
  },
  {
    id: 'new_teacher', icon: '👋', title: 'New Teacher Introduction', category: 'Admin',
    body: `👋 *New Teacher Introduction*\n\nDear Students & Parents,\n\nWe are excited to welcome a new member to our teaching team!\n\n👨‍🏫 *Name:* [TEACHER NAME]\n📖 *Subject(s):* [SUBJECTS]\n🏫 *Class(es):* [CLASSES]\n\n[TEACHER NAME] brings [X] years of experience in [SPECIALISATION] and is passionate about making learning engaging and effective for every student.\n\nPlease give our new teacher a warm Rillcod welcome! 🙌\n\nFeel free to reach out via the portal messaging system with any questions.\n\n— School Management\n_Rillcod Technologies_`,
  },
  {
    id: 'schedule_change', icon: '🔄', title: 'Schedule / Venue Change', category: 'Admin',
    body: `🔄 *Schedule Change Notice*\n\nDear Students & Parents,\n\nPlease note an important change to the class schedule.\n\n📅 *Effective from:* [DATE]\n📖 *Subject/Class:* [SUBJECT / CLASS]\n🕐 *New time:* [TIME]\n📍 *New venue:* [VENUE / Online]\n\n*Reason:* [BRIEF REASON]\n\nPlease update your ward's timetable accordingly. The updated full schedule is also available on the Rillcod portal under *My Classes → Timetable*.\n\nWe apologise for any inconvenience caused.\n\n— School Management`,
  },

  // ── Emergency ─────────────────────────────────────────────────────────────
  {
    id: 'emergency', icon: '🚨', title: 'Emergency / Urgent Notice', category: 'Emergency',
    body: `🚨 *URGENT NOTICE — Action Required*\n\nDear Parents/Guardians,\n\n[INSERT DETAILS OF EMERGENCY OR URGENT SITUATION]\n\n*Please take the following action immediately:*\n• [ACTION 1]\n• [ACTION 2]\n• [ACTION 3]\n\nAcknowledge this message by replying with your ward's *full name and class*.\n\nFurther updates will follow. For urgent enquiries, call the school admin at [PHONE NUMBER].\n\n— School Management\n_Rillcod Technologies_`,
  },
  {
    id: 'school_closure', icon: '🔒', title: 'School Closure / Early Dismissal', category: 'Emergency',
    body: `🔒 *School Closure Notice*\n\nDear Parents/Guardians,\n\nDue to *[REASON]*, the school will be closed today and students are being dismissed early.\n\n🕐 *Dismissal time:* [TIME]\n📍 *Collection point:* School main gate\n\nPlease make arrangements to collect your ward as soon as possible. Students who are not collected will be supervised by staff until [TIME].\n\nAll teachers remain reachable via the *Rillcod portal messaging system*.\n\nWe apologise for the inconvenience and will provide further updates shortly.\n\n— School Management`,
  },
  {
    id: 'health_alert', icon: '🏥', title: 'Health & Safety Alert', category: 'Emergency',
    body: `🏥 *Health & Safety Alert*\n\nDear Parents/Guardians,\n\nWe want to bring an important health matter to your attention.\n\n⚠️ *Issue:* [BRIEF DESCRIPTION]\n\n*Recommended actions:*\n• Watch your ward for any signs of [SYMPTOMS]\n• Ensure regular hand washing and good hygiene\n• Consult a doctor promptly if symptoms develop\n• Do NOT send unwell students to school\n\nThe school is taking all necessary precautions to protect students and staff.\n\nWe will send further updates as the situation develops. Thank you for your cooperation.\n\nStay safe! 💚\n\n— School Management\n_Rillcod Technologies_`,
  },
];

type View = 'list' | 'detail';

const TEMPLATES_KEY = 'rillcod_wa_tpl_v2';

interface Template { id: string; title: string; body: string; category: string; }

// ── Helpers ──────────────────────────────────────────────────────────────────
function typeConfig(type: string) {
  return GROUP_TYPES.find(t => t.value === type) ?? { label: type, color: '#6b7280', desc: '' };
}

function statusStyle(status: string) {
  if (status === 'active')   return { bg: 'rgba(0,168,132,0.15)',  text: '#00a884', border: 'rgba(0,168,132,0.3)' };
  if (status === 'inactive') return { bg: 'rgba(251,191,36,0.12)', text: '#fbbf24', border: 'rgba(251,191,36,0.3)' };
  return                            { bg: 'rgba(107,114,128,0.15)', text: '#9ca3af', border: 'rgba(107,114,128,0.3)' };
}

function relTime(iso: string) {
  const d = Date.now() - new Date(iso).getTime();
  const m = Math.floor(d / 60000);
  if (m < 2)   return 'Just now';
  if (m < 60)  return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24)  return `${h}h ago`;
  const dy = Math.floor(h / 24);
  if (dy < 7)  return `${dy}d ago`;
  return new Date(iso).toLocaleDateString([], { day: '2-digit', month: 'short', year: '2-digit' });
}

function initials(name: string) {
  return name.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase();
}

// ── Component ────────────────────────────────────────────────────────────────
export default function WhatsAppGroupsPage() {
  // Data
  const [groups,     setGroups]     = useState<Group[]>([]);
  const [schools,    setSchools]    = useState<School[]>([]);
  const [broadcasts, setBroadcasts] = useState<Broadcast[]>([]);
  const [callerRole, setCallerRole] = useState<string>('teacher');
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState<string | null>(null);

  // Filters
  const [search,       setSearch]       = useState('');
  const [typeFilter,   setTypeFilter]   = useState('');
  const [statusFilter, setStatusFilter] = useState('active');
  const [schoolFilter, setSchoolFilter] = useState('');

  // Selection
  const [selected,   setSelected]   = useState<Set<string>>(new Set());
  const [activeGroup, setActiveGroup] = useState<Group | null>(null);
  const [view,        setView]        = useState<View>('list');

  // Form
  const [showForm,   setShowForm]   = useState(false);
  const [editGroup,  setEditGroup]  = useState<Group | null>(null);
  const [form,       setForm]       = useState<Partial<Group>>({});
  const [saving,     setSaving]     = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Composer
  const [message,     setMessage]     = useState('');
  const [sending,     setSending]     = useState(false);
  const [logSending,  setLogSending]  = useState(false);

  // Templates
  const [templates,     setTemplates]     = useState<Template[]>([]);
  const [showTemplates, setShowTemplates] = useState(false);
  const [tplTitle,      setTplTitle]      = useState('');
  const [tplCategory,   setTplCategory]   = useState('General');

  // Broadcast history panel
  const [showHistory,   setShowHistory]   = useState(false);
  const [histLoading,   setHistLoading]   = useState(false);
  const [deletingBcast, setDeletingBcast] = useState<string | null>(null);
  const [clearingHist,  setClearingHist]  = useState(false);
  const [histGroupId,   setHistGroupId]   = useState<string | undefined>(undefined);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [confirmClearHist, setConfirmClearHist] = useState(false);

  // Content Pusher
  const [showPusher,       setShowPusher]       = useState(false);
  const [pusherTab,        setPusherTab]        = useState<'assignment' | 'newsletter' | 'custom'>('assignment');
  const [pusherTplCategory, setPusherTplCategory] = useState('All');
  const [assignments,   setAssignments]   = useState<Assignment[]>([]);
  const [assignLoading, setAssignLoading] = useState(false);
  const [selAssignment, setSelAssignment] = useState<Assignment | null>(null);
  const [pusherMsg,     setPusherMsg]     = useState('');
  const [pusherGroups,  setPusherGroups]  = useState<Set<string>>(new Set());
  const [pusherSending, setPusherSending] = useState(false);

  // Toast
  const [toast, setToast] = useState<{ msg: string; type?: 'ok' | 'err' } | null>(null);
  const toastRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Init ──────────────────────────────────────────────────────────────────
  useEffect(() => { loadGroups(); loadTemplates(); }, []);

  function showToast(msg: string, type: 'ok' | 'err' = 'ok') {
    setToast({ msg, type });
    if (toastRef.current) clearTimeout(toastRef.current);
    toastRef.current = setTimeout(() => setToast(null), 3500);
  }

  function loadTemplates() {
    try { setTemplates(JSON.parse(localStorage.getItem(TEMPLATES_KEY) || '[]')); } catch {}
  }

  // ── Data fetching ─────────────────────────────────────────────────────────
  async function loadGroups(extra?: Record<string, string>) {
    setLoading(true); setError(null);
    const params = new URLSearchParams({
      status:     extra?.status     ?? statusFilter,
      group_type: extra?.group_type ?? typeFilter,
      school_id:  extra?.school_id  ?? schoolFilter,
    });
    try {
      const res  = await fetch(`/api/whatsapp-groups?${params}`, { cache: 'no-store' });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Load failed');
      setGroups(json.data ?? []);
      setSchools(json.schools ?? []);
      setCallerRole(json.caller_role ?? 'teacher');
    } catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  }

  async function loadAssignments() {
    setAssignLoading(true);
    try {
      const res  = await fetch('/api/assignments?limit=40&is_active=true', { cache: 'no-store' });
      const json = await res.json();
      setAssignments(json.data ?? []);
    } catch {}
    finally { setAssignLoading(false); }
  }

  function formatAssignment(a: Assignment): string {
    const lines: string[] = [];
    lines.push(`📚 *${a.title}*`);
    if (a.courses?.title) lines.push(`📖 Course: ${a.courses.title}`);
    if (a.due_date) {
      const d = new Date(a.due_date).toLocaleDateString('en-NG', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
      lines.push(`📅 Due: ${d}`);
    }
    if (a.max_points) lines.push(`⭐ Max Points: ${a.max_points}`);
    if (a.assignment_type) lines.push(`🔖 Type: ${String(a.assignment_type).replace(/_/g, ' ')}`);
    if (a.metadata?.target_class_name) lines.push(`🏫 Class: ${a.metadata.target_class_name}`);
    lines.push('');
    if (a.description) lines.push(a.description);
    if (a.instructions) { lines.push(''); lines.push(`📝 Instructions:\n${a.instructions}`); }
    lines.push('');
    lines.push('Please log in to your portal to view full details.');
    lines.push('— Rillcod Technologies');
    return lines.join('\n');
  }

  function openPusher() {
    setShowPusher(true);
    setPusherMsg('');
    setSelAssignment(null);
    setPusherGroups(selected.size > 0 ? new Set(selected) : new Set());
    setPusherTab('assignment');
    loadAssignments();
  }

  async function pushContent() {
    if (!pusherMsg.trim())         { showToast('Write or pick a message first', 'err'); return; }
    if (pusherGroups.size === 0)   { showToast('Select at least one target group', 'err'); return; }
    setPusherSending(true);
    await navigator.clipboard?.writeText(pusherMsg).catch(() => {});
    const targets = groups.filter(g => pusherGroups.has(g.id) && g.status === 'active');
    showToast(`Opening ${targets.length} group${targets.length !== 1 ? 's' : ''} — paste in each`, 'ok');
    for (let i = 0; i < targets.length; i++) {
      await new Promise(r => setTimeout(r, i === 0 ? 80 : 1300));
      window.open(targets[i].link, '_blank', 'noopener,noreferrer');
      await fetch('/api/whatsapp-groups/broadcasts', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ group_id: targets[i].id, message: pusherMsg.trim() }),
      });
      setGroups(prev => prev.map(g => g.id === targets[i].id ? { ...g, last_broadcast_at: new Date().toISOString() } : g));
    }
    setPusherSending(false);
    setShowPusher(false);
    setMessage(pusherMsg);
  }

  async function loadHistory(groupId?: string, schoolId?: string) {
    setHistLoading(true);
    setHistGroupId(groupId);
    const params = new URLSearchParams({ limit: '40' });
    if (groupId)  params.set('group_id',  groupId);
    if (schoolId) params.set('school_id', schoolId);
    try {
      const res  = await fetch(`/api/whatsapp-groups/broadcasts?${params}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to load history');
      setBroadcasts(json.data ?? []);
    } catch (e: any) {
      showToast(e.message, 'err');
      setBroadcasts([]);
    } finally {
      setHistLoading(false);
    }
  }

  async function deleteBroadcast(id: string) {
    setDeletingBcast(id);
    try {
      const res  = await fetch(`/api/whatsapp-groups/broadcasts?id=${id}`, { method: 'DELETE' });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || 'Delete failed');
      setBroadcasts(prev => prev.filter(b => b.id !== id));
      showToast('Entry deleted');
    } catch (e: any) { showToast(e.message, 'err'); }
    finally { setDeletingBcast(null); }
  }

  async function clearHistory(groupId: string) {
    if (!confirmClearHist) { setConfirmClearHist(true); return; }
    setConfirmClearHist(false);
    setClearingHist(true);
    try {
      const res  = await fetch(`/api/whatsapp-groups/broadcasts?group_id=${groupId}`, { method: 'DELETE' });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || 'Clear failed');
      setBroadcasts([]);
      showToast('History cleared');
    } catch (e: any) { showToast(e.message, 'err'); }
    finally { setClearingHist(false); }
  }

  // ── CRUD ──────────────────────────────────────────────────────────────────
  async function saveGroup() {
    if (!form.name?.trim() || !form.link?.trim()) {
      showToast('Name and link are required', 'err'); return;
    }
    setSaving(true); setError(null);
    try {
      const method = editGroup ? 'PATCH' : 'POST';
      const body   = editGroup ? { id: editGroup.id, ...form } : form;
      const res    = await fetch('/api/whatsapp-groups', {
        method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Save failed');
      if (editGroup) {
        setGroups(prev => prev.map(g => g.id === editGroup.id ? json.data : g));
        if (activeGroup?.id === editGroup.id) setActiveGroup(json.data);
      } else {
        setGroups(prev => [json.data, ...prev]);
      }
      resetForm();
      showToast(editGroup ? 'Group updated' : 'Group saved');
    } catch (e: any) { showToast(e.message, 'err'); }
    finally { setSaving(false); }
  }

  async function deleteGroup(id: string, name: string) {
    if (confirmDeleteId !== id) { setConfirmDeleteId(id); return; }
    setConfirmDeleteId(null);
    setDeletingId(id);
    try {
      const res = await fetch(`/api/whatsapp-groups?id=${id}`, { method: 'DELETE' });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || 'Delete failed');
      setGroups(prev => prev.filter(g => g.id !== id));
      setSelected(prev => { const s = new Set(prev); s.delete(id); return s; });
      if (activeGroup?.id === id) { setActiveGroup(null); setView('list'); }
      showToast(`"${name}" deleted`);
    } catch (e: any) { showToast(e.message, 'err'); }
    finally { setDeletingId(null); }
  }

  async function setStatus(group: Group, status: Status) {
    const res  = await fetch('/api/whatsapp-groups', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: group.id, status }),
    });
    const json = await res.json();
    if (!res.ok) { showToast(json.error || 'Update failed', 'err'); return; }
    setGroups(prev => prev.map(g => g.id === group.id ? json.data : g));
    if (activeGroup?.id === group.id) setActiveGroup(json.data);
    showToast(`Marked as ${status}`);
  }

  function resetForm() { setForm({}); setEditGroup(null); setShowForm(false); }

  function openEdit(g: Group) {
    setEditGroup(g);
    setForm({ name: g.name, link: g.link, description: g.description ?? '', group_type: g.group_type,
               class_name: g.class_name ?? '', term: g.term ?? '', member_count: g.member_count ?? undefined,
               school_id: g.school_id ?? '' });
    setShowForm(true);
  }

  // ── Send logic ────────────────────────────────────────────────────────────
  async function logBroadcast(groupId: string) {
    if (!message.trim()) return;
    await fetch('/api/whatsapp-groups/broadcasts', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ group_id: groupId, message: message.trim() }),
    });
    // Refresh last_broadcast_at on the local group
    setGroups(prev => prev.map(g => g.id === groupId
      ? { ...g, last_broadcast_at: new Date().toISOString() } : g));
    if (activeGroup?.id === groupId) setActiveGroup(a => a ? { ...a, last_broadcast_at: new Date().toISOString() } : a);
  }

  async function sendToGroup(group: Group) {
    if (message.trim()) await navigator.clipboard?.writeText(message).catch(() => {});
    setTimeout(() => window.open(group.link, '_blank', 'noopener,noreferrer'), 60);
    await logBroadcast(group.id);
    showToast(`✓ Copied & opening "${group.name}" — paste and send`);
  }

  async function broadcastToSelected() {
    if (selected.size === 0) { showToast('Select at least one group', 'err'); return; }
    if (!message.trim())      { showToast('Write a message first', 'err'); return; }
    setSending(true);
    await navigator.clipboard?.writeText(message).catch(() => {});
    showToast(`Opening ${selected.size} group${selected.size > 1 ? 's' : ''} — paste in each`, 'ok');
    const targets = groups.filter(g => selected.has(g.id));
    for (let i = 0; i < targets.length; i++) {
      await new Promise(r => setTimeout(r, i === 0 ? 80 : 1300));
      window.open(targets[i].link, '_blank', 'noopener,noreferrer');
      await logBroadcast(targets[i].id);
    }
    setSending(false);
  }

  // ── Templates ─────────────────────────────────────────────────────────────
  function saveTemplate() {
    if (!message.trim()) { showToast('Write a message first', 'err'); return; }
    const title = tplTitle.trim() || `Template ${templates.length + 1}`;
    const tpl: Template = { id: Date.now().toString(), title, body: message.trim(), category: tplCategory };
    const updated = [...templates, tpl];
    setTemplates(updated);
    localStorage.setItem(TEMPLATES_KEY, JSON.stringify(updated));
    setTplTitle('');
    showToast(`Saved as "${title}"`);
  }

  function deleteTemplate(id: string) {
    const updated = templates.filter(t => t.id !== id);
    setTemplates(updated);
    localStorage.setItem(TEMPLATES_KEY, JSON.stringify(updated));
  }

  // ── Derived ───────────────────────────────────────────────────────────────
  const filtered = groups.filter(g => {
    if (search && !g.name.toLowerCase().includes(search.toLowerCase()) &&
        !(g.school_name ?? '').toLowerCase().includes(search.toLowerCase()) &&
        !(g.class_name  ?? '').toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const stats = {
    total:    groups.length,
    active:   groups.filter(g => g.status === 'active').length,
    inactive: groups.filter(g => g.status === 'inactive').length,
    archived: groups.filter(g => g.status === 'archived').length,
    byType:   GROUP_TYPES.map(t => ({ ...t, count: groups.filter(g => g.group_type === t.value).length })).filter(t => t.count > 0),
  };

  const isAdmin   = callerRole === 'admin';
  const tplGroups = [...new Set(templates.map(t => t.category))];

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="h-full flex flex-col overflow-hidden" style={{ background: '#0b141a', color: '#e9edef' }}>

      {/* Toast */}
      {toast && (
        <div className="fixed top-[70px] left-1/2 -translate-x-1/2 z-[70] px-5 py-3 rounded-xl text-sm font-bold shadow-2xl flex items-center gap-2 max-w-sm text-center"
          style={{ background: '#1f2c34', border: `1px solid ${toast.type === 'err' ? 'rgba(239,68,68,0.4)' : 'rgba(0,168,132,0.4)'}`, color: toast.type === 'err' ? '#f87171' : '#e9edef' }}>
          {toast.type === 'err' ? <AlertCircle className="w-4 h-4 shrink-0 text-red-400" /> : <CheckCircle2 className="w-4 h-4 shrink-0" style={{ color: '#00a884' }} />}
          {toast.msg}
        </div>
      )}

      <div className="flex flex-1 min-h-0 overflow-hidden">

        {/* ── LEFT SIDEBAR ──────────────────────────────────────────────── */}
        <aside className="hidden lg:flex flex-col w-64 shrink-0 border-r" style={{ background: '#111b21', borderColor: 'rgba(255,255,255,0.07)' }}>
          {/* Logo / Title */}
          <div className="px-5 py-5 flex items-center gap-3" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
            <div className="w-9 h-9 rounded-full flex items-center justify-center shrink-0" style={{ background: '#00a884' }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="white">
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/>
                <path d="M12 0C5.374 0 0 5.373 0 12c0 2.117.554 4.103 1.522 5.827L.057 23.882a.5.5 0 00.613.613l6.056-1.465A11.945 11.945 0 0012 24c6.626 0 12-5.373 12-12S18.626 0 12 0zm0 21.818a9.808 9.808 0 01-5.029-1.388l-.36-.215-3.733.903.921-3.626-.235-.372A9.8 9.8 0 012.182 12C2.182 6.57 6.57 2.182 12 2.182S21.818 6.57 21.818 12 17.43 21.818 12 21.818z"/>
              </svg>
            </div>
            <div>
              <p className="font-black text-white text-[14px] leading-tight">Group Manager</p>
              <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: '#8696a0' }}>
                {isAdmin ? 'Admin · All Schools' : 'School Scope'}
              </p>
            </div>
          </div>

          {/* Stats */}
          <div className="px-4 py-4 space-y-1" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
            <p className="text-[9px] font-black uppercase tracking-widest mb-3" style={{ color: '#8696a0' }}>Overview</p>
            {[
              { label: 'Total Groups',  value: stats.total,    color: '#e9edef' },
              { label: 'Active',         value: stats.active,   color: '#00a884' },
              { label: 'Inactive',       value: stats.inactive, color: '#fbbf24' },
              { label: 'Archived',       value: stats.archived, color: '#6b7280' },
            ].map(s => (
              <div key={s.label} className="flex items-center justify-between py-1">
                <span className="text-[12px]" style={{ color: '#8696a0' }}>{s.label}</span>
                <span className="text-[13px] font-black" style={{ color: s.color }}>{s.value}</span>
              </div>
            ))}
          </div>

          {/* Status filter */}
          <div className="px-4 py-4 space-y-1" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
            <p className="text-[9px] font-black uppercase tracking-widest mb-2" style={{ color: '#8696a0' }}>Status</p>
            {(['all', 'active', 'inactive', 'archived'] as const).map(s => (
              <button key={s} onClick={() => { setStatusFilter(s); loadGroups({ status: s, group_type: typeFilter, school_id: schoolFilter }); }}
                className="w-full text-left px-3 py-2 rounded-lg text-[12px] font-bold capitalize transition-colors"
                style={{ background: statusFilter === s ? 'rgba(0,168,132,0.15)' : 'transparent', color: statusFilter === s ? '#00a884' : '#8696a0' }}>
                {s === 'all' ? 'All Statuses' : s.charAt(0).toUpperCase() + s.slice(1)}
              </button>
            ))}
          </div>

          {/* Type filter */}
          <div className="px-4 py-4 space-y-1 flex-1 overflow-y-auto" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
            <p className="text-[9px] font-black uppercase tracking-widest mb-2" style={{ color: '#8696a0' }}>Group Type</p>
            <button onClick={() => { setTypeFilter(''); loadGroups({ status: statusFilter, group_type: '', school_id: schoolFilter }); }}
              className="w-full text-left px-3 py-2 rounded-lg text-[12px] font-bold transition-colors"
              style={{ background: !typeFilter ? 'rgba(0,168,132,0.15)' : 'transparent', color: !typeFilter ? '#00a884' : '#8696a0' }}>
              All Types
            </button>
            {GROUP_TYPES.map(t => {
              const count = stats.byType.find(b => b.value === t.value)?.count ?? 0;
              return (
                <button key={t.value}
                  onClick={() => { setTypeFilter(t.value); loadGroups({ status: statusFilter, group_type: t.value, school_id: schoolFilter }); }}
                  className="w-full flex items-center justify-between px-3 py-2 rounded-lg text-[12px] font-bold transition-colors"
                  style={{ background: typeFilter === t.value ? `${t.color}20` : 'transparent', color: typeFilter === t.value ? t.color : '#8696a0' }}>
                  <span>{t.label}</span>
                  {count > 0 && <span className="text-[10px] px-1.5 py-0.5 rounded-full" style={{ background: `${t.color}25`, color: t.color }}>{count}</span>}
                </button>
              );
            })}
          </div>

          {/* School filter (admin only) */}
          {isAdmin && schools.length > 0 && (
            <div className="px-4 py-4 space-y-1">
              <p className="text-[9px] font-black uppercase tracking-widest mb-2" style={{ color: '#8696a0' }}>School</p>
              <button onClick={() => { setSchoolFilter(''); loadGroups({ status: statusFilter, group_type: typeFilter, school_id: '' }); }}
                className="w-full text-left px-3 py-2 rounded-lg text-[12px] font-bold transition-colors"
                style={{ background: !schoolFilter ? 'rgba(0,168,132,0.15)' : 'transparent', color: !schoolFilter ? '#00a884' : '#8696a0' }}>
                All Schools
              </button>
              {schools.map(sc => (
                <button key={sc.id}
                  onClick={() => { setSchoolFilter(sc.id); loadGroups({ status: statusFilter, group_type: typeFilter, school_id: sc.id }); }}
                  className="w-full text-left px-3 py-2 rounded-lg text-[12px] font-bold truncate transition-colors"
                  style={{ background: schoolFilter === sc.id ? 'rgba(0,168,132,0.15)' : 'transparent', color: schoolFilter === sc.id ? '#00a884' : '#8696a0' }}>
                  {sc.name}
                </button>
              ))}
            </div>
          )}
        </aside>

        {/* ── MAIN ──────────────────────────────────────────────────────── */}
        <main className="flex-1 flex flex-col min-w-0">

          {/* Top bar */}
          <div className="flex items-center gap-2 px-3 sm:px-5 py-3 shrink-0" style={{ background: '#1f2c34', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
            {/* Title */}
            <div className="flex items-center gap-2 flex-1 min-w-0">
              <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0" style={{ background: 'rgba(0,168,132,0.15)' }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="#00a884">
                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/>
                  <path d="M12 0C5.374 0 0 5.373 0 12c0 2.117.554 4.103 1.522 5.827L.057 23.882a.5.5 0 00.613.613l6.056-1.465A11.945 11.945 0 0012 24c6.626 0 12-5.373 12-12S18.626 0 12 0zm0 21.818a9.808 9.808 0 01-5.029-1.388l-.36-.215-3.733.903.921-3.626-.235-.372A9.8 9.8 0 012.182 12C2.182 6.57 6.57 2.182 12 2.182S21.818 6.57 21.818 12 17.43 21.818 12 21.818z"/>
                </svg>
              </div>
              <div className="min-w-0">
                <h1 className="font-black text-white text-[15px] tracking-tight leading-tight truncate">Group Manager</h1>
                <p className="text-[10px] leading-tight hidden sm:block" style={{ color: '#8696a0' }}>
                  {stats.active} active · {stats.total} total
                </p>
              </div>
            </div>

            {/* Actions — icon-only on mobile, labelled on sm+ */}
            <div className="flex items-center gap-1.5 shrink-0">
              <button onClick={() => { setShowHistory(true); loadHistory(undefined, schoolFilter || undefined); }}
                className="p-2 rounded-full hover:bg-white/5 transition-colors" title="Broadcast history">
                <History className="w-4 h-4" style={{ color: '#8696a0' }} />
              </button>
              <button onClick={() => loadGroups()}
                className="p-2 rounded-full hover:bg-white/5 transition-colors" title="Refresh">
                <RefreshCw className="w-4 h-4" style={{ color: '#8696a0' }} />
              </button>

              {/* Push Content — icon only on mobile */}
              <button onClick={openPusher}
                className="flex items-center gap-1.5 p-2 sm:px-3 sm:py-2 rounded-xl text-white text-[12px] font-black uppercase tracking-widest transition-all active:scale-95"
                style={{ background: '#7c3aed' }}
                title="Push Content to Groups">
                <Zap className="w-4 h-4 shrink-0" />
                <span className="hidden sm:inline">Push</span>
              </button>

              {/* New Group — icon only on mobile */}
              <button onClick={() => { setShowForm(true); setEditGroup(null); setForm({ group_type: 'general', status: 'active' }); }}
                className="flex items-center gap-1.5 p-2 sm:px-3 sm:py-2 rounded-xl text-white text-[12px] font-black uppercase tracking-widest transition-all active:scale-95"
                style={{ background: '#00a884' }}
                title="Add New Group">
                <Plus className="w-4 h-4 shrink-0" />
                <span className="hidden sm:inline">New</span>
              </button>
            </div>
          </div>

          {/* Search + mobile filters */}
          <div className="px-4 sm:px-6 py-3 flex flex-wrap items-center gap-2" style={{ background: '#111b21', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
            <div className="relative flex-1 min-w-[200px]">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2" style={{ color: '#8696a0' }} />
              <input value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Search groups, schools, classes…"
                className="w-full text-white text-[13px] rounded-xl pl-9 pr-4 py-2.5 outline-none"
                style={{ background: '#2a3942', caretColor: '#00a884' }} />
              {search && <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2"><X className="w-3.5 h-3.5" style={{ color: '#8696a0' }} /></button>}
            </div>

            {/* Mobile type chips */}
            <div className="lg:hidden flex gap-1.5 overflow-x-auto max-w-full pb-0.5">
              <button onClick={() => { setTypeFilter(''); loadGroups({ status: statusFilter, group_type: '', school_id: schoolFilter }); }}
                className="shrink-0 px-3 py-1.5 rounded-full text-[11px] font-black transition-all"
                style={{ background: !typeFilter ? 'rgba(0,168,132,0.2)' : 'rgba(255,255,255,0.05)', color: !typeFilter ? '#00a884' : '#8696a0' }}>All</button>
              {GROUP_TYPES.filter(t => stats.byType.some(b => b.value === t.value)).map(t => (
                <button key={t.value}
                  onClick={() => { setTypeFilter(t.value); loadGroups({ status: statusFilter, group_type: t.value, school_id: schoolFilter }); }}
                  className="shrink-0 px-3 py-1.5 rounded-full text-[11px] font-black transition-all"
                  style={{ background: typeFilter === t.value ? `${t.color}30` : 'rgba(255,255,255,0.05)', color: typeFilter === t.value ? t.color : '#8696a0', border: `1px solid ${typeFilter === t.value ? `${t.color}50` : 'transparent'}` }}>
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          {/* Multi-select bar */}
          {selected.size > 0 && (
            <div className="px-4 sm:px-6 py-2.5 flex items-center justify-between gap-3 shrink-0"
              style={{ background: 'rgba(0,168,132,0.1)', borderBottom: '1px solid rgba(0,168,132,0.25)' }}>
              <span className="text-[13px] font-bold flex items-center gap-2" style={{ color: '#00a884' }}>
                <Check className="w-4 h-4" />{selected.size} selected
              </span>
              <div className="flex gap-2">
                <button onClick={() => setSelected(new Set())}
                  className="text-[12px] font-black px-3 py-1.5 rounded-lg" style={{ color: '#8696a0' }}>Clear</button>
                <button onClick={broadcastToSelected} disabled={sending || !message.trim() || message.length > 4096}
                  className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-white text-[12px] font-black disabled:opacity-40 active:scale-95 transition-all"
                  style={{ background: '#00a884' }}>
                  <Layers className="w-3.5 h-3.5" />
                  {sending ? `Opening…` : `Broadcast (${selected.size})`}
                </button>
              </div>
            </div>
          )}

          {/* Content area — groups + detail panel */}
          <div className="flex flex-1 min-h-0 overflow-hidden">

            {/* Group list */}
            <div className={`flex flex-col ${activeGroup ? 'hidden md:flex md:w-[340px] lg:w-[380px]' : 'flex-1'} overflow-hidden`}
              style={{ borderRight: activeGroup ? '1px solid rgba(255,255,255,0.07)' : 'none' }}>

              {/* Select all header */}
              {filtered.length > 0 && (
                <div className="flex items-center justify-between px-4 py-2.5 shrink-0"
                  style={{ background: '#111b21', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                  <span className="text-[11px] font-black uppercase tracking-widest" style={{ color: '#8696a0' }}>
                    {filtered.length} group{filtered.length !== 1 ? 's' : ''}
                  </span>
                  <button
                    onClick={() => setSelected(selected.size === filtered.length ? new Set() : new Set(filtered.map(g => g.id)))}
                    className="text-[11px] font-black uppercase tracking-widest transition-colors"
                    style={{ color: '#00a884' }}>
                    {selected.size === filtered.length ? 'Deselect all' : 'Select all'}
                  </button>
                </div>
              )}

              <div className="flex-1 overflow-y-auto">
                {loading ? (
                  <div className="p-12 flex justify-center"><Loader2 className="w-6 h-6 animate-spin" style={{ color: '#00a884' }} /></div>
                ) : error ? (
                  <div className="p-8 text-center text-[13px]" style={{ color: '#f87171' }}>{error}</div>
                ) : filtered.length === 0 ? (
                  <div className="p-12 text-center space-y-3">
                    <Users className="w-10 h-10 mx-auto" style={{ color: '#2a3942' }} />
                    <p className="text-[13px]" style={{ color: '#8696a0' }}>
                      {groups.length === 0 ? 'No groups yet. Add your first group.' : 'No groups match your filters.'}
                    </p>
                    {groups.length === 0 && (
                      <button onClick={() => { setShowForm(true); setForm({ group_type: 'general', status: 'active' }); }}
                        className="text-[12px] font-black uppercase tracking-widest transition-colors" style={{ color: '#00a884' }}>
                        + Add First Group →
                      </button>
                    )}
                  </div>
                ) : (
                  filtered.map((group, idx) => {
                    const tc = typeConfig(group.group_type);
                    const ss = statusStyle(group.status);
                    const isSelected = selected.has(group.id);
                    const isActive   = activeGroup?.id === group.id;
                    return (
                      <div key={group.id}
                        onClick={() => { setActiveGroup(group); setView('detail'); }}
                        className="flex items-center gap-3 px-4 py-3.5 cursor-pointer transition-colors"
                        style={{
                          borderBottom: '1px solid rgba(255,255,255,0.04)',
                          background: isActive ? '#2a3942' : isSelected ? 'rgba(0,168,132,0.07)' : undefined,
                        }}>

                        {/* Checkbox */}
                        <button
                          onClick={e => { e.stopPropagation(); setSelected(prev => { const s = new Set(prev); if (s.has(group.id)) s.delete(group.id); else s.add(group.id); return s; }); }}
                          className="w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-all"
                          style={{ borderColor: isSelected ? '#00a884' : 'rgba(255,255,255,0.2)', background: isSelected ? '#00a884' : 'transparent' }}>
                          {isSelected && <Check className="w-3 h-3 text-white" />}
                        </button>

                        {/* Avatar */}
                        <div className="w-12 h-12 rounded-full flex items-center justify-center shrink-0 font-black text-[14px]"
                          style={{ background: `${tc.color}20`, color: tc.color, border: `2px solid ${tc.color}35` }}>
                          {initials(group.name)}
                        </div>

                        {/* Info */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap mb-0.5">
                            <span className="font-bold text-white text-[14px] truncate max-w-[180px]">{group.name}</span>
                            {group.status !== 'active' && (
                              <span className="text-[9px] font-black uppercase px-1.5 py-0.5 rounded-full shrink-0"
                                style={{ background: ss.bg, color: ss.text, border: `1px solid ${ss.border}` }}>
                                {group.status}
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="text-[10px] font-black px-1.5 py-0.5 rounded-full shrink-0"
                              style={{ background: `${tc.color}18`, color: tc.color }}>
                              {tc.label}
                            </span>
                            {group.class_name && (
                              <span className="text-[10px]" style={{ color: '#8696a0' }}>{group.class_name}</span>
                            )}
                            {group.school_name && isAdmin && (
                              <span className="text-[10px] truncate" style={{ color: '#8696a0' }}>· {group.school_name}</span>
                            )}
                          </div>
                          {group.last_broadcast_at ? (
                            <div className="flex items-center gap-1 mt-0.5">
                              <Clock className="w-2.5 h-2.5 shrink-0" style={{ color: '#00a884' }} />
                              <span className="text-[10px]" style={{ color: '#8696a0' }}>Sent {relTime(group.last_broadcast_at)}</span>
                            </div>
                          ) : (
                            <span className="text-[10px] mt-0.5 block" style={{ color: '#8696a0' }}>Never broadcast</span>
                          )}
                        </div>

                        {/* Quick-open button — no detail panel needed */}
                        <button
                          onClick={e => {
                            e.stopPropagation();
                            if (message.trim()) {
                              navigator.clipboard?.writeText(message).catch(() => {});
                              logBroadcast(group.id);
                              showToast(`✓ Copied & opening "${group.name}"`);
                            }
                            window.open(group.link, '_blank', 'noopener,noreferrer');
                          }}
                          title={message.trim() ? 'Copy message & open group' : 'Open group in WhatsApp'}
                          className="p-2 rounded-full hover:bg-[#00a884]/20 transition-colors shrink-0">
                          <svg width="18" height="18" viewBox="0 0 24 24" fill="#00a884">
                            <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/>
                            <path d="M12 0C5.374 0 0 5.373 0 12c0 2.117.554 4.103 1.522 5.827L.057 23.882a.5.5 0 00.613.613l6.056-1.465A11.945 11.945 0 0012 24c6.626 0 12-5.373 12-12S18.626 0 12 0zm0 21.818a9.808 9.808 0 01-5.029-1.388l-.36-.215-3.733.903.921-3.626-.235-.372A9.8 9.8 0 012.182 12C2.182 6.57 6.57 2.182 12 2.182S21.818 6.57 21.818 12 17.43 21.818 12 21.818z"/>
                          </svg>
                        </button>
                      </div>
                    );
                  })
                )}
              </div>

              {/* Smart quick-compose bar — always visible at bottom of list */}
              <div className="shrink-0 px-3 py-2.5 flex items-center gap-2" style={{ background: '#1f2c34', borderTop: '1px solid rgba(255,255,255,0.07)' }}>
                <textarea
                  value={message} onChange={e => setMessage(e.target.value)} rows={1}
                  placeholder={selected.size > 0 ? `Message → ${selected.size} group${selected.size !== 1 ? 's' : ''} selected` : 'Type a message then tap WA icon to send…'}
                  className="flex-1 text-white text-[13px] rounded-xl px-3 py-2 outline-none resize-none leading-relaxed"
                  style={{ background: '#2a3942', caretColor: '#00a884', maxHeight: '80px' }}
                  onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey && selected.size > 0) { e.preventDefault(); broadcastToSelected(); } }}
                />
                {selected.size > 0 ? (
                  <button onClick={broadcastToSelected} disabled={sending || !message.trim() || message.length > 4096}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-white text-[12px] font-black disabled:opacity-40 transition-all active:scale-95 shrink-0"
                    style={{ background: '#00a884' }}>
                    <Layers className="w-4 h-4" />
                    {sending ? '…' : `Send (${selected.size})`}
                  </button>
                ) : (
                  <button onClick={openPusher}
                    className="p-2 rounded-full hover:bg-[#7c3aed]/20 transition-colors shrink-0" title="Push content to groups">
                    <Zap className="w-4 h-4" style={{ color: '#7c3aed' }} />
                  </button>
                )}
              </div>
            </div>

            {/* ── Detail / Composer panel ─────────────────────────────────── */}
            {activeGroup ? (
              <div className="flex-1 flex flex-col min-w-0 overflow-hidden" style={{ background: '#0b141a' }}>
                {(() => {
                  const g  = activeGroup;
                  const tc = typeConfig(g.group_type);
                  const ss = statusStyle(g.status);
                  return (
                    <>
                      {/* Detail header */}
                      <div className="flex items-center gap-3 px-5 py-4 shrink-0" style={{ background: '#1f2c34', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
                        <button onClick={() => { setActiveGroup(null); setView('list'); }}
                          className="p-1.5 rounded-full hover:bg-white/10 transition-colors md:hidden">
                          <ChevronRight className="w-5 h-5 rotate-180" style={{ color: '#8696a0' }} />
                        </button>
                        <div className="w-11 h-11 rounded-full flex items-center justify-center font-black text-[14px] shrink-0"
                          style={{ background: `${tc.color}25`, color: tc.color }}>
                          {initials(g.name)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <h2 className="font-black text-white text-[16px] truncate">{g.name}</h2>
                            <span className="text-[9px] font-black px-2 py-0.5 rounded-full shrink-0"
                              style={{ background: ss.bg, color: ss.text, border: `1px solid ${ss.border}` }}>
                              {g.status}
                            </span>
                          </div>
                          <div className="flex items-center gap-2 flex-wrap mt-0.5">
                            <span className="text-[10px] font-black px-1.5 py-0.5 rounded-full"
                              style={{ background: `${tc.color}18`, color: tc.color }}>{tc.label}</span>
                            {g.class_name && <span className="text-[10px]" style={{ color: '#8696a0' }}>{g.class_name}</span>}
                            {g.term && <span className="text-[10px]" style={{ color: '#8696a0' }}>· {g.term}</span>}
                            {g.school_name && isAdmin && <span className="text-[10px]" style={{ color: '#8696a0' }}>· {g.school_name}</span>}
                            {g.member_count && <span className="text-[10px]" style={{ color: '#8696a0' }}>· {g.member_count} members</span>}
                          </div>
                        </div>
                        {/* Actions menu */}
                        <div className="flex items-center gap-1 shrink-0">
                          <button onClick={() => { setShowHistory(true); loadHistory(g.id); }}
                            className="p-2 rounded-full hover:bg-white/10 transition-colors" title="History">
                            <History className="w-4 h-4" style={{ color: '#8696a0' }} />
                          </button>
                          <button onClick={() => openEdit(g)}
                            className="p-2 rounded-full hover:bg-white/10 transition-colors" title="Edit">
                            <Pencil className="w-4 h-4" style={{ color: '#8696a0' }} />
                          </button>
                          {g.status === 'active' && (
                            <button onClick={() => setStatus(g, 'inactive')}
                              className="p-2 rounded-full hover:bg-white/10 transition-colors" title="Mark inactive">
                              <Archive className="w-4 h-4" style={{ color: '#fbbf24' }} />
                            </button>
                          )}
                          {g.status !== 'active' && (
                            <button onClick={() => setStatus(g, 'active')}
                              className="p-2 rounded-full hover:bg-white/10 transition-colors" title="Restore">
                              <RotateCcw className="w-4 h-4" style={{ color: '#00a884' }} />
                            </button>
                          )}
                          {confirmDeleteId === g.id ? (
                            <div className="flex items-center gap-1">
                              <span className="text-[10px] font-black" style={{ color: '#f87171' }}>Delete?</span>
                              <button onClick={() => deleteGroup(g.id, g.name)} className="px-2 py-0.5 rounded-lg text-[10px] font-black" style={{ background: 'rgba(239,68,68,0.2)', color: '#f87171' }}>Yes</button>
                              <button onClick={() => setConfirmDeleteId(null)} className="px-2 py-0.5 rounded-lg text-[10px] font-black" style={{ background: 'rgba(255,255,255,0.06)', color: '#8696a0' }}>No</button>
                            </div>
                          ) : (
                            <button onClick={() => deleteGroup(g.id, g.name)} disabled={!!deletingId}
                              className="p-2 rounded-full hover:bg-rose-500/10 transition-colors" title="Delete">
                              {deletingId === g.id ? <Loader2 className="w-4 h-4 animate-spin text-rose-400" /> : <Trash2 className="w-4 h-4 text-rose-400" />}
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Group meta info strip */}
                      {g.description && (
                        <div className="px-5 py-3 text-[13px] leading-relaxed" style={{ background: `${tc.color}08`, borderBottom: '1px solid rgba(255,255,255,0.05)', color: '#8696a0' }}>
                          {g.description}
                        </div>
                      )}

                      {/* Info cards row */}
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-px shrink-0" style={{ background: 'rgba(255,255,255,0.05)', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
                        {[
                          { label: 'Type',     value: tc.label,                                   color: tc.color },
                          { label: 'Class',    value: g.class_name || '—',                         color: '#e9edef' },
                          { label: 'Term',     value: g.term || '—',                               color: '#e9edef' },
                          { label: 'Members',  value: g.member_count ? `~${g.member_count}` : '—', color: '#e9edef' },
                        ].map(card => (
                          <div key={card.label} className="px-4 py-3" style={{ background: '#0b141a' }}>
                            <p className="text-[9px] font-black uppercase tracking-widest mb-1" style={{ color: '#8696a0' }}>{card.label}</p>
                            <p className="text-[13px] font-bold" style={{ color: card.color }}>{card.value}</p>
                          </div>
                        ))}
                      </div>

                      {/* Composer area */}
                      <div className="flex-1 flex flex-col overflow-hidden">
                        {/* Composer header */}
                        <div className="px-5 py-3 flex items-center justify-between shrink-0"
                          style={{ background: '#1f2c34', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                          <span className="text-[11px] font-black uppercase tracking-widest" style={{ color: '#8696a0' }}>Compose Announcement</span>
                          <button onClick={() => setShowTemplates(v => !v)}
                            className="flex items-center gap-1.5 text-[11px] font-black px-3 py-1.5 rounded-lg transition-colors"
                            style={{ background: showTemplates ? 'rgba(0,168,132,0.15)' : 'rgba(255,255,255,0.05)', color: showTemplates ? '#00a884' : '#8696a0' }}>
                            <BookOpen className="w-3.5 h-3.5" /> Templates
                          </button>
                        </div>

                        <div className="flex-1 flex overflow-hidden">
                          {/* Textarea */}
                          <div className="flex-1 flex flex-col p-4 gap-3">
                            <textarea
                              value={message} onChange={e => { if (e.target.value.length <= 4096) setMessage(e.target.value); }} rows={6}
                              placeholder={`Type your ${tc.label.toLowerCase()} announcement here…`}
                              maxLength={4096}
                              className="flex-1 w-full text-white text-[14px] rounded-xl px-4 py-3 outline-none resize-none leading-relaxed"
                              style={{ background: '#1f2c34', caretColor: '#00a884', minHeight: '120px' }}
                            />
                            <div className="flex items-center justify-between gap-3">
                              <span className="text-[11px]" style={{ color: message.length > 4000 ? '#f87171' : message.length > 3000 ? '#fbbf24' : '#8696a0' }}>
                                {message.length > 3000 ? `${4096 - message.length} chars left` : `${message.length} chars`}
                              </span>
                              <div className="flex gap-2 flex-wrap justify-end">
                                {/* Save template */}
                                <input value={tplTitle} onChange={e => setTplTitle(e.target.value)}
                                  placeholder="Save as template…"
                                  className="text-[11px] text-white rounded-lg px-3 py-1.5 outline-none w-36"
                                  style={{ background: '#2a3942', caretColor: '#00a884' }}
                                  onKeyDown={e => e.key === 'Enter' && saveTemplate()} />
                                <button onClick={saveTemplate} disabled={!message.trim()}
                                  className="text-[11px] font-black px-3 py-1.5 rounded-lg disabled:opacity-40 transition-all"
                                  style={{ background: 'rgba(0,168,132,0.15)', color: '#00a884', border: '1px solid rgba(0,168,132,0.3)' }}>
                                  Save
                                </button>
                                <button onClick={() => sendToGroup(g)} disabled={!message.trim() || message.length > 4096}
                                  className="flex items-center gap-2 px-5 py-2 rounded-xl text-white text-[13px] font-black transition-all active:scale-95 disabled:opacity-40"
                                  style={{ background: '#00a884' }}>
                                  <Send className="w-4 h-4" /> Open Group
                                </button>
                              </div>
                            </div>
                            <p className="text-[11px]" style={{ color: '#8696a0' }}>
                              Message is copied to clipboard → WhatsApp group opens → paste and send.
                            </p>
                          </div>

                          {/* Templates sidebar */}
                          {showTemplates && (
                            <div className="w-64 shrink-0 flex flex-col overflow-hidden" style={{ background: '#111b21', borderLeft: '1px solid rgba(255,255,255,0.06)' }}>
                              <div className="px-4 py-3 font-black text-white text-[12px]" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                                Saved Templates
                              </div>
                              <div className="flex-1 overflow-y-auto">
                                {templates.length === 0 ? (
                                  <div className="p-6 text-center text-[11px]" style={{ color: '#8696a0' }}>No templates saved yet.</div>
                                ) : (
                                  templates.map(tpl => (
                                    <div key={tpl.id} className="px-4 py-3 hover:bg-white/[0.03] transition-colors" style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                                      <div className="flex items-start justify-between gap-2 mb-1">
                                        <p className="font-bold text-white text-[12px] leading-tight">{tpl.title}</p>
                                        <button onClick={() => deleteTemplate(tpl.id)}>
                                          <X className="w-3 h-3 shrink-0" style={{ color: '#8696a0' }} />
                                        </button>
                                      </div>
                                      <p className="text-[11px] mb-2 line-clamp-2 leading-relaxed" style={{ color: '#8696a0' }}>{tpl.body}</p>
                                      <button onClick={() => { setMessage(tpl.body); showToast(`Loaded: "${tpl.title}"`); }}
                                        className="text-[11px] font-black px-3 py-1 rounded-lg transition-all"
                                        style={{ background: '#00a884', color: '#fff' }}>
                                        Use
                                      </button>
                                    </div>
                                  ))
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    </>
                  );
                })()}
              </div>
            ) : (
              /* Empty state when no group selected (desktop) */
              <div className="hidden md:flex flex-1 items-center justify-center text-center p-8">
                <div>
                  <div className="w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-5" style={{ background: '#1f2c34' }}>
                    <svg width="32" height="32" viewBox="0 0 24 24" fill="#2a3942">
                      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/>
                      <path d="M12 0C5.374 0 0 5.373 0 12c0 2.117.554 4.103 1.522 5.827L.057 23.882a.5.5 0 00.613.613l6.056-1.465A11.945 11.945 0 0012 24c6.626 0 12-5.373 12-12S18.626 0 12 0zm0 21.818a9.808 9.808 0 01-5.029-1.388l-.36-.215-3.733.903.921-3.626-.235-.372A9.8 9.8 0 012.182 12C2.182 6.57 6.57 2.182 12 2.182S21.818 6.57 21.818 12 17.43 21.818 12 21.818z"/>
                    </svg>
                  </div>
                  <p className="font-black text-white text-[15px] mb-2">Select a group</p>
                  <p className="text-[13px]" style={{ color: '#8696a0' }}>Pick a group from the left to compose an announcement or manage it.</p>
                </div>
              </div>
            )}
          </div>
        </main>
      </div>

      {/* ── FORM MODAL (Add / Edit) ──────────────────────────────────────── */}
      {showForm && (
        <div className="fixed inset-0 z-[60] flex items-end md:items-center justify-center" style={{ background: 'rgba(0,0,0,0.75)' }}
          onClick={resetForm}>
          <div className="w-full max-w-lg flex flex-col overflow-hidden shadow-2xl md:rounded-2xl rounded-t-3xl pb-[64px] md:pb-0"
            style={{ background: '#1f2c34', maxHeight: '92vh' }} onClick={e => e.stopPropagation()}>
            {/* Header */}
            <div className="flex items-center gap-3 px-5 py-4 shrink-0" style={{ background: '#2a3942' }}>
              <button onClick={resetForm} className="p-1.5 rounded-full hover:bg-white/10 transition-colors">
                <X className="w-5 h-5" style={{ color: '#8696a0' }} />
              </button>
              <div>
                <h2 className="font-black text-white text-[16px]">{editGroup ? 'Edit Group' : 'New WhatsApp Group'}</h2>
                <p className="text-[11px]" style={{ color: '#8696a0' }}>{editGroup ? 'Update group details' : 'Add a group invite link'}</p>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              {/* Name */}
              <div>
                <label className="block text-[10px] font-black uppercase tracking-widest mb-1.5" style={{ color: '#8696a0' }}>
                  Group Name <span style={{ color: '#f87171' }}>*</span>
                </label>
                <input value={form.name ?? ''} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="e.g. JSS1A Parents — Term 2"
                  className="w-full text-white text-[14px] rounded-xl px-4 py-3 outline-none"
                  style={{ background: '#2a3942', caretColor: '#00a884' }} />
              </div>

              {/* Link */}
              <div>
                <label className="block text-[10px] font-black uppercase tracking-widest mb-1.5" style={{ color: '#8696a0' }}>
                  WhatsApp Invite Link <span style={{ color: '#f87171' }}>*</span>
                </label>
                <input value={form.link ?? ''} onChange={e => setForm(f => ({ ...f, link: e.target.value }))}
                  placeholder="https://chat.whatsapp.com/..."
                  className="w-full text-white text-[14px] rounded-xl px-4 py-3 outline-none"
                  style={{ background: '#2a3942', caretColor: '#00a884' }} />
                <p className="text-[10px] mt-1.5 ml-1" style={{ color: '#8696a0' }}>
                  WhatsApp → Group → Group Info → Invite via link → Copy
                </p>
              </div>

              {/* Description */}
              <div>
                <label className="block text-[10px] font-black uppercase tracking-widest mb-1.5" style={{ color: '#8696a0' }}>
                  Purpose / Description
                </label>
                <textarea value={form.description ?? ''} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                  placeholder="What is this group for? Who should receive messages here?"
                  rows={2} className="w-full text-white text-[13px] rounded-xl px-4 py-3 outline-none resize-none"
                  style={{ background: '#2a3942', caretColor: '#00a884' }} />
              </div>

              {/* Type */}
              <div>
                <label className="block text-[10px] font-black uppercase tracking-widest mb-2" style={{ color: '#8696a0' }}>Group Type</label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {GROUP_TYPES.map(t => (
                    <button key={t.value} type="button" onClick={() => setForm(f => ({ ...f, group_type: t.value }))}
                      className="px-2 py-2 rounded-xl text-[11px] font-black uppercase tracking-wider transition-all text-center"
                      style={{
                        background: form.group_type === t.value ? `${t.color}25` : 'rgba(255,255,255,0.05)',
                        color:      form.group_type === t.value ? t.color : '#8696a0',
                        border:     `1px solid ${form.group_type === t.value ? `${t.color}50` : 'transparent'}`,
                      }}>
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Class + Term + Members (3-col) */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-[10px] font-black uppercase tracking-widest mb-1.5" style={{ color: '#8696a0' }}>Class / Year</label>
                  <input value={form.class_name ?? ''} onChange={e => setForm(f => ({ ...f, class_name: e.target.value }))}
                    placeholder="e.g. JSS1A"
                    className="w-full text-white text-[13px] rounded-xl px-3 py-2.5 outline-none"
                    style={{ background: '#2a3942', caretColor: '#00a884' }} />
                </div>
                <div>
                  <label className="block text-[10px] font-black uppercase tracking-widest mb-1.5" style={{ color: '#8696a0' }}>Term</label>
                  <select value={form.term ?? ''} onChange={e => setForm(f => ({ ...f, term: e.target.value }))}
                    className="w-full text-white text-[13px] rounded-xl px-3 py-2.5 outline-none appearance-none"
                    style={{ background: '#2a3942' }}>
                    <option value="">Select…</option>
                    {TERMS.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-black uppercase tracking-widest mb-1.5" style={{ color: '#8696a0' }}>Approx. Members</label>
                  <input value={form.member_count ?? ''} onChange={e => setForm(f => ({ ...f, member_count: parseInt(e.target.value) || undefined }))}
                    type="number" min="1" placeholder="e.g. 45"
                    className="w-full text-white text-[13px] rounded-xl px-3 py-2.5 outline-none"
                    style={{ background: '#2a3942', caretColor: '#00a884' }} />
                </div>
              </div>

              {/* School selector (admin only) */}
              {isAdmin && schools.length > 0 && (
                <div>
                  <label className="block text-[10px] font-black uppercase tracking-widest mb-1.5" style={{ color: '#8696a0' }}>School</label>
                  <select value={form.school_id ?? ''} onChange={e => setForm(f => ({ ...f, school_id: e.target.value }))}
                    className="w-full text-white text-[13px] rounded-xl px-3 py-2.5 outline-none appearance-none"
                    style={{ background: '#2a3942' }}>
                    <option value="">Platform-wide (no school)</option>
                    {schools.map(sc => <option key={sc.id} value={sc.id}>{sc.name}</option>)}
                  </select>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="px-5 py-4 flex gap-3 shrink-0" style={{ borderTop: '1px solid rgba(255,255,255,0.07)' }}>
              <button onClick={resetForm}
                className="px-5 py-3 rounded-xl text-[13px] font-black"
                style={{ background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.5)' }}>
                Cancel
              </button>
              <button onClick={saveGroup} disabled={saving || !form.name?.trim() || !form.link?.trim()}
                className="flex-1 py-3 rounded-xl text-white text-[13px] font-black flex items-center justify-center gap-2 disabled:opacity-40 transition-all active:scale-95"
                style={{ background: '#00a884' }}>
                {saving ? <><Loader2 className="w-4 h-4 animate-spin" /> Saving…</> : editGroup ? 'Update Group' : 'Save Group'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── CONTENT PUSHER MODAL ─────────────────────────────────────────── */}
      {showPusher && (
        <div className="fixed inset-0 z-[60] flex items-end md:items-center justify-center" style={{ background: 'rgba(0,0,0,0.8)' }}
          onClick={() => setShowPusher(false)}>
          <div className="w-full max-w-2xl flex flex-col overflow-hidden shadow-2xl md:rounded-2xl rounded-t-3xl pb-[64px] md:pb-0"
            style={{ background: '#1f2c34', maxHeight: '92vh' }} onClick={e => e.stopPropagation()}>

            {/* Header */}
            <div className="flex items-center gap-3 px-5 py-4 shrink-0" style={{ background: '#2a3942', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
              <button onClick={() => setShowPusher(false)} className="p-1.5 rounded-full hover:bg-white/10 transition-colors">
                <X className="w-5 h-5" style={{ color: '#8696a0' }} />
              </button>
              <div className="flex-1 min-w-0">
                <h2 className="font-black text-white text-[16px] flex items-center gap-2">
                  <Zap className="w-5 h-5" style={{ color: '#7c3aed' }} /> Push Content to Groups
                </h2>
                <p className="text-[11px]" style={{ color: '#8696a0' }}>Select content, craft your message, choose target groups</p>
              </div>
            </div>

            {/* Tab row */}
            <div className="flex gap-1 px-5 py-3 shrink-0" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
              {([
                { id: 'assignment', label: 'Assignment', icon: <FileText className="w-3.5 h-3.5" /> },
                { id: 'newsletter', label: 'Newsletter', icon: <Megaphone className="w-3.5 h-3.5" /> },
                { id: 'custom',     label: 'Custom',     icon: <BookMarked className="w-3.5 h-3.5" /> },
              ] as const).map(tab => (
                <button key={tab.id} onClick={() => { setPusherTab(tab.id); setPusherMsg(''); setSelAssignment(null); setPusherTplCategory('All'); }}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-[12px] font-black uppercase tracking-widest transition-all"
                  style={{
                    background: pusherTab === tab.id ? (tab.id === 'assignment' ? 'rgba(0,168,132,0.2)' : tab.id === 'newsletter' ? 'rgba(124,58,237,0.2)' : 'rgba(2,132,199,0.2)') : 'rgba(255,255,255,0.05)',
                    color: pusherTab === tab.id ? (tab.id === 'assignment' ? '#00a884' : tab.id === 'newsletter' ? '#a78bfa' : '#38bdf8') : '#8696a0',
                  }}>
                  {tab.icon} {tab.label}
                </button>
              ))}
            </div>

            <div className="flex flex-1 min-h-0 overflow-hidden">
              {/* Left: content picker */}
              <div className="w-[200px] shrink-0 flex flex-col overflow-hidden" style={{ borderRight: '1px solid rgba(255,255,255,0.06)' }}>
                <div className="px-3 py-2.5 text-[9px] font-black uppercase tracking-widest" style={{ color: '#8696a0', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                  {pusherTab === 'assignment' ? 'Assignments' : pusherTab === 'newsletter' ? 'Templates' : 'Saved Templates'}
                </div>
                <div className="flex-1 overflow-y-auto">
                  {pusherTab === 'assignment' && (
                    assignLoading ? (
                      <div className="p-6 flex justify-center"><Loader2 className="w-5 h-5 animate-spin" style={{ color: '#00a884' }} /></div>
                    ) : assignments.length === 0 ? (
                      <div className="p-5 text-center text-[11px]" style={{ color: '#8696a0' }}>No active assignments found.</div>
                    ) : assignments.map(a => {
                      const cls = a.metadata?.target_class_name;
                      return (
                        <button key={a.id} onClick={() => {
                          setSelAssignment(a);
                          setPusherMsg(formatAssignment(a));
                          // Auto-select groups matching this assignment's class
                          if (cls) {
                            const matching = groups
                              .filter(g => g.status === 'active' && g.class_name && g.class_name.toLowerCase().trim() === cls.toLowerCase().trim())
                              .map(g => g.id);
                            if (matching.length > 0) {
                              setPusherGroups(new Set(matching));
                              showToast(`Auto-selected ${matching.length} group${matching.length !== 1 ? 's' : ''} for ${cls}`);
                            }
                          }
                        }}
                          className="w-full text-left px-3 py-3 transition-colors"
                          style={{ background: selAssignment?.id === a.id ? 'rgba(0,168,132,0.1)' : 'transparent', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                          <p className="font-bold text-white text-[12px] leading-tight line-clamp-2">{a.title}</p>
                          {cls && (
                            <span className="inline-block text-[9px] font-black px-1.5 py-0.5 rounded-full mt-1" style={{ background: 'rgba(0,168,132,0.15)', color: '#00a884' }}>
                              {cls}
                            </span>
                          )}
                          {a.due_date && <p className="text-[10px] mt-1 flex items-center gap-1" style={{ color: '#8696a0' }}>
                            <CalendarDays className="w-3 h-3" /> {new Date(a.due_date).toLocaleDateString('en-NG', { day: 'numeric', month: 'short' })}
                          </p>}
                          {a.courses?.title && <p className="text-[10px] truncate" style={{ color: '#8696a0' }}>{a.courses.title}</p>}
                        </button>
                      );
                    })
                  )}
                  {pusherTab === 'newsletter' && (() => {
                    const cats = ['All', 'Academic', 'Finance', 'Events', 'Admin', 'Emergency'];
                    const catColors: Record<string, string> = {
                      Academic: '#00a884', Finance: '#f59e0b', Events: '#7c3aed',
                      Admin: '#0284c7', Emergency: '#ef4444',
                    };
                    const filtered = pusherTplCategory === 'All'
                      ? NEWSLETTER_TPLS
                      : NEWSLETTER_TPLS.filter(t => t.category === pusherTplCategory);
                    return (
                      <>
                        {/* Category filter pills */}
                        <div className="px-2 py-2 flex flex-wrap gap-1" style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                          {cats.map(cat => (
                            <button key={cat} onClick={() => setPusherTplCategory(cat)}
                              className="text-[9px] font-black px-2 py-0.5 rounded-full transition-all"
                              style={{
                                background: pusherTplCategory === cat ? (catColors[cat] ?? '#a78bfa') + '30' : 'rgba(255,255,255,0.06)',
                                color:      pusherTplCategory === cat ? (catColors[cat] ?? '#a78bfa') : '#8696a0',
                                border:     `1px solid ${pusherTplCategory === cat ? (catColors[cat] ?? '#a78bfa') + '50' : 'transparent'}`,
                              }}>
                              {cat}
                            </button>
                          ))}
                        </div>
                        {/* Template list */}
                        {filtered.map(t => {
                          const col = catColors[t.category] ?? '#a78bfa';
                          return (
                            <button key={t.id} onClick={() => setPusherMsg(t.body)}
                              className="w-full text-left px-3 py-3 transition-colors"
                              style={{ background: pusherMsg === t.body ? col + '18' : 'transparent', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                              <span className="text-[15px]">{t.icon}</span>
                              <p className="font-bold text-white text-[12px] leading-tight mt-0.5 line-clamp-2">{t.title}</p>
                              <span className="inline-block text-[8px] font-black px-1.5 py-0.5 rounded-full mt-1"
                                style={{ background: col + '20', color: col }}>
                                {t.category}
                              </span>
                            </button>
                          );
                        })}
                        {filtered.length === 0 && (
                          <div className="p-5 text-center text-[11px]" style={{ color: '#8696a0' }}>No templates in this category.</div>
                        )}
                      </>
                    );
                  })()}
                  {pusherTab === 'custom' && templates.map(tpl => (
                    <button key={tpl.id} onClick={() => setPusherMsg(tpl.body)}
                      className="w-full text-left px-3 py-3 transition-colors"
                      style={{ background: pusherMsg === tpl.body ? 'rgba(2,132,199,0.1)' : 'transparent', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                      <p className="font-bold text-white text-[12px] leading-tight">{tpl.title}</p>
                      <p className="text-[10px] mt-0.5 line-clamp-1" style={{ color: '#8696a0' }}>{tpl.category}</p>
                    </button>
                  ))}
                  {pusherTab === 'custom' && templates.length === 0 && (
                    <div className="p-5 text-center text-[11px]" style={{ color: '#8696a0' }}>No saved templates yet. Write and save from the group composer.</div>
                  )}
                </div>
              </div>

              {/* Right: message + groups */}
              <div className="flex-1 flex flex-col overflow-hidden min-w-0">
                {/* Message editor */}
                <div className="p-4 flex flex-col gap-2" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                  <div className="flex items-center justify-between">
                    <span className="text-[9px] font-black uppercase tracking-widest" style={{ color: '#8696a0' }}>Message Preview / Edit</span>
                    <span className="text-[10px]" style={{ color: pusherMsg.length > 4000 ? '#f87171' : pusherMsg.length > 3000 ? '#fbbf24' : '#8696a0' }}>
                      {pusherMsg.length > 3000 ? `${4096 - pusherMsg.length} left` : `${pusherMsg.length} chars`}
                    </span>
                  </div>
                  <textarea value={pusherMsg} onChange={e => { if (e.target.value.length <= 4096) setPusherMsg(e.target.value); }} rows={7}
                    placeholder="Pick content from the left, or type a custom message…"
                    maxLength={4096}
                    className="w-full text-white text-[13px] rounded-xl px-4 py-3 outline-none resize-none leading-relaxed"
                    style={{ background: '#0b141a', caretColor: '#00a884' }} />
                </div>

                {/* Group picker */}
                <div className="flex-1 overflow-y-auto">
                  <div className="flex items-center justify-between px-4 py-2.5" style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                    <span className="text-[9px] font-black uppercase tracking-widest" style={{ color: '#8696a0' }}>
                      Target Groups ({pusherGroups.size} selected)
                    </span>
                    <button onClick={() => setPusherGroups(
                      pusherGroups.size === groups.filter(g => g.status === 'active').length
                        ? new Set()
                        : new Set(groups.filter(g => g.status === 'active').map(g => g.id))
                    )} className="text-[10px] font-black transition-colors" style={{ color: '#00a884' }}>
                      {pusherGroups.size === groups.filter(g => g.status === 'active').length ? 'Deselect All' : 'Select All Active'}
                    </button>
                  </div>
                  {groups.filter(g => g.status === 'active').map(g => {
                    const tc = typeConfig(g.group_type);
                    const on = pusherGroups.has(g.id);
                    return (
                      <button key={g.id} onClick={() => setPusherGroups(prev => {
                        const s = new Set(prev); if (s.has(g.id)) s.delete(g.id); else s.add(g.id); return s;
                      })} className="w-full flex items-center gap-3 px-4 py-3 transition-colors text-left"
                        style={{ background: on ? 'rgba(0,168,132,0.07)' : 'transparent', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                        <div className="w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0"
                          style={{ borderColor: on ? '#00a884' : 'rgba(255,255,255,0.2)', background: on ? '#00a884' : 'transparent' }}>
                          {on && <Check className="w-2.5 h-2.5 text-white" />}
                        </div>
                        <div className="w-8 h-8 rounded-full flex items-center justify-center font-black text-[11px] shrink-0"
                          style={{ background: `${tc.color}20`, color: tc.color }}>
                          {initials(g.name)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-bold text-white text-[13px] truncate">{g.name}</p>
                          <div className="flex items-center gap-1.5">
                            <span className="text-[10px] font-black px-1.5 py-0.5 rounded-full" style={{ background: `${tc.color}18`, color: tc.color }}>{tc.label}</span>
                            {g.class_name && <span className="text-[10px]" style={{ color: '#8696a0' }}>{g.class_name}</span>}
                            {isAdmin && g.school_name && <span className="text-[10px] truncate" style={{ color: '#8696a0' }}>· {g.school_name}</span>}
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Footer action bar */}
            <div className="px-5 py-4 flex items-center justify-between gap-3 shrink-0" style={{ borderTop: '1px solid rgba(255,255,255,0.07)', background: '#2a3942' }}>
              <div className="text-[12px]" style={{ color: '#8696a0' }}>
                {pusherGroups.size > 0
                  ? `Will open ${pusherGroups.size} group${pusherGroups.size !== 1 ? 's' : ''} sequentially`
                  : 'Pick groups on the right'}
              </div>
              <div className="flex gap-2">
                <button onClick={() => setShowPusher(false)} className="px-4 py-2.5 rounded-xl text-[13px] font-black"
                  style={{ background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.5)' }}>Cancel</button>
                <button onClick={pushContent} disabled={pusherSending || !pusherMsg.trim() || pusherGroups.size === 0 || pusherMsg.length > 4096}
                  className="flex items-center gap-2 px-6 py-2.5 rounded-xl text-white text-[13px] font-black disabled:opacity-40 transition-all active:scale-95"
                  style={{ background: '#7c3aed' }}>
                  {pusherSending
                    ? <><Loader2 className="w-4 h-4 animate-spin" /> Pushing…</>
                    : <><Zap className="w-4 h-4" /> Push to {pusherGroups.size || '?'} Group{pusherGroups.size !== 1 ? 's' : ''}</>}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── HISTORY PANEL ────────────────────────────────────────────────── */}
      {showHistory && (
        <div className="fixed inset-0 z-[60] flex items-end md:items-center justify-center" style={{ background: 'rgba(0,0,0,0.75)' }}
          onClick={() => setShowHistory(false)}>
          <div className="w-full max-w-lg flex flex-col overflow-hidden shadow-2xl md:rounded-2xl rounded-t-3xl pb-[64px] md:pb-0"
            style={{ background: '#1f2c34', maxHeight: '85vh' }} onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-3 px-5 py-4 shrink-0" style={{ background: '#2a3942' }}>
              <button onClick={() => setShowHistory(false)} className="p-1.5 rounded-full hover:bg-white/10 transition-colors">
                <X className="w-5 h-5" style={{ color: '#8696a0' }} />
              </button>
              <div className="flex-1 min-w-0">
                <h2 className="font-black text-white text-[16px]">Broadcast History</h2>
                <p className="text-[11px]" style={{ color: '#8696a0' }}>
                  {activeGroup ? `"${activeGroup.name}"` : 'All groups'}
                  {broadcasts.length > 0 && ` · ${broadcasts.length} entr${broadcasts.length === 1 ? 'y' : 'ies'}`}
                </p>
              </div>
              {histGroupId && broadcasts.length > 0 && (
                confirmClearHist ? (
                  <div className="flex items-center gap-1.5 shrink-0">
                    <span className="text-[10px] font-black" style={{ color: '#f87171' }}>Clear all?</span>
                    <button onClick={() => clearHistory(histGroupId)} disabled={clearingHist}
                      className="px-2 py-1 rounded-lg text-[10px] font-black"
                      style={{ background: 'rgba(239,68,68,0.2)', color: '#f87171' }}>
                      {clearingHist ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Yes'}
                    </button>
                    <button onClick={() => setConfirmClearHist(false)} className="px-2 py-1 rounded-lg text-[10px] font-black" style={{ background: 'rgba(255,255,255,0.06)', color: '#8696a0' }}>No</button>
                  </div>
                ) : (
                  <button
                    onClick={() => clearHistory(histGroupId)}
                    disabled={clearingHist}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-black transition-colors shrink-0"
                    style={{ background: 'rgba(239,68,68,0.12)', color: '#f87171' }}
                    title="Delete all history for this group">
                    {clearingHist
                      ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      : <Trash2 className="w-3.5 h-3.5" />}
                    Clear All
                  </button>
                )
              )}
            </div>
            <div className="flex-1 overflow-y-auto">
              {histLoading ? (
                <div className="p-12 flex justify-center"><Loader2 className="w-6 h-6 animate-spin" style={{ color: '#00a884' }} /></div>
              ) : broadcasts.length === 0 ? (
                <div className="p-12 text-center text-[13px]" style={{ color: '#8696a0' }}>No broadcast history yet.</div>
              ) : broadcasts.map((b) => (
                <div key={b.id} className="px-5 py-4 group/row" style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <div className="flex items-center gap-2 flex-wrap min-w-0">
                      {b.group_name && (
                        <span className="text-[11px] font-black px-2 py-0.5 rounded-full shrink-0" style={{ background: 'rgba(0,168,132,0.15)', color: '#00a884' }}>
                          {b.group_name}
                        </span>
                      )}
                      {b.school_name && isAdmin && (
                        <span className="text-[10px] truncate" style={{ color: '#8696a0' }}>{b.school_name}</span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-[10px]" style={{ color: '#8696a0' }}>{relTime(b.sent_at)}</span>
                      <button
                        onClick={() => deleteBroadcast(b.id)}
                        disabled={deletingBcast === b.id}
                        className="p-1 rounded-full hover:bg-rose-500/20 transition-colors opacity-0 group-hover/row:opacity-100 focus:opacity-100"
                        title="Delete this entry">
                        {deletingBcast === b.id
                          ? <Loader2 className="w-3.5 h-3.5 animate-spin text-rose-400" />
                          : <Trash2 className="w-3.5 h-3.5 text-rose-400" />}
                      </button>
                    </div>
                  </div>
                  <p className="text-[13px] leading-relaxed whitespace-pre-wrap" style={{ color: '#d1d7db' }}>{b.message}</p>
                  {b.sent_by_name && (
                    <p className="text-[10px] mt-2" style={{ color: '#8696a0' }}>Sent by {b.sent_by_name}</p>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
