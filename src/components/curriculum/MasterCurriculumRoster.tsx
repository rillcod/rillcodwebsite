'use client';

import { useState } from 'react';
import {
  TrashIcon, EyeIcon, EyeSlashIcon, MagnifyingGlassIcon,
  ExclamationTriangleIcon, CheckCircleIcon, ArrowPathIcon,
  ShieldCheckIcon, BookOpenIcon, SparklesIcon, ChevronDownIcon,
  ChevronRightIcon, BuildingOfficeIcon, TagIcon
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
              `This curriculum is linked to other items:\n• ${detail}\n\nDo you want to FORCE DELETE and clean up these blockers?`
            )
          ) {
            await handleDeleteItem(id, true);
            return;
          }
        }
        throw new Error(json.error || 'Failed to delete curriculum');
      }

      toast.success(force ? 'Force deleted curriculum and cleaned dependencies' : 'Curriculum deleted successfully');
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
      toast.success(newStatus ? 'Curriculum published to school' : 'Curriculum hidden from school view');
      onRefresh();
    } catch (err: any) {
      toast.error(err.message || 'Failed to update visibility');
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Controls & Status Bar */}
      <div className="bg-card border border-border rounded-xl p-5 shadow-sm space-y-4">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-black text-brand-red-600 uppercase tracking-widest bg-brand-red-600/10 px-2 py-0.5 rounded-full border border-brand-red-600/20">
                Master Roster Mode
              </span>
              <span className="text-xs text-muted-foreground font-bold">
                {curricula.length} Total Curricula in Database
              </span>
            </div>
            <h2 className="text-lg font-black text-foreground uppercase tracking-tight mt-1">
              All Curricula &amp; Hidden Items
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Inspect every curriculum item across all programs, terms, and visibility flags. Unhide or delete items cleanly.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
            <button
              type="button"
              onClick={onRefresh}
              className="px-3 py-2 text-xs font-bold border border-border rounded-xl hover:bg-muted transition flex items-center gap-1.5"
            >
              <ArrowPathIcon className="w-3.5 h-3.5" /> Refresh
            </button>

            {isAdmin && (
              <button
                type="button"
                onClick={() => setShowResetModal(true)}
                className="px-3 py-2 text-xs font-bold bg-rose-500/10 text-rose-500 border border-rose-500/20 hover:bg-rose-500 hover:text-white rounded-xl transition flex items-center gap-1.5"
              >
                <ExclamationTriangleIcon className="w-3.5 h-3.5" /> Start Fresh / Wipe All
              </button>
            )}
          </div>
        </div>

        {/* Filter and Search Bar */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 border-t border-border/60">
          <div className="relative">
            <MagnifyingGlassIcon className="w-4 h-4 text-muted-foreground absolute left-3 top-3" />
            <input
              type="text"
              placeholder="Search by course, program, or school..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-2 text-xs bg-background border border-border rounded-xl focus:outline-none focus:border-primary"
            />
          </div>

          <div className="flex items-center gap-1 bg-background border border-border rounded-xl p-1">
            <button
              type="button"
              onClick={() => setVisibilityFilter('all')}
              className={`flex-1 py-1 text-[10px] font-black uppercase tracking-wider rounded-lg transition ${
                visibilityFilter === 'all' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              All ({curricula.length})
            </button>
            <button
              type="button"
              onClick={() => setVisibilityFilter('visible')}
              className={`flex-1 py-1 text-[10px] font-black uppercase tracking-wider rounded-lg transition ${
                visibilityFilter === 'visible' ? 'bg-emerald-600 text-white' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              Visible ({curricula.filter((c) => c.is_visible_to_school).length})
            </button>
            <button
              type="button"
              onClick={() => setVisibilityFilter('hidden')}
              className={`flex-1 py-1 text-[10px] font-black uppercase tracking-wider rounded-lg transition ${
                visibilityFilter === 'hidden' ? 'bg-amber-600 text-white' : 'text-muted-foreground hover:text-foreground'
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
              className="py-2 px-4 bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs rounded-xl transition flex items-center justify-center gap-2"
            >
              <TrashIcon className="w-4 h-4" />
              Delete Selected ({selectedIds.length})
            </button>
          )}
        </div>
      </div>

      {/* Curricula Table / List */}
      {filtered.length === 0 ? (
        <div className="text-center py-16 bg-card border border-dashed border-border rounded-xl space-y-3">
          <BookOpenIcon className="w-12 h-12 text-muted-foreground/30 mx-auto" />
          <p className="text-sm font-bold text-foreground">No curricula found</p>
          <p className="text-xs text-muted-foreground">
            {search ? 'Try clearing your search query' : 'No curriculum records exist yet. Click Generate Curriculum to create one.'}
          </p>
        </div>
      ) : (
        <div className="bg-card border border-border rounded-xl overflow-hidden shadow-sm">
          <div className="p-3 bg-muted/40 border-b border-border flex items-center justify-between">
            <label className="flex items-center gap-2 text-xs font-bold text-muted-foreground cursor-pointer">
              <input
                type="checkbox"
                checked={selectedIds.length === filtered.length && filtered.length > 0}
                onChange={toggleSelectAll}
                className="rounded border-border accent-primary"
              />
              Select All Shown ({filtered.length})
            </label>
            <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
              Showing {filtered.length} of {curricula.length} Total Records
            </span>
          </div>

          <div className="divide-y divide-border">
            {filtered.map((item) => {
              const title = item.courses?.title || item.content?.description || 'Untitled Course Curriculum';
              const programName = item.courses?.programs?.name || 'General Program';
              const schoolName = item.schools?.name || 'Platform Shared Template';
              const isVisible = item.is_visible_to_school;
              const terms = item.content?.terms ?? [];
              const isExpanded = expandedId === item.id;
              const isSelected = selectedIds.includes(item.id);

              return (
                <div
                  key={item.id}
                  className={`p-4 transition-colors ${
                    isSelected ? 'bg-primary/5' : 'hover:bg-muted/20'
                  }`}
                >
                  <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                    <div className="flex items-start gap-3 min-w-0 flex-1">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleSelect(item.id)}
                        className="mt-1 rounded border-border accent-primary"
                      />

                      <div className="space-y-1 min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-[10px] font-black uppercase tracking-wider text-muted-foreground bg-muted px-2 py-0.5 rounded">
                            {programName}
                          </span>
                          <span className="text-[10px] font-black uppercase tracking-wider text-indigo-400 bg-indigo-500/10 px-2 py-0.5 rounded border border-indigo-500/20">
                            v{item.version ?? 1}
                          </span>
                          <button
                            type="button"
                            onClick={() => handleToggleVisibility(item)}
                            className={`text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full border transition flex items-center gap-1 ${
                              isVisible
                                ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20 hover:bg-emerald-500/20'
                                : 'bg-amber-500/10 text-amber-400 border-amber-500/20 hover:bg-amber-500/20'
                            }`}
                          >
                            {isVisible ? <EyeIcon className="w-3 h-3" /> : <EyeSlashIcon className="w-3 h-3" />}
                            {isVisible ? 'Visible to School' : 'Hidden from School (Click to Unhide)'}
                          </button>
                        </div>

                        <h3 className="text-base font-black text-foreground tracking-tight truncate">
                          {title}
                        </h3>

                        <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <BuildingOfficeIcon className="w-3.5 h-3.5" />
                            {schoolName}
                          </span>
                          <span>•</span>
                          <span>{terms.length} Academic Term(s)</span>
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
                        className="px-3 py-1.5 bg-primary/10 hover:bg-primary text-primary hover:text-primary-foreground font-bold text-xs rounded-xl border border-primary/20 transition flex items-center gap-1"
                      >
                        <BookOpenIcon className="w-3.5 h-3.5" /> Inspect Syllabus
                      </button>

                      <button
                        type="button"
                        onClick={() => setExpandedId(isExpanded ? null : item.id)}
                        className="p-2 border border-border text-muted-foreground hover:text-foreground rounded-xl transition"
                      >
                        {isExpanded ? <ChevronDownIcon className="w-4 h-4" /> : <ChevronRightIcon className="w-4 h-4" />}
                      </button>

                      {isAdmin && (
                        <button
                          type="button"
                          onClick={() => handleDeleteItem(item.id)}
                          disabled={deletingId === item.id}
                          className="p-2 bg-rose-500/10 text-rose-400 hover:bg-rose-500 hover:text-white border border-rose-500/20 rounded-xl transition disabled:opacity-50"
                          title="Delete this curriculum"
                        >
                          <TrashIcon className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Expanded Breakdown */}
                  {isExpanded && (
                    <div className="mt-4 pt-3 border-t border-border/60 bg-muted/20 rounded-xl p-4 space-y-3">
                      <p className="text-xs font-bold text-foreground">Terms &amp; Weekly Topics Breakdown:</p>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                        {terms.map((t: any) => (
                          <div key={t.term} className="bg-card border border-border p-3 rounded-lg space-y-1">
                            <span className="text-[10px] font-black text-brand-red-600 uppercase tracking-widest block">
                              Term {t.term} {t.title ? `· ${t.title}` : ''}
                            </span>
                            <p className="text-xs font-bold text-foreground truncate">
                              {(t.weeks ?? []).length} Weeks / Sessions
                            </p>
                            <div className="text-[11px] text-muted-foreground space-y-0.5 max-h-24 overflow-y-auto custom-scrollbar">
                              {(t.weeks ?? []).slice(0, 4).map((w: any) => (
                                <p key={w.week} className="truncate">
                                  W{w.week}: {w.topic || w.type}
                                </p>
                              ))}
                              {(t.weeks ?? []).length > 4 && (
                                <p className="text-[10px] text-primary font-bold">
                                  +{(t.weeks ?? []).length - 4} more weeks...
                                </p>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Master Wipe Confirmation Modal */}
      {showResetModal && (
        <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/75 backdrop-blur-sm p-4">
          <div className="bg-card border border-rose-500/40 rounded-2xl p-6 max-w-md w-full shadow-2xl space-y-4 text-left">
            <div className="flex items-center gap-3 text-rose-500">
              <ExclamationTriangleIcon className="w-8 h-8 flex-shrink-0" />
              <div>
                <h3 className="text-lg font-black uppercase tracking-tight">Wipe All Curriculum Data</h3>
                <p className="text-xs text-muted-foreground font-semibold">Danger Zone — Administrative Reset</p>
              </div>
            </div>

            <p className="text-xs text-muted-foreground leading-relaxed">
              This action will permanently delete <strong className="text-foreground">{curricula.length} curriculum records</strong> and clean up all associated draft plans and tracking records so you can start completely fresh.
            </p>

            <div className="bg-rose-500/10 border border-rose-500/20 p-3 rounded-xl space-y-1">
              <p className="text-[10px] font-black text-rose-400 uppercase tracking-widest">
                Type RESET to confirm deletion:
              </p>
              <input
                type="text"
                placeholder="RESET"
                value={resetConfirmInput}
                onChange={(e) => setResetConfirmInput(e.target.value)}
                className="w-full px-3 py-2 bg-background border border-border text-foreground font-mono text-sm uppercase rounded-lg focus:outline-none focus:border-rose-500"
              />
            </div>

            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => {
                  setShowResetModal(false);
                  setResetConfirmInput('');
                }}
                className="flex-1 py-2.5 border border-border text-xs font-bold rounded-xl hover:bg-muted transition"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleMasterReset}
                disabled={resetConfirmInput.trim() !== 'RESET' || isProcessingBulk}
                className="flex-1 py-2.5 bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-white text-xs font-black uppercase tracking-wider rounded-xl transition"
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
