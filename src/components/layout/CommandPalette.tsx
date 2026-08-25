// @refresh reset
'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from 'cmdk';
import {
  MagnifyingGlassIcon,
  AcademicCapIcon,
  BookOpenIcon,
  UserGroupIcon,
  CogIcon,
  EnvelopeIcon,
  RocketLaunchIcon,
  CommandLineIcon,
  HomeIcon,
  BuildingOfficeIcon,
  ChartBarIcon,
  BanknotesIcon,
  ClipboardDocumentListIcon,
  TrophyIcon,
  CalendarDaysIcon,
  UserIcon,
} from '@/lib/icons';
import { useAuth } from '@/contexts/auth-context';
import { createClient } from '@/lib/supabase/client';
import { isPlatformStaffRole } from '@/lib/dashboard/route-access';

type PageItem = {
  name: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  keywords?: string;
};

const PAGE_ITEMS_BY_ROLE: Record<string, PageItem[]> = {
  admin: [
    { name: 'Dashboard', href: '/dashboard', icon: HomeIcon },
    { name: 'Partner Schools', href: '/dashboard/schools', icon: BuildingOfficeIcon },
    { name: 'Teachers', href: '/dashboard/teachers', icon: AcademicCapIcon },
    { name: 'Students', href: '/dashboard/students', icon: UserGroupIcon },
    { name: 'Classes', href: '/dashboard/classes', icon: BookOpenIcon },
    { name: 'Write', href: '/dashboard/reports/builder', icon: ClipboardDocumentListIcon, keywords: 'report scores builder' },
    { name: 'Publish', href: '/dashboard/results', icon: TrophyIcon },
    { name: 'Auto-fill', href: '/dashboard/academic/results', icon: ChartBarIcon, keywords: 'prepare results class work' },
    { name: 'Finance', href: '/dashboard/finance', icon: BanknotesIcon },
    { name: 'Office Center', href: '/dashboard/office', icon: BuildingOfficeIcon },
    { name: 'Settings', href: '/dashboard/settings', icon: CogIcon },
  ],
  teacher: [
    { name: 'Dashboard', href: '/dashboard', icon: HomeIcon },
    { name: 'My Classes', href: '/dashboard/classes', icon: BookOpenIcon },
    { name: 'Course outline', href: '/dashboard/academic/build', icon: ClipboardDocumentListIcon },
    { name: 'Students', href: '/dashboard/students', icon: UserGroupIcon },
    { name: 'Lesson Plans', href: '/dashboard/lesson-plans', icon: ClipboardDocumentListIcon },
    { name: 'Grading', href: '/dashboard/grading', icon: TrophyIcon },
    { name: 'Write', href: '/dashboard/reports/builder', icon: ClipboardDocumentListIcon, keywords: 'report scores builder' },
    { name: 'Publish', href: '/dashboard/results', icon: TrophyIcon, keywords: 'progress reports' },
    { name: 'Auto-fill', href: '/dashboard/academic/results', icon: ChartBarIcon, keywords: 'prepare results class work' },
    { name: 'Learner Progress', href: '/dashboard/learner-progress', icon: ChartBarIcon },
    { name: 'Inbox', href: '/dashboard/inbox', icon: EnvelopeIcon },
    { name: 'Settings', href: '/dashboard/settings', icon: CogIcon },
  ],
  school: [
    { name: 'Dashboard', href: '/dashboard', icon: HomeIcon },
    { name: 'Students', href: '/dashboard/students', icon: UserGroupIcon },
    { name: 'Classes', href: '/dashboard/classes', icon: BookOpenIcon },
    { name: 'Publish', href: '/dashboard/results', icon: TrophyIcon },
    { name: 'Finance', href: '/dashboard/finance', icon: BanknotesIcon },
    { name: 'Inbox', href: '/dashboard/inbox', icon: EnvelopeIcon },
    { name: 'My Profile', href: '/dashboard/profile', icon: UserIcon },
  ],
  student: [
    { name: 'Dashboard', href: '/dashboard', icon: HomeIcon },
    { name: 'Learning Center', href: '/dashboard/learning', icon: RocketLaunchIcon },
    { name: 'Assignments', href: '/dashboard/assignments', icon: ClipboardDocumentListIcon },
    { name: 'CBT Exams', href: '/dashboard/cbt', icon: CommandLineIcon },
    { name: 'Timetable', href: '/dashboard/timetable', icon: CalendarDaysIcon },
    { name: 'Grades', href: '/dashboard/grades', icon: ChartBarIcon },
    { name: 'My Report Card', href: '/dashboard/results', icon: TrophyIcon },
    { name: 'My Fees', href: '/dashboard/finance', icon: BanknotesIcon },
    { name: 'Messages', href: '/dashboard/inbox', icon: EnvelopeIcon },
    { name: 'My Profile', href: '/dashboard/profile', icon: UserIcon },
  ],
  parent: [
    { name: 'Dashboard', href: '/dashboard', icon: HomeIcon },
    { name: 'My Children', href: '/dashboard/my-children', icon: UserGroupIcon },
    { name: 'Report Cards', href: '/dashboard/parent-results', icon: TrophyIcon },
    { name: 'Attendance', href: '/dashboard/parent-attendance', icon: ClipboardDocumentListIcon },
    { name: 'Invoices & Payments', href: '/dashboard/parent-invoices', icon: BanknotesIcon },
    { name: 'Inbox', href: '/dashboard/inbox', icon: EnvelopeIcon },
    { name: 'My Profile', href: '/dashboard/profile', icon: UserIcon },
  ],
};

const itemClassName =
  'flex min-h-12 items-center gap-3 px-3 py-2.5 rounded-xl cursor-pointer transition-colors data-[selected=true]:bg-primary/10 data-[selected=true]:text-primary';

export default function CommandPalette() {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState('');
  const [results, setResults] = React.useState<{ classes: any[]; lessons: any[]; students: any[] }>({
    classes: [],
    lessons: [],
    students: [],
  });
  const router = useRouter();
  const { profile } = useAuth();
  const db = React.useMemo(() => createClient(), []);
  const staff = isPlatformStaffRole(profile?.role);
  const canRosterSearch = staff || profile?.role === 'school';
  const pageItems = PAGE_ITEMS_BY_ROLE[profile?.role ?? ''] ?? PAGE_ITEMS_BY_ROLE.student;

  React.useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() === 'k' && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        setOpen((current) => !current);
      }
    };
    const onOpen = () => setOpen(true);

    document.addEventListener('keydown', onKeyDown);
    window.addEventListener('rillcod:open-command-palette', onOpen);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('rillcod:open-command-palette', onOpen);
    };
  }, []);

  React.useEffect(() => {
    if (!query || query.length < 2 || !profile) {
      setResults({ classes: [], lessons: [], students: [] });
      return;
    }

    const search = async () => {
      const canSearchLessons = staff || profile.role === 'student';
      const lessonsQ = canSearchLessons
        ? db.from('lessons').select('id, title').ilike('title', `%${query}%`).limit(3)
        : Promise.resolve({ data: [] as any[] });
      const [classesResult, lessonsResult, studentsResult] = await Promise.all([
        canRosterSearch
          ? db.from('classes').select('id, name').ilike('name', `%${query}%`).limit(3)
          : Promise.resolve({ data: [] as any[] }),
        lessonsQ,
        canRosterSearch
          ? db.from('students').select('id, full_name').ilike('full_name', `%${query}%`).limit(3)
          : Promise.resolve({ data: [] as any[] }),
      ]);

      setResults({
        classes: (classesResult as { data?: any[] }).data || [],
        lessons: lessonsResult.data || [],
        students: (studentsResult as { data?: any[] }).data || [],
      });
    };

    const timer = setTimeout(search, 300);
    return () => clearTimeout(timer);
  }, [query, profile, db, staff, canRosterSearch]);

  const handleOpenChange = (nextOpen: boolean) => {
    setOpen(nextOpen);
    if (!nextOpen) setQuery('');
  };

  const goTo = (href: string) => {
    setOpen(false);
    setQuery('');
    router.push(href);
  };

  if (!profile) return null;

  return (
    <CommandDialog open={open} onOpenChange={handleOpenChange} label="Search dashboard">
      <div className="overflow-hidden bg-card border border-border rounded-t-3xl sm:rounded-2xl shadow-2xl">
        <div className="flex items-center gap-3 border-b border-border px-4 sm:px-5 py-3">
          <MagnifyingGlassIcon className="w-5 h-5 text-primary shrink-0" />
          <CommandInput
            value={query}
            placeholder={
              canRosterSearch
                ? 'Search pages, lessons, classes, or students'
                : profile.role === 'student'
                  ? 'Search pages or lessons'
                  : 'Search pages'
            }
            className="flex-1 min-w-0 bg-transparent border-none text-foreground placeholder:text-muted-foreground text-base font-medium h-11 outline-none"
            onValueChange={setQuery}
          />
          <kbd className="hidden sm:inline-flex px-2 py-1 bg-muted border border-border rounded-md text-[10px] font-semibold text-muted-foreground">
            Esc
          </kbd>
        </div>

        <CommandList className="max-h-[68dvh] overflow-y-auto p-2 sm:p-3 custom-scrollbar">
          <CommandEmpty className="py-14 text-center">
            <MagnifyingGlassIcon className="w-8 h-8 text-muted-foreground/30 mx-auto mb-3" />
            <p className="text-sm font-semibold text-muted-foreground">No results found</p>
          </CommandEmpty>

          <CommandGroup heading={<span className="px-3 py-2 block text-[11px] font-semibold text-muted-foreground">Pages</span>}>
            {pageItems.map(({ name, href, icon: Icon, keywords }) => (
              <CommandItem
                key={href}
                value={`${name} ${keywords ?? ''}`}
                onSelect={() => goTo(href)}
                className={itemClassName}
              >
                <div className="w-9 h-9 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
                  <Icon className="w-4.5 h-4.5" />
                </div>
                <span className="text-sm font-semibold">{name}</span>
              </CommandItem>
            ))}
          </CommandGroup>

          {results.lessons.length > 0 && (
            <CommandGroup heading={<span className="px-3 py-2 block text-[11px] font-semibold text-muted-foreground">Lessons</span>}>
              {results.lessons.map((lesson) => (
                <CommandItem key={lesson.id} value={lesson.title} onSelect={() => goTo(`/dashboard/lessons/${lesson.id}`)} className={itemClassName}>
                  <div className="w-9 h-9 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
                    <BookOpenIcon className="w-4.5 h-4.5" />
                  </div>
                  <span className="text-sm font-semibold truncate">{lesson.title}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          )}

          {canRosterSearch && results.classes.length > 0 && (
            <CommandGroup heading={<span className="px-3 py-2 block text-[11px] font-semibold text-muted-foreground">Classes</span>}>
              {results.classes.map((classroom) => (
                <CommandItem key={classroom.id} value={classroom.name} onSelect={() => goTo(`/dashboard/classes/${classroom.id}`)} className={itemClassName}>
                  <div className="w-9 h-9 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
                    <AcademicCapIcon className="w-4.5 h-4.5" />
                  </div>
                  <span className="text-sm font-semibold truncate">{classroom.name}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          )}

          {canRosterSearch && results.students.length > 0 && (
            <CommandGroup heading={<span className="px-3 py-2 block text-[11px] font-semibold text-muted-foreground">Students</span>}>
              {results.students.map((student) => (
                <CommandItem key={student.id} value={student.full_name} onSelect={() => goTo(`/dashboard/students/${student.id}`)} className={itemClassName}>
                  <div className="w-9 h-9 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
                    <UserGroupIcon className="w-4.5 h-4.5" />
                  </div>
                  <span className="text-sm font-semibold truncate">{student.full_name}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          )}

          <CommandSeparator className="my-2 h-px bg-border" />

          <CommandGroup heading={<span className="px-3 py-2 block text-[11px] font-semibold text-muted-foreground">Quick actions</span>}>
            <CommandItem onSelect={() => goTo('/dashboard/inbox')} className={itemClassName}>
              <div className="w-9 h-9 rounded-lg bg-muted text-muted-foreground flex items-center justify-center shrink-0">
                <EnvelopeIcon className="w-4.5 h-4.5" />
              </div>
              <span className="text-sm font-semibold">Open inbox</span>
            </CommandItem>
            <CommandItem
              onSelect={() => goTo(
                profile?.role === 'student' || profile?.role === 'parent'
                  ? '/dashboard/profile'
                  : '/dashboard/settings'
              )}
              className={itemClassName}
            >
              <div className="w-9 h-9 rounded-lg bg-muted text-muted-foreground flex items-center justify-center shrink-0">
                <CogIcon className="w-4.5 h-4.5" />
              </div>
              <span className="text-sm font-semibold">
                {profile?.role === 'student' || profile?.role === 'parent' ? 'My Profile' : 'Account settings'}
              </span>
            </CommandItem>
          </CommandGroup>
        </CommandList>

        <div className="hidden sm:flex items-center justify-between border-t border-border bg-muted/30 px-5 py-2.5 text-[10px] font-medium text-muted-foreground">
          <span>Use arrow keys to move</span>
          <span>Press Enter to open</span>
        </div>
      </div>
    </CommandDialog>
  );
}
