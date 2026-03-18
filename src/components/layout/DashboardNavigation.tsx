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
  TrashIcon,
} from '@/lib/icons';

// ── Types ─────────────────────────────────────────────────────────────────────
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
        .eq('user_id', profile.id).eq('is_viewed', false)
    ]).then(([msgRes, nwlRes]) => {
      const total = (msgRes.count ?? 0) + (nwlRes.count ?? 0);
      setUnreadCount(total);
    });
  }, [profile?.id, isMinimal]); // eslint-disable-line

  if (isMinimal) return null;

  if (!profile) return (
    <div className="fixed top-0 left-0 right-0 z-50 bg-[#0b0b18] border-b border-white/10 h-14 flex items-center justify-between px-4 sm:px-6">
      <span className="text-white/30 text-sm font-semibold">Rillcod Academy</span>
      <div className="flex items-center gap-3">
        <a href="/login"
          className="text-xs font-bold text-violet-400 hover:text-violet-300 transition-colors underline underline-offset-2">
          Sign In
        </a>
        <button
          onClick={signOut}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-rose-600/20 hover:bg-rose-600/40 text-rose-400 text-xs font-bold rounded-xl border border-rose-600/20 transition-all">
          <ArrowRightOnRectangleIcon className="w-3.5 h-3.5" /> Sign Out
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
          { name: 'Register Students', href: '/dashboard/students/bulk-register', icon: UserPlusIcon },
          { name: 'Enrol Students', href: '/dashboard/students/bulk-enroll', icon: AcademicCapIcon },
          { name: 'Wipe Students', href: '/dashboard/students/bulk-delete', icon: TrashIcon },
          { name: 'Users', href: '/dashboard/users', icon: ShieldCheckIcon },
          { name: 'Approvals', href: '/dashboard/approvals', icon: ClipboardDocumentCheckIcon },
          { divider: true, label: 'Academics' },
          { name: 'Programs', href: '/dashboard/programs', icon: AcademicCapIcon },
          { name: 'Courses', href: '/dashboard/courses', icon: BookOpenIcon },
          { name: 'Assignments', href: '/dashboard/assignments', icon: ClipboardDocumentListIcon },
          { name: 'Grades', href: '/dashboard/grades', icon: ClipboardDocumentCheckIcon },
          { name: 'CBT Exams', href: '/dashboard/cbt', icon: AcademicCapIcon },
          { name: 'Timetable', href: '/dashboard/timetable', icon: CalendarDaysIcon },
          { divider: true, label: 'Content' },
          { name: 'Library', href: '/dashboard/library', icon: BookOpenIcon },
          { name: 'Leaderboard', href: '/dashboard/leaderboard', icon: TrophyIcon },
          { name: 'Live Sessions', href: '/dashboard/live-sessions', icon: VideoCameraIcon },
          { divider: true, label: 'Reports' },
          { name: 'Report Builder', href: '/dashboard/reports/builder', icon: DocumentTextIcon },
          { name: 'Progress Reports', href: '/dashboard/results', icon: DocumentChartBarIcon },
          { name: 'Analytics', href: '/dashboard/analytics', icon: ChartBarIcon },
          { divider: true, label: 'Finance' },
          { name: 'Payments', href: '/dashboard/payments', icon: BanknotesIcon },
          { divider: true, label: 'System' },
          { name: 'Messages', href: '/dashboard/messages', icon: EnvelopeIcon },
          { name: 'Newsletters', href: '/dashboard/newsletters', icon: DocumentTextIcon },
          { name: 'IoT Monitor', href: '/dashboard/iot', icon: SignalIcon },
          { name: 'Settings', href: '/dashboard/settings', icon: CogIcon },
        ];

      case 'teacher':
        return [
          ...base,
          { divider: true, label: 'Teaching' },
          { name: 'My Classes', href: '/dashboard/classes', icon: BookOpenIcon },
          { name: 'Lessons', href: '/dashboard/lessons', icon: PresentationChartLineIcon },
          { name: 'Assignments', href: '/dashboard/assignments', icon: ClipboardDocumentListIcon },
          { name: 'CBT Exams', href: '/dashboard/cbt', icon: AcademicCapIcon },
          { name: 'Attendance', href: '/dashboard/attendance', icon: ClipboardDocumentCheckIcon },
          { name: 'Timetable', href: '/dashboard/timetable', icon: CalendarDaysIcon },
          { divider: true, label: 'Students' },
          { name: 'Students', href: '/dashboard/students', icon: UserGroupIcon },
          { name: 'Register Students', href: '/dashboard/students/bulk-register', icon: UserPlusIcon },
          { name: 'Grades', href: '/dashboard/grades', icon: ClipboardDocumentCheckIcon },
          { divider: true, label: 'Reports' },
          { name: 'Report Builder', href: '/dashboard/reports/builder', icon: DocumentTextIcon },
          { name: 'Progress Reports', href: '/dashboard/results', icon: DocumentChartBarIcon },
          { divider: true, label: 'Content' },
          { name: 'Library', href: '/dashboard/library', icon: BookOpenIcon },
          { name: 'Code Playground', href: '/dashboard/playground', icon: CodeBracketIcon },
          { name: 'Leaderboard', href: '/dashboard/leaderboard', icon: TrophyIcon },
          { divider: true, label: 'More' },
          { name: 'Live Sessions', href: '/dashboard/live-sessions', icon: VideoCameraIcon },
          { name: 'Messages', href: '/dashboard/messages', icon: EnvelopeIcon },
          { name: 'Settings', href: '/dashboard/settings', icon: CogIcon },
        ];

      case 'student':
        return [
          ...base,
          { divider: true, label: 'Learn' },
          { name: 'Learning Center', href: '/dashboard/learning', icon: RocketLaunchIcon },
          { name: 'Assignments', href: '/dashboard/assignments', icon: ClipboardDocumentListIcon },
          { name: 'CBT Exams', href: '/dashboard/cbt', icon: AcademicCapIcon },
          { name: 'Library', href: '/dashboard/library', icon: BookOpenIcon },
          { divider: true, label: 'Activities' },
          { name: 'Code Playground', href: '/dashboard/playground', icon: CodeBracketIcon },
          { name: 'Live Sessions', href: '/dashboard/live-sessions', icon: VideoCameraIcon },
          { name: 'My Portfolio', href: '/dashboard/portfolio', icon: RocketLaunchIcon },
          { name: 'Leaderboard', href: '/dashboard/leaderboard', icon: TrophyIcon },
          { divider: true, label: 'Schedule' },
          { name: 'Timetable', href: '/dashboard/timetable', icon: CalendarDaysIcon },
          { name: 'Attendance', href: '/dashboard/attendance', icon: ClipboardDocumentCheckIcon },
          { divider: true, label: 'My Progress' },
          { name: 'Grades', href: '/dashboard/grades', icon: ClipboardDocumentCheckIcon },
          { name: 'My Report Card', href: '/dashboard/results', icon: DocumentChartBarIcon },
          { divider: true, label: 'More' },
          { name: 'Messages', href: '/dashboard/messages', icon: EnvelopeIcon },
          { name: 'Settings', href: '/dashboard/settings', icon: CogIcon },
        ];

      case 'school':
        return [
          ...base,
          { divider: true, label: 'My School' },
          { name: 'School Overview', href: '/dashboard/school-overview', icon: ChartBarIcon },
          { name: 'My Students', href: '/dashboard/students', icon: UserGroupIcon },
          { name: 'Attendance', href: '/dashboard/attendance', icon: ClipboardDocumentCheckIcon },
          { name: 'Timetable', href: '/dashboard/timetable', icon: CalendarDaysIcon },
          { divider: true, label: 'Reports' },
          { name: 'Student Reports', href: '/dashboard/results', icon: DocumentChartBarIcon },
          { name: 'Grades', href: '/dashboard/grades', icon: ClipboardDocumentCheckIcon },
          { name: 'Performance', href: '/dashboard/progress', icon: PresentationChartLineIcon },
          { divider: true, label: 'Finance' },
          { name: 'Payments', href: '/dashboard/payments', icon: BanknotesIcon },
          { divider: true, label: 'More' },
          { name: 'Messages', href: '/dashboard/messages', icon: EnvelopeIcon },
          { name: 'Newsletters', href: '/dashboard/newsletters', icon: DocumentTextIcon },
          { name: 'Settings', href: '/dashboard/settings', icon: CogIcon },
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
      ? ['Dashboard', 'Learning Center', 'Code Playground', 'My Report Card', 'Messages']
      : profile?.role === 'school'
        ? ['Dashboard', 'My Students', 'Student Reports', 'Messages']
        : profile?.role === 'admin'
          ? ['Dashboard', 'Students', 'Approvals', 'Progress Reports', 'Messages']
          : profile?.role === 'teacher'
            ? ['Dashboard', 'My Classes', 'Students', 'Progress Reports', 'Messages']
            : ['Dashboard']
  );
  const bottomNavItems = navItems.filter(item => BOTTOM_NAV_NAMES.has(item.name)).slice(0, 4);

  const handleLogout = () => signOut();

  return (
    <>
      {/* ── Mobile Top Header ── */}
      <div className="md:hidden fixed top-0 left-0 right-0 z-50 flex items-center justify-between bg-[#0B132B] px-4 py-1.5 text-white border-b border-[#7a0606] shadow-lg">
        <Link href="/dashboard" className="flex items-center gap-2">
          <Image src="/images/logo.png" alt="Rillcod" width={24} height={24} className="rounded-lg" priority />
          <span className="font-extrabold uppercase tracking-widest text-base">Rillcod</span>
        </Link>
        <div className="flex items-center gap-2">
          {unreadCount > 0 && (
            <Link href="/dashboard/messages" className="relative p-1.5">
              <BellIcon className="w-5 h-5 text-gray-300" />
              <span className="absolute top-0 right-0 w-4 h-4 bg-rose-500 text-white text-[9px] font-black rounded-full flex items-center justify-center">
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            </Link>
          )}
          <button
            onClick={() => setMobileOpen(!mobileOpen)}
            aria-label={mobileOpen ? 'Close menu' : 'Open menu'}
            className="p-1.5 text-white hover:text-[#FF914D] transition-colors rounded-lg hover:bg-white/10"
          >
            {mobileOpen ? <XMarkIcon className="w-7 h-7" /> : <Bars3Icon className="w-7 h-7" />}
          </button>
        </div>
      </div>

      {/* ── Backdrop (mobile only) ── */}
      {mobileOpen && (
        <div
          onClick={() => setMobileOpen(false)}
          className="fixed inset-0 bg-black/60 z-40 md:hidden backdrop-blur-sm"
          aria-hidden="true"
        />
      )}

      {/* ── Sidebar ── */}
      <nav
        className={`
          fixed top-[53px] left-0 bottom-16 z-40 md:bottom-0
          md:static md:top-auto md:bottom-auto md:z-auto
          flex flex-col w-[280px] md:w-64
          bg-[#0B132B] text-gray-200
          border-r-4 border-[#7a0606] shadow-2xl
          transform transition-transform duration-300 ease-in-out
          md:translate-x-0 md:h-screen md:flex-shrink-0
          ${mobileOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
        `}
        aria-label="Dashboard navigation"
      >
        {/* Logo (desktop only) */}
        <div className="hidden md:flex flex-col items-center justify-center py-6 border-b border-gray-800">
          <Image src="/images/logo.png" alt="Rillcod Academy" width={64} height={64} className="rounded-2xl shadow-lg shadow-black/50 mb-3" priority />
          <span className="text-xl font-extrabold uppercase tracking-[0.2em] text-white">Rillcod</span>
          <span className="text-[10px] font-bold tracking-widest text-gray-400 mt-1 uppercase">Academy Portal</span>
        </div>

        {/* User badge */}
        <div className="px-4 md:px-6 py-4 flex items-center gap-3 border-b border-gray-800 bg-[#060c1d]">
          <div className="w-10 h-10 bg-[#7a0606] border border-gray-600 rounded flex items-center justify-center flex-shrink-0">
            <span className="text-white text-lg font-black uppercase">
              {profile.full_name?.charAt(0) ?? 'U'}
            </span>
          </div>
          <div className="flex flex-col overflow-hidden">
            <span className="text-sm font-bold truncate text-white">{profile.full_name}</span>
            <span className="text-[10px] font-black uppercase tracking-widest text-[#FF914D]">
              {profile.role === 'school' && profile.school_name
                ? profile.school_name
                : profile.role}
            </span>
          </div>
        </div>

        {/* Links */}
        <div className="flex-1 overflow-y-auto px-3 md:px-4 py-4 space-y-0.5">
          {navEntries.map((entry, idx) => {
            if (isDivider(entry)) {
              return (
                <div key={`divider-${idx}`} className="pt-3 pb-1 px-2">
                  <div className="flex items-center gap-2">
                    <span className="text-[9px] font-black uppercase tracking-[0.2em] text-white/25 whitespace-nowrap">
                      {entry.label}
                    </span>
                    <div className="h-px flex-1 bg-white/10" />
                  </div>
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
                className={`flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-bold tracking-wider uppercase transition-all duration-200 ${active
                    ? 'bg-[#7a0606] text-white shadow-md'
                    : 'text-gray-400 hover:bg-[#1a2b54] hover:text-white'
                  }`}
              >
                <Icon className={`w-5 h-5 flex-shrink-0 ${active ? 'text-white' : 'text-gray-400'}`} />
                <span className="truncate">{name}</span>
                {name === 'Messages' && unreadCount > 0 && (
                  <span className="ml-auto text-[10px] bg-rose-500 text-white px-1.5 py-0.5 rounded-full font-black min-w-[1.25rem] text-center">
                    {unreadCount > 9 ? '9+' : unreadCount}
                  </span>
                )}
              </Link>
            );
          })}
        </div>

        {/* Bottom actions */}
        <div className="p-3 md:p-4 border-t border-gray-800 bg-[#060c1d] space-y-1">
          <Link
            href="/dashboard/messages"
            onClick={() => setMobileOpen(false)}
            className="flex items-center gap-3 w-full px-4 py-3 rounded-lg text-xs font-bold uppercase text-gray-400 hover:bg-[#1a2b54] hover:text-white transition-colors"
          >
            <div className="relative flex-shrink-0">
              <BellIcon className="w-5 h-5" />
              {unreadCount > 0 && (
                <span className="absolute -top-1 -right-1 w-4 h-4 bg-rose-500 text-white text-[9px] font-black rounded-full flex items-center justify-center">
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
            </div>
            Notifications
            {unreadCount > 0 && (
              <span className="ml-auto text-[10px] bg-rose-500/20 text-rose-400 px-1.5 py-0.5 rounded-full">{unreadCount}</span>
            )}
          </Link>
          <Link
            href="/dashboard/profile"
            onClick={() => setMobileOpen(false)}
            className="flex items-center gap-3 w-full px-4 py-3 rounded-lg text-xs font-bold uppercase text-gray-400 hover:bg-[#1a2b54] hover:text-white transition-colors"
          >
            <UserIcon className="w-5 h-5 flex-shrink-0" /> Profile
          </Link>
          <button
            onClick={handleLogout}
            className="flex items-center gap-3 w-full px-4 py-3 rounded-lg text-xs font-bold uppercase text-red-500 hover:bg-red-500/10 transition-colors"
          >
            <ArrowRightOnRectangleIcon className="w-5 h-5 flex-shrink-0" /> Sign Out
          </button>
        </div>
      </nav>

      {/* ── Mobile Bottom Navigation ── */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-[#0B132B] border-t-2 border-[#7a0606] px-1 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] flex items-center justify-around shadow-[0_-4px_20px_rgba(0,0,0,0.5)]">
        {bottomNavItems.map(({ name, href, icon: Icon }) => {
          const active = pathname === href || pathname?.startsWith(href + '/');
          return (
            <Link
              key={`mobile-${name}`}
              href={href}
              onClick={() => setMobileOpen(false)}
              className={`flex flex-col items-center gap-1 px-2 py-1 rounded-xl min-w-[3.5rem] transition-all duration-200 ${active ? 'text-white' : 'text-gray-500 hover:text-gray-300'
                }`}
            >
              <div className={`relative p-2 rounded-lg transition-all duration-200 ${active ? 'bg-[#7a0606] shadow-md shadow-black/40' : ''}`}>
                <Icon className={`w-6 h-6 ${active ? 'text-white' : 'text-gray-400'}`} />
                {name === 'Messages' && unreadCount > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 w-3.5 h-3.5 bg-rose-500 text-white text-[8px] font-black rounded-full flex items-center justify-center">
                    {unreadCount > 9 ? '9+' : unreadCount}
                  </span>
                )}
              </div>
              <span className={`text-[9px] font-bold uppercase tracking-wide leading-none ${active ? 'text-white' : 'text-gray-500'}`}>
                {name === 'My Courses' ? 'Courses' :
                  name === 'My Classes' ? 'Classes' :
                    name === 'My Report Card' ? 'Report' :
                      name === 'Code Playground' ? 'Play' :
                        name === 'Progress Reports' ? 'Reports' :
                          name === 'Student Reports' ? 'Reports' :
                            name === 'My Students' ? 'Students' :
                              name === 'School Overview' ? 'Overview' :
                                name}
              </span>
            </Link>
          );
        })}

        <button
          onClick={handleLogout}
          className="flex flex-col items-center gap-1 px-2 py-1 rounded-xl min-w-[3.5rem] transition-all duration-200 text-red-500 hover:text-red-400 group"
        >
          <div className="relative p-2 rounded-lg transition-all duration-200 group-active:bg-red-500/20">
            <ArrowRightOnRectangleIcon className="w-6 h-6" />
          </div>
          <span className="text-[9px] font-bold uppercase tracking-wide leading-none">Sign Out</span>
        </button>
      </div>
    </>
  );
}
