// @refresh reset
'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/auth-context';
import {
  XMarkIcon,
  ArrowRightOnRectangleIcon,
  MagnifyingGlassIcon,
  ChevronDownIcon,
  CogIcon,
  UserIcon,
} from '@/lib/icons';
import ThemeToggle from '@/components/ThemeToggle';
import ViewAsSwitcher from '@/components/layout/ViewAsSwitcher';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import MobileBottomSheet from '@/components/mobile/MobileBottomSheet';

interface MobileNavSheetProps {
  isOpen: boolean;
  onClose: () => void;
  navEntries: Array<{ name: string; href: string; icon: any } | { divider: true; label: string }>;
}

type NavGroup = {
  title: string;
  items: Array<{ name: string; href: string; icon: any }>;
};

const ROLE_LABELS: Record<string, string> = {
  admin: 'Administrator',
  teacher: 'Teacher',
  school: 'School',
  student: 'Student',
  parent: 'Parent',
};

function isNavActive(pathname: string, href: string) {
  const targetPath = href.split('?')[0].replace(/\/$/, '') || '/';
  const currentPath = pathname.replace(/\/$/, '') || '/';
  if (targetPath === '/dashboard') return currentPath === targetPath;
  return currentPath === targetPath || currentPath.startsWith(`${targetPath}/`);
}

function buildGroups(navEntries: MobileNavSheetProps['navEntries']): NavGroup[] {
  const groups: NavGroup[] = [];
  let current: NavGroup = { title: 'Menu', items: [] };

  navEntries.forEach((entry) => {
    if ('divider' in entry) {
      if (current.items.length > 0) groups.push(current);
      current = { title: entry.label, items: [] };
    } else {
      current.items.push(entry);
    }
  });

  if (current.items.length > 0) groups.push(current);
  return groups;
}

function defaultExpanded(groups: NavGroup[], pathname: string): Record<string, boolean> {
  const activeTitle = groups.find((group) =>
    group.items.some((item) => isNavActive(pathname, item.href)),
  )?.title;
  const next: Record<string, boolean> = {};

  groups.forEach((group, index) => {
    next[group.title] =
      group.title === activeTitle || group.items.length <= 2 || (index === 0 && !activeTitle);
  });
  return next;
}

export default function MobileNavSheet({ isOpen, onClose, navEntries }: MobileNavSheetProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { profile, signOut, signingOut } = useAuth();
  const reduceMotion = useReducedMotion();
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [keyboardInset, setKeyboardInset] = useState(0);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const groups = useMemo(() => buildGroups(navEntries), [navEntries]);

  const resetSheet = useCallback(() => {
    setSearch('');
    setSelectedCategory('All');
    setExpanded(defaultExpanded(groups, pathname));
  }, [groups, pathname]);

  useEffect(() => {
    if (isOpen) resetSheet();
  }, [isOpen, resetSheet]);

  useEffect(() => {
    if (!isOpen) {
      setKeyboardInset(0);
      return;
    }
    const viewport = window.visualViewport;
    if (!viewport) return;

    const sync = () => {
      const hidden = window.innerHeight - viewport.height - viewport.offsetTop;
      setKeyboardInset(hidden > 80 ? Math.round(hidden) : 0);
    };

    sync();
    viewport.addEventListener('resize', sync);
    viewport.addEventListener('scroll', sync);
    return () => {
      viewport.removeEventListener('resize', sync);
      viewport.removeEventListener('scroll', sync);
    };
  }, [isOpen]);

  const normalizedQuery = search.trim().toLowerCase();
  const isSearching = normalizedQuery.length > 0;
  const filteredGroups = useMemo(() => {
    let result = groups;
    if (selectedCategory !== 'All') {
      result = result.filter((g) => g.title === selectedCategory);
    }
    if (normalizedQuery) {
      result = result
        .map((group) => ({
          ...group,
          items: group.items.filter(
            (item) =>
              item.name.toLowerCase().includes(normalizedQuery) ||
              item.href.toLowerCase().includes(normalizedQuery),
          ),
        }))
        .filter((group) => group.items.length > 0);
    }
    return result;
  }, [groups, selectedCategory, normalizedQuery]);
  const totalMatches = filteredGroups.reduce((sum, group) => sum + group.items.length, 0);
  const firstMatch = filteredGroups[0]?.items[0];
  const compactChrome = isSearching || keyboardInset > 0;
  const roleLabel = ROLE_LABELS[profile?.role ?? ''] ?? profile?.role ?? '';

  const submitSearch = (event: React.FormEvent) => {
    event.preventDefault();
    if (!firstMatch) return;
    searchInputRef.current?.blur();
    onClose();
    router.push(firstMatch.href);
  };

  if (!profile) return null;

  return (
    <MobileBottomSheet
      isOpen={isOpen}
      onClose={onClose}
      label="Navigation menu"
      dismissible={!keyboardInset}
    >
      <div
        className="flex min-h-0 flex-1 flex-col"
        style={
          keyboardInset
            ? {
                maxHeight: `calc(100dvh - ${keyboardInset}px - 1rem)`,
                marginBottom: keyboardInset,
              }
            : undefined
        }
      >
        {/* Identity header — Material 3 sheet header pattern */}
        <div className="flex shrink-0 items-center gap-3 border-b border-border px-4 py-3 bg-card/60">
          <div
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-primary to-indigo-600 text-sm font-black text-white shadow-md shadow-primary/20"
            aria-hidden
          >
            {profile.full_name?.charAt(0) ?? 'U'}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-base font-bold text-foreground">
              {profile.full_name}
            </p>
            <p className="truncate text-xs font-semibold text-muted-foreground">{roleLabel}</p>
          </div>
          <ThemeToggle />
          <button
            type="button"
            onClick={onClose}
            className="flex h-10 w-10 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground active:scale-90 transition-transform"
            aria-label="Close menu"
          >
            <XMarkIcon className="h-5 w-5" />
          </button>
        </div>

        {(profile.role === 'admin' || profile.role === 'teacher') && !compactChrome && (
          <div className="shrink-0 border-b border-border bg-muted/40 px-4 py-2">
            <ViewAsSwitcher />
          </div>
        )}

        {/* Search near the top — standard for iOS Settings / Material navigation */}
        <form onSubmit={submitSearch} className="shrink-0 border-b border-border px-4 py-3 bg-muted/20">
          <div className="relative">
            <MagnifyingGlassIcon className="pointer-events-none absolute start-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              ref={searchInputRef}
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search pages &amp; actions…"
              aria-label="Search pages"
              enterKeyHint="go"
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="none"
              spellCheck={false}
              dir="auto"
              className="min-h-11 w-full rounded-2xl border border-border bg-card pe-10 ps-10 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none shadow-sm"
            />
            {search && (
              <button
                type="button"
                onClick={() => {
                  setSearch('');
                  searchInputRef.current?.focus();
                }}
                className="absolute end-1.5 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground hover:bg-muted"
                aria-label="Clear search"
              >
                <XMarkIcon className="h-4 w-4" />
              </button>
            )}
          </div>

          {/* Quick Category Filter Chips */}
          {!isSearching && groups.length > 2 && (
            <div className="flex items-center gap-1.5 overflow-x-auto pt-2 pb-0.5 no-scrollbar">
              <button
                type="button"
                onClick={() => setSelectedCategory('All')}
                className={`px-3 py-1 rounded-full text-xs font-bold whitespace-nowrap transition-all active:scale-95 ${
                  selectedCategory === 'All'
                    ? 'bg-primary text-white shadow-sm'
                    : 'bg-card border border-border text-muted-foreground hover:text-foreground'
                }`}
              >
                All
              </button>
              {groups.map((g) => (
                <button
                  key={g.title}
                  type="button"
                  onClick={() => setSelectedCategory(g.title)}
                  className={`px-3 py-1 rounded-full text-xs font-bold whitespace-nowrap transition-all active:scale-95 ${
                    selectedCategory === g.title
                      ? 'bg-primary text-white shadow-sm'
                      : 'bg-card border border-border text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {g.title}
                </button>
              ))}
            </div>
          )}

          {isSearching && (
            <p className="mt-2 px-1 text-xs text-muted-foreground" aria-live="polite">
              {totalMatches === 0
                ? 'No results'
                : totalMatches === 1
                  ? '1 result'
                  : `${totalMatches} results`}
              {firstMatch ? ` · Enter opens ${firstMatch.name}` : ''}
            </p>
          )}
        </form>

        <div className="custom-scrollbar flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain px-3 py-3">
          <div className="space-y-5">
            {filteredGroups.length === 0 ? (
              <div className="py-16 text-center">
                <MagnifyingGlassIcon className="mx-auto mb-3 h-8 w-8 text-muted-foreground/30" />
                <p className="text-sm font-semibold text-foreground">No pages found</p>
                <p className="mt-1 text-sm text-muted-foreground">Try a different search</p>
              </div>
            ) : (
              filteredGroups.map((group) => {
                const sectionOpen = isSearching || expanded[group.title] !== false;
                const activeInSection = group.items.some((item) =>
                  isNavActive(pathname, item.href),
                );
                const canCollapse = !isSearching && group.items.length > 2;

                return (
                  <section key={group.title} aria-label={group.title}>
                    {canCollapse ? (
                      <button
                        type="button"
                        onClick={() =>
                          setExpanded((current) => ({
                            ...current,
                            [group.title]: !current[group.title],
                          }))
                        }
                        aria-expanded={sectionOpen}
                        className="mb-1 flex min-h-11 w-full items-center gap-2 px-2 text-start"
                      >
                        <span
                          className={`flex-1 truncate text-xs font-semibold ${
                            activeInSection ? 'text-primary' : 'text-muted-foreground'
                          }`}
                        >
                          {group.title}
                        </span>
                        <span className="tabular-nums text-xs text-muted-foreground">
                          {group.items.length}
                        </span>
                        <ChevronDownIcon
                          className={`h-4 w-4 text-muted-foreground transition-transform ${
                            sectionOpen ? 'rotate-180' : ''
                          }`}
                        />
                      </button>
                    ) : (
                      <div className="mb-1 px-2 text-xs font-semibold text-muted-foreground">
                        {group.title}
                      </div>
                    )}

                    <AnimatePresence initial={false}>
                      {sectionOpen && (
                        <motion.div
                          initial={reduceMotion ? false : { height: 0, opacity: 0 }}
                          animate={{ height: 'auto', opacity: 1 }}
                          exit={reduceMotion ? undefined : { height: 0, opacity: 0 }}
                          transition={{ duration: reduceMotion ? 0 : 0.12 }}
                          className="overflow-hidden"
                        >
                          <ul className="space-y-1">
                            {group.items.map(({ name, href, icon: Icon }) => {
                              const active = isNavActive(pathname, href);
                              return (
                                <li key={`${group.title}-${name}-${href}`}>
                                  <Link
                                    href={href}
                                    onClick={onClose}
                                    aria-current={active ? 'page' : undefined}
                                    className={`flex min-h-12 items-center gap-3 rounded-xl px-3 py-2 active:scale-[0.98] ${
                                      active
                                        ? 'bg-primary/10 text-primary'
                                        : 'text-foreground hover:bg-muted'
                                    }`}
                                  >
                                    <div
                                      className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${
                                        active
                                          ? 'bg-primary text-primary-foreground'
                                          : 'bg-muted text-muted-foreground'
                                      }`}
                                      aria-hidden
                                    >
                                      <Icon className="h-5 w-5" />
                                    </div>
                                    <span className="truncate text-[15px] font-medium">{name}</span>
                                  </Link>
                                </li>
                              );
                            })}
                          </ul>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </section>
                );
              })
            )}
          </div>
        </div>

        {!compactChrome && (
          <div className="flex shrink-0 items-center gap-2 border-t border-border bg-card px-4 py-3">
            <Link
              href="/dashboard/settings"
              onClick={onClose}
              className="flex min-h-12 flex-1 items-center justify-center gap-2 rounded-xl bg-muted px-4 text-sm font-semibold text-foreground"
            >
              <UserIcon className="h-5 w-5" />
              Account
            </Link>
            {profile.role === 'admin' && (
              <Link
                href="/dashboard/platform-operations"
                onClick={onClose}
                className="flex h-12 w-12 items-center justify-center rounded-xl bg-muted text-foreground"
                aria-label="Platform operations"
                title="Platform operations"
              >
                <CogIcon className="h-5 w-5" />
              </Link>
            )}
            <button
              type="button"
              onClick={() => {
                if (
                  !window.confirm(
                    'Sign out of Rillcod Technologies? You will need to log in again.',
                  )
                ) {
                  return;
                }
                onClose();
                void signOut();
              }}
              disabled={signingOut}
              className="flex min-h-12 flex-1 items-center justify-center gap-2 rounded-xl bg-destructive/10 px-4 text-sm font-semibold text-destructive disabled:opacity-50"
            >
              <ArrowRightOnRectangleIcon className="h-5 w-5" />
              {signingOut ? 'Signing out…' : 'Sign out'}
            </button>
          </div>
        )}
      </div>
    </MobileBottomSheet>
  );
}
