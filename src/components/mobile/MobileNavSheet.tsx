// @refresh reset
'use client';

import React, { useEffect, useMemo, useState, useCallback } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/contexts/auth-context';
import {
  XMarkIcon,
  ArrowRightOnRectangleIcon,
  MagnifyingGlassIcon,
  ChevronDownIcon,
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

function buildGroups(
  navEntries: MobileNavSheetProps['navEntries'],
): NavGroup[] {
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

/** Small sections stay open; large ones collapse unless they contain the active route. */
function defaultExpanded(groups: NavGroup[], pathname: string): Record<string, boolean> {
  const activeTitle = groups.find((g) =>
    g.items.some((item) => isNavActive(pathname, item.href)),
  )?.title;

  const next: Record<string, boolean> = {};
  for (let i = 0; i < groups.length; i++) {
    const group = groups[i];
    const isActiveSection = group.title === activeTitle;
    const isCompact = group.items.length <= 2;
    next[group.title] =
      isActiveSection || isCompact || (i === 0 && !activeTitle);
  }
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

  const totalMatches = filteredGroups.reduce((sum, g) => sum + g.items.length, 0);

  const toggleSection = (title: string) => {
    setExpanded((prev) => ({ ...prev, [title]: !prev[title] }));
  };

  const expandAll = () => {
    const all: Record<string, boolean> = {};
    groups.forEach((g) => {
      all[g.title] = true;
    });
    setExpanded(all);
  };

  const collapseAll = () => {
    const activeTitle = groups.find((g) =>
      g.items.some((item) => isNavActive(pathname, item.href)),
    )?.title;
    const next: Record<string, boolean> = {};
    groups.forEach((g) => {
      next[g.title] = g.title === activeTitle || g.items.length <= 2;
    });
    setExpanded(next);
  };

  if (!profile) return null;

  const isSearching = normalizedQuery.length > 0;

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[100] md:hidden">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-background/80 backdrop-blur-md"
            aria-hidden="true"
          />

          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 28, stiffness: 300 }}
            drag="y"
            dragConstraints={{ top: 0 }}
            dragElastic={0.2}
            onDragEnd={(_, info) => {
              if (info.offset.y > 100 || info.velocity.y > 500) onClose();
            }}
            className="absolute bottom-0 left-0 right-0 max-h-[92vh] bg-card/95 backdrop-blur-2xl border-t border-border/80 rounded-t-[2.5rem] shadow-2xl flex flex-col overflow-hidden pb-[max(1rem,env(safe-area-inset-bottom))]"
            role="dialog"
            aria-modal="true"
            aria-label="App menu"
          >
            <div className="pt-3 pb-1 flex justify-center cursor-grab active:cursor-grabbing">
              <div className="w-14 h-1.5 bg-muted-foreground/40 rounded-full" />
            </div>

            {/* Header */}
            <div className="px-5 py-2.5 border-b border-border/60 flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-primary to-indigo-600 text-white flex items-center justify-center font-black shadow-md shadow-primary/20 text-sm shrink-0">
                  {profile.full_name?.charAt(0) ?? 'U'}
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-black text-foreground truncate">{profile.full_name}</p>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <span className="bg-primary/10 border border-primary/20 text-primary text-[8px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full inline-block">
                      {profile.role}
                    </span>
                    <span className="flex items-center gap-1 text-[8px] font-black uppercase tracking-widest text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-full">
                      <span className="relative flex h-1.5 w-1.5 shrink-0">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                        <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500" />
                      </span>
                      Connected
                    </span>
                  </div>
                </div>
              </div>
              <ThemeToggle />
            </div>

            {(profile.role === 'admin' || profile.role === 'teacher') && (
              <div className="px-5 py-2 border-b border-border/60 bg-muted/30">
                <ViewAsSwitcher />
              </div>
            )}

            {/* Search + section controls */}
            <div className="px-5 py-3 border-b border-border/60 space-y-2.5 bg-muted/20">
              <div className="relative">
                <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                <input
                  type="search"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Jump to a page…"
                  aria-label="Search menu"
                  className="w-full min-h-11 pl-9 pr-9 rounded-xl border border-border bg-background text-sm font-semibold text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/50"
                />
                {search && (
                  <button
                    type="button"
                    onClick={() => setSearch('')}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-lg text-muted-foreground hover:bg-muted"
                    aria-label="Clear search"
                  >
                    <XMarkIcon className="w-4 h-4" />
                  </button>
                )}
              </div>
              {!isSearching && groups.length > 1 && (
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={expandAll}
                    className="flex-1 min-h-9 rounded-lg border border-border bg-background text-[10px] font-black uppercase tracking-wider text-muted-foreground hover:text-foreground"
                  >
                    Expand all
                  </button>
                  <button
                    type="button"
                    onClick={collapseAll}
                    className="flex-1 min-h-9 rounded-lg border border-border bg-background text-[10px] font-black uppercase tracking-wider text-muted-foreground hover:text-foreground"
                  >
                    Collapse
                  </button>
                </div>
              )}
              {isSearching && (
                <p className="text-[10px] font-bold text-muted-foreground">
                  {totalMatches} match{totalMatches !== 1 ? 'es' : ''}
                </p>
              )}
            </div>

            {/* Nav sections */}
            <div className="flex-1 overflow-y-auto px-5 py-3 space-y-2 custom-scrollbar overscroll-contain">
              {filteredGroups.length === 0 ? (
                <div className="py-12 text-center text-sm text-muted-foreground">
                  No pages match &ldquo;{search}&rdquo;
                </div>
              ) : (
                filteredGroups.map((group) => {
                  const isOpenSection = isSearching || expanded[group.title] !== false;
                  const activeInSection = group.items.some((item) =>
                    isNavActive(pathname, item.href),
                  );
                  const canCollapse = !isSearching && group.items.length > 2;

                  return (
                    <section
                      key={group.title}
                      className="rounded-2xl border border-border/70 bg-background/50 overflow-hidden"
                    >
                      {canCollapse ? (
                        <button
                          type="button"
                          onClick={() => toggleSection(group.title)}
                          aria-expanded={isOpenSection}
                          className={`w-full flex items-center gap-2 px-3.5 py-3 min-h-11 text-left touch-active-scale ${
                            activeInSection ? 'bg-primary/5' : 'hover:bg-muted/40'
                          }`}
                        >
                          <span className="text-[9px] font-black text-brand-red-accent uppercase tracking-[0.2em] flex-1 truncate">
                            {group.title}
                          </span>
                          <span className="text-[10px] font-bold tabular-nums text-muted-foreground bg-muted/60 px-2 py-0.5 rounded-full">
                            {group.items.length}
                          </span>
                          <ChevronDownIcon
                            className={`w-4 h-4 text-muted-foreground transition-transform duration-200 ${
                              isOpenSection ? 'rotate-180' : ''
                            }`}
                          />
                        </button>
                      ) : (
                        <div className="px-3.5 py-2.5 border-b border-border/50">
                          <span className="text-[9px] font-black text-brand-red-accent uppercase tracking-[0.2em]">
                            {group.title}
                          </span>
                        </div>
                      )}

                      <AnimatePresence initial={false}>
                        {isOpenSection && (
                          <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ duration: 0.2 }}
                            className="overflow-hidden"
                          >
                            <div className="p-2 grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                              {group.items.map(({ name, href, icon: Icon }) => {
                                const active = isNavActive(pathname, href);
                                return (
                                  <Link
                                    key={`${group.title}-${name}-${href}`}
                                    href={href}
                                    onClick={onClose}
                                    className={`flex items-center gap-3 p-3 min-h-11 rounded-xl border transition-all touch-active-scale active:scale-[0.98] ${
                                      active
                                        ? 'border-primary/50 bg-primary/10 shadow-sm ring-1 ring-primary/20'
                                        : 'border-transparent bg-card/80 hover:bg-primary/5 hover:border-primary/25'
                                    }`}
                                  >
                                    <div
                                      className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 transition-all ${
                                        active
                                          ? 'bg-primary text-white shadow-md shadow-primary/30'
                                          : 'bg-primary/10 text-primary'
                                      }`}
                                    >
                                      <Icon className="w-4 h-4" />
                                    </div>
                                    <span
                                      className={`text-xs font-bold truncate ${
                                        active ? 'text-primary' : 'text-foreground'
                                      }`}
                                    >
                                      {name}
                                    </span>
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

            {/* Bottom actions — above floating dock */}
            <div
              className="px-5 pt-3 pb-1 border-t border-border/60 bg-card/95 backdrop-blur-2xl flex items-center gap-3"
              style={{ paddingBottom: 'max(0.5rem, env(safe-area-inset-bottom))' }}
            >
              <button
                type="button"
                onClick={onClose}
                aria-label="Close menu"
                className="flex-1 flex items-center justify-center gap-2 min-h-11 py-3 px-4 bg-primary text-white font-black text-xs uppercase tracking-wider rounded-2xl shadow-lg shadow-primary/30 touch-active-scale active:scale-[0.98]"
              >
                <XMarkIcon className="w-4 h-4" />
                Done
              </button>
              <button
                type="button"
                onClick={() => {
                  onClose();
                  void signOut();
                }}
                disabled={signingOut}
                aria-label="Sign out"
                className="flex min-h-11 min-w-11 items-center justify-center p-3 bg-rose-500/10 border border-rose-500/20 text-rose-600 dark:text-rose-400 rounded-2xl hover:bg-rose-500 hover:text-white touch-active-scale active:scale-[0.98] disabled:opacity-50"
              >
                <ArrowRightOnRectangleIcon className="w-5 h-5" />
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
