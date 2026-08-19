// @refresh reset
'use client';

import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/contexts/auth-context';
import ThemeToggle from '@/components/ThemeToggle';
import NotificationDropdown from '@/components/notifications/NotificationDropdown';
import {
  ChevronRightIcon,
  HomeIcon,
} from '@/lib/icons';

const PATH_LABELS: Record<string, string> = {
  '/dashboard': 'Overview',
  '/dashboard/students': 'Students Registry',
  '/dashboard/teachers': 'Teachers',
  '/dashboard/schools': 'Partner Schools',
  '/dashboard/parents': 'Parents Directory',
  '/dashboard/users': 'Users & Security',
  '/dashboard/approvals': 'Pending Approvals',
  '/dashboard/programs': 'Programs & Courses',
  '/dashboard/classes': 'Classes',
  '/dashboard/courses': 'Course Library',
  '/dashboard/lesson-plans': 'Lesson Plans',
  '/dashboard/grading': 'Grading Queue',
  '/dashboard/timetable': 'Timetable',
  '/dashboard/finance': 'Finance & Billing',
  '/dashboard/my-card': 'Digital Access Card',
  '/dashboard/card-studio': 'Card Studio',
  '/dashboard/certificates': 'Certificates',
  '/dashboard/learning': 'Learning Center',
  '/dashboard/assignments': 'Assignments',
  '/dashboard/cbt': 'CBT Exams',
  '/dashboard/path-progress': 'Path Progress',
  '/dashboard/announcements': 'Announcements',
  '/dashboard/office': 'Office Center',
  '/dashboard/reports/builder': 'Write',
  '/dashboard/results': 'Publish',
  '/dashboard/academic/results': 'Auto-fill',
};

export default function DesktopTopNavbar() {
  const pathname = usePathname() || '/dashboard';
  const { profile } = useAuth();
  const currentLabel =
    PATH_LABELS[pathname] || pathname.split('/').pop()?.replace(/-/g, ' ') || 'Dashboard';

  return (
    <header className="hidden md:flex items-center justify-between px-6 lg:px-10 py-3 bg-card/95 backdrop-blur-xl border-b border-border/80 sticky top-0 z-40">
      <div className="flex items-center gap-2 text-xs font-semibold min-w-0">
        <Link
          href="/dashboard"
          className="flex items-center gap-1.5 text-muted-foreground hover:text-foreground transition-colors"
        >
          <HomeIcon className="w-3.5 h-3.5 text-primary" />
          <span>Dashboard</span>
        </Link>
        {pathname !== '/dashboard' && (
          <>
            <ChevronRightIcon className="w-3.5 h-3.5 text-muted-foreground/50 shrink-0" />
            <span className="text-foreground capitalize font-bold truncate max-w-[260px]">
              {currentLabel}
            </span>
          </>
        )}
      </div>

      <div className="flex items-center gap-3 shrink-0">

        {profile?.role && (
          <span className="px-2.5 py-1 rounded-full bg-primary/10 text-primary text-[10px] font-bold capitalize">
            {profile.role}
          </span>
        )}

        <div className="flex items-center gap-1 border-l border-border pl-3">
          <NotificationDropdown />
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
