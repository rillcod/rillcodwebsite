'use client';

import { useAuth } from '@/contexts/auth-context';
import { useEffect, useState, Suspense, useMemo } from 'react';
import { useSearchParams } from 'next/navigation';
import { ClipboardDocumentCheckIcon, AcademicCapIcon } from '@/lib/icons';
import { toast } from 'sonner';

interface Child { id: string; full_name: string; school_name: string | null }
interface AttendanceRecord {
  id: string;
  date: string;
  status: 'present' | 'absent' | 'late' | 'excused';
  note: string | null;
  course_name: string | null;
}

type StatusFilter = 'all' | 'present' | 'absent' | 'late' | 'excused';

const STATUS_STYLE: Record<string, string> = {
  present: 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400',
  absent: 'bg-rose-500/10 border-rose-500/30 text-rose-400',
  late: 'bg-amber-500/10 border-amber-500/30 text-amber-400',
  excused: 'bg-primary/10 border-primary/30 text-primary',
};

const STATUS_DOT: Record<string, string> = {
  present: 'bg-emerald-400',
  absent: 'bg-rose-400',
  late: 'bg-amber-400',
  excused: 'bg-primary',
};

const STATUS_LABEL: Record<StatusFilter, string> = {
  all: 'All',
  present: 'Present',
  absent: 'Absent',
  late: 'Late',
  excused: 'Excused',
};

const FILTER_TABS: StatusFilter[] = ['all', 'present', 'absent', 'late', 'excused'];

const TAB_ACTIVE: Record<StatusFilter, string> = {
  all: 'bg-white/10 border-white/20 text-white',
  present: 'bg-emerald-500/15 border-emerald-500/40 text-emerald-400',
  absent: 'bg-rose-500/15 border-rose-500/40 text-rose-400',
  late: 'bg-amber-500/15 border-amber-500/40 text-amber-400',
  excused: 'bg-primary/15 border-primary/40 text-primary',
};

const EMPTY_ICON_COLOR: Record<StatusFilter, string> = {
  all: 'text-muted-foreground',
  present: 'text-emerald-400',
  absent: 'text-rose-400',
  late: 'text-amber-400',
  excused: 'text-primary',
};

/** Get ISO week number (Mon-based) from a date string */
function getISOWeek(dateStr: string): { year: number; week: number } {
  const d = new Date(dateStr);
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayOfWeek = date.getUTCDay() || 7; // make Sunday = 7
  date.setUTCDate(date.getUTCDate() + 4 - dayOfWeek);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const weekNum = Math.ceil((((date.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return { year: date.getUTCFullYear(), week: weekNum };
}

function isoWeekKey(dateStr: string): string {
  const { year, week } = getISOWeek(dateStr);
  return `${year}-W${String(week).padStart(2, '0')}`;
}

/** Attendance ring SVG */
function AttendanceRing({ pct }: { pct: number }) {
  const radius = 54;
  const circumference = 2 * Math.PI * radius;
  const filled = (pct / 100) * circumference;
  const ringColor = pct >= 80 ? '#34d399' : pct >= 60 ? '#fbbf24' : '#fb7185';
  const textColor = pct >= 80 ? '#34d399' : pct >= 60 ? '#fbbf24' : '#fb7185';
  const glowColor = pct >= 80 ? '#10b98133' : pct >= 60 ? '#f59e0b33' : '#f4375033';

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative" style={{ width: 140, height: 140 }}>
        <svg width="140" height="140" viewBox="0 0 140 140" className="block -rotate-90">
          {/* Glow filter */}
          <defs>
            <filter id="ring-glow" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="3" result="blur" />
              <feComposite in="SourceGraphic" in2="blur" operator="over" />
            </filter>
          </defs>
          {/* Track */}
          <circle
            cx="70" cy="70" r={radius}
            fill="none"
            stroke="#ffffff12"
            strokeWidth="10"
            strokeLinecap="round"
          />
          {/* Progress */}
          <circle
            cx="70" cy="70" r={radius}
            fill="none"
            stroke={ringColor}
            strokeWidth="10"
            strokeLinecap="round"
            strokeDasharray={`${filled} ${circumference}`}
            style={{ filter: `drop-shadow(0 0 6px ${glowColor})`, transition: 'stroke-dasharray 0.6s ease' }}
          />
        </svg>
        {/* Center label */}
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-3xl font-black" style={{ color: textColor }}>{pct}%</span>
          <span className="text-[9px] font-black uppercase tracking-widest text-white/40 mt-0.5">Rate</span>
        </div>
      </div>
      <p className="text-[10px] font-black uppercase tracking-widest text-white/40">Attendance Rate</p>
    </div>
  );
}

/** Weekly breakdown chart — last 8 ISO weeks */
function WeeklyBreakdownChart({ records }: { records: AttendanceRecord[] }) {
  const weeks = useMemo(() => {
    // Build a map of week → counts
    const map: Record<string, { present: number; absent: number; late: number; key: string }> = {};
    records.forEach(r => {
      const k = isoWeekKey(r.date);
      if (!map[k]) map[k] = { present: 0, absent: 0, late: 0, key: k };
      if (r.status === 'present') map[k].present++;
      else if (r.status === 'absent') map[k].absent++;
      else if (r.status === 'late') map[k].late++;
    });

    // Sort by key desc, take last 8, then reverse to chronological
    const sorted = Object.values(map)
      .sort((a, b) => b.key.localeCompare(a.key))
      .slice(0, 8)
      .reverse();

    return sorted;
  }, [records]);

  if (weeks.length === 0) return null;

  const maxTotal = Math.max(...weeks.map(w => w.present + w.absent + w.late), 1);

  return (
    <div className="bg-card border border-border rounded-xl p-5">
      <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-4">
        Weekly Breakdown — Last {weeks.length} Week{weeks.length !== 1 ? 's' : ''}
      </p>
      {/* Legend */}
      <div className="flex gap-4 mb-4">
        {[
          { label: 'Present', color: 'bg-emerald-500' },
          { label: 'Absent', color: 'bg-rose-500' },
          { label: 'Late', color: 'bg-amber-500' },
        ].map(({ label, color }) => (
          <div key={label} className="flex items-center gap-1.5">
            <span className={`w-2.5 h-2.5 rounded-sm ${color}`} />
            <span className="text-[9px] font-black uppercase tracking-widest text-muted-foreground">{label}</span>
          </div>
        ))}
      </div>
      <div className="space-y-2.5">
        {weeks.map((w, idx) => {
          const total = w.present + w.absent + w.late;
          const pPct = total > 0 ? (w.present / maxTotal) * 100 : 0;
          const aPct = total > 0 ? (w.absent / maxTotal) * 100 : 0;
          const lPct = total > 0 ? (w.late / maxTotal) * 100 : 0;
          const barPct = (total / maxTotal) * 100;
          return (
            <div key={w.key} className="flex items-center gap-3">
              <span className="text-[9px] font-black uppercase tracking-widest text-muted-foreground w-8 shrink-0 text-right">
                Wk {idx + 1}
              </span>
              {/* Stacked bar */}
              <div className="flex-1 h-4 bg-white/5 rounded-sm overflow-hidden flex">
                {w.present > 0 && (
                  <div
                    className="h-full bg-emerald-500 transition-all duration-500"
                    style={{ width: `${pPct}%` }}
                    title={`Present: ${w.present}`}
                  />
                )}
                {w.absent > 0 && (
                  <div
                    className="h-full bg-rose-500 transition-all duration-500"
                    style={{ width: `${aPct}%` }}
                    title={`Absent: ${w.absent}`}
                  />
                )}
                {w.late > 0 && (
                  <div
                    className="h-full bg-amber-500 transition-all duration-500"
                    style={{ width: `${lPct}%` }}
                    title={`Late: ${w.late}`}
                  />
                )}
              </div>
              {/* Count label */}
              <span className="text-[9px] font-black text-muted-foreground w-6 shrink-0">{total}d</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ParentAttendanceContent() {
  const { profile } = useAuth();
  const searchParams = useSearchParams();
  const studentParam = searchParams.get('student');

  const [children, setChildren] = useState<Child[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(studentParam);
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [loadingChildren, setLoadingChildren] = useState(true);
  const [loadingRecords, setLoadingRecords] = useState(false);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');

  useEffect(() => {
    if (!profile) return;
    setLoadingChildren(true);
    fetch('/api/parents/portal?section=children')
      .then(res => res.json())
      .then(data => {
        if (!data.success) throw new Error(data.error || 'Failed to load children');
        const list = (data.children ?? []) as Child[];
        setChildren(list);
        if (!selectedId && list.length > 0) setSelectedId(list[0].id);
        setLoadingChildren(false);
      })
      .catch(err => {
        toast.error('Could not load student list. Please try again.');
        console.error('Failed to load children:', err);
        setLoadingChildren(false);
      });
  }, [profile]);

  useEffect(() => {
    if (!selectedId) return;
    setLoadingRecords(true);
    fetch(`/api/parents/portal?section=attendance&child_id=${selectedId}`)
      .then(res => res.json())
      .then(data => {
        if (!data.success) throw new Error(data.error || 'Failed to load attendance');
        setRecords((data.records ?? []) as AttendanceRecord[]);
        setLoadingRecords(false);
      })
      .catch(err => {
        toast.error('Could not load attendance logs for this student.');
        console.error('Failed to load attendance:', err);
        setLoadingRecords(false);
      });
  }, [selectedId]);

  if (profile?.role !== 'parent') {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-muted-foreground text-sm">Access restricted to parent accounts.</p>
      </div>
    );
  }

  const selectedChild = children.find(c => c.id === selectedId);
  const presentCount = records.filter(r => r.status === 'present').length;
  const absentCount = records.filter(r => r.status === 'absent').length;
  const lateCount = records.filter(r => r.status === 'late').length;
  const excusedCount = records.filter(r => r.status === 'excused').length;
  const attendancePct = records.length > 0 ? Math.round((presentCount / records.length) * 100) : null;

  const filteredRecords = statusFilter === 'all'
    ? records
    : records.filter(r => r.status === statusFilter);

  const ringColor = attendancePct != null
    ? (attendancePct >= 80 ? 'text-emerald-400' : attendancePct >= 60 ? 'text-amber-400' : 'text-rose-400')
    : 'text-muted-foreground';

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-black text-foreground tracking-tight">Attendance</h1>
        <p className="text-sm text-muted-foreground mt-1">Attendance records for your children.</p>
      </div>

      {/* Child Selector */}
      {!loadingChildren && children.length > 1 && (
        <div className="flex flex-wrap gap-2">
          {children.map(child => (
            <button key={child.id}
              onClick={() => setSelectedId(child.id)}
              className={`px-4 py-2 text-xs font-black uppercase tracking-widest border rounded-xl transition-all ${
                selectedId === child.id
                  ? 'bg-primary border-primary text-white'
                  : 'bg-card border-border text-muted-foreground hover:border-primary/50'
              }`}>
              {child.full_name}
            </button>
          ))}
        </div>
      )}

      {!loadingChildren && children.length === 0 && (
        <div className="bg-card border border-border rounded-xl p-10 text-center">
          <AcademicCapIcon className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
          <p className="text-sm font-black text-foreground uppercase tracking-wider">No children linked</p>
        </div>
      )}

      {selectedChild && (
        <div className="space-y-5">
          <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
            Attendance for {selectedChild.full_name}
          </p>

          {/* ── ATTENDANCE RING + STATS ── */}
          {!loadingRecords && records.length > 0 && attendancePct != null && (
            <div className="bg-card border border-border rounded-xl p-6">
              <div className="flex flex-col sm:flex-row items-center sm:items-start gap-8">
                {/* Attendance Ring */}
                <div className="shrink-0">
                  <AttendanceRing pct={attendancePct} />
                </div>

                {/* Stats grid */}
                <div className="flex-1 w-full">
                  <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                    {/* Attendance Rate card */}
                    <div className="bg-white/5 border border-white/10 rounded-xl p-4 col-span-2 sm:col-span-1 flex flex-col gap-2">
                      <div className="flex items-center gap-2">
                        <span className={`w-2.5 h-2.5 rounded-full ${
                          attendancePct >= 80 ? 'bg-emerald-400' : attendancePct >= 60 ? 'bg-amber-400' : 'bg-rose-400'
                        }`} />
                        <span className="text-[9px] font-black uppercase tracking-widest text-muted-foreground">Attendance Rate</span>
                      </div>
                      <div className={`text-3xl font-black ${ringColor}`}>{attendancePct}%</div>
                      <div className="text-[9px] text-muted-foreground">
                        {attendancePct >= 80 ? 'Excellent attendance' : attendancePct >= 60 ? 'Needs improvement' : 'Poor attendance'}
                      </div>
                    </div>

                    {/* Present */}
                    <div className="bg-white/5 border border-white/10 rounded-xl p-4 flex flex-col gap-2">
                      <div className="flex items-center gap-2">
                        <span className="w-2.5 h-2.5 rounded-full bg-emerald-400" />
                        <span className="text-[9px] font-black uppercase tracking-widest text-muted-foreground">Present</span>
                      </div>
                      <div className="text-3xl font-black text-emerald-400">{presentCount}</div>
                      <div className="text-[9px] text-muted-foreground">days attended</div>
                    </div>

                    {/* Absent */}
                    <div className="bg-white/5 border border-white/10 rounded-xl p-4 flex flex-col gap-2">
                      <div className="flex items-center gap-2">
                        <span className="w-2.5 h-2.5 rounded-full bg-rose-400" />
                        <span className="text-[9px] font-black uppercase tracking-widest text-muted-foreground">Absent</span>
                      </div>
                      <div className="text-3xl font-black text-rose-400">{absentCount}</div>
                      <div className="text-[9px] text-muted-foreground">days missed</div>
                    </div>

                    {/* Late */}
                    <div className="bg-white/5 border border-white/10 rounded-xl p-4 flex flex-col gap-2">
                      <div className="flex items-center gap-2">
                        <span className="w-2.5 h-2.5 rounded-full bg-amber-400" />
                        <span className="text-[9px] font-black uppercase tracking-widest text-muted-foreground">Late</span>
                      </div>
                      <div className="text-3xl font-black text-amber-400">{lateCount}</div>
                      <div className="text-[9px] text-muted-foreground">days late</div>
                    </div>

                    {/* Excused */}
                    {excusedCount > 0 && (
                      <div className="bg-white/5 border border-white/10 rounded-xl p-4 flex flex-col gap-2 col-span-2 sm:col-span-1">
                        <div className="flex items-center gap-2">
                          <span className="w-2.5 h-2.5 rounded-full bg-primary" />
                          <span className="text-[9px] font-black uppercase tracking-widest text-muted-foreground">Excused</span>
                        </div>
                        <div className="text-3xl font-black text-primary">{excusedCount}</div>
                        <div className="text-[9px] text-muted-foreground">excused absences</div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ── WEEKLY BREAKDOWN CHART ── */}
          {!loadingRecords && records.length > 0 && (
            <WeeklyBreakdownChart records={records} />
          )}

          {/* ── STATUS FILTER TABS ── */}
          {!loadingRecords && records.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {FILTER_TABS.map(tab => {
                const isActive = statusFilter === tab;
                const count = tab === 'all' ? records.length
                  : records.filter(r => r.status === tab).length;
                return (
                  <button
                    key={tab}
                    onClick={() => setStatusFilter(tab)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 text-[9px] font-black uppercase tracking-widest border rounded-xl transition-all ${
                      isActive
                        ? TAB_ACTIVE[tab]
                        : 'bg-card border-border text-muted-foreground hover:border-white/20 hover:text-white/60'
                    }`}
                  >
                    {tab !== 'all' && (
                      <span className={`w-1.5 h-1.5 rounded-full ${isActive ? STATUS_DOT[tab] : 'bg-white/20'}`} />
                    )}
                    {STATUS_LABEL[tab]}
                    <span className={`ml-0.5 ${isActive ? 'opacity-80' : 'opacity-40'}`}>({count})</span>
                  </button>
                );
              })}
            </div>
          )}

          {/* ── RECORDS TABLE ── */}
          {loadingRecords && (
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="bg-card border border-border rounded-xl p-4 animate-pulse flex justify-between">
                  <div className="h-4 bg-muted rounded w-1/4" />
                  <div className="h-4 bg-muted rounded w-1/4" />
                  <div className="h-4 bg-muted rounded w-16" />
                </div>
              ))}
            </div>
          )}

          {!loadingRecords && records.length === 0 && (
            <div className="bg-card border border-border rounded-xl p-10 text-center">
              <ClipboardDocumentCheckIcon className="w-8 h-8 text-muted-foreground mx-auto mb-3" />
              <p className="text-sm font-black text-foreground uppercase tracking-wider">No attendance records</p>
              <p className="text-[11px] text-muted-foreground mt-1">No records have been logged yet for this student.</p>
            </div>
          )}

          {!loadingRecords && records.length > 0 && filteredRecords.length === 0 && (
            <div className="bg-card border border-border rounded-xl p-10 text-center">
              <ClipboardDocumentCheckIcon className={`w-8 h-8 mx-auto mb-3 ${EMPTY_ICON_COLOR[statusFilter]}`} />
              <p className="text-sm font-black text-foreground uppercase tracking-wider">
                No {STATUS_LABEL[statusFilter]} records
              </p>
              <p className="text-[11px] text-muted-foreground mt-1">
                There are no {STATUS_LABEL[statusFilter].toLowerCase()} attendance records for this student.
              </p>
            </div>
          )}

          {!loadingRecords && filteredRecords.length > 0 && (
            <div className="bg-card border border-border rounded-xl overflow-hidden">
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-4 px-5 py-2.5 border-b border-border bg-muted">
                <span className="text-[9px] font-black uppercase tracking-widest text-muted-foreground">Date</span>
                <span className="text-[9px] font-black uppercase tracking-widest text-muted-foreground hidden sm:block">Course</span>
                <span className="text-[9px] font-black uppercase tracking-widest text-muted-foreground">Status</span>
                <span className="text-[9px] font-black uppercase tracking-widest text-muted-foreground">Note</span>
              </div>
              <div className="divide-y divide-border">
                {filteredRecords.map(record => (
                  <div key={record.id} className="grid grid-cols-3 sm:grid-cols-4 gap-4 px-5 py-3 hover:bg-white/5 transition-all">
                    <span className="text-xs text-foreground font-bold">
                      {new Date(record.date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' })}
                    </span>
                    <span className="text-xs text-muted-foreground hidden sm:block truncate">{record.course_name ?? '—'}</span>
                    <span>
                      <span className={`text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full border ${STATUS_STYLE[record.status] ?? STATUS_STYLE.absent}`}>
                        {record.status}
                      </span>
                    </span>
                    <span className="text-[11px] text-muted-foreground truncate">{record.note ?? '—'}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function ParentAttendancePage() {
  return (
    <Suspense fallback={<div className="animate-pulse h-64 bg-card border border-border rounded-xl" />}>
      <ParentAttendanceContent />
    </Suspense>
  );
}
