'use client';

import { useState } from 'react';
import {
  TrashIcon, EyeSlashIcon, MagnifyingGlassIcon,
  ExclamationTriangleIcon, CheckCircleIcon, ArrowPathIcon,
  BookOpenIcon, SparklesIcon, ChevronDownIcon,
  ChevronRightIcon, BuildingOfficeIcon,
  ClipboardIcon, ArrowRightIcon,
} from '@/lib/icons';
import { toast } from 'react-hot-toast';

interface Dependent {
  kind: string;
  id: string;
  label: string;
  detail: string;
  onCleanup: string;
  safe: boolean;
  href?: string;
}

interface DebrisSummary {
  orphan_releases: number;
  delivery_schedules: number;
  adoptions: number;
  offering_directions: number;
  week_tracking_on_orphans: number;
  teaching?: {
    lesson_plans: number;
    lessons: number;
    assignments: number;
    flashcards: number;
    exams: number;
    cbt_exams: number;
    total: number;
  };
  items?: Array<{
    id: string;
    title: string | null;
    status: string | null;
    course_id: string | null;
    version_tag: string | null;
  }>;
  teaching_items?: {
    lesson_plans?: any[];
    lessons?: any[];
    assignments?: any[];
    flashcards?: any[];
  };
}

interface MasterCurriculumRosterProps {
  curricula: any[];
  isAdmin: boolean;
  onRefresh: () => void;
  onSelectCurriculum: (item: any) => void;
}

const KIND_LABEL: Record<string, string> = {
  official_edition: 'Edition',
  teaching_plan: 'Teaching plan',
  delivery_record: 'Delivery weeks',
  delivery_schedule: 'Schedule',
  school_adoption: 'Adoption',
  offering_direction: 'Offering direction',
};

export function MasterCurriculumRoster({
  curricula,
  isAdmin,
  onRefresh,
  onSelectCurriculum,
}: MasterCurriculumRosterProps) {
  const [search, setSearch] = useState('');
  const [visibilityFilter, setVisibilityFilter] = useState<'all' | 'visible' | 'hidden'>('all');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [showResetModal, setShowResetModal] = useState(false);
  const [resetConfirmInput, setResetConfirmInput] = useState('');
  const [isProcessingBulk, setIsProcessingBulk] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [blockersById, setBlockersById] = useState<Record<string, {
    loading?: boolean;
    dependents: Dependent[];
    summary?: any;
    error?: string;
  }>>({});
  const [lastOpErrors, setLastOpErrors] = useState<Array<{ id: string; error: string }> | null>(null);
  const [debris, setDebris] = useState<DebrisSummary | null>(null);
  const [debrisLoading, setDebrisLoading] = useState(false);
  const [purgeConfirm, setPurgeConfirm] = useState('');
  const [showPurgeModal, setShowPurgeModal] = useState(false);

  const filtered = curricula.filter((item) => {
    const title = item.courses?.title || item.content?.description || 'Untitled Curriculum';
    const programName = item.courses?.programs?.name || '';
    const schoolName = item.schools?.name || 'Platform Shared Template';
    const id = String(item.id || '');
    const q = search.toLowerCase().trim();
    const matchesSearch =
      !q ||
      title.toLowerCase().includes(q) ||
      programName.toLowerCase().includes(q) ||
      schoolName.toLowerCase().includes(q) ||
      id.toLowerCase().includes(q);

    if (!matchesSearch) return false;
    if (visibilityFilter === 'visible' && !item.is_visible_to_school) return false;
    if (visibilityFilter === 'hidden' && item.is_visible_to_school) return false;

    return true;
  });

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const toggleSelectAll = () => {
    if (selectedIds.length === filtered.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(filtered.map((item) => item.id));
    }
  };

  const copyId = async (id: string) => {
    try {
      await navigator.clipboard.writeText(id);
      toast.success('Curriculum ID copied');
    } catch {
      toast.error('Could not copy ID');
    }
  };

  const loadBlockers = async (id: string) => {
    setBlockersById((prev) => ({
      ...prev,
      [id]: { ...(prev[id] || { dependents: [] }), loading: true },
    }));
    try {
      const res = await fetch(`/api/curricula/${id}/dependents`);
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || 'Failed to load blockers');
      setBlockersById((prev) => ({
        ...prev,
        [id]: {
          loading: false,
          dependents: json.dependents || [],
          summary: json.summary,
        },
      }));
    } catch (err: any) {
      setBlockersById((prev) => ({
        ...prev,
        [id]: {
          loading: false,
          dependents: [],
          error: err.message || 'Failed to load blockers',
        },
      }));
    }
  };

  const toggleExpand = (id: string) => {
    const next = expandedId === id ? null : id;
    setExpandedId(next);
    if (next && !blockersById[next]?.dependents?.length && !blockersById[next]?.loading) {
      void loadBlockers(next);
    }
  };

  const handleDeleteItem = async (id: string, force = false) => {
    setDeletingId(id);
    setLastOpErrors(null);
    try {
      const url = force ? `/api/curricula/${id}?force=1` : `/api/curricula/${id}`;
      const res = await fetch(url, { method: 'DELETE' });
      const json = await res.json().catch(() => ({}));

      if (!res.ok) {
        if (res.status === 409 && json.can_force && !force) {
          await loadBlockers(id);
          setExpandedId(id);
          const detail = [
            json.official_release_count ? `${json.official_release_count} official edition(s)` : null,
            json.draft_plan_count ? `${json.draft_plan_count} draft plan(s)` : null,
            json.live_plan_count ? `${json.live_plan_count} live plan(s)` : null,
            json.delivery_record_count ? `${json.delivery_record_count} tracking week(s)` : null,
          ].filter(Boolean).join(', ');

          if (
            window.confirm(
              `This curriculum is held by:\n${detail || json.error}\n\nForce-delete will clear those blockers and remove this copy. Continue?`
            )
          ) {
            await handleDeleteItem(id, true);
            return;
          }
          return;
        }
        throw new Error(json.error || 'Failed to delete curriculum');
      }

      toast.success(force ? 'Cleaned blockers and deleted curriculum' : 'Curriculum deleted');
      setSelectedIds((prev) => prev.filter((x) => x !== id));
      onRefresh();
    } catch (err: any) {
      toast.error(err.message || 'Deletion failed', { duration: 9000 });
      setLastOpErrors([{ id, error: err.message || 'Deletion failed' }]);
      await loadBlockers(id);
      setExpandedId(id);
    } finally {
      setDeletingId(null);
    }
  };

  const formatBulkResult = (json: any) => {
    const errors = Array.isArray(json.errors) ? json.errors : [];
    setLastOpErrors(errors.length ? errors : null);
    if (errors.length) {
      const preview = errors
        .slice(0, 3)
        .map((e: any) => `${String(e.id).slice(0, 8)}…: ${e.error}`)
        .join('\n');
      toast.error(
        `Deleted ${json.deletedCount ?? 0}/${json.totalRequested ?? 0}. ${errors.length} failed.\n${preview}`,
        { duration: 12000, style: { maxWidth: '36rem', whiteSpace: 'pre-wrap' } }
      );
      return false;
    }
    return true;
  };

  const handleBulkDeleteSelected = async () => {
    if (selectedIds.length === 0) return;
    if (!window.confirm(`Force-delete ${selectedIds.length} selected curriculum record(s)? Blockers will be cleaned.`)) return;

    setIsProcessingBulk(true);
    setLastOpErrors(null);
    try {
      const res = await fetch('/api/curricula/bulk-delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: selectedIds }),
      });
      const json = await res.json();
      if (!res.ok && res.status !== 207) throw new Error(json.error || 'Bulk delete failed');

      if (formatBulkResult(json)) {
        toast.success(`Deleted ${json.deletedCount} curriculum record(s)`);
        setSelectedIds([]);
      }
      onRefresh();
      void inspectDebris();
    } catch (err: any) {
      toast.error(err.message || 'Bulk delete failed');
    } finally {
      setIsProcessingBulk(false);
    }
  };

  const handleMasterReset = async () => {
    if (resetConfirmInput.trim() !== 'RESET') {
      toast.error("Please type 'RESET' in uppercase to confirm.");
      return;
    }

    setIsProcessingBulk(true);
    setLastOpErrors(null);
    try {
      const res = await fetch('/api/curricula/bulk-delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reset_all: true, confirmation: 'RESET' }),
      });
      const json = await res.json();
      if (!res.ok && res.status !== 207) throw new Error(json.error || 'Master wipe failed');

      const remaining = json.debris_remaining?.orphan_releases ?? 0;
      if (formatBulkResult(json)) {
        toast.success(
          `Wipe complete. Removed ${json.deletedCount} curricula` +
            (json.debris_purged ? ` and ${json.debris_purged} orphan edition(s)` : '') +
            (remaining ? `. ${remaining} orphan edition(s) still remain — inspect debris below.` : '.'),
          { duration: 10000 }
        );
        setShowResetModal(false);
        setResetConfirmInput('');
        setSelectedIds([]);
      }
      onRefresh();
      void inspectDebris();
    } catch (err: any) {
      toast.error(err.message || 'Master wipe failed', { duration: 10000 });
    } finally {
      setIsProcessingBulk(false);
    }
  };

  const inspectDebris = async () => {
    if (!isAdmin) return;
    setDebrisLoading(true);
    try {
      const res = await fetch('/api/curricula/bulk-delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ inspect_debris: true }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to inspect debris');
      setDebris({
        ...json.summary,
        items: json.debris?.orphan_releases || [],
        teaching_items: {
          lesson_plans: json.debris?.teaching?.orphan_lesson_plans || [],
          lessons: json.debris?.teaching?.orphan_lessons || [],
          assignments: json.debris?.teaching?.orphan_assignments || [],
          flashcards: json.debris?.teaching?.orphan_flashcards || [],
        },
      });
    } catch (err: any) {
      toast.error(err.message || 'Debris inspection failed');
    } finally {
      setDebrisLoading(false);
    }
  };

  const handlePurgeDebris = async () => {
    if (purgeConfirm.trim() !== 'PURGE') {
      toast.error("Type PURGE to confirm.");
      return;
    }
    setIsProcessingBulk(true);
    try {
      const res = await fetch('/api/curricula/bulk-delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ purge_debris: true, confirmation: 'PURGE' }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Debris purge failed');
      toast.success(
        `Purged ${json.purged_releases} orphan edition(s)` +
          (json.teaching_purged
            ? ` · teaching: ${json.teaching_purged.lesson_plans || 0} plans, ${json.teaching_purged.lessons || 0} lessons, ${json.teaching_purged.assignments || 0} assignments, ${json.teaching_purged.flashcards || 0} flashcards`
            : '')
      );
      setShowPurgeModal(false);
      setPurgeConfirm('');
      await inspectDebris();
      onRefresh();
    } catch (err: any) {
      toast.error(err.message || 'Debris purge failed', { duration: 10000 });
    } finally {
      setIsProcessingBulk(false);
    }
  };

  const handleToggleVisibility = async (item: any) => {
    try {
      const newStatus = !item.is_visible_to_school;
      const res = await fetch(`/api/curricula/${item.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_visible_to_school: newStatus }),
      });
      if (!res.ok) {
        const json = await res.json();
        throw new Error(json.error || 'Failed to update visibility');
      }
      toast.success(newStatus ? 'Curriculum published to school view' : 'Curriculum hidden from school view');
      onRefresh();
    } catch (err: any) {
      toast.error(err.message || 'Failed to update visibility');
    }
  };

  const handleUnpublish = async (id: string) => {
    if (!window.confirm('Unpublish and retire official editions linked to this curriculum?')) return;
    try {
      const res = await fetch('/api/curricula/unpublish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ curriculum_id: id }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Unpublish failed');
      toast.success('Curriculum edition unpublished and retired');
      onRefresh();
      void loadBlockers(id);
    } catch (err: any) {
      toast.error(err.message || 'Unpublish failed');
    }
  };

  const debrisTotal =
    (debris?.orphan_releases || 0) +
    (debris?.delivery_schedules || 0) +
    (debris?.adoptions || 0) +
    (debris?.offering_directions || 0) +
    (debris?.week_tracking_on_orphans || 0) +
    (debris?.teaching?.total || 0);

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-brand-red-600/10 via-primary/10 to-indigo-600/10 border border-primary/20 p-6 backdrop-blur-xl shadow-lg">
        <div className="absolute top-0 right-0 -mt-8 -mr-8 w-48 h-48 bg-primary/10 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
          <div className="space-y-2">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest bg-primary/10 text-primary border border-primary/30">
                <SparklesIcon className="w-3 h-3 animate-pulse" />
                Master Curriculum Roster
              </span>
              <span className="text-xs font-bold text-muted-foreground bg-background/60 px-3 py-1 rounded-full border border-border">
                {curricula.length} Total Database Items
              </span>
            </div>
            <h1 className="text-2xl font-black tracking-tight text-foreground uppercase">
              All Curricula &amp; Master Directory
            </h1>
            <p className="text-xs text-muted-foreground max-w-2xl leading-relaxed">
              Search by course, school, or full curriculum ID. Expand any row to see exactly what is holding it,
              then force-clean or wipe leftover orphan editions.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
            <button
              type="button"
              onClick={onRefresh}
              className="px-4 py-2.5 text-xs font-bold bg-card border border-border text-foreground hover:bg-muted rounded-xl shadow-sm transition-all duration-200 flex items-center gap-2"
            >
              <ArrowPathIcon className="w-4 h-4 text-primary" /> Refresh
            </button>

            {isAdmin && (
              <>
                <button
                  type="button"
                  onClick={() => void inspectDebris()}
                  disabled={debrisLoading}
                  className="px-4 py-2.5 text-xs font-bold bg-card border border-amber-500/40 text-amber-600 hover:bg-amber-500/10 rounded-xl shadow-sm transition-all duration-200 flex items-center gap-2"
                >
                  <ExclamationTriangleIcon className="w-4 h-4" />
                  {debrisLoading ? 'Scanning…' : 'Inspect Debris'}
                </button>
                <button
                  type="button"
                  onClick={() => setShowResetModal(true)}
                  className="px-4 py-2.5 text-xs font-black uppercase tracking-wider bg-rose-500/10 text-rose-500 border border-rose-500/30 hover:bg-rose-600 hover:text-white rounded-xl shadow-sm transition-all duration-200 flex items-center gap-2"
                >
                  <ExclamationTriangleIcon className="w-4 h-4" /> Start Fresh / Wipe All
                </button>
              </>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-5 mt-5 border-t border-border/60">
          <div className="relative">
            <MagnifyingGlassIcon className="w-4 h-4 text-muted-foreground absolute left-3.5 top-3" />
            <input
              type="text"
              placeholder="Search course, school, or curriculum ID…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2 text-xs bg-background/80 border border-border rounded-xl focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all shadow-inner font-mono"
            />
          </div>

          <div className="flex items-center gap-1 bg-background/80 border border-border rounded-xl p-1 shadow-inner">
            <button
              type="button"
              onClick={() => setVisibilityFilter('all')}
              className={`flex-1 py-1.5 text-[10px] font-black uppercase tracking-wider rounded-lg transition-all ${
                visibilityFilter === 'all'
                  ? 'bg-primary text-primary-foreground shadow-md'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              All ({curricula.length})
            </button>
            <button
              type="button"
              onClick={() => setVisibilityFilter('visible')}
              className={`flex-1 py-1.5 text-[10px] font-black uppercase tracking-wider rounded-lg transition-all ${
                visibilityFilter === 'visible'
                  ? 'bg-emerald-600 text-white shadow-md'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              Visible ({curricula.filter((c) => c.is_visible_to_school).length})
            </button>
            <button
              type="button"
              onClick={() => setVisibilityFilter('hidden')}
              className={`flex-1 py-1.5 text-[10px] font-black uppercase tracking-wider rounded-lg transition-all ${
                visibilityFilter === 'hidden'
                  ? 'bg-amber-600 text-white shadow-md'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              Hidden ({curricula.filter((c) => !c.is_visible_to_school).length})
            </button>
          </div>

          {isAdmin && selectedIds.length > 0 && (
            <button
              type="button"
              onClick={handleBulkDeleteSelected}
              disabled={isProcessingBulk}
              className="py-2.5 px-4 bg-gradient-to-r from-rose-600 to-red-700 hover:from-rose-700 hover:to-red-800 text-white font-bold text-xs rounded-xl transition-all shadow-md flex items-center justify-center gap-2 animate-in fade-in"
            >
              <TrashIcon className="w-4 h-4" />
              Delete Selected ({selectedIds.length})
            </button>
          )}
        </div>
      </div>

      {lastOpErrors && lastOpErrors.length > 0 && (
        <div className="rounded-2xl border border-rose-500/40 bg-rose-500/10 p-4 space-y-2">
          <p className="text-xs font-black uppercase tracking-wider text-rose-500">
            Delete / wipe failures ({lastOpErrors.length})
          </p>
          <ul className="space-y-2 max-h-48 overflow-y-auto">
            {lastOpErrors.map((e) => (
              <li key={`${e.id}-${e.error}`} className="text-xs text-foreground bg-card/70 border border-border rounded-xl px-3 py-2">
                <button
                  type="button"
                  className="font-mono text-primary underline mr-2"
                  onClick={() => {
                    setSearch(e.id);
                    void loadBlockers(e.id);
                    setExpandedId(e.id);
                  }}
                >
                  {e.id}
                </button>
                <span className="text-muted-foreground">{e.error}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {isAdmin && debris && (
        <div className={`rounded-2xl border p-4 space-y-3 ${
          debrisTotal > 0
            ? 'border-amber-500/40 bg-amber-500/10'
            : 'border-emerald-500/30 bg-emerald-500/10'
        }`}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs font-black uppercase tracking-wider text-foreground">
                Curriculum debris scan
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                {debrisTotal === 0
                  ? 'No orphan editions or leftover teaching debris found.'
                  : `${debris.orphan_releases} orphan edition(s), ${debris.delivery_schedules} schedule(s), ${debris.adoptions} adoption(s)` +
                    (debris.teaching
                      ? ` · teaching orphans: ${debris.teaching.lesson_plans} plans, ${debris.teaching.lessons} lessons, ${debris.teaching.assignments} assignments, ${debris.teaching.flashcards} flashcards, ${debris.teaching.exams} exams, ${debris.teaching.cbt_exams} CBT`
                      : '')}
              </p>
            </div>
            {(debris.orphan_releases > 0 || (debris.teaching?.total || 0) > 0) && (
              <button
                type="button"
                onClick={() => setShowPurgeModal(true)}
                className="px-4 py-2 text-xs font-black uppercase tracking-wider bg-amber-600 text-white rounded-xl hover:bg-amber-700"
              >
                Purge Orphan Debris
              </button>
            )}
          </div>
          {(debris.items?.length || 0) > 0 && (
            <ul className="space-y-2 max-h-56 overflow-y-auto">
              {debris.items!.map((item) => (
                <li key={item.id} className="text-xs bg-card border border-border rounded-xl px-3 py-2 flex flex-wrap gap-2 items-center justify-between">
                  <div className="min-w-0">
                    <p className="font-bold text-foreground truncate">{item.title || 'Untitled edition'}</p>
                    <p className="font-mono text-muted-foreground">{item.id}</p>
                  </div>
                  <span className="text-[10px] font-black uppercase tracking-wider px-2 py-1 rounded-full bg-muted text-muted-foreground">
                    {item.status || 'unknown'} {item.version_tag ? `· ${item.version_tag}` : ''}
                  </span>
                </li>
              ))}
            </ul>
          )}
          {(debris.teaching_items?.lesson_plans?.length ||
            debris.teaching_items?.assignments?.length ||
            debris.teaching_items?.flashcards?.length ||
            debris.teaching_items?.lessons?.length) ? (
            <div className="space-y-2 pt-2 border-t border-border/60">
              <p className="text-[10px] font-black uppercase tracking-widest text-amber-700 dark:text-amber-300">
                Orphan teaching artifacts
              </p>
              <ul className="space-y-1 max-h-40 overflow-y-auto text-xs">
                {(debris.teaching_items?.lesson_plans || []).slice(0, 8).map((p: any) => (
                  <li key={`plan-${p.id}`} className="font-mono text-muted-foreground">
                    plan {p.id} · {p.reason || p.status || 'orphan'}
                  </li>
                ))}
                {(debris.teaching_items?.assignments || []).slice(0, 8).map((a: any) => (
                  <li key={`asg-${a.id}`} className="text-muted-foreground">
                    assignment: {a.title || a.id} · {a.reason || 'orphan'}
                  </li>
                ))}
                {(debris.teaching_items?.flashcards || []).slice(0, 8).map((f: any) => (
                  <li key={`fc-${f.id}`} className="text-muted-foreground">
                    flashcard: {f.title || f.id} · {f.reason || 'orphan'}
                  </li>
                ))}
                {(debris.teaching_items?.lessons || []).slice(0, 8).map((l: any) => (
                  <li key={`ls-${l.id}`} className="text-muted-foreground">
                    lesson: {l.title || l.id} · {l.reason || 'orphan'}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      )}

      {filtered.length === 0 ? (
        <div className="text-center py-20 bg-card border border-dashed border-border rounded-2xl space-y-4 shadow-sm">
          <BookOpenIcon className="w-14 h-14 text-muted-foreground/30 mx-auto animate-bounce" />
          <div className="space-y-1">
            <p className="text-base font-black text-foreground">No Curricula Match Your Filter</p>
            <p className="text-xs text-muted-foreground max-w-sm mx-auto">
              {search
                ? 'Try clearing your search (course, school, or paste a full curriculum UUID).'
                : 'No curriculum syllabi exist in the database yet. Click Syllabus Builder to generate one.'}
            </p>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex items-center justify-between px-2">
            <label className="flex items-center gap-2 text-xs font-bold text-muted-foreground cursor-pointer select-none">
              <input
                type="checkbox"
                checked={selectedIds.length === filtered.length && filtered.length > 0}
                onChange={toggleSelectAll}
                className="rounded border-border accent-primary w-4 h-4"
              />
              Select All Shown ({filtered.length})
            </label>
            <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
              Showing {filtered.length} of {curricula.length} Records
            </span>
          </div>

          <div className="grid grid-cols-1 gap-4">
            {filtered.map((item) => {
              const title = item.courses?.title || item.content?.description || 'Untitled Course Syllabus';
              const programName = item.courses?.programs?.name || 'General Program';
              const schoolName = item.schools?.name || 'Platform Shared Template';
              const isVisible = item.is_visible_to_school;
              const terms = item.content?.terms ?? [];
              const isExpanded = expandedId === item.id;
              const isSelected = selectedIds.includes(item.id);
              const blockers = blockersById[item.id];

              return (
                <div
                  key={item.id}
                  className={`relative overflow-hidden rounded-2xl border transition-all duration-300 ${
                    isSelected
                      ? 'bg-primary/5 border-primary shadow-md'
                      : isVisible
                      ? 'bg-card border-border hover:border-emerald-500/40 hover:shadow-lg'
                      : 'bg-card/70 border-amber-500/30 hover:border-amber-500/60 hover:shadow-lg'
                  }`}
                >
                  <div
                    className={`absolute top-0 left-0 bottom-0 w-1.5 ${
                      isVisible ? 'bg-gradient-to-b from-emerald-400 to-teal-600' : 'bg-gradient-to-b from-amber-400 to-orange-600'
                    }`}
                  />

                  <div className="p-5 pl-7 space-y-4">
                    <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                      <div className="flex items-start gap-3 min-w-0 flex-1">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleSelect(item.id)}
                          className="mt-1 rounded border-border accent-primary w-4 h-4"
                        />

                        <div className="space-y-1.5 min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-[10px] font-black uppercase tracking-wider text-primary bg-primary/10 px-2.5 py-0.5 rounded-full border border-primary/20">
                              {programName}
                            </span>
                            <span className="text-[10px] font-black uppercase tracking-wider text-indigo-400 bg-indigo-500/10 px-2.5 py-0.5 rounded-full border border-indigo-500/20">
                              v{item.version ?? 1}
                            </span>

                            <button
                              type="button"
                              onClick={() => handleToggleVisibility(item)}
                              className={`text-[9px] font-black uppercase tracking-widest px-3 py-1 rounded-full border transition-all flex items-center gap-1.5 shadow-sm ${
                                isVisible
                                  ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/20'
                                  : 'bg-amber-500/10 text-amber-400 border-amber-500/30 hover:bg-amber-500/20'
                              }`}
                            >
                              <span className={`w-2 h-2 rounded-full ${isVisible ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'}`} />
                              {isVisible ? 'Visible to School' : 'Hidden from School (Click to Unhide)'}
                            </button>
                          </div>

                          <h3 className="text-lg font-black text-foreground tracking-tight truncate">
                            {title}
                          </h3>

                          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                            <span className="flex items-center gap-1 font-bold">
                              <BuildingOfficeIcon className="w-3.5 h-3.5 text-primary" />
                              {schoolName}
                            </span>
                            <span>•</span>
                            <span className="font-bold text-foreground">{terms.length} Academic Term(s)</span>
                            <span>•</span>
                            <span>
                              Created {new Date(item.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                            </span>
                          </div>

                          <div className="flex flex-wrap items-center gap-2 pt-1">
                            <code className="text-[11px] font-mono bg-muted/60 border border-border px-2 py-1 rounded-lg text-foreground break-all">
                              {item.id}
                            </code>
                            <button
                              type="button"
                              onClick={() => void copyId(item.id)}
                              className="inline-flex items-center gap-1 px-2 py-1 text-[10px] font-bold uppercase tracking-wider border border-border rounded-lg hover:bg-muted"
                              title="Copy curriculum ID"
                            >
                              <ClipboardIcon className="w-3.5 h-3.5" /> Copy ID
                            </button>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0 w-full md:w-auto justify-end">
                        <button
                          type="button"
                          onClick={() => onSelectCurriculum(item)}
                          className="px-4 py-2 bg-primary hover:bg-primary/90 text-primary-foreground font-black text-xs uppercase tracking-wider rounded-xl shadow-md transition-all flex items-center gap-1.5"
                        >
                          <BookOpenIcon className="w-3.5 h-3.5" /> Inspect Syllabus
                        </button>

                        <button
                          type="button"
                          onClick={() => toggleExpand(item.id)}
                          className="p-2.5 border border-border text-muted-foreground hover:text-foreground bg-muted/20 hover:bg-muted/50 rounded-xl transition-all"
                          title="Show terms and blockers"
                        >
                          {isExpanded ? <ChevronDownIcon className="w-4 h-4" /> : <ChevronRightIcon className="w-4 h-4" />}
                        </button>

                        {isAdmin && (
                          <>
                            <button
                              type="button"
                              onClick={() => handleUnpublish(item.id)}
                              className="px-3 py-2 bg-amber-500/10 text-amber-400 hover:bg-amber-500 hover:text-white border border-amber-500/30 font-bold text-xs rounded-xl transition-all flex items-center gap-1"
                              title="Unpublish & Retire this official release"
                            >
                              <EyeSlashIcon className="w-3.5 h-3.5" /> Unpublish
                            </button>

                            <button
                              type="button"
                              onClick={() => handleDeleteItem(item.id)}
                              disabled={deletingId === item.id}
                              className="p-2.5 bg-rose-500/10 text-rose-400 hover:bg-rose-600 hover:text-white border border-rose-500/30 rounded-xl transition-all disabled:opacity-50"
                              title="Delete this curriculum"
                            >
                              <TrashIcon className="w-4 h-4" />
                            </button>
                          </>
                        )}
                      </div>
                    </div>

                    {isExpanded && (
                      <div className="mt-4 pt-4 border-t border-border/60 space-y-4 animate-in fade-in">
                        <div className="bg-muted/20 rounded-xl p-4 space-y-3">
                          <p className="text-xs font-black text-foreground uppercase tracking-wider">
                            Academic Terms &amp; Weekly Content Map
                          </p>
                          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                            {terms.map((t: any) => (
                              <div key={t.term} className="bg-card border border-border p-3.5 rounded-xl space-y-1.5 shadow-sm">
                                <div className="flex items-center justify-between">
                                  <span className="text-[10px] font-black text-brand-red-600 uppercase tracking-widest">
                                    Term {t.term} {t.title ? `· ${t.title}` : ''}
                                  </span>
                                  <CheckCircleIcon className="w-3.5 h-3.5 text-emerald-400" />
                                </div>
                                <p className="text-xs font-bold text-foreground truncate">
                                  {(t.weeks ?? []).length} Weekly Sessions
                                </p>
                                <div className="text-[11px] text-muted-foreground space-y-1 pt-1 border-t border-border/40 max-h-24 overflow-y-auto custom-scrollbar">
                                  {(t.weeks ?? []).slice(0, 4).map((w: any) => (
                                    <p key={w.week} className="truncate">
                                      <span className="font-bold text-foreground">W{w.week}:</span> {w.topic || w.type}
                                    </p>
                                  ))}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>

                        <div className="bg-rose-500/5 border border-rose-500/20 rounded-xl p-4 space-y-3">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <p className="text-xs font-black text-rose-500 uppercase tracking-wider">
                              Holding / debris for this ID
                            </p>
                            <button
                              type="button"
                              onClick={() => void loadBlockers(item.id)}
                              className="text-[10px] font-bold uppercase tracking-wider px-2 py-1 border border-border rounded-lg hover:bg-muted"
                            >
                              Refresh blockers
                            </button>
                          </div>

                          {blockers?.loading && (
                            <p className="text-xs text-muted-foreground">Loading blockers…</p>
                          )}
                          {blockers?.error && (
                            <p className="text-xs text-rose-500">{blockers.error}</p>
                          )}
                          {!blockers?.loading && blockers?.dependents?.length === 0 && !blockers?.error && (
                            <p className="text-xs text-emerald-600 font-bold">
                              No blockers found — soft delete should succeed.
                            </p>
                          )}
                          {(blockers?.dependents?.length || 0) > 0 && (
                            <ul className="space-y-2 max-h-64 overflow-y-auto">
                              {blockers!.dependents.map((d) => (
                                <li
                                  key={`${d.kind}-${d.id}`}
                                  className="bg-card border border-border rounded-xl px-3 py-2 text-xs space-y-1"
                                >
                                  <div className="flex flex-wrap items-center gap-2 justify-between">
                                    <span className="font-bold text-foreground">{d.label}</span>
                                    <span className="text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
                                      {KIND_LABEL[d.kind] || d.kind} · {d.onCleanup}
                                    </span>
                                  </div>
                                  <p className="text-muted-foreground">{d.detail}</p>
                                  {d.href && (
                                    <a
                                      href={d.href}
                                      className="inline-flex items-center gap-1 text-primary font-bold hover:underline"
                                    >
                                      <ArrowRightIcon className="w-3 h-3" /> Open
                                    </a>
                                  )}
                                </li>
                              ))}
                            </ul>
                          )}

                          {isAdmin && (blockers?.dependents?.length || 0) > 0 && (
                            <button
                              type="button"
                              onClick={() => handleDeleteItem(item.id, true)}
                              disabled={deletingId === item.id}
                              className="w-full py-2.5 bg-rose-600 hover:bg-rose-700 text-white text-xs font-black uppercase tracking-wider rounded-xl disabled:opacity-50"
                            >
                              {deletingId === item.id ? 'Cleaning…' : 'Clean blockers and delete'}
                            </button>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {showResetModal && (
        <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-in fade-in duration-200">
          <div className="bg-card border border-rose-500/50 rounded-2xl p-6 max-w-md w-full shadow-2xl space-y-5 text-left">
            <div className="flex items-center gap-3 text-rose-500">
              <div className="p-3 bg-rose-500/10 rounded-xl border border-rose-500/20">
                <ExclamationTriangleIcon className="w-8 h-8 flex-shrink-0 animate-pulse" />
              </div>
              <div>
                <h3 className="text-lg font-black uppercase tracking-tight text-foreground">Master Reset / Wipe All</h3>
                <p className="text-xs text-rose-400 font-bold">Danger Zone — Administrative Clean Slate</p>
              </div>
            </div>

            <p className="text-xs text-muted-foreground leading-relaxed">
              Permanently deletes <strong className="text-foreground">{curricula.length} curriculum records</strong>,
              clears delivery schedules / adoptions / tracking that block them, and then purges orphan editions left behind.
              Failures are listed on this page so nothing silent remains.
            </p>

            <div className="bg-rose-500/10 border border-rose-500/30 p-4 rounded-xl space-y-2">
              <p className="text-[10px] font-black text-rose-400 uppercase tracking-widest">
                Type RESET to confirm deletion:
              </p>
              <input
                type="text"
                placeholder="RESET"
                value={resetConfirmInput}
                onChange={(e) => setResetConfirmInput(e.target.value)}
                className="w-full px-3.5 py-2.5 bg-background border border-border text-foreground font-mono text-sm uppercase rounded-lg focus:outline-none focus:border-rose-500 focus:ring-2 focus:ring-rose-500/20"
              />
            </div>

            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={() => {
                  setShowResetModal(false);
                  setResetConfirmInput('');
                }}
                className="flex-1 py-3 border border-border text-xs font-bold rounded-xl hover:bg-muted transition-all"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleMasterReset}
                disabled={resetConfirmInput.trim() !== 'RESET' || isProcessingBulk}
                className="flex-1 py-3 bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-white text-xs font-black uppercase tracking-wider rounded-xl transition-all shadow-md"
              >
                {isProcessingBulk ? 'Wiping All...' : 'Confirm Wipe All'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showPurgeModal && (
        <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-in fade-in duration-200">
          <div className="bg-card border border-amber-500/50 rounded-2xl p-6 max-w-md w-full shadow-2xl space-y-5 text-left">
            <h3 className="text-lg font-black uppercase tracking-tight text-foreground">Purge Orphan Debris</h3>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Removes orphan official editions and teaching debris (orphan lesson plans, lessons,
              assignments, flashcards, exams, CBT) that no longer have a valid parent.
            </p>
            <input
              type="text"
              placeholder="PURGE"
              value={purgeConfirm}
              onChange={(e) => setPurgeConfirm(e.target.value)}
              className="w-full px-3.5 py-2.5 bg-background border border-border text-foreground font-mono text-sm uppercase rounded-lg focus:outline-none focus:border-amber-500"
            />
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => {
                  setShowPurgeModal(false);
                  setPurgeConfirm('');
                }}
                className="flex-1 py-3 border border-border text-xs font-bold rounded-xl hover:bg-muted"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handlePurgeDebris}
                disabled={purgeConfirm.trim() !== 'PURGE' || isProcessingBulk}
                className="flex-1 py-3 bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white text-xs font-black uppercase tracking-wider rounded-xl"
              >
                {isProcessingBulk ? 'Purging…' : 'Confirm Purge'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
