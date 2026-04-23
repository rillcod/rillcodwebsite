'use client';

import Link from 'next/link';
import type { ComponentType } from 'react';
import { useAuth } from '@/contexts/auth-context';
import {
  ArrowLeftIcon,
  Cog6ToothIcon,
  ChartBarIcon,
  ClipboardDocumentListIcon,
  ShieldExclamationIcon,
  RectangleStackIcon,
  BoltIcon,
} from '@/lib/icons';

type SettingsCard = {
  title: string;
  description: string;
  href: string;
  cta: string;
  roles: string;
  icon: ComponentType<{ className?: string }>;
};

const SETTINGS_CARDS: SettingsCard[] = [
  {
    title: 'Operations control center',
    description: 'Manage calendar, approvals, permissions, assessment, promotion, alerts, communication, integrity, and PWA behavior.',
    href: '/dashboard/progression/operations',
    cta: 'Open operations',
    roles: 'Admin, Teacher (School read-only)',
    icon: BoltIcon,
  },
  {
    title: 'Progression policies',
    description: 'Set delivery mode, weekly frequency, mastery mode, and track priority per program.',
    href: '/dashboard/progression/policies',
    cta: 'Open policies',
    roles: 'Admin, Teacher',
    icon: Cog6ToothIcon,
  },
  {
    title: 'Project seed registry',
    description: 'Create, edit, activate/deactivate, or delete seeded project rows used in progression generation.',
    href: '/dashboard/progression/project-registry',
    cta: 'Open registry',
    roles: 'Admin, Teacher, School',
    icon: RectangleStackIcon,
  },
  {
    title: 'Audit log',
    description: 'Review lock overrides, week edits while locked, and term status changes with before/after state.',
    href: '/dashboard/progression/audit',
    cta: 'Open audit',
    roles: 'Admin, Teacher, School',
    icon: ClipboardDocumentListIcon,
  },
  {
    title: 'Marker integrity',
    description: 'Monitor duplicate markers and cross-link marker health between assignments and flashcard decks.',
    href: '/dashboard/progression/marker-integrity',
    cta: 'Open integrity',
    roles: 'Admin, Teacher, School',
    icon: ShieldExclamationIcon,
  },
  {
    title: 'Analytics',
    description: 'View completion trends, weak-topic heatmaps, class breakdown, and student-level performance.',
    href: '/dashboard/progression/analytics',
    cta: 'Open analytics',
    roles: 'Admin, Teacher',
    icon: ChartBarIcon,
  },
  {
    title: 'QA spine catalog manager',
    description: 'Read-only visibility for active catalog version, lane counts, and last seed timestamp.',
    href: '/dashboard/progression/qa-spine-catalog',
    cta: 'Open catalog manager',
    roles: 'Admin, Teacher',
    icon: RectangleStackIcon,
  },
  {
    title: 'Communication safety monitor',
    description: 'Watch abuse events, open reports, and escalation pressure for student/parent messaging safety.',
    href: '/dashboard/progression/communication-safety',
    cta: 'Open safety monitor',
    roles: 'Admin, Teacher, School',
    icon: ShieldExclamationIcon,
  },
  {
    title: 'Communication reports queue',
    description: 'Review conversation reports and mark moderation lifecycle from open to closed.',
    href: '/dashboard/progression/communication-reports',
    cta: 'Open reports queue',
    roles: 'Admin, Teacher, School',
    icon: ClipboardDocumentListIcon,
  },
];

export default function ProgressionSettingsHomePage() {
  const { profile, loading } = useAuth();
  const canView = ['admin', 'teacher', 'school'].includes(profile?.role ?? '');

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="w-10 h-10 border-4 border-violet-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!canView) return <div className="p-6 text-sm text-muted-foreground">Staff access required.</div>;

  return (
    <div className="max-w-6xl mx-auto p-4 sm:p-6 space-y-4">
      <div className="bg-card border border-border rounded-2xl p-5">
        <Link
          href="/dashboard/progression"
          className="inline-flex items-center gap-2 text-xs font-bold text-muted-foreground hover:text-foreground"
        >
          <ArrowLeftIcon className="w-4 h-4" />
          Back to progression
        </Link>
        <h1 className="text-xl font-black text-card-foreground mt-3">LMS Settings Home</h1>
        <p className="text-sm text-muted-foreground mt-1">
          One place to manage progression rules, seed content, audit transparency, and data integrity checks.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {SETTINGS_CARDS.map((card) => {
          const Icon = card.icon;
          return (
            <Link
              key={card.href}
              href={card.href}
              className="rounded-2xl border border-border bg-card p-4 hover:bg-muted/20 transition-colors"
            >
              <div className="w-9 h-9 rounded-lg border border-violet-500/30 bg-violet-500/10 flex items-center justify-center">
                <Icon className="w-5 h-5 text-violet-300" />
              </div>
              <p className="text-sm font-black text-foreground mt-3">{card.title}</p>
              <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{card.description}</p>
              <p className="text-[10px] text-muted-foreground mt-2">Access: {card.roles}</p>
              <p className="text-[11px] font-bold text-cyan-300 mt-3">{card.cta}</p>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
