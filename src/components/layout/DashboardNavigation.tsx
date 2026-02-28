'use client';

import { useState } from 'react';
import { useAuth } from '@/contexts/auth-context';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
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
  ArrowRightOnRectangleIcon,
  Bars3Icon,
  XMarkIcon,
} from '@heroicons/react/24/outline';

type NavItem = { name: string; href: string; icon: any };

export default function DashboardNavigation() {
  const { profile, signOut } = useAuth();
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  // Show minimal escape bar when profile not yet loaded
  if (!profile) return (
    <div className="fixed top-0 left-0 right-0 z-50 bg-[#0b0b18] border-b border-white/10 h-14 flex items-center justify-between px-6">
      <span className="text-white/30 text-sm font-semibold">Rillcod Academy</span>
      <div className="flex items-center gap-3">
        <a href="/login"
          className="text-xs font-bold text-violet-400 hover:text-violet-300 transition-colors underline underline-offset-2">
          Sign In
        </a>
        <a href="/api/auth/signout"
          className="flex items-center gap-1.5 px-3 py-1.5 bg-rose-600/20 hover:bg-rose-600/40 text-rose-400 text-xs font-bold rounded-xl border border-rose-600/20 transition-all">
          <ArrowRightOnRectangleIcon className="w-3.5 h-3.5" /> Sign Out
        </a>
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
          { name: 'Analytics', href: '/dashboard/analytics', icon: ChartBarIcon },
          { name: 'Settings', href: '/dashboard/settings', icon: CogIcon },
        ];
      case 'teacher':
        return [
          ...base,
          { name: 'My Classes', href: '/dashboard/classes', icon: BookOpenIcon },
          { name: 'Lessons', href: '/dashboard/lessons', icon: PresentationChartLineIcon },
          { name: 'Students', href: '/dashboard/students', icon: UserGroupIcon },
          { name: 'Assignments', href: '/dashboard/assignments', icon: ClipboardDocumentListIcon },
          { name: 'Grades', href: '/dashboard/grades', icon: ClipboardDocumentCheckIcon },
          { name: 'Progress', href: '/dashboard/progress', icon: ChartBarIcon },
          { name: 'Settings', href: '/dashboard/settings', icon: CogIcon },
        ];
      case 'student':
        return [
          ...base,
          { name: 'My Courses', href: '/dashboard/courses', icon: BookOpenIcon },
          { name: 'Lessons', href: '/dashboard/lessons', icon: PresentationChartLineIcon },
          { name: 'Assignments', href: '/dashboard/assignments', icon: ClipboardDocumentListIcon },
          { name: 'Grades', href: '/dashboard/grades', icon: ClipboardDocumentCheckIcon },
          { name: 'Progress', href: '/dashboard/progress', icon: ChartBarIcon },
          { name: 'Settings', href: '/dashboard/settings', icon: CogIcon },
        ];
      default:
        return base;
    }
  };

  const navItems = getNavItems();

  const handleLogout = () => {
    // Use server-side route to properly clear SSR session cookies
    window.location.href = '/api/auth/signout';
  };

  return (
    <>
      {/* Mobile Top Header (Visible only on small screens) */}
      <div className="md:hidden flex items-center justify-between bg-[#0B132B] px-4 py-3 text-white border-b-2 border-[#7a0606]">
        <Link href="/dashboard" className="flex items-center gap-2">
          <AcademicCapIcon className="w-6 h-6 text-white" />
          <span className="font-extrabold uppercase tracking-widest text-lg">
            Rillcod
          </span>
        </Link>
        <button
          onClick={() => setMobileOpen(!mobileOpen)}
          className="text-white hover:text-[#FF914D] transition-colors"
        >
          {mobileOpen ? <XMarkIcon className="w-7 h-7" /> : <Bars3Icon className="w-7 h-7" />}
        </button>
      </div>

      {/* Main Sidebar Navigation */}
      <nav
        className={`fixed md:relative z-40 inset-y-0 left-0 flex flex-col w-64 bg-[#0B132B] text-gray-200 transform transition-transform duration-300 ease-in-out font-sans border-r-4 border-[#7a0606] shadow-2xl ${mobileOpen ? 'translate-x-[0%]' : '-translate-x-[100%] md:translate-x-[0%]'
          }`}
      >
        {/* Logo Section */}
        <div className="hidden md:flex flex-col items-center justify-center py-8 border-b border-gray-800">
          <div className="w-16 h-16 bg-[#7a0606] border-2 border-white rounded-full flex items-center justify-center mb-4 shadow-lg shadow-black/50">
            <AcademicCapIcon className="w-8 h-8 text-white" />
          </div>
          <span className="text-xl font-extrabold uppercase tracking-[0.2em] text-white">
            Rillcod
          </span>
          <span className="text-[10px] font-bold tracking-widest text-gray-400 mt-1 uppercase">
            Academy Portal
          </span>
        </div>

        {/* User Badge */}
        <div className="px-6 py-4 flex items-center gap-3 border-b border-gray-800 bg-[#060c1d]">
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
        <div className="flex-1 overflow-y-auto px-4 py-6 space-y-1 custom-scrollbar">
          {navItems.map(({ name, href, icon: Icon }) => {
            const active = pathname === href || pathname?.startsWith(href + '/');
            return (
              <Link
                key={name}
                href={href}
                onClick={() => setMobileOpen(false)}
                className={`flex items-center gap-3 px-4 py-3.5 rounded-lg text-sm font-bold tracking-wider uppercase transition-all duration-200 ${active
                  ? 'bg-[#7a0606] text-white shadow-md'
                  : 'text-gray-400 hover:bg-[#1a2b54] hover:text-white'
                  }`}
              >
                <Icon className={`w-5 h-5 ${active ? 'text-white' : 'text-gray-400'}`} />
                {name}
              </Link>
            );
          })}
        </div>

        {/* Bottom Actions */}
        <div className="p-4 border-t border-gray-800 bg-[#060c1d] space-y-2">
          <Link
            href="/dashboard/profile"
            onClick={() => setMobileOpen(false)}
            className="flex items-center gap-3 w-full px-4 py-3 rounded-lg text-xs font-bold uppercase text-gray-400 hover:bg-[#1a2b54] hover:text-white transition-colors"
          >
            <UserIcon className="w-5 h-5" /> Profile
          </Link>
          <button
            onClick={handleLogout}
            className="flex items-center gap-3 w-full px-4 py-3 rounded-lg text-xs font-bold uppercase text-red-500 hover:bg-red-500/10 transition-colors"
          >
            <ArrowRightOnRectangleIcon className="w-5 h-5" /> Sign Out
          </button>
        </div>
      </nav>

      {/* Mobile Backdrop Overlay */}
      {mobileOpen && (
        <div
          onClick={() => setMobileOpen(false)}
          className="fixed inset-0 bg-black/50 z-30 md:hidden backdrop-blur-sm transition-opacity"
        />
      )}
    </>
  );
}