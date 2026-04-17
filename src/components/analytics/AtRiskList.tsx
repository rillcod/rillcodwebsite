// @refresh reset
'use client';

import { useState, useEffect } from 'react';
import { ExclamationTriangleIcon, UserCircleIcon } from '@/lib/icons';
import type { AtRiskStudent, AtRiskSignal } from '@/services/analytics.service';

// ── Signal badge config ───────────────────────────────────────────────────────
const SIGNAL_CONFIG: Record<AtRiskSignal, { label: string; className: string }> = {
  no_login: {
    label: 'No Login 7d',
    className: 'bg-rose-500/20 text-rose-400 border border-rose-500/30',
  },
  low_attendance: {
    label: 'Low Attendance',
    className: 'bg-amber-500/20 text-amber-400 border border-amber-500/30',
  },
  overdue_assignments: {
    label: 'Overdue Work',
    className: 'bg-orange-500/20 text-orange-400 border border-orange-500/30',
  },
};

interface Props {
  schoolId?: string;
  classId?: string;
}

export function AtRiskList({ schoolId, classId }: Props) {
  const [students, setStudents] = useState<AtRiskStudent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const params = new URLSearchParams();
        if (schoolId) params.set('school_id', schoolId);
        if (classId) params.set('class_id', classId);
        const res = await fetch(`/api/analytics/at-risk?${params}`);
        if (!res.ok) throw new Error('Failed to load');
        const json = await res.json();
        setStudents(json.data ?? []);
      } catch (err) {
        console.error('Failed to load at-risk students:', err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [schoolId, classId]);

  if (loading) {
    return (
      <div className="animate-pulse space-y-4">
        {[1, 2, 3].map(i => <div key={i} className="h-16 bg-white/5 rounded-2xl" />)}
      </div>
    );
  }

  // Req 5.5 — empty state when no students are at risk
  if (students.length === 0) {
    return (
      <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-2xl p-8 text-center">
        <div className="w-12 h-12 bg-emerald-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
          <UserCircleIcon className="w-6 h-6 text-emerald-400" />
        </div>
        <p className="text-emerald-400 font-bold">All students on track!</p>
        <p className="text-emerald-400/60 text-sm mt-1">No learners flagged for risk currently.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {students.map(student => (
        <div
          key={student.portal_user_id}
          className="bg-white/5 border border-border rounded-2xl p-4 flex items-start justify-between gap-4 hover:bg-white/8 transition-all"
        >
          <div className="flex items-start gap-4">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-rose-500/20 shrink-0">
              <ExclamationTriangleIcon className="w-5 h-5 text-rose-400" />
            </div>
            <div>
              <p className="font-bold text-white">{student.full_name}</p>
              {/* Req 5.4 — triggered_signals as labelled badges */}
              <div className="flex flex-wrap gap-1.5 mt-2">
                {student.triggered_signals.map(signal => {
                  const cfg = SIGNAL_CONFIG[signal];
                  return (
                    <span
                      key={signal}
                      className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide ${cfg.className}`}
                    >
                      {cfg.label}
                    </span>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
