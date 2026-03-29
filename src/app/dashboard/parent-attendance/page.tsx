'use client';

import { useAuth } from '@/contexts/auth-context';
import { useEffect, useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { ClipboardDocumentCheckIcon, AcademicCapIcon } from '@/lib/icons';

interface Child { id: string; full_name: string; school_name: string | null }
interface AttendanceRecord {
  id: string;
  date: string;
  status: 'present' | 'absent' | 'late' | 'excused';
  note: string | null;
  course_name: string | null;
}

const STATUS_STYLE: Record<string, string> = {
  present: 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400',
  absent: 'bg-rose-500/10 border-rose-500/30 text-rose-400',
  late: 'bg-amber-500/10 border-amber-500/30 text-amber-400',
  excused: 'bg-blue-500/10 border-blue-500/30 text-blue-400',
};

function ParentAttendanceContent() {
  const { profile } = useAuth();
  const searchParams = useSearchParams();
  const studentParam = searchParams.get('student');

  const [children, setChildren] = useState<Child[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(studentParam);
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [loadingChildren, setLoadingChildren] = useState(true);
  const [loadingRecords, setLoadingRecords] = useState(false);

  useEffect(() => {
    if (!profile) return;
    const supabase = createClient();
    supabase
      .from('students')
      .select('id, full_name, school_name')
      .eq('parent_email', profile.email)
      .then(({ data }) => {
        setChildren((data ?? []) as Child[]);
        if (!selectedId && data && data.length > 0) setSelectedId(data[0].id);
        setLoadingChildren(false);
      });
  }, [profile]);

  useEffect(() => {
    if (!selectedId) return;
    setLoadingRecords(true);
    const supabase = createClient();

    // First resolve the portal user_id for this student record
    supabase
      .from('students')
      .select('user_id')
      .eq('id', selectedId)
      .maybeSingle()
      .then(async ({ data: student }) => {
        if (!student?.user_id) {
          setRecords([]);
          setLoadingRecords(false);
          return;
        }
        const { data } = await supabase
          .from('attendance')
          .select('id, status, notes, created_at, class_sessions(session_date, topic, classes(name))')
          .eq('user_id', student.user_id)
          .order('created_at', { ascending: false })
          .limit(60);
        setRecords((data ?? []).map((r: any) => ({
          id: r.id,
          date: r.class_sessions?.session_date ?? r.created_at?.slice(0, 10) ?? '',
          status: r.status,
          note: r.notes,
          course_name: r.class_sessions?.classes?.name ?? r.class_sessions?.topic ?? null,
        })));
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
  const attendancePct = records.length > 0 ? Math.round((presentCount / records.length) * 100) : null;

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
              className={`px-4 py-2 text-xs font-black uppercase tracking-widest border rounded-none transition-all ${
                selectedId === child.id
                  ? 'bg-orange-600 border-orange-600 text-white'
                  : 'bg-card border-border text-muted-foreground hover:border-orange-500/50'
              }`}>
              {child.full_name}
            </button>
          ))}
        </div>
      )}

      {!loadingChildren && children.length === 0 && (
        <div className="bg-card border border-border rounded-none p-10 text-center">
          <AcademicCapIcon className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
          <p className="text-sm font-black text-foreground uppercase tracking-wider">No children linked</p>
        </div>
      )}

      {selectedChild && (
        <div className="space-y-4">
          <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
            Attendance for {selectedChild.full_name}
          </p>

          {/* Summary Stats */}
          {!loadingRecords && records.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { label: 'Attendance Rate', value: attendancePct != null ? `${attendancePct}%` : '—', color: 'from-emerald-600 to-emerald-400' },
                { label: 'Present', value: presentCount, color: 'from-emerald-600 to-emerald-400' },
                { label: 'Absent', value: absentCount, color: 'from-rose-600 to-rose-400' },
                { label: 'Late', value: lateCount, color: 'from-amber-600 to-amber-400' },
              ].map(({ label, value, color }) => (
                <div key={label} className="bg-card border border-border rounded-none p-4">
                  <p className={`text-2xl font-black bg-gradient-to-br ${color} bg-clip-text text-transparent`}>{value}</p>
                  <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mt-1">{label}</p>
                </div>
              ))}
            </div>
          )}

          {/* Records Table */}
          {loadingRecords && (
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="bg-card border border-border rounded-none p-4 animate-pulse flex justify-between">
                  <div className="h-4 bg-muted rounded w-1/4" />
                  <div className="h-4 bg-muted rounded w-1/4" />
                  <div className="h-4 bg-muted rounded w-16" />
                </div>
              ))}
            </div>
          )}

          {!loadingRecords && records.length === 0 && (
            <div className="bg-card border border-border rounded-none p-8 text-center">
              <ClipboardDocumentCheckIcon className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
              <p className="text-sm font-black text-foreground uppercase tracking-wider">No attendance records</p>
            </div>
          )}

          {!loadingRecords && records.length > 0 && (
            <div className="bg-card border border-border rounded-none overflow-hidden">
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-4 px-5 py-2.5 border-b border-border bg-muted">
                <span className="text-[9px] font-black uppercase tracking-widest text-muted-foreground">Date</span>
                <span className="text-[9px] font-black uppercase tracking-widest text-muted-foreground hidden sm:block">Course</span>
                <span className="text-[9px] font-black uppercase tracking-widest text-muted-foreground">Status</span>
                <span className="text-[9px] font-black uppercase tracking-widest text-muted-foreground">Note</span>
              </div>
              <div className="divide-y divide-border">
                {records.map(record => (
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
    <Suspense fallback={<div className="animate-pulse h-64 bg-card border border-border rounded-none" />}>
      <ParentAttendanceContent />
    </Suspense>
  );
}
