'use client';

import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/contexts/auth-context';
import Link from 'next/link';
import { ArrowPathIcon, ArrowLeftIcon, BoltIcon, RocketLaunchIcon } from '@/lib/icons';
import { toast } from 'sonner';

type OpsData = Record<string, Record<string, unknown>>;

// Categorized functional pillars
const PILLARS = [
  {
    id: 'setup',
    label: 'Institutional Setup',
    desc: 'Core calendar, permissions, and entry workflows.',
    sections: ['lms.ops.calendar', 'lms.ops.permissions', 'lms.ops.approvals'],
  },
  {
    id: 'academic',
    label: 'Academic Excellence',
    desc: 'Standards for assessment, grading, and promotion.',
    sections: ['lms.ops.assessment', 'lms.ops.promotion'],
  },
  {
    id: 'intelligence',
    label: 'System Intelligence',
    desc: 'Alerts, safety, communication, and app behavior.',
    sections: ['lms.ops.alerts', 'lms.ops.communication', 'lms.ops.integrity', 'lms.ops.pwa'],
  },
];

const SECTION_META: Record<string, { label: string; desc: string }> = {
  'lms.ops.calendar': {
    label: 'Academic Timeline',
    desc: 'Manage term cycles, holidays, and school year boundaries.',
  },
  'lms.ops.permissions': {
    label: 'Access Governance',
    desc: 'Define what teachers, parents, and schools can see or edit.',
  },
  'lms.ops.approvals': {
    label: 'Onboarding Guardrails',
    desc: 'Set manual or automatic approval for new students and schools.',
  },
  'lms.ops.assessment': {
    label: 'Grading Architecture',
    desc: 'Global rules for retries, marking schemes, and submission limits.',
  },
  'lms.ops.promotion': {
    label: 'Promotion Standards',
    desc: 'Criteria for moving students to the next level at term end.',
  },
  'lms.ops.alerts': {
    label: 'Proactive Monitoring',
    desc: 'Automatic notifications for attendance and performance drops.',
  },
  'lms.ops.communication': {
    label: 'Messaging Safety',
    desc: 'Platform-wide limits and safety rules for student messaging.',
  },
  'lms.ops.integrity': {
    label: 'Data Health',
    desc: 'Automated backup frequency and record cleanup rules.',
  },
  'lms.ops.pwa': {
    label: 'App Experience',
    desc: 'Offline behavior and performance mode for mobile users.',
  },
};

function humaniseKey(key: string): string {
  return key
    .replace(/_/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase());
}

function isBoolean(v: unknown): v is boolean { return typeof v === 'boolean'; }
function isNumber(v: unknown): v is number { return typeof v === 'number' && Number.isFinite(v); }

export default function OperationsSettingsPage() {
  const { profile, loading: authLoading } = useAuth();
  const canView = ['admin', 'teacher', 'school'].includes(profile?.role ?? '');
  const canSave = ['admin', 'teacher'].includes(profile?.role ?? '');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [readonly, setReadonly] = useState(false);
  const [data, setData] = useState<OpsData>({});
  const [activePillar, setActivePillar] = useState('setup');

  useEffect(() => {
    if (!canView) return;
    setLoading(true);
    fetch('/api/progression/operations-settings')
      .then(r => r.json())
      .then(j => {
        setData((j.data ?? {}) as OpsData);
        setReadonly(Boolean(j.readonly));
      })
      .catch(() => toast.error('Failed to load settings'))
      .finally(() => setLoading(false));
  }, [canView]);

  function updateValue(section: string, key: string, value: unknown) {
    setData(prev => ({ ...prev, [section]: { ...(prev[section] ?? {}), [key]: value } }));
  }

  async function saveAll() {
    if (!canSave || readonly) return;
    setSaving(true);
    try {
      const res = await fetch('/api/progression/operations-settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ settings: data }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || 'Save failed');
      toast.success('All platform changes saved successfully');
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  if (authLoading || loading) return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin" />
    </div>
  );

  if (!canView) return <div className="p-20 text-center text-muted-foreground font-bold uppercase tracking-widest">Unauthorized Access</div>;

  const currentPillar = PILLARS.find(p => p.id === activePillar) || PILLARS[0];

  return (
    <div className="max-w-7xl mx-auto p-4 sm:p-8 space-y-12 pb-32">

      {/* Hero Header */}
      <div className="relative overflow-hidden bg-card border border-border rounded-[3rem] p-10 sm:p-14 shadow-2xl">
        <div className="absolute top-0 right-0 w-80 h-80 bg-primary/10 rounded-full blur-[100px] -mr-32 -mt-32 pointer-events-none" />
        <Link href="/dashboard/progression/settings" className="inline-flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground hover:text-primary mb-8 transition-colors relative z-10">
          <ArrowLeftIcon className="w-4 h-4" /> Back to Controls
        </Link>
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-10 relative z-10">
          <div className="space-y-3">
            <div className="flex items-center gap-3">
               <RocketLaunchIcon className="w-5 h-5 text-primary" />
               <h1 className="text-4xl font-black tracking-tight text-card-foreground leading-tight">Platform Operations</h1>
            </div>
            <p className="text-lg text-muted-foreground max-w-2xl leading-relaxed italic">
              Manage the global nervous system of your platform. Configure academic boundaries, 
              governance rules, and intelligence toggles.
            </p>
          </div>
          {readonly && (
            <span className="px-6 py-3 text-[10px] font-black uppercase tracking-[0.2em] rounded-2xl border border-primary/30 bg-primary/10 text-primary shadow-lg backdrop-blur-xl">
              Read-Only Mode
            </span>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">
        {/* Navigation Sidebar */}
        <div className="lg:col-span-4 space-y-4">
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground mb-4 ml-4">Operational Pillars</p>
          {PILLARS.map(pillar => (
            <button
              key={pillar.id}
              onClick={() => setActivePillar(pillar.id)}
              className={`w-full text-left p-8 rounded-[2.5rem] border transition-all duration-500 shadow-xl relative overflow-hidden group ${
                activePillar === pillar.id 
                  ? 'bg-primary border-primary text-white shadow-primary/20 -translate-y-1' 
                  : 'bg-card border-border text-muted-foreground hover:border-primary/50 hover:bg-primary/5'
              }`}
            >
              <div className={`absolute top-0 right-0 w-24 h-24 rounded-full blur-2xl -mr-12 -mt-12 transition-all ${activePillar === pillar.id ? 'bg-white/10' : 'bg-primary/5'}`} />
              <p className="text-lg font-black tracking-tight relative z-10">{pillar.label}</p>
              <p className={`text-sm mt-2 leading-relaxed italic relative z-10 ${activePillar === pillar.id ? 'text-white/80' : 'text-muted-foreground/60 group-hover:text-primary/70 transition-colors'}`}>
                {pillar.desc}
              </p>
            </button>
          ))}
        </div>

        {/* Content Area */}
        <div className="lg:col-span-8 space-y-10">
          <div className="flex items-center gap-4 border-b border-border pb-6 px-4">
            <div className="w-12 h-12 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center">
               <BoltIcon className="w-6 h-6 text-primary" />
            </div>
            <div className="space-y-0.5">
              <h2 className="text-2xl font-black text-foreground tracking-tight">{currentPillar.label}</h2>
              <p className="text-sm text-muted-foreground italic">{currentPillar.desc}</p>
            </div>
          </div>

          {currentPillar.sections.map(sectionId => {
            const block = data[sectionId] || {};
            const meta = SECTION_META[sectionId] || { label: sectionId, desc: '' };
            if (Object.keys(block).length === 0) return null;

            return (
              <div key={sectionId} className="bg-card border border-border rounded-[2.5rem] overflow-hidden shadow-2xl hover:border-primary/20 transition-all group">
                <div className="p-8 border-b border-border bg-muted/20">
                  <h3 className="text-[11px] font-black text-foreground uppercase tracking-[0.2em]">{meta.label}</h3>
                  {meta.desc && <p className="text-[10px] text-muted-foreground mt-2 italic">{meta.desc}</p>}
                </div>
                <div className="p-10 grid grid-cols-1 md:grid-cols-2 gap-8 bg-card/30 backdrop-blur-sm">
                  {Object.entries(block).map(([key, value]) => (
                    <div key={key} className="space-y-3 group/item">
                      <div className="flex items-center justify-between">
                        <label className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground group-hover/item:text-primary transition-colors">
                          {humaniseKey(key)}
                        </label>
                      </div>
                      
                      {isBoolean(value) ? (
                        <div className="flex items-center justify-between p-4 rounded-2xl border border-border bg-background shadow-inner">
                          <span className="text-xs font-black text-foreground uppercase tracking-widest">{value ? 'Active' : 'Disabled'}</span>
                          <button
                            type="button"
                            disabled={readonly || !canSave}
                            onClick={() => updateValue(sectionId, key, !value)}
                            className={`relative inline-flex h-7 w-12 items-center rounded-full transition-all duration-500 ${value ? 'bg-primary' : 'bg-muted'} ${readonly || !canSave ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                          >
                            <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow-xl transition-transform duration-500 ${value ? 'translate-x-6' : 'translate-x-1'}`} />
                          </button>
                        </div>
                      ) : isNumber(value) ? (
                        <input
                          type="number"
                          value={value}
                          disabled={readonly || !canSave}
                          onChange={e => updateValue(sectionId, key, Number(e.target.value))}
                          className="w-full px-5 py-4 bg-background border border-border rounded-2xl text-sm font-black focus:outline-none focus:border-primary shadow-inner transition-all disabled:opacity-50"
                        />
                      ) : (
                        <input
                          type="text"
                          value={String(value ?? '')}
                          disabled={readonly || !canSave}
                          onChange={e => updateValue(sectionId, key, e.target.value)}
                          className="w-full px-5 py-4 bg-background border border-border rounded-2xl text-sm font-black focus:outline-none focus:border-primary shadow-inner transition-all disabled:opacity-50"
                        />
                      )}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}

          {canSave && !readonly && Object.keys(data).length > 0 && (
            <div className="pt-10">
              <button
                type="button"
                onClick={saveAll}
                disabled={saving}
                className="group relative w-full overflow-hidden rounded-[2.5rem] bg-primary p-6 text-[11px] font-black uppercase tracking-[0.3em] text-white shadow-[0_20px_50px_rgba(124,58,237,0.4)] transition-all hover:scale-[1.02] active:scale-100 disabled:opacity-50"
              >
                <div className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/10 to-white/0 -translate-x-full group-hover:translate-x-full transition-transform duration-1000" />
                <div className="flex items-center justify-center gap-4">
                  {saving ? (
                    <ArrowPathIcon className="w-6 h-6 animate-spin" />
                  ) : (
                    <BoltIcon className="w-6 h-6" />
                  )}
                  {saving ? 'Synchronizing platform vites...' : 'Apply Global Changes'}
                </div>
              </button>
              <p className="text-center text-[9px] text-muted-foreground mt-6 uppercase tracking-[0.3em] font-black opacity-50">
                Secure Platform Update System
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
