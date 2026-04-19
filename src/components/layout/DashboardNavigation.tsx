// @refresh reset
'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/auth-context';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname, useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import {
  HomeIcon, UserGroupIcon, AcademicCapIcon, BookOpenIcon,
  ChartBarIcon, CogIcon, BuildingOfficeIcon, ClipboardDocumentListIcon,
  PresentationChartLineIcon, ClipboardDocumentCheckIcon, DocumentTextIcon,
  DocumentChartBarIcon, UserIcon, BellIcon, EnvelopeIcon,
  ArrowRightOnRectangleIcon, Bars3Icon, XMarkIcon, SignalIcon,
  TrophyIcon, ShieldCheckIcon, CodeBracketIcon, RocketLaunchIcon,
  CalendarDaysIcon, BanknotesIcon, VideoCameraIcon, UserPlusIcon,
  TrashIcon, SunIcon, MoonIcon, FireIcon, ArchiveBoxIcon, CommandLineIcon,
  CreditCardIcon, ChatBubbleLeftEllipsisIcon, ChatBubbleLeftRightIcon,
  SparklesIcon, BoltIcon,
} from '@/lib/icons';
import ThemeToggle from '@/components/ThemeToggle';

// ── Types ────────────────────────────────────────────────────────────────────
type NavItem = { name: string; href: string; icon: any };
type NavDivider = { divider: true; label: string };
type NavEntry = NavItem | NavDivider;

function isDivider(e: NavEntry): e is NavDivider {
  return 'divider' in e;
}

export default function DashboardNavigation() {
  const { profile, signOut } = useAuth();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const isMinimal = searchParams.get('minimal') === 'true';
  const [mobileOpen, setMobileOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [notifUnread, setNotifUnread] = useState(0);

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (isMinimal) return;
    if (mobileOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [mobileOpen, isMinimal]);

  useEffect(() => {
    if (isMinimal || !profile) return;
    const db = createClient();

    Promise.all([
      db.from('messages').select('id', { count: 'exact', head: true })
        .eq('recipient_id', profile.id).eq('is_read', false),
      (db.from('newsletter_delivery' as any)).select('id', { count: 'exact', head: true })
        .eq('user_id', profile.id).eq('is_viewed', false),
      db.from('notifications').select('id', { count: 'exact', head: true })
        .eq('user_id', profile.id).eq('is_read', false),
    ]).then(([msgRes, nwlRes, notifRes]) => {
      const nc = notifRes.count ?? 0;
      const total = (msgRes.count ?? 0) + (nwlRes.count ?? 0) + nc;
      setUnreadCount(total);
      setNotifUnread(nc);
    });
  }, [profile?.id, isMinimal]); // eslint-disable-line

  if (isMinimal) return null;

  if (!profile) return (
    <div className="fixed top-0 left-0 right-0 z-50 bg-[#121212] border-b border-white/5 h-14 flex items-center justify-between px-4 sm:px-6">
      <span className="text-white/30 text-[10px] font-black uppercase tracking-widest">Rillcod Technologies</span>
      <div className="flex items-center gap-3">
        <a href="/login"
          className="text-xs font-bold text-violet-400 hover:text-violet-300 transition-colors underline underline-offset-2">
          Sign In
        </a>
        <button
          onClick={signOut}
          className="flex items-center gap-1.5 px-4 py-2 bg-rose-500/10 hover:bg-rose-600 text-rose-500 hover:text-white text-sm font-black rounded-xl border border-rose-500/20 transition-all shadow-lg shadow-rose-500/5 active:scale-95">
          <ArrowRightOnRectangleIcon className="w-4 h-4" /> Sign Out
        </button>
      </div>
    </div>
  );

  // ── Nav entries per role ────────────────────────────────────────────────────
  const getNavEntries = (): NavEntry[] => {
    const base: NavItem[] = [{ name: 'Dashboard', href: '/dashboard', icon: HomeIcon }];

    switch (profile.role) {
      case 'admin':
        return [
          ...base,
          { divider: true, label: 'People' },
          { name: 'Schools', href: '/dashboard/schools', icon: BuildingOfficeIcon },
          { name: 'Teachers', href: '/dashboard/teachers', icon: AcademicCapIcon },
          { name: 'Students', href: '/dashboard/students', icon: UserGroupIcon },
          { name: 'Parents & Feedback', href: '/dashboard/parents', icon: UserPlusIcon },
          { name: 'Users', href: '/dashboard/users', icon: ShieldCheckIcon },
          { name: 'Approvals', href: '/dashboard/approvals', icon: ClipboardDocumentCheckIcon },
          { divider: true, label: 'Academics' },
          { name: 'Course & Syllabus', href: '/dashboard/curriculum', icon: BookOpenIcon },
          { name: 'Generate Content', href: '/dashboard/generate-content', icon: SparklesIcon },
          { name: 'Course Progress', href: '/dashboard/curriculum/progress', icon: ChartBarIcon },
          { name: 'Term Progression', href: '/dashboard/progression', icon: RocketLaunchIcon },
          { name: 'Programs', href: '/dashboard/programs', icon: AcademicCapIcon },
          { name: 'Courses', href: '/dashboard/courses', icon: PresentationChartLineIcon },
          { name: 'Lesson Plans', href: '/dashboard/lesson-plans', icon: ClipboardDocumentListIcon },
          { name: 'Assignments', href: '/dashboard/assignments', icon: ClipboardDocumentListIcon },
          { name: 'Projects', href: '/dashboard/projects', icon: RocketLaunchIcon },
          { name: 'Grades', href: '/dashboard/grades', icon: ClipboardDocumentCheckIcon },
          { name: 'Grading Guide', href: '/dashboard/grades/waec', icon: AcademicCapIcon },
          { name: 'CBT Exams', href: '/dashboard/cbt', icon: AcademicCapIcon },
          { name: 'Timetable', href: '/dashboard/timetable', icon: CalendarDaysIcon },
          { name: 'Grading Queue', href: '/dashboard/grading', icon: ClipboardDocumentCheckIcon },
          { divider: true, label: 'Engagement' },
          { name: 'Class Engagement', href: '/dashboard/engagement', icon: BoltIcon },
          { name: 'Showcase Board', href: '/dashboard/showcase', icon: TrophyIcon },
          { divider: true, label: 'Content' },
          { name: 'Library', href: '/dashboard/library', icon: BookOpenIcon },
          { name: 'Leaderboard', href: '/dashboard/leaderboard', icon: TrophyIcon },
          { name: 'Gamification', href: '/dashboard/gamification', icon: TrophyIcon },
          { name: 'Live Sessions', href: '/dashboard/live-sessions', icon: VideoCameraIcon },
          { name: 'Activity Hub', href: '/dashboard/activity-hub', icon: SparklesIcon },
          { divider: true, label: 'Reports' },
          { name: 'Report Builder', href: '/dashboard/reports/builder', icon: DocumentTextIcon },
          { name: 'Progress Reports', href: '/dashboard/results', icon: DocumentChartBarIcon },
          { name: 'Manage Certificates', href: '/dashboard/certificates/management', icon: TrophyIcon },
          { name: 'Analytics', href: '/dashboard/analytics', icon: ChartBarIcon },
          { name: 'Activity Logs', href: '/dashboard/activity-logs', icon: ClipboardDocumentListIcon },
          { divider: true, label: 'Finance' },
          { name: 'Smart Finance', href: '/dashboard/finance', icon: BanknotesIcon },
          { divider: true, label: 'System' },
          { name: 'Moderation', href: '/dashboard/moderation', icon: ShieldCheckIcon },
          { name: 'School Directory', href: '/dashboard/directory', icon: UserGroupIcon },
          { name: 'Feedback & Support', href: '/dashboard/feedback', icon: ChatBubbleLeftRightIcon },
          { name: 'Consent Forms', href: '/dashboard/consent-forms', icon: ClipboardDocumentCheckIcon },
          { name: 'WhatsApp Inbox', href: '/dashboard/inbox', icon: ChatBubbleLeftRightIcon },
          { name: 'Customer Retention', href: '/dashboard/crm', icon: UserPlusIcon },
          { name: 'Notifications', href: '/dashboard/notifications', icon: BellIcon },
          { name: 'Newsletters', href: '/dashboard/newsletters', icon: DocumentTextIcon },
          { name: 'Profile', href: '/dashboard/profile', icon: UserIcon },
        ];

      case 'teacher':
        return [
          ...base,
          { divider: true, label: 'Teaching' },
          { name: 'Course & Syllabus', href: '/dashboard/curriculum', icon: BookOpenIcon },
          { name: 'Generate Content', href: '/dashboard/generate-content', icon: SparklesIcon },
          { name: 'Course Progress', href: '/dashboard/curriculum/progress', icon: ChartBarIcon },
          { name: 'Term Progression', href: '/dashboard/progression', icon: RocketLaunchIcon },
          { name: 'Lesson Plans', href: '/dashboard/lesson-plans', icon: ClipboardDocumentListIcon },
          { name: 'My Classes', href: '/dashboard/classes', icon: BookOpenIcon },
          { name: 'Assignments', href: '/dashboard/assignments', icon: ClipboardDocumentListIcon },
          { name: 'Projects', href: '/dashboard/projects', icon: RocketLaunchIcon },
          { name: 'CBT Exams', href: '/dashboard/cbt', icon: AcademicCapIcon },
          { name: 'Attendance', href: '/dashboard/attendance', icon: ClipboardDocumentCheckIcon },
          { name: 'Timetable', href: '/dashboard/timetable', icon: CalendarDaysIcon },
          { divider: true, label: 'Students' },
          { name: 'Students', href: '/dashboard/students', icon: UserGroupIcon },
          { name: 'Parents & Feedback', href: '/dashboard/parents', icon: UserPlusIcon },
          { name: 'Grades', href: '/dashboard/grades', icon: ClipboardDocumentCheckIcon },
          { name: 'Grading Guide', href: '/dashboard/grades/waec', icon: AcademicCapIcon },
          { name: 'Gamification', href: '/dashboard/gamification', icon: TrophyIcon },
          { divider: true, label: 'Engagement' },
          { name: 'Class Engagement', href: '/dashboard/engagement', icon: BoltIcon },
          { name: 'Showcase Board', href: '/dashboard/showcase', icon: TrophyIcon },
          { divider: true, label: 'Reports' },
          { name: 'Report Builder', href: '/dashboard/reports/builder', icon: DocumentTextIcon },
          { name: 'Progress Reports', href: '/dashboard/results', icon: DocumentChartBarIcon },
          { name: 'Manage Certificates', href: '/dashboard/certificates/management', icon: TrophyIcon },
          { divider: true, label: 'Content' },
          { name: 'Library', href: '/dashboard/library', icon: BookOpenIcon },
          { name: 'Flashcard Studio', href: '/dashboard/flashcards', icon: AcademicCapIcon },
          { name: 'Study Groups', href: '/dashboard/study-groups', icon: UserGroupIcon },
          { name: 'Grading Queue', href: '/dashboard/grading', icon: ClipboardDocumentCheckIcon },
          { name: 'Smart Finance', href: '/dashboard/finance', icon: BanknotesIcon },
          { name: 'Code Playground', href: '/dashboard/playground', icon: CodeBracketIcon },
          { name: 'Leaderboard', href: '/dashboard/leaderboard', icon: TrophyIcon },
          { name: 'Live Sessions', href: '/dashboard/live-sessions', icon: VideoCameraIcon },
          { divider: true, label: 'More' },
          { name: 'School Directory', href: '/dashboard/directory', icon: UserGroupIcon },
          { name: 'WhatsApp Inbox', href: '/dashboard/inbox', icon: ChatBubbleLeftRightIcon },
          { name: 'Customer Retention', href: '/dashboard/crm', icon: UserPlusIcon },
          { name: 'Notifications', href: '/dashboard/notifications', icon: BellIcon },
          { name: 'Profile', href: '/dashboard/profile', icon: UserIcon },
        ];

      case 'student':
        return [
          ...base,
          { divider: true, label: 'Learn' },
          { name: 'Learning Center', href: '/dashboard/learning', icon: RocketLaunchIcon },
          { name: 'Assignments', href: '/dashboard/assignments', icon: ClipboardDocumentListIcon },
          { name: 'CBT Exams', href: '/dashboard/cbt', icon: AcademicCapIcon },
          { name: 'Projects', href: '/dashboard/projects', icon: RocketLaunchIcon },
          { name: 'Library', href: '/dashboard/library', icon: BookOpenIcon },
          { divider: true, label: 'Activities' },
          { name: 'Study Groups', href: '/dashboard/study-groups', icon: UserGroupIcon },
          { name: 'Code Playground', href: '/dashboard/playground', icon: CodeBracketIcon },
          { name: 'Live Sessions', href: '/dashboard/live-sessions', icon: VideoCameraIcon },
          { name: 'My Portfolio', href: '/dashboard/portfolio', icon: RocketLaunchIcon },
          { name: 'Showcase', href: '/dashboard/showcase', icon: TrophyIcon },
          { name: 'Leaderboard', href: '/dashboard/leaderboard', icon: TrophyIcon },
          { divider: true, label: 'Schedule' },
          { name: 'Timetable', href: '/dashboard/timetable', icon: CalendarDaysIcon },
          { name: 'Attendance', href: '/dashboard/attendance', icon: ClipboardDocumentCheckIcon },
          { divider: true, label: 'My Progress' },
          { name: 'Grades', href: '/dashboard/grades', icon: ClipboardDocumentCheckIcon },
          { name: 'Certificate Vault', href: '/dashboard/certificates', icon: TrophyIcon },
          { name: 'My Report Card', href: '/dashboard/results', icon: DocumentChartBarIcon },
          { name: 'My Access Card', href: '/dashboard/my-card', icon: CreditCardIcon },
          ...(['bootcamp', 'online'].includes((profile as any).enrollment_type ?? '')
            ? [{ name: 'My Payments', href: '/dashboard/my-payments', icon: BanknotesIcon }]
            : []),
          { divider: true, label: 'More' },
          { name: 'Messages', href: '/dashboard/messages', icon: EnvelopeIcon },
          { name: 'Notifications', href: '/dashboard/notifications', icon: BellIcon },
          { name: 'Newsletters', href: '/dashboard/newsletters', icon: DocumentTextIcon },
          { name: 'Profile', href: '/dashboard/profile', icon: UserIcon },
        ];

      case 'school':
        return [
          ...base,
          { divider: true, label: 'My School' },
          { name: 'School Overview', href: '/dashboard/school-overview', icon: ChartBarIcon },
          { name: 'My Students', href: '/dashboard/students', icon: UserGroupIcon },
          { name: 'Card Studio', href: '/dashboard/card-studio', icon: CreditCardIcon },
          { name: 'Classes', href: '/dashboard/classes', icon: AcademicCapIcon },
          { name: 'Attendance', href: '/dashboard/attendance', icon: ClipboardDocumentCheckIcon },
          { name: 'Timetable', href: '/dashboard/timetable', icon: CalendarDaysIcon },
          { name: 'Live Sessions', href: '/dashboard/live-sessions', icon: VideoCameraIcon },
          { divider: true, label: 'Reports' },
          { name: 'Student Reports', href: '/dashboard/results', icon: DocumentChartBarIcon },
          { name: 'Term Progression', href: '/dashboard/progression', icon: RocketLaunchIcon },
          { name: 'Grades', href: '/dashboard/grades', icon: ClipboardDocumentCheckIcon },
          { name: 'Showcase Board', href: '/dashboard/showcase', icon: TrophyIcon },
          { name: 'Performance', href: '/dashboard/progress', icon: PresentationChartLineIcon },
          { divider: true, label: 'Billing' },
          { name: 'My Billing', href: '/dashboard/school-billing', icon: BanknotesIcon },
          { divider: true, label: 'More' },
          { name: 'Course & Syllabus', href: '/dashboard/curriculum', icon: BookOpenIcon },
          { name: 'Course Progress', href: '/dashboard/curriculum/progress', icon: ChartBarIcon },
          { name: 'Grading Guide', href: '/dashboard/grades/waec', icon: AcademicCapIcon },
          { name: 'Consent Forms', href: '/dashboard/consent-forms', icon: ClipboardDocumentCheckIcon },
          { name: 'WhatsApp Inbox', href: '/dashboard/inbox', icon: ChatBubbleLeftRightIcon },
          { name: 'Notifications', href: '/dashboard/notifications', icon: BellIcon },
          { name: 'Profile', href: '/dashboard/profile', icon: UserIcon },
        ];

      case 'parent':
        return [
          ...base,
          { divider: true, label: 'My Children' },
          { name: 'My Children', href: '/dashboard/my-children', icon: UserGroupIcon },
          { divider: true, label: 'Academic Progress' },
          { name: 'Report Cards', href: '/dashboard/parent-results', icon: DocumentChartBarIcon },
          { name: 'Attendance', href: '/dashboard/parent-attendance', icon: ClipboardDocumentCheckIcon },
          { name: 'Grades', href: '/dashboard/parent-grades', icon: ClipboardDocumentListIcon },
          { name: 'Certificates', href: '/dashboard/parent-certificates', icon: TrophyIcon },
          { name: "Children's Access Cards", href: '/dashboard/parent-card', icon: CreditCardIcon },
          { divider: true, label: 'Finance' },
          { name: 'Invoices & Payments', href: '/dashboard/parent-invoices', icon: BanknotesIcon },
          { divider: true, label: 'Community' },
          { name: 'Share Feedback', href: '/dashboard/parent-feedback', icon: ChatBubbleLeftEllipsisIcon },
          { divider: true, label: 'More' },
          { name: 'Consent Forms', href: '/dashboard/consent-forms', icon: ClipboardDocumentCheckIcon },
          { name: 'Messages', href: '/dashboard/messages', icon: EnvelopeIcon },
          { name: 'Notifications', href: '/dashboard/notifications', icon: BellIcon },
          { name: 'Newsletters', href: '/dashboard/newsletters', icon: DocumentTextIcon },
          { name: 'Profile', href: '/dashboard/profile', icon: UserIcon },
        ];

      default:
        return base;
    }
  };

  const navEntries = getNavEntries();

  // Extract plain nav items for bottom tab bar
  const navItems = navEntries.filter((e): e is NavItem => !isDivider(e));
  const BOTTOM_NAV_NAMES = new Set(
    profile?.role === 'student'
      ? ['bootcamp', 'online'].includes((profile as any).enrollment_type ?? '')
        ? ['Dashboard', 'Learning Center', 'My Payments', 'My Report Card', 'Messages']
        : ['Dashboard', 'Learning Center', 'My Report Card', 'Messages']
      : profile?.role === 'school'
        ? ['Dashboard', 'My Students', 'My Billing', 'Student Reports', 'WhatsApp Inbox']
        : profile?.role === 'admin'
          ? ['Dashboard', 'Students', 'Approvals', 'Progress Reports', 'WhatsApp Inbox']
          : profile?.role === 'teacher'
            ? ['Dashboard', 'My Classes', 'Students', 'Progress Reports', 'WhatsApp Inbox']
            : profile?.role === 'parent'
              ? ['Dashboard', 'My Children', 'Report Cards', 'Messages']
              : ['Dashboard']
  );
  const bottomNavItems = navItems.filter(item => BOTTOM_NAV_NAMES.has(item.name)).slice(0, 5);

  const handleLogout = () => signOut();

  return (
    <>
      {/* ── Mobile Top Header ── */}
      <div className="md:hidden fixed top-0 left-0 right-0 z-50 flex items-center justify-between bg-sidebar/95 backdrop-blur-xl px-4 py-2 border-b border-sidebar-foreground/[0.08] shadow-[0_1px_30px_rgba(0,0,0,0.3)]">
        <Link href="/dashboard" className="flex items-center gap-2.5">
          <div className="w-7 h-7 bg-orange-500/10 border border-orange-500/30 flex items-center justify-center">
            <Image src="/images/logo.png" alt="Rillcod" width={16} height={16} className="object-contain" priority />
          </div>
          <span className="font-black uppercase tracking-widest text-[13px] text-sidebar-foreground italic">
            Rillcod <span className="text-orange-500">Technologies</span>
          </span>
        </Link>
        <div className="flex items-center gap-1.5">
          {unreadCount > 0 && (
            <Link href="/dashboard/messages" className="relative p-2">
              <BellIcon className="w-5 h-5 text-sidebar-foreground/40" />
              <span className="absolute top-1 right-1 w-3.5 h-3.5 bg-rose-500 text-white text-[8px] font-black rounded-full flex items-center justify-center">
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            </Link>
          )}
          <ThemeToggle />
          <button
            onClick={() => setMobileOpen(!mobileOpen)}
            aria-label={mobileOpen ? 'Close menu' : 'Open menu'}
            className="p-2 text-sidebar-foreground/50 hover:text-sidebar-foreground hover:bg-sidebar-foreground/[0.06] transition-all"
          >
            {mobileOpen ? <XMarkIcon className="w-6 h-6" /> : <Bars3Icon className="w-6 h-6" />}
          </button>
        </div>
      </div>

      {/* ── Backdrop (mobile only) ── */}
      {mobileOpen && (
        <div
          onClick={() => setMobileOpen(false)}
          className="fixed inset-0 bg-black/70 z-40 md:hidden backdrop-blur-sm"
          aria-hidden="true"
        />
      )}

      {/* ── Sidebar ── */}
      <nav
        className={`
          fixed top-[53px] left-0 bottom-16 z-40 md:bottom-0
          md:static md:top-auto md:bottom-auto md:z-auto
          flex flex-col w-[240px] md:w-64
          bg-sidebar
          border-r border-sidebar-foreground/[0.08]
          shadow-[4px_0_40px_rgba(0,0,0,0.3)]
          transform transition-transform duration-300 ease-in-out
          md:translate-x-0 md:h-screen md:flex-shrink-0
          ${mobileOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
        `}
        aria-label="Dashboard navigation"
      >
        {/* Logo */}
        <div className="hidden md:flex flex-col items-center justify-center py-7 border-b border-sidebar-foreground/[0.08] relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-b from-orange-500/[0.04] to-transparent pointer-events-none" />
          <div className="w-11 h-11 bg-orange-500/10 border border-orange-500/25 flex items-center justify-center shadow-[0_0_24px_rgba(249,115,22,0.15)] mb-3 relative z-10">
            <Image src="/images/logo.png" alt="Rillcod Technologies" width={28} height={28} className="object-contain" priority />
          </div>
          <div className="text-center leading-none relative z-10">
            <h1 className="text-[18px] font-black uppercase tracking-[0.25em] text-sidebar-foreground italic">RILLCOD<span className="text-orange-500">.</span></h1>
            <p className="text-[12px] font-black uppercase tracking-[0.2em] text-orange-500/80 italic mt-0.5">TECHNOLOGIES</p>
          </div>
        </div>

        {/* User badge */}
        <div className="px-4 py-4 flex items-center gap-3 border-b border-sidebar-foreground/[0.08] bg-sidebar-foreground/[0.03]">
          <div className="w-9 h-9 bg-orange-500/10 border border-orange-500/25 flex items-center justify-center flex-shrink-0 shadow-[0_0_14px_rgba(249,115,22,0.12)]">
            <span className="text-orange-400 text-sm font-black uppercase">
              {profile.full_name?.charAt(0) ?? 'U'}
            </span>
          </div>
          <div className="flex flex-col min-w-0">
            <span className="text-[14px] font-black truncate text-sidebar-foreground/90 tracking-wide">{profile.full_name}</span>
            <span className="text-[10px] font-black uppercase tracking-[0.3em] text-orange-400/70 mt-0.5">
              {profile.role === 'school' && profile.school_name ? profile.school_name : profile.role}
            </span>
          </div>
          {unreadCount > 0 && (
            <span className="ml-auto flex-shrink-0 w-5 h-5 bg-rose-500 text-white text-[9px] font-black rounded-none flex items-center justify-center">
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
        </div>

        {/* Links */}
        <div className="flex-1 overflow-y-auto px-2 py-3 space-y-px">
          {navEntries.map((entry, idx) => {
            if (isDivider(entry)) {
              return (
                <div key={`divider-${idx}`} className="pt-5 pb-2 px-3">
                  <p className="text-[11px] font-black uppercase tracking-[0.25em] text-sidebar-foreground/35 mb-2">{entry.label}</p>
                  <div className="h-px bg-gradient-to-r from-sidebar-foreground/[0.1] to-transparent" />
                </div>
              );
            }

            const { name, href, icon: Icon } = entry;
            const active = pathname === href || pathname?.startsWith(href + '/');
            return (
              <Link
                key={name}
                href={href}
                onClick={() => setMobileOpen(false)}
                className={`relative flex items-center gap-3 px-3 py-2.5 text-[13px] font-black tracking-[0.08em] uppercase transition-all duration-200 group ${
                  active
                    ? 'bg-orange-500/[0.08] text-sidebar-foreground'
                    : 'text-sidebar-foreground/40 hover:text-sidebar-foreground/80 hover:bg-sidebar-foreground/[0.05]'
                }`}
              >
                {active && (
                  <div className="absolute left-0 top-0 bottom-0 w-[2px] bg-orange-500 shadow-[0_0_12px_rgba(249,115,22,0.6)]" />
                )}
                <Icon className={`w-4 h-4 flex-shrink-0 transition-all ${
                  active
                    ? 'text-orange-400 drop-shadow-[0_0_6px_rgba(249,115,22,0.7)]'
                    : 'text-sidebar-foreground/30 group-hover:text-sidebar-foreground/60'
                }`} />
                <span className="truncate">{name}</span>
                {name === 'Messages' && unreadCount > 0 && (
                  <span className="ml-auto flex-shrink-0 px-1.5 py-0.5 bg-rose-500 text-white text-[8px] font-black min-w-[1.1rem] text-center">
                    {unreadCount > 9 ? '9+' : unreadCount}
                  </span>
                )}
                {name === 'Notifications' && notifUnread > 0 && (
                  <span className="ml-auto flex-shrink-0 px-1.5 py-0.5 bg-orange-500 text-white text-[8px] font-black min-w-[1.1rem] text-center">
                    {notifUnread > 9 ? '9+' : notifUnread}
                  </span>
                )}
                {active && (
                  <div className="ml-auto w-1 h-1 rounded-full bg-orange-500/60 flex-shrink-0" />
                )}
              </Link>
            );
          })}
        </div>

        {/* Bottom */}
        <div className="border-t border-sidebar-foreground/[0.08] bg-sidebar-foreground/[0.02]">
          <div className="flex items-center justify-between px-4 py-3 border-b border-sidebar-foreground/[0.06]">
            <span className="text-[8px] font-black uppercase tracking-[0.3em] text-sidebar-foreground/30">Display</span>
            <ThemeToggle />
          </div>
          <button
            onClick={handleLogout}
            className="flex items-center gap-3 w-full px-5 py-4 text-[12px] font-black uppercase tracking-[0.25em] text-rose-500 hover:text-white hover:bg-rose-600 transition-all group active:scale-[0.98]"
          >
            <ArrowRightOnRectangleIcon className="w-5 h-5 flex-shrink-0 group-hover:translate-x-1 transition-transform" />
            Sign Out
          </button>
        </div>
      </nav>

      {/* ── Mobile Bottom Navigation ── */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-sidebar/97 backdrop-blur-xl border-t border-sidebar-foreground/[0.08] flex items-center justify-around px-1 pt-1 pb-[max(0.5rem,env(safe-area-inset-bottom))] shadow-[0_-4px_30px_rgba(0,0,0,0.4)]">
        {bottomNavItems.map(({ name, href, icon: Icon }) => {
          const active = pathname === href || pathname?.startsWith(href + '/');
          const shortName =
            name === 'My Courses' ? 'Courses' :
            name === 'My Classes' ? 'Classes' :
            name === 'My Report Card' ? 'Report' :
            name === 'My Access Card' ? 'My Card' :
            name === 'My Payments' ? 'Payments' :
            name === 'Code Playground' ? 'Code' :
            name === 'Progress Reports' ? 'Reports' :
            name === 'Student Reports' ? 'Reports' :
            name === 'My Students' ? 'Students' :
            name === 'School Overview' ? 'Overview' :
            name === 'Learning Center' ? 'Learn' :
            name === 'WhatsApp Inbox' ? 'WhatsApp' :
            name === 'My Children' ? 'Children' :
            name === 'Report Cards' ? 'Reports' :
            name;
          return (
            <Link
              key={`mobile-${name}`}
              href={href}
              onClick={() => setMobileOpen(false)}
              className="flex flex-col items-center gap-0.5 py-1 flex-1 min-w-0 transition-all duration-200"
            >
              <div className={`relative flex items-center justify-center w-10 h-7 rounded-xl transition-all duration-200 ${
                active
                  ? 'bg-orange-500/15 shadow-[0_0_12px_rgba(249,115,22,0.25)]'
                  : ''
              }`}>
                <Icon className={`w-5 h-5 transition-colors ${active ? 'text-orange-400' : 'text-sidebar-foreground/35'}`} />
                {name === 'Messages' && unreadCount > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 w-3.5 h-3.5 bg-rose-500 text-white text-[7px] font-black flex items-center justify-center rounded-full ring-2 ring-sidebar">
                    {unreadCount > 9 ? '9+' : unreadCount}
                  </span>
                )}
              </div>
              <span className={`text-[9px] font-black uppercase tracking-[0.08em] leading-none truncate max-w-full px-0.5 transition-colors ${
                active ? 'text-orange-400' : 'text-sidebar-foreground/25'
              }`}>
                {shortName}
              </span>
            </Link>
          );
        })}
        <button
          onClick={() => setMobileOpen(v => !v)}
          className="flex flex-col items-center gap-0.5 py-1 flex-1 min-w-0 transition-all group"
        >
          <div className={`flex items-center justify-center w-10 h-7 rounded-xl transition-all duration-200 ${mobileOpen ? 'bg-orange-500/15' : ''}`}>
            {mobileOpen
              ? <XMarkIcon className="w-5 h-5 text-orange-400" />
              : <Bars3Icon className="w-5 h-5 text-sidebar-foreground/35" />
            }
          </div>
          <span className={`text-[9px] font-black uppercase tracking-[0.08em] leading-none transition-colors ${mobileOpen ? 'text-orange-400' : 'text-sidebar-foreground/25'}`}>
            Menu
          </span>
        </button>
      </div>
    </>
  );
}
