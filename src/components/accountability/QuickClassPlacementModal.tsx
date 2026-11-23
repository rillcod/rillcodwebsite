'use client';

import { useEffect, useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import {
  AcademicCapIcon,
  ArrowPathIcon,
  CheckCircleIcon,
  MagnifyingGlassIcon,
  XMarkIcon,
} from '@/lib/icons';
import { toast } from 'sonner';
import type { Person } from '@/lib/accountability/types';

type ActiveClassOption = {
  id: string;
  name: string;
  school_id: string | null;
  school_name: string | null;
  qa_grade_key: string | null;
  current_students: number | null;
  max_students: number | null;
};

type Props = {
  isOpen: boolean;
  onClose: () => void;
  students: Person[];
  onPlaced: () => void;
};

/**
 * 1-Click Class Placement Modal for Accountability.
 * Reuses POST/PUT /api/classes/[id]/enroll so admins can place one or many
 * unplaced students into an active class directly without leaving Accountability.
 */
export default function QuickClassPlacementModal({
  isOpen,
  onClose,
  students,
  onPlaced,
}: Props) {
  const [classes, setClasses] = useState<ActiveClassOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [selectedClassId, setSelectedClassId] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    const db = createClient();
    db.from('classes')
      .select('id, name, school_id, qa_grade_key, current_students, max_students, schools(name)')
      .eq('status', 'active')
      .order('name', { ascending: true })
      .limit(250)
      .then(({ data, error: dbErr }) => {
        if (cancelled) return;
        if (dbErr) {
          setError(dbErr.message);
          setLoading(false);
          return;
        }
        const rows: ActiveClassOption[] = (data ?? []).map((c: any) => ({
          id: c.id,
          name: c.name,
          school_id: c.school_id ?? null,
          school_name: Array.isArray(c.schools) ? c.schools[0]?.name ?? null : c.schools?.name ?? null,
          qa_grade_key: c.qa_grade_key ?? null,
          current_students: c.current_students ?? null,
          max_students: c.max_students ?? null,
        }));
        setClasses(rows);
        // Pre-filter search by first student's school if available
        const firstSchool = students[0]?.school_name;
        if (firstSchool) setSearch(firstSchool);
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isOpen, students]);

  const filteredClasses = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return classes;
    return classes.filter((c) =>
      `${c.name} ${c.school_name ?? ''} ${c.qa_grade_key ?? ''}`.toLowerCase().includes(q),
    );
  }, [classes, search]);

  const handlePlace = async () => {
    if (!selectedClassId || students.length === 0) return;
    setSubmitting(true);
    setError(null);
    try {
      const targetClass = classes.find((c) => c.id === selectedClassId);
      if (students.length === 1) {
        const res = await fetch(`/api/classes/${selectedClassId}/enroll`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            studentId: students[0].id,
            forceClaim: true,
            promoteToClassGrade: true,
          }),
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(json.error || 'Could not place student');
        toast.success(`Placed ${students[0].full_name || 'student'} into ${targetClass?.name || 'class'}.`);
      } else {
        const res = await fetch(`/api/classes/${selectedClassId}/enroll`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            studentIds: students.map((s) => s.id),
            forceClaim: true,
          }),
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(json.error || 'Could not place students');
        toast.success(`Placed ${students.length} students into ${targetClass?.name || 'class'}.`);
      }
      onPlaced();
      onClose();
    } catch (e: any) {
      const msg = e?.message || 'Placement failed';
      setError(msg);
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[9980] flex items-center justify-center bg-black/70 backdrop-blur-sm p-3 sm:p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget && !submitting) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="quick-class-placement-title"
        className="w-full max-w-lg rounded-2xl border border-border bg-card shadow-2xl overflow-hidden max-h-[88dvh] flex flex-col"
      >
        <div className="px-5 py-4 border-b border-border bg-muted/30 flex items-start justify-between gap-3">
          <div className="flex items-start gap-2.5 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-primary text-primary-foreground flex items-center justify-center shrink-0">
              <AcademicCapIcon className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h2 id="quick-class-placement-title" className="text-base font-black text-foreground">
                Quick Class Placement
              </h2>
              <p className="text-xs text-muted-foreground mt-0.5 truncate">
                {students.length === 1
                  ? `Place ${students[0].full_name || 'student'} into an active class`
                  : `Place ${students.length} selected students into an active class`}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            aria-label="Close placement modal"
            className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-border bg-background text-foreground hover:bg-muted"
          >
            <XMarkIcon className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 sm:p-5 space-y-3 overflow-y-auto flex-1">
          <div className="relative">
            <MagnifyingGlassIcon className="w-4 h-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Filter classes by name, school, or grade…"
              aria-label="Filter destination classes"
              className="w-full rounded-xl border border-border bg-background pl-9 pr-3 py-2.5 text-xs font-medium text-foreground focus:border-primary focus:outline-none"
            />
          </div>

          {error && (
            <p className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs font-bold text-rose-700 dark:text-rose-300">
              {error}
            </p>
          )}

          {loading ? (
            <div className="py-10 flex items-center justify-center gap-2 text-xs text-muted-foreground">
              <ArrowPathIcon className="w-4 h-4 animate-spin text-primary" /> Loading active classes…
            </div>
          ) : filteredClasses.length === 0 ? (
            <p className="py-8 text-center text-xs text-muted-foreground">
              No active classes match &ldquo;{search}&rdquo;. Clear search to view all classes.
            </p>
          ) : (
            <div className="divide-y divide-border rounded-xl border border-border max-h-72 overflow-y-auto">
              {filteredClasses.map((cls) => {
                const selected = selectedClassId === cls.id;
                const full = cls.max_students != null && cls.max_students > 0 && (cls.current_students ?? 0) >= cls.max_students;
                return (
                  <button
                    key={cls.id}
                    type="button"
                    onClick={() => setSelectedClassId(cls.id)}
                    className={`w-full px-3.5 py-2.5 text-left flex items-center justify-between gap-2 transition-colors ${
                      selected ? 'bg-primary/10' : 'hover:bg-muted/40'
                    }`}
                  >
                    <div className="min-w-0">
                      <p className={`text-xs font-bold truncate ${selected ? 'text-primary' : 'text-foreground'}`}>
                        {cls.name}
                      </p>
                      <p className="text-[11px] text-muted-foreground truncate">
                        {cls.school_name || 'No school'}
                        {cls.qa_grade_key ? ` · ${cls.qa_grade_key}` : ''}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                        full ? 'bg-rose-500/10 text-rose-700 dark:text-rose-300' : 'bg-muted text-muted-foreground'
                      }`}>
                        {cls.current_students ?? 0}{cls.max_students ? `/${cls.max_students}` : ''}
                      </span>
                      {selected && <CheckCircleIcon className="w-4 h-4 text-primary" />}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className="px-5 py-3.5 border-t border-border bg-muted/30 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="rounded-xl border border-border bg-background px-4 py-2 text-xs font-bold text-foreground hover:bg-muted"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!selectedClassId || submitting}
            onClick={() => void handlePlace()}
            className="inline-flex items-center gap-1.5 rounded-xl bg-primary text-primary-foreground px-4 py-2 text-xs font-black uppercase tracking-wider disabled:opacity-50"
          >
            {submitting ? <ArrowPathIcon className="w-3.5 h-3.5 animate-spin" /> : <CheckCircleIcon className="w-3.5 h-3.5" />}
            {submitting ? 'Placing…' : `Place ${students.length === 1 ? 'Student' : `${students.length} Students`}`}
          </button>
        </div>
      </div>
    </div>
  );
}
