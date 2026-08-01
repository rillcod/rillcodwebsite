// @refresh reset
'use client';

import React, { useEffect } from 'react';
import Link from 'next/link';
import { useAuth } from '@/contexts/auth-context';
import {
  XMarkIcon, ArrowRightOnRectangleIcon, UserIcon,
  BellIcon, DocumentTextIcon, QuestionMarkCircleIcon,
  CogIcon, BuildingOfficeIcon, ShieldCheckIcon, AcademicCapIcon,
  BookOpenIcon, ClipboardDocumentCheckIcon, TrophyIcon, CreditCardIcon
} from '@/lib/icons';
import ThemeToggle from '@/components/ThemeToggle';
import ViewAsSwitcher from '@/components/layout/ViewAsSwitcher';
import { motion, AnimatePresence } from 'framer-motion';

interface MobileNavSheetProps {
  isOpen: boolean;
  onClose: () => void;
  navEntries: Array<{ name: string; href: string; icon: any } | { divider: true; label: string }>;
}

export default function MobileNavSheet({ isOpen, onClose, navEntries }: MobileNavSheetProps) {
  const { profile, signOut, signingOut } = useAuth();

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  if (!isOpen || !profile) return null;

  const linksOnly = navEntries.filter((e): e is { name: string; href: string; icon: any } => !('divider' in e));

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[100] md:hidden">
        {/* Backdrop */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="absolute inset-0 bg-background/80 backdrop-blur-md"
          aria-hidden="true"
        />

        {/* Spring Bottom Sheet */}
        <motion.div
          initial={{ y: '100%' }}
          animate={{ y: 0 }}
          exit={{ y: '100%' }}
          transition={{ type: 'spring', damping: 28, stiffness: 300 }}
          className="absolute bottom-0 left-0 right-0 max-h-[85vh] bg-card/95 backdrop-blur-2xl border-t border-border/80 rounded-t-[2.5rem] shadow-2xl flex flex-col overflow-hidden pb-[max(1rem,env(safe-area-inset-bottom))]"
        >
          {/* Drag Handle */}
          <div className="pt-3 pb-2 flex justify-center cursor-grab active:cursor-grabbing" onClick={onClose}>
            <div className="w-12 h-1.5 bg-muted-foreground/30 rounded-full" />
          </div>

          {/* Header */}
          <div className="px-6 py-3 border-b border-border/60 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-primary to-indigo-600 text-white flex items-center justify-center font-black shadow-md shadow-primary/20 text-sm">
                {profile.full_name?.charAt(0) ?? 'U'}
              </div>
              <div className="flex flex-col min-w-0">
                <span className="text-sm font-black text-foreground truncate max-w-[180px]">
                  {profile.full_name}
                </span>
                <span className="bg-primary/10 border border-primary/20 text-primary text-[8px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full inline-block mt-0.5 w-fit">
                  {profile.role}
                </span>
              </div>
            </div>
            <button
              onClick={onClose}
              aria-label="Close sheet"
              className="p-2 rounded-xl bg-muted/60 text-muted-foreground hover:text-foreground active:scale-95 transition-all"
            >
              <XMarkIcon className="w-5 h-5" />
            </button>
          </div>

          {/* Role simulation switcher (Staff only) */}
          {(profile.role === 'admin' || profile.role === 'teacher') && (
            <div className="px-6 py-2 border-b border-border/60 bg-muted/30">
              <ViewAsSwitcher />
            </div>
          )}

          {/* Nav Grid */}
          <div className="flex-1 overflow-y-auto px-6 py-4 space-y-2 custom-scrollbar">
            <p className="text-[9px] font-black text-muted-foreground uppercase tracking-[0.25em] mb-2">
              Quick Shortcuts
            </p>
            <div className="grid grid-cols-2 gap-2.5">
              {linksOnly.map(({ name, href, icon: Icon }) => (
                <Link
                  key={name}
                  href={href}
                  onClick={onClose}
                  className="flex items-center gap-3 p-3 rounded-2xl border border-border/60 bg-background/50 hover:bg-primary/10 hover:border-primary/30 active:scale-95 transition-all shadow-sm group"
                >
                  <div className="w-8 h-8 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0 group-hover:bg-primary group-hover:text-white transition-all">
                    <Icon className="w-4 h-4" />
                  </div>
                  <span className="text-xs font-bold text-foreground truncate">{name}</span>
                </Link>
              ))}
            </div>
          </div>

          {/* Footer Controls */}
          <div className="px-6 pt-3 pb-2 border-t border-border/60 bg-background/50 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <ThemeToggle />
              <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Appearance</span>
            </div>
            <button
              onClick={() => {
                onClose();
                void signOut();
              }}
              disabled={signingOut}
              className="flex items-center gap-2 px-4 py-2 bg-rose-500/10 border border-rose-500/20 text-rose-600 dark:text-rose-400 font-black text-xs uppercase tracking-wider rounded-xl hover:bg-rose-500 hover:text-white active:scale-95 transition-all disabled:opacity-50"
            >
              <ArrowRightOnRectangleIcon className="w-4 h-4" />
              <span>{signingOut ? 'Signing out...' : 'Sign out'}</span>
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
