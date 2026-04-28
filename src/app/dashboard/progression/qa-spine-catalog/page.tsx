'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/auth-context';
import {
  ArrowPathIcon,
  ArrowLeftIcon,
  PlusIcon,
  BookOpenIcon,
  AcademicCapIcon,
  ShieldExclamationIcon,
  TrashIcon,
  XMarkIcon
} from '@/lib/icons';
import Link from 'next/link';
import { toast } from 'sonner';

type CatalogSummary = {
  total_rows: number;
  active_catalog_version: string | null;
  program_count: number;
  last_seed_at: string | null;
  lane_counts: Array<{ lane_index: number; count: number }>;
  versions: Array<{ catalog_version: string; count: number }>;
};

const STAGE_META: Record<number, { label: string; desc: string }> = {
  0: { label: 'Foundational Intro', desc: 'Warm-up and orientation modules.' },
  1: { label: 'Core Instruction', desc: 'Primary teaching and theory delivery.' },
  2: { label: 'Active Application', desc: 'Hands-on practice and lab exercises.' },
  3: { label: 'Mastery Assessment', desc: 'Validation and knowledge checks.' },
  4: { label: 'Extension & Depth', desc: 'Advanced enrichment for high-flyers.' },
  5: { label: 'Advanced Synthesis', desc: 'Project integration and final synthesis.' },
};

export default function QaSpineCatalogPage() {
  const { profile, loading: authLoading } = useAuth();
  const canView = ['admin', 'teacher'].includes(profile?.role ?? '');
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<CatalogSummary | null>(null);
  const [activeTab, setActiveTab] = useState<'status' | 'manage'>('status');

  // Management State
  const [selectedVersion, setSelectedVersion] = useState('');
  const [selectedProgram, setSelectedProgram] = useState('');
  const [blueprints, setBlueprints] = useState<any[]>([]);
  const [loadingBlueprints, setLoadingBlueprints] = useState(false);
  const [purging, setPurging] = useState<string | null>(null);

  const [showConstruct, setShowConstruct] = useState(false);
  const [constructBusy, setConstructBusy] = useState(false);
  const [constructForm, setConstructForm] = useState({
    catalog_version: '',
    program_id: '',
    lane_index: 0,
    track: 'core',
    week_number: 1,
    topic: '',
    grade_label: '',
    year_number: 1,
    term_number: 1,
  });

  async function loadSummary() {
    setLoading(true);
    try {
      const res = await fetch('/api/platform-syllabus-catalog/summary');
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to load architecture data');
      const summary = (json.data ?? null) as CatalogSummary | null;
      setData(summary);
      if (summary?.active_catalog_version && !selectedVersion) {
        setSelectedVersion(summary.active_catalog_version);
        setConstructForm(f => ({ ...f, catalog_version: summary.active_catalog_version || '' }));
      }
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Architecture diagnostic failed');
    } finally {
      setLoading(false);
    }
  }

  async function constructBlueprint() {
    if (!constructForm.topic || !constructForm.catalog_version || !constructForm.program_id) {
      toast.error('Version, Program, and Topic are required');
      return;
    }
    setConstructBusy(true);
    try {
      const res = await fetch('/api/platform-syllabus-template', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...constructForm,
          week_index: constructForm.week_number
        }),
      });
      if (!res.ok) throw new Error('Construction failed');
      toast.success('New blueprint injected into engine');
      setShowConstruct(false);
      void loadSummary();
      if (activeTab === 'manage') void loadBlueprints();
    } catch (err: unknown) {
      toast.error('Construction failed');
    } finally {
      setConstructBusy(false);
    }
  }

  async function loadBlueprints() {
    if (!selectedVersion) return;
    setLoadingBlueprints(true);
    try {
      const params = new URLSearchParams({ catalog_version: selectedVersion });
      if (selectedProgram) params.set('program_id', selectedProgram);
      const res = await fetch(`/api/platform-syllabus-template?${params}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to fetch blueprints');
      setBlueprints(json.data.rows ?? []);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Blueprint fetch failed');
    } finally {
      setLoadingBlueprints(false);
    }
  }

  useEffect(() => {
    if (!canView) return;
    void loadSummary();
  }, [canView]);

  useEffect(() => {
    if (activeTab === 'manage') void loadBlueprints();
  }, [activeTab, selectedVersion, selectedProgram]);

  async function purgeBlueprint(id: string) {
    setPurging(id);
    try {
      const res = await fetch(`/api/platform-syllabus-template?id=${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Purge failed');
      setBlueprints(prev => prev.filter(b => b.id !== id));
      toast.success('Blueprint purged from engine');
      void loadSummary();
    } catch (err: unknown) {
      toast.error('Purge failed');
    } finally {
      setPurging(null);
    }
  }

  async function bulkPurge() {
    if (!selectedVersion || !selectedProgram) {
      toast.error('Select version and program for bulk purge');
      return;
    }
    const ok = window.confirm(`Permanently purge ALL ${selectedVersion} blueprints for program ${selectedProgram}?`);
    if (!ok) return;

    setLoadingBlueprints(true);
    try {
      const res = await fetch(`/api/platform-syllabus-template?catalog_version=${selectedVersion}&program_id=${selectedProgram}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Bulk purge failed');
      setBlueprints([]);
      toast.success('Bulk purge completed');
      void loadSummary();
    } catch (err: unknown) {
      toast.error('Bulk purge failed');
    } finally {
      setLoadingBlueprints(false);
    }
  }

  if (authLoading || loading) return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin" />
    </div>
  );

  if (!canView) return <div className="p-20 text-center text-muted-foreground font-bold uppercase tracking-widest">Unauthorized Access</div>;

  const totalTemplates = data?.total_rows ?? 0;
  const isHealthy = totalTemplates > 0;

  return (
    <div className="max-w-7xl mx-auto p-4 sm:p-8 space-y-12 pb-32">
      {/* Hero Header */}
      <div className="relative overflow-hidden bg-card border border-border rounded-[3rem] p-10 sm:p-14 shadow-2xl">
        <div className="absolute top-0 right-0 w-[50rem] h-[50rem] bg-emerald-500/10 rounded-full blur-[120px] -mr-64 -mt-64 pointer-events-none" />

        <Link href="/dashboard/progression/settings" className="inline-flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground hover:text-emerald-400 mb-10 transition-colors relative z-10">
          <ArrowLeftIcon className="w-4 h-4" /> Back to Intelligence Hub
        </Link>

        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-12 relative z-10">
          <div className="space-y-6 max-w-3xl">
            <h1 className="text-4xl sm:text-6xl font-black tracking-tighter text-card-foreground leading-tight">Syllabus Engine Architecture</h1>
            <p className="text-xl text-muted-foreground leading-relaxed italic max-w-2xl">
              Master curriculum template library. These high-fidelity blueprints power the AI core
              during syllabus generation and pedagogical alignment.
            </p>
            <button
              onClick={() => setShowConstruct(true)}
              className="group relative px-10 py-5 bg-emerald-500 text-white rounded-[1.5rem] text-[11px] font-black uppercase tracking-[0.2em] shadow-[0_20px_50px_rgba(16,185,129,0.3)] hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center gap-4 w-fit overflow-hidden"
            >
              <div className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/10 to-white/0 -translate-x-full group-hover:translate-x-full transition-transform duration-1000" />
              <PlusIcon className="w-5 h-5" /> Construct New Blueprint
            </button>
          </div>
          <div className="flex gap-3 bg-muted/30 p-2 rounded-[1.5rem] border border-border shrink-0 backdrop-blur-xl shadow-inner">
            <button
              onClick={() => setActiveTab('status')}
              className={`px-8 py-4 text-[10px] font-black uppercase tracking-widest rounded-xl transition-all duration-500 ${activeTab === 'status' ? 'bg-card text-emerald-400 shadow-2xl' : 'text-muted-foreground hover:text-foreground'}`}
            >
              Engine Status
            </button>
            <button
              onClick={() => setActiveTab('manage')}
              className={`px-8 py-4 text-[10px] font-black uppercase tracking-widest rounded-xl transition-all duration-500 ${activeTab === 'manage' ? 'bg-card text-emerald-400 shadow-2xl' : 'text-muted-foreground hover:text-foreground'}`}
            >
              Inventory Control
            </button>
          </div>
        </div>
      </div>

      {activeTab === 'status' ? (
        <div className="space-y-12 animate-in fade-in slide-in-from-bottom-8 duration-1000">
          {/* Engine Status Diagnostic */}
          <div className={`rounded-[3rem] border p-1.5 transition-all shadow-2xl ${isHealthy ? 'border-emerald-500/20 bg-emerald-500/5' : 'border-rose-500/20 bg-rose-500/5'}`}>
            <div className="bg-card rounded-[calc(3rem-6px)] p-10 flex flex-col sm:flex-row items-center gap-10">
              <div className={`w-24 h-24 rounded-[2rem] flex items-center justify-center shrink-0 shadow-2xl ${isHealthy ? 'bg-emerald-500 shadow-emerald-500/40 text-white' : 'bg-rose-500 shadow-rose-500/40 text-white'}`}>
                <ArrowPathIcon className={`w-12 h-12 ${loading ? 'animate-spin' : ''}`} />
              </div>
              <div className="flex-1 text-center sm:text-left space-y-2">
                <p className="text-3xl font-black text-card-foreground tracking-tight">Core Status: {isHealthy ? 'Optimum' : 'Critical Depletion'}</p>
                <p className="text-lg text-muted-foreground leading-relaxed italic">
                  {isHealthy
                    ? `Curriculum engine is synchronized with ${totalTemplates} pedagogical blueprints across ${data?.program_count} academic programs.`
                    : 'Emergency Alert: No active blueprints detected. System generation functionality is offline.'}
                </p>
              </div>
              <div className="flex flex-col items-end gap-3 px-8 border-l border-border/50">
                <span className={`px-6 py-2.5 rounded-full text-[11px] font-black uppercase tracking-widest shadow-lg ${isHealthy ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'}`}>
                  v{data?.active_catalog_version || '0.0.0'}
                </span>
                <p className="text-[10px] font-black text-muted-foreground/40 tracking-[0.2em] uppercase">Active Schema</p>
              </div>
            </div>
          </div>

          {/* Metric Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-10 px-4">
            {[
              { label: 'Template Inventory', val: totalTemplates, desc: 'Verified lesson structures', icon: BookOpenIcon, color: 'emerald' },
              { label: 'Program Coverage', val: data?.program_count ?? 0, desc: 'Supported academic paths', icon: AcademicCapIcon, color: 'blue' },
              { label: 'Architecture Health', val: isHealthy ? '100%' : '0%', desc: 'System integrity rating', icon: ShieldExclamationIcon, color: isHealthy ? 'emerald' : 'rose' },
            ].map((m, idx) => (
              <div key={idx} className="bg-card border border-border rounded-[3rem] p-10 space-y-6 hover:border-emerald-500/30 transition-all shadow-2xl group">
                <div className={`w-16 h-16 rounded-[1.5rem] bg-${m.color === 'emerald' ? 'emerald' : m.color === 'blue' ? 'blue' : 'rose'}-500/10 border border-${m.color === 'emerald' ? 'emerald' : m.color === 'blue' ? 'blue' : 'rose'}-500/20 flex items-center justify-center transition-transform group-hover:scale-110 duration-500`}>
                  <m.icon className={`w-8 h-8 text-${m.color === 'emerald' ? 'emerald' : m.color === 'blue' ? 'blue' : 'rose'}-400`} />
                </div>
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground mb-2">{m.label}</p>
                  <p className="text-5xl font-black text-foreground tracking-tighter">{m.val}</p>
                  <p className="text-sm text-muted-foreground mt-2 italic">{m.desc}</p>
                </div>
              </div>
            ))}
          </div>

          {/* Structural Analysis */}
          {(data?.lane_counts ?? []).length > 0 && (
            <div className="bg-card border border-border rounded-[3.5rem] overflow-hidden shadow-[0_40px_100px_rgba(0,0,0,0.1)]">
              <div className="p-12 border-b border-border bg-muted/10">
                <h2 className="text-[11px] font-black text-foreground uppercase tracking-[0.3em] leading-none">Pedagogical Layer Distribution</h2>
                <p className="text-sm text-muted-foreground mt-3 italic">Analysis of blueprints mapped to specific learning stages.</p>
              </div>
              <div className="p-12 space-y-12">
                {(data?.lane_counts ?? []).map(row => {
                  const meta = STAGE_META[row.lane_index] || { label: 'Extended Layer', desc: 'Specialized content modules.' };
                  const maxCount = Math.max(...(data?.lane_counts ?? []).map(r => r.count), 1);
                  const pct = (row.count / maxCount) * 100;

                  return (
                    <div key={row.lane_index} className="space-y-5 group">
                      <div className="flex items-end justify-between">
                        <div className="space-y-1.5">
                          <p className="text-2xl font-black text-foreground group-hover:text-emerald-400 transition-colors tracking-tight">{meta.label}</p>
                          <p className="text-sm text-muted-foreground italic">{meta.desc}</p>
                        </div>
                        <div className="text-right">
                          <span className="text-3xl font-black text-emerald-400 tabular-nums">
                            {row.count}
                          </span>
                          <span className="text-[11px] font-black text-muted-foreground ml-3 uppercase tracking-widest opacity-50">Assets</span>
                        </div>
                      </div>
                      <div className="h-5 bg-muted/20 rounded-full overflow-hidden border border-border p-1 shadow-inner">
                        <div
                          className="h-full bg-gradient-to-r from-emerald-500 to-teal-400 rounded-full transition-all duration-1000 shadow-[0_0_20px_rgba(16,185,129,0.3)]"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-12 animate-in fade-in slide-in-from-bottom-8 duration-1000">
          {/* Blueprint Management Controls */}
          <div className="bg-card border border-border rounded-[3rem] p-10 shadow-2xl flex flex-col md:flex-row gap-8 items-end">
            <div className="flex-1 space-y-3">
              <label className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground ml-4">Architecture Version</label>
              <select
                value={selectedVersion}
                onChange={(e) => setSelectedVersion(e.target.value)}
                className="w-full px-8 py-5 bg-background border border-border rounded-2xl font-black uppercase tracking-widest outline-none focus:border-emerald-500 transition-all appearance-none shadow-inner"
              >
                {(data?.versions ?? []).map(v => (
                  <option key={v.catalog_version} value={v.catalog_version}>{v.catalog_version}</option>
                ))}
              </select>
            </div>
            <div className="flex-1 space-y-3">
              <label className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground ml-4">Program Scope</label>
              <select
                value={selectedProgram}
                onChange={(e) => setSelectedProgram(e.target.value)}
                className="w-full px-8 py-5 bg-background border border-border rounded-2xl font-black uppercase tracking-widest outline-none focus:border-emerald-500 transition-all appearance-none shadow-inner"
              >
                <option value="">All Programs</option>
                {/* Programs list would be populated here */}
              </select>
            </div>
            {selectedProgram && (
              <button
                onClick={bulkPurge}
                className="px-10 py-5 bg-rose-500/10 text-rose-400 border border-rose-500/20 rounded-2xl text-[11px] font-black uppercase tracking-widest hover:bg-rose-500 hover:text-white transition-all shadow-xl shadow-rose-500/10 shrink-0"
              >
                Bulk Purge Scope
              </button>
            )}
          </div>

          {/* Blueprint List */}
          <div className="bg-card border border-border rounded-[3.5rem] overflow-hidden shadow-2xl">
            <div className="p-10 border-b border-border flex items-center justify-between bg-muted/10">
              <h3 className="text-[11px] font-black uppercase tracking-[0.2em] text-foreground">Inventory: {selectedVersion}</h3>
              <p className="px-5 py-2 bg-muted/30 rounded-full text-[10px] font-black text-muted-foreground uppercase tracking-widest">{blueprints.length} Total Nodes</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-muted/20 border-b border-border">
                    <th className="px-10 py-6 text-[10px] font-black uppercase tracking-widest text-muted-foreground">Calibration</th>
                    <th className="px-10 py-6 text-[10px] font-black uppercase tracking-widest text-muted-foreground">Architectural Topic</th>
                    <th className="px-10 py-6 text-[10px] font-black uppercase tracking-widest text-muted-foreground text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/30">
                  {loadingBlueprints ? (
                    <tr>
                      <td colSpan={3} className="px-10 py-24 text-center">
                        <div className="w-12 h-12 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto" />
                        <p className="mt-6 text-[11px] font-black text-muted-foreground uppercase tracking-[0.3em]">Scanning Engine Architecture...</p>
                      </td>
                    </tr>
                  ) : blueprints.length === 0 ? (
                    <tr>
                      <td colSpan={3} className="px-10 py-24 text-center">
                        <p className="text-lg font-black text-muted-foreground italic opacity-30">No blueprints detected in this scope.</p>
                      </td>
                    </tr>
                  ) : (
                    blueprints.map((row) => (
                      <tr key={row.id} className="hover:bg-muted/10 transition-all group">
                        <td className="px-10 py-8">
                          <div className="flex items-center gap-4">
                            <span className="px-4 py-1.5 rounded-xl bg-emerald-500/10 text-emerald-400 text-[10px] font-black border border-emerald-500/20 shadow-sm">L{row.lane_index}</span>
                            <span className="text-lg font-black text-foreground tracking-tighter">W{row.week_number}</span>
                          </div>
                        </td>
                        <td className="px-10 py-8">
                          <p className="text-base font-black text-foreground leading-tight group-hover:text-emerald-400 transition-colors">{row.topic}</p>
                          <div className="flex items-center gap-3 mt-2">
                            <span className="text-[10px] font-black text-muted-foreground/60 uppercase tracking-widest">{row.program_id}</span>
                            <div className="w-1 h-1 rounded-full bg-border" />
                            <span className="text-[10px] font-black text-muted-foreground/60 uppercase tracking-widest">{row.track}</span>
                          </div>
                        </td>
                        <td className="px-10 py-8 text-right">
                          <button
                            onClick={() => purgeBlueprint(row.id)}
                            disabled={purging === row.id}
                            className="p-4 rounded-2xl bg-rose-500/5 text-rose-400 border border-rose-500/10 hover:bg-rose-500 hover:text-white transition-all duration-500 shadow-sm disabled:opacity-50"
                          >
                            <TrashIcon className="w-5 h-5" />
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Academic Node Builder Modal */}
      {showConstruct && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-3xl z-[100] flex items-center justify-center p-4">
          <div className="bg-card border border-border rounded-[4rem] w-full max-w-2xl p-10 sm:p-14 shadow-[0_50px_150px_rgba(0,0,0,0.5)] relative animate-in zoom-in-95 duration-500">
            <button onClick={() => setShowConstruct(false)} className="absolute top-10 right-10 p-4 rounded-full bg-muted/50 hover:bg-rose-500 hover:text-white transition-all duration-500 group">
              <XMarkIcon className="w-6 h-6 transition-transform group-hover:rotate-90" />
            </button>

            <div className="space-y-3 mb-12">
              <h2 className="text-4xl font-black tracking-tighter text-emerald-400">Academic Node Builder</h2>
              <p className="text-lg text-muted-foreground italic">Construct a new weekly objective for the curriculum engine.</p>
            </div>

            <div className="space-y-10 mb-12">
              <div className="space-y-3">
                <label className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground ml-4">Primary Academic Topic</label>
                <input
                  placeholder="e.g. Exploring Artificial Intelligence Ethics"
                  value={constructForm.topic}
                  onChange={(e) => setConstructForm((f) => ({ ...f, topic: e.target.value }))}
                  className="w-full px-8 py-5 bg-background border border-border rounded-3xl font-black text-xl focus:border-emerald-500 outline-none transition-all shadow-inner placeholder:text-muted-foreground/30"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-8">
                <div className="space-y-3">
                  <label className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground ml-4">Target Program</label>
                  <input
                    placeholder="e.g. CS_FOUNDATION"
                    value={constructForm.program_id}
                    onChange={(e) => setConstructForm((f) => ({ ...f, program_id: e.target.value.toUpperCase() }))}
                    className="w-full px-8 py-5 bg-background border border-border rounded-2xl font-black uppercase tracking-widest outline-none focus:border-emerald-500 transition-all shadow-inner"
                  />
                </div>
                <div className="space-y-3">
                  <label className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground ml-4">Learning Level (0-5)</label>
                  <input
                    type="number"
                    min={0}
                    max={5}
                    value={constructForm.lane_index}
                    onChange={(e) => setConstructForm((f) => ({ ...f, lane_index: Number(e.target.value) }))}
                    className="w-full px-8 py-5 bg-background border border-border rounded-2xl font-black outline-none focus:border-emerald-500 transition-all shadow-inner"
                  />
                </div>
              </div>

              <div className="p-8 bg-muted/20 rounded-[2.5rem] border border-border space-y-8 shadow-inner">
                <p className="text-[10px] font-black uppercase tracking-[0.3em] text-muted-foreground text-center">System Calibration</p>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                  <div className="space-y-3">
                    <label className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground ml-2">Year</label>
                    <select value={constructForm.year_number} onChange={(e) => setConstructForm((f) => ({ ...f, year_number: Number(e.target.value) }))} className="w-full px-4 py-4 bg-background border border-border rounded-2xl font-black outline-none focus:border-emerald-500 transition-all text-sm shadow-sm">
                       {[1,2,3,4,5,6,7,8,9,10].map(y => <option key={y} value={y}>Y{y}</option>)}
                    </select>
                  </div>
                  <div className="space-y-3">
                    <label className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground ml-2">Term</label>
                    <select value={constructForm.term_number} onChange={(e) => setConstructForm((f) => ({ ...f, term_number: Number(e.target.value) }))} className="w-full px-4 py-4 bg-background border border-border rounded-2xl font-black outline-none focus:border-emerald-500 transition-all text-sm shadow-sm">
                       {[1,2,3].map(t => <option key={t} value={t}>T{t}</option>)}
                    </select>
                  </div>
                  <div className="space-y-3">
                    <label className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground ml-2">Week</label>
                    <input type="number" min={1} value={constructForm.week_number} onChange={(e) => setConstructForm((f) => ({ ...f, week_number: Number(e.target.value) }))} className="w-full px-4 py-4 bg-background border border-border rounded-2xl font-black outline-none focus:border-emerald-500 transition-all text-sm shadow-sm" />
                  </div>
                  <div className="space-y-3">
                    <label className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground ml-2">Engine</label>
                    <div className="w-full px-4 py-4 bg-background/50 border border-border rounded-2xl font-black uppercase tracking-widest text-[9px] opacity-50 shadow-inner flex items-center justify-center truncate">
                      {constructForm.catalog_version}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <button onClick={() => void constructBlueprint()} disabled={constructBusy} className="group relative w-full py-6 bg-emerald-500 text-white rounded-[2rem] font-black uppercase tracking-[0.3em] shadow-[0_30px_70px_rgba(16,185,129,0.4)] disabled:opacity-50 hover:scale-[1.02] active:scale-[0.98] transition-all overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/10 to-white/0 -translate-x-full group-hover:translate-x-full transition-transform duration-1000" />
              {constructBusy ? 'Engineering Node...' : 'Inject into Learning Engine'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
