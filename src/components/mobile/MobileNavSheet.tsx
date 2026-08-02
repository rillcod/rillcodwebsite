// @refresh reset
'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
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
import { motion, AnimatePresence } from 'framer-motion';

interface MobileNavSheetProps {
  isOpen: boolean;
  onClose: () => void;
  navEntries: Array<{ name: string; href: string; icon: any } | { divider: true; label: string }>;
}

type NavGroup = {
  title: string;
  items: Array<{ name: string; href: string; icon: any }>;
};

function isNavActive(pathname: string, href: string) {
  const targetPath = href.split('?')[0].replace(/\/$/, '') || '/';
  const currentPath = pathname.replace(/\/$/, '') || '/';
  if (targetPath === '/dashboard') return currentPath === targetPath;
  return currentPath === targetPath || currentPath.startsWith(`${targetPath}/`);
}

function buildGroups(navEntries: MobileNavSheetProps['navEntries']): NavGroup[] {
  const groups: NavGroup[] = [];
  let current: NavGroup = { title: 'Main', items: [] };

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
    next[group.title] = group.title === activeTitle || group.items.length <= 2 || (index === 0 && !activeTitle);
  });
  return next;
}

export default function MobileNavSheet({ isOpen, onClose, navEntries }: MobileNavSheetProps) {
  const pathname = usePathname();
  const { profile, signOut, signingOut } = useAuth();
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const groups = useMemo(() => buildGroups(navEntries), [navEntries]);

  const resetSheet = useCallback(() => {
    setSearch('');
    setExpanded(defaultExpanded(groups, pathname));
  }, [groups, pathname]);

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
      resetSheet();
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen, resetSheet]);

  const normalizedQuery = search.trim().toLowerCase();
  const isSearching = normalizedQuery.length > 0;
  const filteredGroups = useMemo(() => {
    if (!normalizedQuery) return groups;
    return groups
      .map((group) => ({
        ...group,
        items: group.items.filter(
          (item) =>
            item.name.toLowerCase().includes(normalizedQuery) ||
            item.href.toLowerCase().includes(normalizedQuery),
        ),
      }))
      .filter((group) => group.items.length > 0);
  }, [groups, normalizedQuery]);
  const totalMatches = filteredGroups.reduce((sum, group) => sum + group.items.length, 0);

  if (!profile) return null;

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[100] md:hidden">
          <motion.button
            type="button"
            aria-label="Close app menu"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 w-full h-full bg-black/35 dark:bg-black/60 backdrop-blur-[2px]"
          />

          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 320 }}
            drag="y"
            dragConstraints={{ top: 0 }}
            dragElastic={0.16}
            onDragEnd={(_, info) => {
              if (info.offset.y > 100 || info.velocity.y > 500) onClose();
            }}
            className="absolute bottom-0 left-0 right-0 max-h-[90dvh] bg-card border-t border-border rounded-t-[1.75rem] shadow-2xl flex flex-col overflow-hidden pb-[env(safe-area-inset-bottom)]"
            role="dialog"
            aria-modal="true"
            aria-label="App menu"
          >
            <div className="pt-2.5 pb-1 flex justify-center cursor-grab active:cursor-grabbing">
              <div className="w-10 h-1 bg-muted-foreground/30 rounded-full" />
            </div>

            <div className="px-4 py-2.5 border-b border-border flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-primary text-white flex items-center justify-center font-bold text-sm shrink-0">
                {profile.full_name?.charAt(0) ?? 'U'}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold text-foreground truncate">{profile.full_name}</p>
                <p className="text-xs text-muted-foreground capitalize">{profile.role} account</p>
              </div>
              <ThemeToggle />
              <button
                type="button"
                onClick={onClose}
                className="flex min-h-11 min-w-11 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
                aria-label="Close menu"
              >
                <XMarkIcon className="w-5 h-5" />
              </button>
            </div>

            {(profile.role === 'admin' || profile.role === 'teacher') && (
              <div className="px-4 py-2 border-b border-border bg-muted/30">
                <ViewAsSwitcher />
              </div>
            )}

            <div className="px-4 py-3 border-b border-border bg-card">
              <div className="relative">
                <MagnifyingGlassIcon className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                <input
                  type="search"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search pages"
                  aria-label="Search app pages"
                  className="w-full min-h-12 pl-10 pr-10 rounded-xl border border-border bg-muted/40 text-base font-medium text-foreground placeholder:text-muted-foreground focus:bg-background focus:border-primary"
                />
                {search && (
                  <button
                    type="button"
                    onClick={() => setSearch('')}
                    className="absolute right-1.5 top-1/2 -translate-y-1/2 flex min-h-9 min-w-9 items-center justify-center rounded-full text-muted-foreground hover:bg-muted"
                    aria-label="Clear search"
                  >
                    <XMarkIcon className="w-4 h-4" />
                  </button>
                )}
              </div>
              {isSearching && (
                <p className="mt-2 px-1 text-xs text-muted-foreground">
                  {totalMatches} {totalMatches === 1 ? 'result' : 'results'}
                </p>
              )}
            </div>

            <div className="flex-1 overflow-y-auto px-3 py-3 space-y-4 custom-scrollbar overscroll-contain">
              {filteredGroups.length === 0 ? (
                <div className="py-12 text-center">
                  <MagnifyingGlassIcon className="w-8 h-8 text-muted-foreground/30 mx-auto mb-3" />
                  <p className="text-sm font-semibold text-muted-foreground">No pages found</p>
                </div>
              ) : (
                filteredGroups.map((group) => {
                  const sectionOpen = isSearching || expanded[group.title] !== false;
                  const activeInSection = group.items.some((item) => isNavActive(pathname, item.href));
                  const canCollapse = !isSearching && group.items.length > 2;

                  return (
                    <section key={group.title}>
                      {canCollapse ? (
                        <button
                          type="button"
                          onClick={() => setExpanded((current) => ({ ...current, [group.title]: !current[group.title] }))}
                          aria-expanded={sectionOpen}
                          className="w-full flex min-h-10 items-center gap-2 px-2 text-left"
                        >
                          <span className={`text-xs font-semibold flex-1 truncate ${activeInSection ? 'text-primary' : 'text-muted-foreground'}`}>
                            {group.title}
                          </span>
                          <span className="text-xs tabular-nums text-muted-foreground">{group.items.length}</span>
                          <ChevronDownIcon className={`w-4 h-4 text-muted-foreground transition-transform ${sectionOpen ? 'rotate-180' : ''}`} />
                        </button>
                      ) : (
                        <div className="px-2 pb-1.5 text-xs font-semibold text-muted-foreground">{group.title}</div>
                      )}

                      <AnimatePresence initial={false}>
                        {sectionOpen && (
                          <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ duration: 0.18 }}
                            className="overflow-hidden"
                          >
                            <div className="space-y-1">
                              {group.items.map(({ name, href, icon: Icon }) => {
                                const active = isNavActive(pathname, href);
                                return (
                                  <Link
                                    key={`${group.title}-${name}-${href}`}
                                    href={href}
                                    onClick={onClose}
                                    aria-current={active ? 'page' : undefined}
                                    className={`flex min-h-12 items-center gap-3 rounded-xl px-3 py-2 transition-colors active:scale-[0.99] ${
                                      active ? 'bg-primary/10 text-primary' : 'text-foreground hover:bg-muted'
                                    }`}
                                  >
                                    <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${active ? 'bg-primary text-white' : 'bg-muted text-muted-foreground'}`}>
                                      <Icon className="w-4.5 h-4.5" />
                                    </div>
                                    <span className="text-sm font-semibold truncate">{name}</span>
                                  </Link>
                                );
                              })}
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </section>
                  );
                })
              )}
            </div>

            <div className="flex items-center gap-2 px-4 py-3 border-t border-border bg-card">
              <Link
                href="/dashboard/settings"
                onClick={onClose}
                className="flex min-h-12 flex-1 items-center justify-center gap-2 rounded-xl bg-muted px-4 text-sm font-semibold text-foreground"
              >
                <UserIcon className="w-4.5 h-4.5" />
                Account
              </Link>
              {profile.role === 'admin' && (
                <Link
                  href="/dashboard/platform-operations"
                  onClick={onClose}
                  className="flex min-h-12 min-w-12 items-center justify-center rounded-xl bg-muted text-foreground"
                  aria-label="Platform Operations"
                  title="Platform Operations"
                >
                  <CogIcon className="w-4.5 h-4.5" />
                </Link>
              )}
              <button
                type="button"
                onClick={() => {
                  onClose();
                  void signOut();
                }}
                disabled={signingOut}
                className="flex min-h-12 flex-1 items-center justify-center gap-2 rounded-xl bg-rose-500/10 px-4 text-sm font-semibold text-rose-600 dark:text-rose-400 disabled:opacity-50"
              >
                <ArrowRightOnRectangleIcon className="w-4.5 h-4.5" />
                {signingOut ? 'Signing out' : 'Sign out'}
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
