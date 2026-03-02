'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/auth-context';
import { createClient } from '@/lib/supabase/client';
import {
  ClipboardDocumentCheckIcon, UserGroupIcon, CalendarIcon,
  CheckCircleIcon, XCircleIcon, ClockIcon, ExclamationCircleIcon,
  PlusIcon, ChevronDownIcon, CheckIcon, ArrowPathIcon,
} from '@heroicons/react/24/outline';

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: any }> = {
  present:  { label: 'Present',  color: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30', icon: CheckCircleIcon },
  absent:   { label: 'Absent',   color: 'bg-rose-500/20 text-rose-400 border-rose-500/30',         icon: XCircleIcon },
  late:     { label: 'Late',     color: 'bg-amber-500/20 text-amber-400 border-amber-500/30',      icon: ClockIcon },
  excused:  { label: 'Excused',  color: 'bg-blue-500/20 text-blue-400 border-blue-500/30',         icon: ExclamationCircleIcon },
};

export default function AttendancePage() {
  const { profile, loading: authLoading } = useAuth();
  const [classes, setClasses] = useState<any[]>([]);
  const [selectedClass, setSelectedClass] = useState<string>('');
  const [sessions, setSessions] = useState<any[]>([]);
  const [selectedSession, setSelectedSession] = useState<string>('');
  const [students, setStudents] = useState<any[]>([]);
  const [attendance, setAttendance] = useState<Record<string, { status: string; notes: string }>>({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // Student: own attendance
  const [myAttendance, setMyAttendance] = useState<any[]>([]);

  // New session form
  const [showNewSession, setShowNewSession] = useState(false);
  const [newSession, setNewSession] = useState({ session_date: '', start_time: '', end_time: '', topic: '' });
  const [creatingSession, setCreatingSession] = useState(false);

  const isStaff = profile?.role === 'admin' || profile?.role === 'teacher';

  useEffect(() => {
    if (authLoading || !profile) return;
    const db = createClient();
    if (isStaff) {
      const q = profile.role === 'teacher'
        ? db.from('classes').select('id, name, programs(name)').eq('teacher_id', profile.id).order('name')
        : db.from('classes').select('id, name, programs(name)').order('name');
      q.then(({ data }) => setClasses(data ?? []));
    } else {
      // Student: get own attendance with sessions
      db.from('attendance')
        .select('*, class_sessions(session_date, topic, start_time, classes(name))')
        .eq('user_id', profile.id)
        .order('created_at', { ascending: false })
        .then(({ data }) => setMyAttendance(data ?? []));
    }
  }, [profile?.id, authLoading]); // eslint-disable-line

  // Load sessions when class selected
  useEffect(() => {
    if (!selectedClass) return;
    setLoading(true);
    createClient().from('class_sessions')
      .select('*')
      .eq('class_id', selectedClass)
      .order('session_date', { ascending: false })
      .then(({ data }) => {
        setSessions(data ?? []);
        setSelectedSession('');
        setStudents([]);
        setAttendance({});
        setLoading(false);
      });
  }, [selectedClass]);

  // Load attendance when session selected
  useEffect(() => {
    if (!selectedSession || !selectedClass) return;
    setLoading(true);
    const db = createClient();
    // Get enrolled students in this class's program
    db.from('classes').select('program_id').eq('id', selectedClass).single()
      .then(({ data: cls }) => {
        if (!cls) return;
        return Promise.all([
          db.from('enrollments').select('portal_users(id, full_name, email)').eq('program_id', cls.program_id),
          db.from('attendance').select('*').eq('session_id', selectedSession),
        ]);
      })
      .then(res => {
        if (!res) { setLoading(false); return; }
        const [enrRes, attRes] = res;
        const studs = (enrRes.data ?? []).map((e: any) => e.portal_users).filter(Boolean);
        setStudents(studs);
        const attMap: Record<string, { status: string; notes: string }> = {};
        (attRes.data ?? []).forEach((a: any) => {
          attMap[a.user_id] = { status: a.status, notes: a.notes ?? '' };
        });
        // Default unset students to 'present'
        studs.forEach((s: any) => {
          if (!attMap[s.id]) attMap[s.id] = { status: 'present', notes: '' };
        });
        setAttendance(attMap);
        setLoading(false);
        setSaved(false);
      });
  }, [selectedSession]); // eslint-disable-line

  const handleSave = async () => {
    if (!selectedSession) return;
    setSaving(true);
    const db = createClient();
    const records = Object.entries(attendance).map(([user_id, val]) => ({
      session_id: selectedSession,
      user_id,
      status: val.status,
      notes: val.notes || null,
    }));
    const { error } = await db.from('attendance').upsert(records, { onConflict: 'session_id,user_id' });
    if (error) { alert(error.message); }
    else { setSaved(true); }
    setSaving(false);
  };

  const createSession = async () => {
    if (!selectedClass || !newSession.session_date) return;
    setCreatingSession(true);
    const { data, error } = await createClient().from('class_sessions').insert({
      class_id: selectedClass,
      session_date: newSession.session_date,
      start_time: newSession.start_time || null,
      end_time: newSession.end_time || null,
      topic: newSession.topic || null,
    }).select().single();
    if (error) { alert(error.message); }
    else {
      setSessions(prev => [data, ...prev]);
      setSelectedSession(data.id);
      setShowNewSession(false);
      setNewSession({ session_date: '', start_time: '', end_time: '', topic: '' });
    }
    setCreatingSession(false);
  };

  if (authLoading) return (
    <div className="min-h-screen bg-[#0f0f1a] flex items-center justify-center">
      <div className="w-10 h-10 border-4 border-teal-500 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  // ── STUDENT VIEW ─────────────────────────────────────────────────────────
  if (!isStaff) {
    const present = myAttendance.filter(a => a.status === 'present').length;
    const rate = myAttendance.length ? Math.round((present / myAttendance.length) * 100) : 0;
    return (
      <div className="min-h-screen bg-[#0f0f1a] text-white">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <ClipboardDocumentCheckIcon className="w-5 h-5 text-teal-400" />
              <span className="text-xs font-bold text-teal-400 uppercase tracking-widest">Attendance Record</span>
            </div>
            <h1 className="text-3xl font-extrabold">My Attendance</h1>
          </div>
          <div className="grid grid-cols-3 gap-4">
            {[
              { label: 'Total Sessions', value: myAttendance.length, color: 'text-teal-400' },
              { label: 'Present', value: present, color: 'text-emerald-400' },
              { label: 'Attendance Rate', value: `${rate}%`, color: rate >= 75 ? 'text-emerald-400' : 'text-rose-400' },
            ].map(s => (
              <div key={s.label} className="bg-white/5 border border-white/10 rounded-2xl p-5 text-center">
                <p className={`text-2xl font-extrabold ${s.color}`}>{s.value}</p>
                <p className="text-xs text-white/40 mt-1">{s.label}</p>
              </div>
            ))}
          </div>
          {myAttendance.length === 0 ? (
            <div className="text-center py-16 bg-white/5 border border-white/10 rounded-2xl">
              <ClipboardDocumentCheckIcon className="w-12 h-12 mx-auto text-white/10 mb-3" />
              <p className="text-white/30">No attendance records yet.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {myAttendance.map((a: any) => {
                const cfg = STATUS_CONFIG[a.status] ?? STATUS_CONFIG.present;
                return (
                  <div key={a.id} className="bg-white/5 border border-white/10 rounded-xl p-4 flex items-center justify-between gap-4">
                    <div>
                      <p className="font-semibold text-white">{a.class_sessions?.topic || 'Session'}</p>
                      <p className="text-xs text-white/40">
                        {a.class_sessions?.classes?.name} · {a.class_sessions?.session_date && new Date(a.class_sessions.session_date).toLocaleDateString()}
                      </p>
                      {a.notes && <p className="text-xs text-white/30 mt-1">{a.notes}</p>}
                    </div>
                    <span className={`px-2.5 py-1 rounded-full text-xs font-bold border ${cfg.color}`}>{cfg.label}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    );
  }

  // ── STAFF VIEW ───────────────────────────────────────────────────────────
  const currentSession = sessions.find(s => s.id === selectedSession);

  return (
    <div className="min-h-screen bg-[#0f0f1a] text-white">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">

        <div>
          <div className="flex items-center gap-2 mb-1">
            <ClipboardDocumentCheckIcon className="w-5 h-5 text-teal-400" />
            <span className="text-xs font-bold text-teal-400 uppercase tracking-widest">Attendance Manager</span>
          </div>
          <h1 className="text-3xl font-extrabold">Attendance Tracking</h1>
          <p className="text-white/40 text-sm mt-1">Mark and review student attendance per session</p>
        </div>

        {/* Selectors */}
        <div className="bg-white/5 border border-white/10 rounded-2xl p-5 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-white/40 uppercase tracking-widest mb-1.5">Select Class</label>
              <div className="relative">
                <select value={selectedClass} onChange={e => { setSelectedClass(e.target.value); setSelectedSession(''); }}
                  className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-sm text-white focus:outline-none focus:border-teal-500 cursor-pointer appearance-none">
                  <option value="">Choose a class…</option>
                  {classes.map(c => <option key={c.id} value={c.id}>{c.name}{c.programs?.name ? ` — ${c.programs.name}` : ''}</option>)}
                </select>
                <ChevronDownIcon className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30 pointer-events-none" />
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold text-white/40 uppercase tracking-widest mb-1.5">Select Session</label>
              <div className="relative">
                <select value={selectedSession} onChange={e => setSelectedSession(e.target.value)}
                  disabled={!selectedClass || sessions.length === 0}
                  className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-sm text-white focus:outline-none focus:border-teal-500 cursor-pointer appearance-none disabled:opacity-40">
                  <option value="">Choose a session…</option>
                  {sessions.map(s => (
                    <option key={s.id} value={s.id}>
                      {new Date(s.session_date).toLocaleDateString()}{s.topic ? ` — ${s.topic}` : ''}
                    </option>
                  ))}
                </select>
                <ChevronDownIcon className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30 pointer-events-none" />
              </div>
            </div>
          </div>

          {selectedClass && (
            <div className="flex items-center justify-between pt-1">
              <span className="text-xs text-white/30">{sessions.length} session{sessions.length !== 1 ? 's' : ''} found</span>
              <button onClick={() => setShowNewSession(!showNewSession)}
                className="flex items-center gap-1.5 text-xs font-bold text-teal-400 hover:text-teal-300 transition-colors">
                <PlusIcon className="w-3.5 h-3.5" /> New Session
              </button>
            </div>
          )}

          {showNewSession && (
            <div className="border border-teal-500/20 bg-teal-500/5 rounded-xl p-4 space-y-3">
              <p className="text-xs font-bold text-teal-400 uppercase tracking-widest">New Session</p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs text-white/40 mb-1">Date <span className="text-rose-400">*</span></label>
                  <input type="date" value={newSession.session_date}
                    onChange={e => setNewSession(f => ({ ...f, session_date: e.target.value }))}
                    className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-xl text-sm text-white focus:outline-none focus:border-teal-500 transition-colors" />
                </div>
                <div>
                  <label className="block text-xs text-white/40 mb-1">Start Time</label>
                  <input type="time" value={newSession.start_time}
                    onChange={e => setNewSession(f => ({ ...f, start_time: e.target.value }))}
                    className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-xl text-sm text-white focus:outline-none focus:border-teal-500 transition-colors" />
                </div>
                <div>
                  <label className="block text-xs text-white/40 mb-1">End Time</label>
                  <input type="time" value={newSession.end_time}
                    onChange={e => setNewSession(f => ({ ...f, end_time: e.target.value }))}
                    className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-xl text-sm text-white focus:outline-none focus:border-teal-500 transition-colors" />
                </div>
              </div>
              <div>
                <label className="block text-xs text-white/40 mb-1">Topic / Notes</label>
                <input type="text" value={newSession.topic}
                  onChange={e => setNewSession(f => ({ ...f, topic: e.target.value }))}
                  placeholder="e.g. Introduction to Variables"
                  className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-xl text-sm text-white placeholder-white/25 focus:outline-none focus:border-teal-500 transition-colors" />
              </div>
              <button onClick={createSession} disabled={creatingSession || !newSession.session_date}
                className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold bg-teal-600 hover:bg-teal-500 text-white rounded-xl transition-colors disabled:opacity-50">
                {creatingSession ? <ArrowPathIcon className="w-3.5 h-3.5 animate-spin" /> : <PlusIcon className="w-3.5 h-3.5" />}
                Create Session
              </button>
            </div>
          )}
        </div>

        {/* Attendance sheet */}
        {loading && (
          <div className="text-center py-12"><div className="w-8 h-8 border-4 border-teal-500 border-t-transparent rounded-full animate-spin mx-auto" /></div>
        )}

        {!loading && selectedSession && students.length === 0 && (
          <div className="text-center py-16 bg-white/5 border border-white/10 rounded-2xl">
            <UserGroupIcon className="w-12 h-12 mx-auto text-white/10 mb-3" />
            <p className="text-white/30">No enrolled students found for this class.</p>
          </div>
        )}

        {!loading && selectedSession && students.length > 0 && (
          <div className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden">
            <div className="p-5 border-b border-white/10 flex items-center justify-between flex-wrap gap-3">
              <div>
                <h3 className="font-bold text-white">
                  {currentSession?.session_date && new Date(currentSession.session_date).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
                  {currentSession?.topic && ` — ${currentSession.topic}`}
                </h3>
                <p className="text-xs text-white/40 mt-0.5">{students.length} students</p>
              </div>
              <div className="flex items-center gap-2">
                {/* Mark all buttons */}
                {['present', 'absent'].map(s => (
                  <button key={s} onClick={() => {
                    const next: Record<string, { status: string; notes: string }> = {};
                    students.forEach((st: any) => next[st.id] = { status: s, notes: attendance[st.id]?.notes ?? '' });
                    setAttendance(next);
                  }}
                    className="px-3 py-1.5 text-xs font-bold text-white/50 bg-white/5 hover:bg-white/10 rounded-xl transition-colors capitalize">
                    All {s}
                  </button>
                ))}
                <button onClick={handleSave} disabled={saving}
                  className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold bg-teal-600 hover:bg-teal-500 text-white rounded-xl transition-colors disabled:opacity-50">
                  {saving ? <ArrowPathIcon className="w-3.5 h-3.5 animate-spin" /> : saved ? <CheckIcon className="w-3.5 h-3.5" /> : <ClipboardDocumentCheckIcon className="w-3.5 h-3.5" />}
                  {saving ? 'Saving…' : saved ? 'Saved!' : 'Save Attendance'}
                </button>
              </div>
            </div>

            <div className="divide-y divide-white/5">
              {students.map((student: any, i: number) => {
                const att = attendance[student.id] ?? { status: 'present', notes: '' };
                const cfg = STATUS_CONFIG[att.status];
                return (
                  <div key={student.id} className="px-5 py-4 flex flex-col sm:flex-row items-start sm:items-center gap-3">
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <div className="w-9 h-9 bg-[#7a0606] border border-white/10 rounded-lg flex items-center justify-center text-sm font-black text-white flex-shrink-0">
                        {student.full_name?.charAt(0) ?? '?'}
                      </div>
                      <div className="min-w-0">
                        <p className="font-semibold text-white text-sm">{student.full_name}</p>
                        <p className="text-xs text-white/30 truncate">{student.email}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {Object.entries(STATUS_CONFIG).map(([val, c]) => (
                        <button key={val} onClick={() => setAttendance(a => ({ ...a, [student.id]: { ...a[student.id], status: val } }))}
                          className={`px-2.5 py-1.5 rounded-xl text-xs font-bold border transition-all ${att.status === val ? `${c.color} scale-105` : 'bg-white/5 border-white/10 text-white/30 hover:bg-white/10'}`}>
                          {c.label}
                        </button>
                      ))}
                      <input type="text" value={att.notes} placeholder="Notes"
                        onChange={e => setAttendance(a => ({ ...a, [student.id]: { ...a[student.id], notes: e.target.value } }))}
                        className="hidden sm:block w-28 px-2 py-1.5 bg-white/5 border border-white/10 rounded-xl text-xs text-white placeholder-white/20 focus:outline-none focus:border-teal-500 transition-colors" />
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Summary bar */}
            <div className="px-5 py-4 border-t border-white/10 bg-white/3 flex flex-wrap gap-4 text-xs text-white/40">
              {Object.entries(STATUS_CONFIG).map(([s, c]) => {
                const count = Object.values(attendance).filter(a => a.status === s).length;
                return <span key={s} className={`font-bold ${c.color.split(' ')[1]}`}>{c.label}: {count}</span>;
              })}
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
