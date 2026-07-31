'use client';

import { useState } from 'react';
import {
  TrashIcon, EyeIcon, EyeSlashIcon, MagnifyingGlassIcon,
  ExclamationTriangleIcon, CheckCircleIcon, ArrowPathIcon,
  ShieldCheckIcon, BookOpenIcon, SparklesIcon, ChevronDownIcon,
  ChevronRightIcon, BuildingOfficeIcon, TagIcon,
  DocumentCheckIcon, RocketLaunchIcon
} from '@/lib/icons';
import { toast } from 'react-hot-toast';

interface MasterCurriculumRosterProps {
  curricula: any[];
  isAdmin: boolean;
  onRefresh: () => void;
  onSelectCurriculum: (item: any) => void;
}

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

  // Filter curricula
  const filtered = curricula.filter((item) => {
    const title = item.courses?.title || item.content?.description || 'Untitled Curriculum';
    const programName = item.courses?.programs?.name || '';
    const schoolName = item.schools?.name || 'Platform Shared Template';
    const matchesSearch =
      title.toLowerCase().includes(search.toLowerCase()) ||
      programName.toLowerCase().includes(search.toLowerCase()) ||
      schoolName.toLowerCase().includes(search.toLowerCase());

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

  // Delete single item with optional force cleanup
  const handleDeleteItem = async (id: string, force = false) => {
    setDeletingId(id);
    try {
      const url = force ? `/api/curricula/${id}?force=1` : `/api/curricula/${id}`;
      const res = await fetch(url, { method: 'DELETE' });
      const json = await res.json().catch(() => ({}));

      if (!res.ok) {
        if (res.status === 409 && json.can_force && !force) {
          const detail = [
            json.official_release_count ? `${json.official_release_count} official release(s) unlinked` : null,
            json.draft_plan_count ? `${json.draft_plan_count} draft plan(s) removed` : null,
            json.live_plan_count ? `${json.live_plan_count} live plan(s) detached` : null,
            json.delivery_record_count ? `${json.delivery_record_count} tracking week(s) cleared` : null,
          ].filter(Boolean).join('\n• ');

          if (
            window.confirm(
              `This curriculum is linked to active records:\n• ${detail}\n\nDo you want to FORCE DELETE and clean up these blockers?`
            )
          ) {
            await handleDeleteItem(id, true);
            return;
          }
        }
        throw new Error(json.error || 'Failed to delete curriculum');
      }

      toast.success(force ? 'Cleaned dependencies and deleted curriculum' : 'Curriculum deleted successfully');
      setSelectedIds((prev) => prev.filter((x) => x !== id));
      onRefresh();
    } catch (err: any) {
      toast.error(err.message || 'Deletion failed');
    } finally {
      setDeletingId(null);
    }
  };

  // Bulk Delete Selected
  const handleBulkDeleteSelected = async () => {
    if (selectedIds.length === 0) return;
    if (!window.confirm(`Are you sure you want to delete ${selectedIds.length} selected curriculum records?`)) return;

    setIsProcessingBulk(true);
    try {
      const res = await fetch('/api/curricula/bulk-delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: selectedIds }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Bulk delete failed');

      toast.success(`Successfully deleted ${json.deletedCount} curriculum records`);
      setSelectedIds([]);
      onRefresh();
    } catch (err: any) {
      toast.error(err.message || 'Bulk delete failed');
    } finally {
      setIsProcessingBulk(false);
    }
  };

  // Master Reset / Wipe All
  const handleMasterReset = async () => {
    if (resetConfirmInput.trim() !== 'RESET') {
      toast.error("Please type 'RESET' in uppercase to confirm.");
      return;
    }

    setIsProcessingBulk(true);
    try {
      const res = await fetch('/api/curricula/bulk-delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reset_all: true, confirmation: 'RESET' }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Master wipe failed');

      toast.success(`Master reset complete! Removed ${json.deletedCount} curriculum records.`);
      setShowResetModal(false);
      setResetConfirmInput('');
      setSelectedIds([]);
      onRefresh();
    } catch (err: any) {
      toast.error(err.message || 'Master wipe failed');
    } finally {
      setIsProcessingBulk(false);
    }
  };

  // Toggle Visibility for a curriculum
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

  // Explicitly Unpublish and Retire official releases
  const handleUnpublish = async (id: string) => {
    if (!window.confirm('Are you sure you want to UNPUBLISH and RETIRE this official curriculum edition? It will be hidden from all schools.')) return;
    try {
      const res = await fetch('/api/curricula/unpublish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ curriculum_id: id }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Unpublish failed');

      toast.success('Curriculum edition explicitly unpublished and retired!');
      onRefresh();
    } catch (err: any) {
      toast.error(err.message || 'Unpublish failed');
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* Sleek Hero Header */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-brand-red-600/10 via-primary/10 to-indigo-600/10 border border-primary/20 p-6 backdrop-blur-xl shadow-lg">
        <div className="absolute top-0 right-0 -mt-8 -mr-8 w-48 h-48 bg-primary/10 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
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
              Transparent, full-spectrum inspection of every course syllabus in your database. Easily unhide draft items, force-clean dependencies, or wipe data to start completely fresh.
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
              <button
                type="button"
                onClick={() => setShowResetModal(true)}
                className="px-4 py-2.5 text-xs font-black uppercase tracking-wider bg-rose-500/10 text-rose-500 border border-rose-500/30 hover:bg-rose-600 hover:text-white rounded-xl shadow-sm transition-all duration-200 flex items-center gap-2"
              >
                <ExclamationTriangleIcon className="w-4 h-4" /> Start Fresh / Wipe All
              </button>
            )}
          </div>
        </div>

        {/* Filter and Search Bar */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-5 mt-5 border-t border-border/60">
          <div className="relative">
            <MagnifyingGlassIcon className="w-4 h-4 text-muted-foreground absolute left-3.5 top-3" />
            <input
              type="text"
              placeholder="Search by course, program, or school..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2 text-xs bg-background/80 border border-border rounded-xl focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all shadow-inner"
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

      {/* Curricula Cards Grid */}
      {filtered.length === 0 ? (
        <div className="text-center py-20 bg-card border border-dashed border-border rounded-2xl space-y-4 shadow-sm">
          <BookOpenIcon className="w-14 h-14 text-muted-foreground/30 mx-auto animate-bounce" />
          <div className="space-y-1">
            <p className="text-base font-black text-foreground">No Curricula Match Your Filter</p>
            <p className="text-xs text-muted-foreground max-w-sm mx-auto">
              {search ? 'Try clearing your search term or switching visibility filters.' : 'No curriculum syllabi exist in the database yet. Click Syllabus Builder to generate one.'}
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
                  {/* Left Accent Status Strip */}
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

                          <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
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
                        </div>
                      </div>

                      {/* Action buttons */}
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
                          onClick={() => setExpandedId(isExpanded ? null : item.id)}
                          className="p-2.5 border border-border text-muted-foreground hover:text-foreground bg-muted/20 hover:bg-muted/50 rounded-xl transition-all"
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

                    {/* Expanded Term Breakdown */}
                    {isExpanded && (
                      <div className="mt-4 pt-4 border-t border-border/60 bg-muted/20 rounded-xl p-4 space-y-3 animate-in fade-in">
                        <p className="text-xs font-black text-foreground uppercase tracking-wider">
                          Academic Terms &amp; Weekly Content Map:
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
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Master Wipe Confirmation Modal */}
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
              This action will permanently delete <strong className="text-foreground">{curricula.length} curriculum records</strong> and clean up all associated draft plans, QA runs, and tracking records so you can start completely fresh.
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
    </div>
  );
}
