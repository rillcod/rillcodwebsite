'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/auth-context';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import {
  HomeIcon,
  UserGroupIcon,
  AcademicCapIcon,
  BookOpenIcon,
  ChartBarIcon,
  CogIcon,
  BuildingOfficeIcon,
  ClipboardDocumentListIcon,
  PresentationChartLineIcon,
  ClipboardDocumentCheckIcon,
  UserIcon,
  BellIcon,
  EnvelopeIcon,
  ArrowRightOnRectangleIcon,
  Bars3Icon,
  XMarkIcon,
  SignalIcon,
} from '@heroicons/react/24/outline';

type NavItem = { name: string; href: string; icon: any };

export default function DashboardNavigation() {
  const { profile, signOut } = useAuth();
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);

  // Close sidebar on route change
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  // Lock body scroll when mobile sidebar is open
  useEffect(() => {
    if (mobileOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [mobileOpen]);

  useEffect(() => {
    if (!profile) return;
    createClient()
      .from('messages').select('id', { count: 'exact', head: true })
      .eq('recipient_id', profile.id).eq('is_read', false)
      .then(({ count }) => setUnreadCount(count ?? 0));
  }, [profile?.id]); // eslint-disable-line

  // Show minimal escape bar when profile not yet loaded
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

  const getNavItems = (): NavItem[] => {
    const base: NavItem[] = [{ name: 'Dashboard', href: '/dashboard', icon: HomeIcon }];

    switch (profile.role) {
      case 'admin':
        return [
          ...base,
          { name: 'Schools', href: '/dashboard/schools', icon: BuildingOfficeIcon },
          { name: 'Teachers', href: '/dashboard/teachers', icon: AcademicCapIcon },
          { name: 'Approvals', href: '/dashboard/approvals', icon: ClipboardDocumentCheckIcon },
          { name: 'Students', href: '/dashboard/students', icon: UserGroupIcon },
          { name: 'Courses', href: '/dashboard/courses', icon: BookOpenIcon },
          { name: 'Library', href: '/dashboard/library', icon: BookOpenIcon },
          { name: 'CBT Exams', href: '/dashboard/cbt', icon: AcademicCapIcon },
          { name: 'Messages', href: '/dashboard/messages', icon: EnvelopeIcon },
          { name: 'Analytics', href: '/dashboard/analytics', icon: ChartBarIcon },
          { name: 'IoT Monitor', href: '/dashboard/iot', icon: SignalIcon },
          { name: 'Settings', href: '/dashboard/settings', icon: CogIcon },
        ];
      case 'teacher':
        return [
          ...base,
          { name: 'My Classes', href: '/dashboard/classes', icon: BookOpenIcon },
          { name: 'Lessons', href: '/dashboard/lessons', icon: PresentationChartLineIcon },
          { name: 'Library', href: '/dashboard/library', icon: BookOpenIcon },
          { name: 'Attendance', href: '/dashboard/attendance', icon: ClipboardDocumentCheckIcon },
          { name: 'Students', href: '/dashboard/students', icon: UserGroupIcon },
          { name: 'Assignments', href: '/dashboard/assignments', icon: ClipboardDocumentListIcon },
          { name: 'CBT Exams', href: '/dashboard/cbt', icon: AcademicCapIcon },
          { name: 'Grades', href: '/dashboard/grades', icon: ClipboardDocumentCheckIcon },
          { name: 'Messages', href: '/dashboard/messages', icon: EnvelopeIcon },
          { name: 'Progress', href: '/dashboard/progress', icon: ChartBarIcon },
          { name: 'Settings', href: '/dashboard/settings', icon: CogIcon },
        ];
      case 'student':
        return [
          ...base,
          { name: 'My Courses', href: '/dashboard/courses', icon: BookOpenIcon },
          { name: 'Lessons', href: '/dashboard/lessons', icon: PresentationChartLineIcon },
          { name: 'Library', href: '/dashboard/library', icon: BookOpenIcon },
          { name: 'Attendance', href: '/dashboard/attendance', icon: ClipboardDocumentCheckIcon },
          { name: 'Assignments', href: '/dashboard/assignments', icon: ClipboardDocumentListIcon },
          { name: 'CBT Exams', href: '/dashboard/cbt', icon: AcademicCapIcon },
          { name: 'Grades', href: '/dashboard/grades', icon: ClipboardDocumentCheckIcon },
          { name: 'Messages', href: '/dashboard/messages', icon: EnvelopeIcon },
          { name: 'Progress', href: '/dashboard/progress', icon: ChartBarIcon },
          { name: 'Settings', href: '/dashboard/settings', icon: CogIcon },
        ];
      case 'school':
        return [
          ...base,
          { name: 'My Students', href: '/dashboard/students', icon: UserGroupIcon },
          { name: 'Grades & Reports', href: '/dashboard/grades', icon: ClipboardDocumentCheckIcon },
          { name: 'Activity', href: '/dashboard/progress', icon: ChartBarIcon },
          { name: 'Courses', href: '/dashboard/courses', icon: BookOpenIcon },
          { name: 'Library', href: '/dashboard/library', icon: BookOpenIcon },
          { name: 'Messages', href: '/dashboard/messages', icon: EnvelopeIcon },
          { name: 'Settings', href: '/dashboard/settings', icon: CogIcon },
        ];
      default:
        return base;
    }
  };

  const navItems = getNavItems();
  const bottomNavNames = new Set(['Dashboard', 'Courses', 'My Courses', 'Library', 'Messages', 'Settings']);
  const bottomNavItems = navItems.filter((item) => bottomNavNames.has(item.name)).slice(0, 5);

  const handleLogout = () => {
    signOut();
  };

  return (
    <>
      {/* ── Mobile Top Header (hidden on md+) ── */}
      <div className="md:hidden fixed top-0 left-0 right-0 z-50 flex items-center justify-between bg-[#0B132B] px-4 py-2.5 text-white border-b-2 border-[#7a0606] shadow-lg">
        <Link href="/dashboard" className="flex items-center gap-2.5">
          <Image src="/images/logo.png" alt="Rillcod" width={32} height={32} className="rounded-lg" priority />
          <span className="font-extrabold uppercase tracking-widest text-lg">Rillcod</span>
        </Link>
        <div className="flex items-center gap-2">
          {/* Unread badge in topbar */}
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
      {/* On mobile: fixed overlay, slides in from left below the top header (top-[53px])
          On md+: static sidebar that sits in the flex layout */}
      <nav
        className={`
          fixed top-[53px] left-0 bottom-0 z-40
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
        {/* Logo Section (desktop only) */}
        <div className="hidden md:flex flex-col items-center justify-center py-6 border-b border-gray-800">
          <Image src="/images/logo.png" alt="Rillcod Academy" width={64} height={64} className="rounded-2xl shadow-lg shadow-black/50 mb-3" priority />
          <span className="text-xl font-extrabold uppercase tracking-[0.2em] text-white">Rillcod</span>
          <span className="text-[10px] font-bold tracking-widest text-gray-400 mt-1 uppercase">Academy Portal</span>
        </div>

        {/* User Badge */}
        <div className="px-4 md:px-6 py-4 flex items-center gap-3 border-b border-gray-800 bg-[#060c1d]">
          <div className="w-10 h-10 bg-[#7a0606] border border-gray-600 rounded flex items-center justify-center flex-shrink-0">
            <span className="text-white text-lg font-black uppercase">
              {profile.full_name?.charAt(0) ?? 'U'}
            </span>
          </div>
          <div className="flex flex-col overflow-hidden">
            <span className="text-sm font-bold truncate text-white">
              {profile.full_name}
            </span>
            <span className="text-[10px] font-black uppercase tracking-widest text-[#FF914D]">
              {profile.role}
            </span>
          </div>
        </div>

        {/* Links Navigation */}
        <div className="flex-1 overflow-y-auto px-3 md:px-4 py-4 space-y-0.5">
          {navItems.map(({ name, href, icon: Icon }) => {
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

        {/* Bottom Actions */}
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
            {unreadCount > 0 && <span className="ml-auto text-[10px] bg-rose-500/20 text-rose-400 px-1.5 py-0.5 rounded-full">{unreadCount}</span>}
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

      {/* ── Mobile Bottom Navigation (visible on mobile only) ── */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-[#0B132B] border-t-2 border-[#7a0606] px-1 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] flex items-center justify-around shadow-[0_-4px_20px_rgba(0,0,0,0.5)]">
        {bottomNavItems.map(({ name, href, icon: Icon }) => {
          const active = pathname === href || pathname?.startsWith(href + '/');
          return (
            <Link
              key={`mobile-${name}`}
              href={href}
              onClick={() => setMobileOpen(false)}
              className={`flex flex-col items-center gap-1 px-2 py-1 rounded-xl min-w-[3.5rem] transition-all duration-200 ${active ? 'text-white' : 'text-gray-500 hover:text-gray-300'}`}
            >
              <div className={`relative p-1.5 rounded-lg transition-all duration-200 ${active ? 'bg-[#7a0606] shadow-md shadow-black/40' : ''}`}>
                <Icon className={`w-5 h-5 ${active ? 'text-white' : 'text-gray-400'}`} />
                {name === 'Messages' && unreadCount > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 w-3.5 h-3.5 bg-rose-500 text-white text-[8px] font-black rounded-full flex items-center justify-center">
                    {unreadCount > 9 ? '9+' : unreadCount}
                  </span>
                )}
              </div>
              <span className={`text-[9px] font-bold uppercase tracking-wide leading-none ${active ? 'text-white' : 'text-gray-500'}`}>
                {name === 'My Courses' ? 'Courses' : name}
              </span>
            </Link>
          );
        })}
      </div>
    </>
  );
}