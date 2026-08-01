// @refresh reset
'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/contexts/auth-context';
import ThemeToggle from '@/components/ThemeToggle';
import NotificationDropdown from '@/components/notifications/NotificationDropdown';
import {
  ChevronRightIcon,
  MagnifyingGlassIcon,
  HomeIcon,
  XMarkIcon,
  ArrowRightIcon,
  AcademicCapIcon,
  UserGroupIcon,
  BuildingOfficeIcon,
  BookOpenIcon,
  DocumentCheckIcon,
  BanknotesIcon,
  ShieldCheckIcon,
  TrophyIcon,
  RocketLaunchIcon,
  ClipboardDocumentListIcon,
  MegaphoneIcon,
  CommandLineIcon,
} from '@/lib/icons';
import { motion, AnimatePresence } from 'framer-motion';

const PATH_LABELS: Record<string, string> = {
  '/dashboard': 'Overview',
  '/dashboard/students': 'Students Registry',
  '/dashboard/teachers': 'Teacher Nucleus',
  '/dashboard/schools': 'Partner Schools',
  '/dashboard/parents': 'Parents Directory',
  '/dashboard/users': 'Users & Security',
  '/dashboard/approvals': 'Pending Approvals',
  '/dashboard/programs': 'Programs & Courses',
  '/dashboard/classes': 'My Classes',
  '/dashboard/courses': 'Course Library',
  '/dashboard/lesson-plans': 'Lesson Plans',
  '/dashboard/grading': 'Grading Queue',
  '/dashboard/timetable': 'Timetable & Operations',
  '/dashboard/finance': 'Finance & Billing',
  '/dashboard/my-card': 'Digital Access Card',
  '/dashboard/card-studio': 'Card Studio',
  '/dashboard/certificates': 'Certificates Vault',
  '/dashboard/learning': 'Learning Hub',
  '/dashboard/assignments': 'Assignments',
  '/dashboard/cbt': 'CBT Exam Engine',
  '/dashboard/path-progress': 'Path Progress',
  '/dashboard/announcements': 'Announcements',
  '/dashboard/office': 'Office Center',
};

const COMMAND_ITEMS = [
  { name: 'Students Registry', href: '/dashboard/students', icon: UserGroupIcon, category: 'People & Access' },
  { name: 'Teacher Nucleus', href: '/dashboard/teachers', icon: AcademicCapIcon, category: 'People & Access' },
  { name: 'Partner Schools', href: '/dashboard/schools', icon: BuildingOfficeIcon, category: 'People & Access' },
  { name: 'Parents Directory', href: '/dashboard/parents', icon: UserGroupIcon, category: 'People & Access' },
  { name: 'Pending Approvals', href: '/dashboard/approvals', icon: DocumentCheckIcon, category: 'People & Access' },

  { name: 'My Classes', href: '/dashboard/classes', icon: AcademicCapIcon, category: 'Academics & Operations' },
  { name: 'Programs & Courses', href: '/dashboard/programs', icon: BookOpenIcon, category: 'Academics & Operations' },
  { name: 'Course Library', href: '/dashboard/courses', icon: BookOpenIcon, category: 'Academics & Operations' },
  { name: 'Lesson Plans', href: '/dashboard/lesson-plans', icon: ClipboardDocumentListIcon, category: 'Academics & Operations' },
  { name: 'Grading Queue', href: '/dashboard/grading', icon: DocumentCheckIcon, category: 'Academics & Operations' },
  { name: 'Timetable & Schedule', href: '/dashboard/timetable', icon: RocketLaunchIcon, category: 'Academics & Operations' },

  { name: 'Finance & Billing', href: '/dashboard/finance', icon: BanknotesIcon, category: 'Finance & Identity' },
  { name: 'Digital Access Card', href: '/dashboard/my-card', icon: ShieldCheckIcon, category: 'Finance & Identity' },
  { name: 'Card Studio', href: '/dashboard/card-studio', icon: ShieldCheckIcon, category: 'Finance & Identity' },
  { name: 'Certificates Vault', href: '/dashboard/certificates', icon: TrophyIcon, category: 'Finance & Identity' },

  { name: 'Learning Hub', href: '/dashboard/learning', icon: RocketLaunchIcon, category: 'Student Hub' },
  { name: 'Assignments', href: '/dashboard/assignments', icon: ClipboardDocumentListIcon, category: 'Student Hub' },
  { name: 'CBT Exam Engine', href: '/dashboard/cbt', icon: CommandLineIcon, category: 'Student Hub' },
  { name: 'Announcements', href: '/dashboard/announcements', icon: MegaphoneIcon, category: 'Communication' },
  { name: 'Office Center', href: '/dashboard/office', icon: BuildingOfficeIcon, category: 'Headquarters' },
];

export default function DesktopTopNavbar() {
  const pathname = usePathname() || '/dashboard';
  const router = useRouter();
  const { profile } = useAuth();
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState('');

  const currentLabel = PATH_LABELS[pathname] || pathname.split('/').pop()?.replace(/-/g, ' ') || 'Dashboard';

  // ⌘K / Ctrl+K keyboard shortcut listener
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setSearchOpen((prev) => !prev);
      }
      if (e.key === 'Escape') {
        setSearchOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const filteredItems = useMemo(() => {
    if (!query.trim()) return COMMAND_ITEMS;
    const q = query.toLowerCase().trim();
    return COMMAND_ITEMS.filter(
      (item) => item.name.toLowerCase().includes(q) || item.category.toLowerCase().includes(q),
    );
  }, [query]);

  const handleSelect = (href: string) => {
    setSearchOpen(false);
    setQuery('');
    router.push(href);
  };

  return (
    <>
      <header className="hidden md:flex items-center justify-between px-6 lg:px-10 py-3 bg-card/80 backdrop-blur-2xl border-b border-border/80 sticky top-0 z-40 transition-all">
        {/* Breadcrumb Navigation */}
        <div className="flex items-center gap-2 text-xs font-bold min-w-0">
          <Link
            href="/dashboard"
            className="flex items-center gap-1.5 text-muted-foreground hover:text-foreground transition-colors"
          >
            <HomeIcon className="w-3.5 h-3.5 text-primary" />
            <span>Dashboard</span>
          </Link>
          {pathname !== '/dashboard' && (
            <>
              <ChevronRightIcon className="w-3.5 h-3.5 text-muted-foreground/50 flex-shrink-0" />
              <span className="text-foreground capitalize font-black truncate max-w-[260px]">
                {currentLabel}
              </span>
            </>
          )}
        </div>

        {/* Center/Right Desktop Quick Controls */}
        <div className="flex items-center gap-3.5 flex-shrink-0">
          {/* Real-time Connected Indicator */}
          <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-brand-red-600/10 border border-brand-red-600/20 text-brand-red-600 dark:text-brand-red-500 text-[10px] font-black uppercase tracking-widest">
            <span className="relative flex h-2 w-2 shrink-0">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-brand-red-500 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-brand-red-600" />
            </span>
            <span>Rillcod Technologies</span>
          </div>

          {/* Quick Search Shortcut Tile (Triggers Command Palette) */}
          <button
            onClick={() => setSearchOpen(true)}
            className="flex items-center gap-2.5 px-3.5 py-1.5 rounded-xl border border-border/80 bg-background/80 hover:bg-muted text-muted-foreground hover:text-foreground text-xs font-semibold shadow-sm transition-all group active:scale-95"
            aria-label="Open command palette"
          >
            <MagnifyingGlassIcon className="w-3.5 h-3.5 text-primary group-hover:scale-110 transition-transform" />
            <span className="text-[11px]">Quick search...</span>
            <kbd className="hidden lg:inline-block px-1.5 py-0.5 text-[9px] font-black text-muted-foreground bg-muted border border-border rounded shadow-2xs">
              ⌘K
            </kbd>
          </button>

          {/* User Role Badge */}
          {profile?.role && (
            <span className="px-2.5 py-1 rounded-full bg-primary/10 border border-primary/20 text-primary text-[9px] font-black uppercase tracking-widest">
              {profile.role}
            </span>
          )}

          {/* Notifications Dropdown & Theme Toggle */}
          <div className="flex items-center gap-1.5 border-l border-border/60 pl-3.5">
            <NotificationDropdown />
            <ThemeToggle />
          </div>
        </div>
      </header>

      {/* ── Interactive Command Palette Modal (⌘K / Ctrl+K) ── */}
      <AnimatePresence>
        {searchOpen && (
          <div className="fixed inset-0 z-[100] hidden md:flex items-start justify-center pt-20 px-4">
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSearchOpen(false)}
              className="absolute inset-0 bg-background/80 backdrop-blur-md"
            />

            {/* Modal Body */}
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: -10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: -10 }}
              className="relative w-full max-w-2xl bg-card border border-border/80 rounded-3xl shadow-2xl overflow-hidden z-10 flex flex-col"
            >
              {/* Search Bar Input */}
              <div className="flex items-center gap-3 px-5 py-4 border-b border-border/60 bg-muted/20">
                <MagnifyingGlassIcon className="w-5 h-5 text-primary shrink-0" />
                <input
                  type="text"
                  autoFocus
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Type to search pages, modules, or tools..."
                  className="flex-1 bg-transparent text-sm font-bold text-foreground placeholder:text-muted-foreground outline-none"
                />
                <button
                  onClick={() => setSearchOpen(false)}
                  className="p-1 rounded-xl hover:bg-muted text-muted-foreground hover:text-foreground"
                >
                  <XMarkIcon className="w-5 h-5" />
                </button>
              </div>

              {/* Filtered Search Results List */}
              <div className="max-h-[60vh] overflow-y-auto px-4 py-3 space-y-1 custom-scrollbar">
                {filteredItems.length === 0 ? (
                  <div className="p-8 text-center text-muted-foreground text-xs font-semibold">
                    No matching workspace found for &quot;{query}&quot;
                  </div>
                ) : (
                  filteredItems.map((item) => {
                    const Icon = item.icon;
                    return (
                      <button
                        key={item.href}
                        onClick={() => handleSelect(item.href)}
                        className="w-full flex items-center justify-between p-3 rounded-2xl border border-transparent hover:border-primary/30 hover:bg-primary/5 text-left active:scale-[0.99] transition-all group"
                      >
                        <div className="flex items-center gap-3.5 min-w-0">
                          <div className="w-9 h-9 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0 group-hover:bg-primary group-hover:text-white transition-colors shadow-sm">
                            <Icon className="w-4.5 h-4.5" />
                          </div>
                          <div className="min-w-0">
                            <span className="text-xs font-black text-foreground truncate block">
                              {item.name}
                            </span>
                            <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider block mt-0.5">
                              {item.category}
                            </span>
                          </div>
                        </div>
                        <ArrowRightIcon className="w-4 h-4 text-muted-foreground group-hover:text-primary group-hover:translate-x-1 transition-all shrink-0" />
                      </button>
                    );
                  })
                )}
              </div>

              {/* Footer Help */}
              <div className="px-5 py-2.5 border-t border-border/60 bg-muted/30 flex items-center justify-between text-[10px] font-bold text-muted-foreground">
                <span>Press <kbd className="px-1 py-0.5 bg-background border border-border rounded">ESC</kbd> to exit</span>
                <span>Rillcod Command Palette</span>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
}
