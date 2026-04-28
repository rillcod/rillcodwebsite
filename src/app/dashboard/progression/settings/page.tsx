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
  icon: ComponentType<{ className?: string }>;
  allowedRoles: string[];
};

const CATEGORIES = [
  {
    name: 'Academic Governance',
    desc: 'The master protocols for term cycles, promotion criteria, and behavioral rules.',
    cards: [
      {
        title: 'Promotion & Delivery Rules',
        description: 'Define mastery thresholds, compulsory tracks, and delivery frequency across all programs.',
        href: '/dashboard/progression/policies',
        cta: 'Manage Protocols',
        icon: Cog6ToothIcon,
        allowedRoles: ['admin', 'teacher'],
      },
      {
        title: 'Operational Controls',
        description: 'Global toggles for permissions, messaging limits, and platform-wide behavior.',
        href: '/dashboard/progression/operations',
        cta: 'Execute Commands',
        icon: BoltIcon,
        allowedRoles: ['admin', 'teacher', 'school'],
      },
      {
        title: 'Learning System Map',
        description: 'Visualize the architectural hierarchy from Programs to daily Lesson Plans.',
        href: '/dashboard/curriculum/learning-system',
        cta: 'Scan Systems',
        icon: RectangleStackIcon,
        allowedRoles: ['admin', 'teacher'],
      },
    ]
  },
  {
    name: 'Curriculum Core',
    desc: 'Manage the underlying DNA and creative assets that power the automated learning engine.',
    cards: [
      {
        title: 'Syllabus Engine Architecture',
        description: 'Manage the QA spines and master compliance blueprints that drive automated generation.',
        href: '/dashboard/progression/qa-spine-catalog',
        cta: 'Access Engine',
        icon: RectangleStackIcon,
        allowedRoles: ['admin', 'teacher'],
      },
      {
        title: 'Creative Asset Vault',
        description: 'The master repository of project blueprints and learning seeds for high-fidelity delivery.',
        href: '/dashboard/progression/project-registry',
        cta: 'Open Vault',
        icon: RectangleStackIcon,
        allowedRoles: ['admin', 'teacher'],
      },
    ]
  },
  {
    name: 'Intelligence & Safety',
    desc: 'Monitor platform health, institutional safety, and academic integrity metrics.',
    cards: [
      {
        title: 'Academic Analytics',
        description: 'Deep-dive into performance heatmaps and completion trends across schools.',
        href: '/dashboard/progression/analytics',
        cta: 'View Intelligence',
        icon: ChartBarIcon,
        allowedRoles: ['admin', 'teacher'],
      },
      {
        title: 'Investigation Desk',
        description: 'Advanced moderation and safety reporting hub for institutional security.',
        href: '/dashboard/progression/communication-reports',
        cta: 'Launch Desk',
        icon: ShieldExclamationIcon,
        allowedRoles: ['admin', 'teacher', 'school'],
      },
      {
        title: 'Data Integrity Lab',
        description: 'Monitor structural health, audit overrides, and reconcile student mappings.',
        href: '/dashboard/progression/marker-integrity',
        cta: 'Check Vitals',
        icon: ShieldExclamationIcon,
        allowedRoles: ['admin', 'teacher', 'school'],
      },
    ]
  }
];

export default function ProgressionSettingsHomePage() {
  const { profile, loading } = useAuth();
  const canView = ['admin', 'teacher', 'school'].includes(profile?.role ?? '');

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!canView) return <div className="p-20 text-center text-muted-foreground font-bold">Unauthorized Governance Access</div>;

  return (
    <div className="max-w-7xl mx-auto p-4 sm:p-8 space-y-16 pb-24">
      {/* Hero Section */}
      <div className="relative overflow-hidden bg-card border border-border rounded-[3rem] p-10 sm:p-14 shadow-2xl">
        <div className="absolute top-0 right-0 w-[40rem] h-[40rem] bg-primary/10 rounded-full blur-[120px] -mr-64 -mt-64 pointer-events-none" />
        <div className="absolute bottom-0 left-0 w-[30rem] h-[30rem] bg-violet-600/10 rounded-full blur-[120px] -ml-48 -mb-48 pointer-events-none" />
        
        <Link
          href="/dashboard/progression"
          className="inline-flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground hover:text-primary mb-10 transition-colors"
        >
          <ArrowLeftIcon className="w-4 h-4" />
          System Overview
        </Link>
        <div className="relative z-10 space-y-4">
          <h1 className="text-4xl sm:text-5xl font-black text-card-foreground tracking-tighter">Governance Controls</h1>
          <p className="text-lg text-muted-foreground mt-2 max-w-2xl leading-relaxed italic">
            The master terminal for governing the Rillcod ecosystem. Define academic standards, 
            secure the curriculum engine, and monitor institutional vitals from a single command hub.
          </p>
        </div>
      </div>

      <div className="space-y-20">
        {CATEGORIES.map((category) => (
          <div key={category.name} className="space-y-8">
            <div className="flex flex-col gap-2 ml-2">
              <h2 className="text-2xl font-black text-foreground tracking-tight uppercase tracking-widest">{category.name}</h2>
              <p className="text-sm text-muted-foreground italic">{category.desc}</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {category.cards
                .filter(card => card.allowedRoles.includes(profile?.role ?? ''))
                .map((card) => {
                  const Icon = card.icon;
                  return (
                    <Link
                      key={card.href}
                      href={card.href}
                      className="group relative flex flex-col p-8 rounded-[2.5rem] border border-border bg-card hover:border-primary/50 transition-all duration-500 shadow-xl hover:shadow-primary/5 hover:-translate-y-2 overflow-hidden"
                    >
                      <div className="absolute top-0 right-0 w-32 h-32 bg-primary/5 rounded-full blur-2xl -mr-16 -mt-16 group-hover:bg-primary/10 transition-all" />
                      
                      <div className="w-14 h-14 rounded-2xl border border-primary/20 bg-primary/5 flex items-center justify-center mb-8 group-hover:scale-110 group-hover:bg-primary/20 transition-all shadow-lg">
                        <Icon className="w-6 h-6 text-primary" />
                      </div>
                      
                      <div className="flex-1 space-y-3">
                        <p className="text-lg font-black text-foreground group-hover:text-primary transition-colors tracking-tight">{card.title}</p>
                        <p className="text-sm text-muted-foreground leading-relaxed italic">{card.description}</p>
                      </div>
                      
                      <div className="mt-8 pt-6 border-t border-border flex items-center justify-between">
                        <span className="text-[10px] font-black uppercase tracking-[0.2em] text-primary group-hover:translate-x-1 transition-all">
                          {card.cta} →
                        </span>
                      </div>
                    </Link>
                  );
                })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
