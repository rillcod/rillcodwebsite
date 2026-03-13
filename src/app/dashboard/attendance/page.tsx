'use client';

import React, { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/auth-context';
import { createClient } from '@/lib/supabase/client';
import {
  ClipboardDocumentCheckIcon, UserGroupIcon, CalendarIcon,
  CheckCircleIcon, XCircleIcon, ClockIcon, ExclamationCircleIcon,
  PlusIcon, ChevronDownIcon, CheckIcon, ArrowPathIcon, ArrowLeftIcon, PrinterIcon,
  TableCellsIcon, ChartPieIcon
} from '@heroicons/react/24/outline';
import { useSearchParams, useRouter } from 'next/navigation';

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: any }> = {
  present: { label: 'Present', color: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30', icon: CheckCircleIcon },
  absent: { label: 'Absent', color: 'bg-rose-500/20 text-rose-400 border-rose-500/30', icon: XCircleIcon },
  late: { label: 'Late', color: 'bg-amber-500/20 text-amber-400 border-amber-500/30', icon: ClockIcon },
  excused: { label: 'Excused', color: 'bg-blue-500/20 text-blue-400 border-blue-500/30', icon: ExclamationCircleIcon },
};

export default function AttendancePage() {
  const { profile, loading: authLoading } = useAuth();
  const searchParams = useSearchParams();
  const isMinimal = searchParams.get('minimal') === 'true';
  const router = useRouter();
  const rawClassId = searchParams.get('class_id');
  const classIdFromQuery = React.useMemo(() => rawClassId, [rawClassId]);
  const [activeTab, setActiveTab] = useState<'mark' | 'log'>('mark');
  const [classes, setClasses] = useState<any[]>([]);
  const [selectedClass, setSelectedClass] = useState<string>('');
  const [sessions, setSessions] = useState<any[]>([]);
  const [selectedSession, setSelectedSession] = useState<string>('');
  const [students, setStudents] = useState<any[]>([]);
  const [attendance, setAttendance] = useState<Record<string, { status: string; notes: string }>>({});
  
  // History matrix state
  const [fullAttendanceData, setFullAttendanceData] = useState<any[]>([]);
  
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // Student: own attendance
  const [myAttendance, setMyAttendance] = useState<any[]>([]);

  // New session form
  const [showNewSession, setShowNewSession] = useState(false);
  const [newSession, setNewSession] = useState({ session_date: '', start_time: '', end_time: '', topic: '' });
  const [creatingSession, setCreatingSession] = useState(false);

  const isStaff = profile?.role === 'admin' || profile?.role === 'teacher' || profile?.role === 'school';

  useEffect(() => {
    if (authLoading || !profile) return;
    const db = createClient();
    if (isStaff) {
      const q = profile.role === 'teacher'
        ? db.from('classes').select('id, name, programs(name)').eq('teacher_id', profile.id).order('name')
        : profile.role === 'school' && profile.school_id
        ? db.from('classes').select('id, name, programs(name)').eq('school_id', profile.school_id).order('name')
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

  useEffect(() => {
    if (classIdFromQuery && isStaff) {
      setSelectedClass(classIdFromQuery);
    }
  }, [classIdFromQuery, isStaff]);

  // Load sessions when class selected
  useEffect(() => {
    if (!selectedClass) return;
    setLoading(true);
    const db = createClient();
    db.from('class_sessions')
      .select('*')
      .eq('class_id', selectedClass)
      .order('session_date', { ascending: false })
      .then(({ data }) => {
        const sess = data ?? [];
        setSessions(sess);
        setSelectedSession('');
        setStudents([]);
        setAttendance({});
        
        // If we entered via direct link, try to find/init today's session
        if (classIdFromQuery === selectedClass && sess.length === 0) {
           quickMarkToday();
        } else {
           setLoading(false);
        }
      });
  }, [selectedClass]);

  // Load attendance when session selected
  useEffect(() => {
    if (!selectedSession || !selectedClass) return;
    setLoading(true);
    const db = createClient();
    db.from('classes').select('name, program_id, school_id').eq('id', selectedClass).single()
      .then(({ data: cls }) => {
        if (!cls || !cls.program_id) return;
        let enrQuery = db.from('enrollments')
          .select('id, status, portal_users!inner(id, full_name, email, school_id, section_class)')
          .eq('program_id', cls.program_id);
        if (cls.school_id) enrQuery = enrQuery.eq('portal_users.school_id', cls.school_id);
        if (cls.name) enrQuery = enrQuery.eq('portal_users.section_class', cls.name);

        return Promise.all([
          enrQuery,
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
        studs.forEach((s: any) => {
          if (!attMap[s.id]) attMap[s.id] = { status: 'present', notes: '' };
        });
        setAttendance(attMap);
        setLoading(false);
        setSaved(false);
      });
  }, [selectedSession]); // eslint-disable-line

  // Load ALL records for the Log view
  useEffect(() => {
    if (activeTab !== 'log' || !selectedClass) return;
    setLoading(true);
    const db = createClient();
    db.from('attendance')
      .select('*, class_sessions!inner(*)')
      .eq('class_sessions.class_id', selectedClass)
      .order('created_at', { ascending: false })
      .then(({ data }) => {
        setFullAttendanceData(data ?? []);
        setLoading(false);
      });
  }, [activeTab, selectedClass]);

  const handlePrintLog = () => {
    const clsName = classes.find(c => c.id === selectedClass)?.name || 'Class';
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    // Build Table Rows
    const rows = students.map(student => {
      const studentRecords = fullAttendanceData.filter(d => d.user_id === student.id);
      const total = sessions.length;
      const present = studentRecords.filter(r => r.status === 'present').length;
      const rate = total > 0 ? Math.round((present / total) * 100) : 0;
      
      return `
        <tr>
          <td><strong>${student.full_name}</strong><br/><small>${student.email}</small></td>
          <td style="text-align:center">${total}</td>
          <td style="text-align:center; color: #10b981;">${present}</td>
          <td style="text-align:center; font-weight: bold; color: ${rate >= 75 ? '#10b981' : '#f43f5e'};">${rate}%</td>
        </tr>
      `;
    }).join('');

    const html = `
      <html>
      <head>
        <title>Attendance Report - ${clsName}</title>
        <style>
          body { font-family: 'Segoe UI', system-ui; padding: 40px; color: #111; }
          .header { text-align: center; border-bottom: 2px solid #eee; padding-bottom: 20px; margin-bottom: 30px; }
          .brand { font-size: 28px; font-weight: 900; letter-spacing: -1px; }
          .brand span { color: #10b981; }
          h1 { margin: 10px 0; font-size: 20px; text-transform: uppercase; letter-spacing: 2px; }
          table { width: 100%; border-collapse: collapse; margin-top: 20px; }
          th, td { border: 1px solid #eee; padding: 12px; text-align: left; }
          th { background: #f9fafb; font-size: 11px; text-transform: uppercase; color: #666; }
          .footer { margin-top: 50px; font-size: 12px; color: #999; text-align: center; }
          @media print { .no-print { display: none; } }
        </style>
      </head>
      <body>
        <div class="header">
          <div class="brand">RILLCOD <span>ACADEMY</span></div>
          <h1>Attendance Summary Report</h1>
          <p>Class: ${clsName} | Generated: ${new Date().toLocaleDateString()}</p>
        </div>
        <table>
          <thead>
            <tr>
              <th>Student Name</th>
              <th style="text-align:center">Sessions</th>
              <th style="text-align:center">Present</th>
              <th style="text-align:center">Attendance %</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
        <div class="footer">
          Generated via Rillcod Academy Portal
          <br/><button class="no-print" onclick="window.print()" style="margin-top:20px; padding: 10px 25px; background: #10b981; color: white; border: none; border-radius: 8px; cursor: pointer; font-weight: bold;">Print Report</button>
        </div>
      </body>
      </html>
    `;
    printWindow.document.write(html);
    printWindow.document.close();
  };

  const handlePrintSession = () => {
    if (!selectedSession || !currentSession) return;
    const clsName = classes.find(c => c.id === selectedClass)?.name || 'Class';
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    const rows = students.map(student => {
      const att = attendance[student.id] ?? { status: 'present', notes: '' };
      const cfg = STATUS_CONFIG[att.status] ?? STATUS_CONFIG.present;
      return `
        <tr>
          <td><strong>${student.full_name}</strong><br/><small>${student.email}</small></td>
          <td style="text-align:center; font-weight: bold; color: ${att.status === 'present' ? '#10b981' : '#f43f5e'}; text-transform: uppercase; font-size: 11px;">${cfg.label}</td>
          <td>${att.notes || '—'}</td>
        </tr>
      `;
    }).join('');

    const html = `
      <html>
      <head>
        <title>Session Attendance - ${currentSession.topic || currentSession.session_date}</title>
        <style>
          body { font-family: 'Segoe UI', system-ui; padding: 40px; color: #111; }
          .header { text-align: center; border-bottom: 2px solid #eee; padding-bottom: 20px; margin-bottom: 30px; }
          .brand { font-size: 28px; font-weight: 900; letter-spacing: -1px; }
          .brand span { color: #10b981; }
          h1 { margin: 10px 0; font-size: 20px; text-transform: uppercase; letter-spacing: 2px; }
          table { width: 100%; border-collapse: collapse; margin-top: 20px; }
          th, td { border: 1px solid #eee; padding: 12px; text-align: left; }
          th { background: #f9fafb; font-size: 11px; text-transform: uppercase; color: #666; }
          .footer { margin-top: 50px; font-size: 12px; color: #999; text-align: center; }
          @media print { .no-print { display: none; } }
        </style>
      </head>
      <body>
        <div class="header">
          <div class="brand">RILLCOD <span>ACADEMY</span></div>
          <h1>Session Attendance Report</h1>
          <p>Class: ${clsName} | Topic: ${currentSession.topic || '—'} | Date: ${new Date(currentSession.session_date).toLocaleDateString()}</p>
        </div>
        <table>
          <thead>
            <tr>
              <th>Student Name</th>
              <th style="text-align:center">Status</th>
              <th>Teacher Notes</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
        <div class="footer">
          Generated via Rillcod Academy Portal
          <br/><button class="no-print" onclick="window.print()" style="margin-top:20px; padding: 10px 25px; background: #10b981; color: white; border: none; border-radius: 8px; cursor: pointer; font-weight: bold;">Print Session Report</button>
        </div>
      </body>
      </html>
    `;
    printWindow.document.write(html);
    printWindow.document.close();
  };

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

  const quickMarkToday = async () => {
    if (!selectedClass) return;
    setLoading(true);
    const db = createClient();
    const today = new Date().toISOString().split('T')[0];

    // Check if today's session already exists
    const { data: existing } = await db.from('class_sessions')
      .select('*')
      .eq('class_id', selectedClass)
      .eq('session_date', today)
      .maybeSingle();

    if (existing) {
      setSelectedSession(existing.id);
    } else {
      // Create new session for today
      const { data: created, error } = await db.from('class_sessions').insert({
        class_id: selectedClass,
        session_date: today,
        topic: `Session on ${new Date().toLocaleDateString()}`
      }).select().single();

      if (error) {
        alert(error.message);
        setLoading(false);
        return;
      }
      setSessions(prev => [created, ...prev]);
      setSelectedSession(created.id);
    }
    setLoading(false);
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

        {!isMinimal && (
          <div className="flex flex-col md:flex-row md:items-center gap-6">
            <button onClick={() => router.back()}
              className="w-10 h-10 flex items-center justify-center rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 transition-colors flex-shrink-0">
              <ArrowLeftIcon className="w-5 h-5 text-white/60" />
            </button>
            <div className="flex-1">
              <div className="flex items-center justify-between gap-4 mb-1">
                <div className="flex items-center gap-2">
                  <ClipboardDocumentCheckIcon className="w-5 h-5 text-teal-400" />
                  <span className="text-xs font-bold text-teal-400 uppercase tracking-widest">Attendance Manager</span>
                </div>
                {selectedClass && (
                  <button
                    onClick={() => router.push(`/dashboard/classes/${selectedClass}`)}
                    className="text-xs font-black text-white/40 hover:text-white uppercase tracking-widest flex items-center gap-2 transition-colors"
                  >
                    <ArrowLeftIcon className="w-3 h-3" /> Return to Class
                  </button>
                )}
              </div>
              <h1 className="text-3xl font-extrabold">{selectedClass ? 'Class Attendance' : 'Attendance Tracking'}</h1>
              <p className="text-white/40 text-sm mt-1">Mark and review student attendance per session</p>
            </div>
          </div>
        )}

        {/* Tabs */}
        {selectedClass && (
          <div className="flex items-center gap-1 p-1 bg-white/5 border border-white/10 rounded-2xl w-fit">
            <button onClick={() => setActiveTab('mark')}
              className={`flex items-center gap-2 px-4 py-2 text-xs font-bold rounded-xl transition-all ${activeTab === 'mark' ? 'bg-teal-600 text-white shadow-lg shadow-teal-900/40' : 'text-white/40 hover:text-white hover:bg-white/5'}`}>
              <ClipboardDocumentCheckIcon className="w-4 h-4" /> Mark Attendance
            </button>
            <button onClick={() => setActiveTab('log')}
              className={`flex items-center gap-2 px-4 py-2 text-xs font-bold rounded-xl transition-all ${activeTab === 'log' ? 'bg-teal-600 text-white shadow-lg shadow-teal-900/40' : 'text-white/40 hover:text-white hover:bg-white/5'}`}>
              <TableCellsIcon className="w-4 h-4" /> Attendance Log
            </button>
          </div>
        )}

        {/* Tab Content: MARK ATTENDANCE */}
        {activeTab === 'mark' && (
          <>
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
                <div className="flex flex-col gap-4 pt-2">
                  <div className="flex flex-col sm:flex-row items-center gap-3">
                    <button onClick={quickMarkToday} disabled={loading}
                      className="w-full sm:flex-1 flex items-center justify-center gap-2 py-3.5 bg-teal-600 hover:bg-teal-500 text-white font-extrabold rounded-2xl transition-all shadow-lg shadow-teal-900/30">
                      <CalendarIcon className="w-5 h-5 text-teal-200" />
                      {loading ? 'Processing…' : 'Mark Today\'s Attendance'}
                    </button>
                    <button onClick={() => setShowNewSession(!showNewSession)}
                      className="w-full sm:w-auto px-4 py-3.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-2xl text-xs font-bold text-white/40 hover:text-white transition-all">
                      Past / Custom Date
                    </button>
                  </div>

                  {showNewSession && (
                    <div className="bg-white/5 border border-teal-500/10 rounded-2xl p-4 space-y-3 animate-in fade-in slide-in-from-top-2 duration-300">
                      <p className="text-[10px] font-bold text-teal-400 uppercase tracking-widest px-1">Session Options</p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <input type="date" value={newSession.session_date}
                          onChange={e => setNewSession(f => ({ ...f, session_date: e.target.value }))}
                          className="px-4 py-2.5 bg-[#0f0f1a] border border-white/10 rounded-xl text-sm text-white focus:outline-none focus:border-teal-500 transition-colors" />
                        <button onClick={async () => {
                          if (!newSession.session_date) return;
                          setLoading(true);
                          const { data, error } = await createClient().from('class_sessions').insert({
                            class_id: selectedClass,
                            session_date: newSession.session_date,
                            topic: newSession.topic || `Session on ${newSession.session_date}`,
                            start_time: newSession.start_time || null,
                            end_time: newSession.end_time || null,
                          }).select().single();
                          if (error) alert(error.message);
                          else {
                            setSessions(prev => [data, ...prev]);
                            setSelectedSession(data.id);
                            setShowNewSession(false);
                          }
                          setLoading(false);
                        }}
                          className="px-4 py-2.5 bg-teal-600/20 text-teal-400 border border-teal-500/20 rounded-xl text-xs font-bold hover:bg-teal-600/30 transition-all">
                          Confirm & Create
                        </button>
                      </div>
                      <input type="text" value={newSession.topic}
                        onChange={e => setNewSession(f => ({ ...f, topic: e.target.value }))}
                        placeholder="Topic / Lessons (optional)"
                        className="w-full px-4 py-2.5 bg-[#0f0f1a] border border-white/10 rounded-xl text-sm text-white placeholder-white/20 focus:outline-none focus:border-teal-500 transition-colors" />
                    </div>
                  )}
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
                    <button onClick={handlePrintSession}
                      className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold bg-white/5 hover:bg-white/10 text-white/40 hover:text-white border border-white/10 rounded-xl transition-colors">
                      <PrinterIcon className="w-4 h-4" />
                    </button>
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
                          <div className="w-9 h-9 bg-teal-500/10 border border-teal-500/20 rounded-lg flex items-center justify-center text-sm font-black text-teal-400 flex-shrink-0">
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
          </>
        )}

        {/* Tab Content: ATTENDANCE LOG */}
        {activeTab === 'log' && (
          <div className="space-y-6">
            <div className="bg-white/5 border border-white/10 rounded-2xl p-6 flex items-center justify-between gap-4">
              <div>
                <h2 className="text-xl font-bold">Attendance History</h2>
                <p className="text-white/40 text-sm">Review student performance metrics across all {sessions.length} sessions</p>
              </div>
              <button 
                onClick={handlePrintLog}
                className="flex items-center gap-2 px-6 py-3 bg-white/10 hover:bg-white/20 text-white text-xs font-bold rounded-xl transition-all border border-white/10"
              >
                <PrinterIcon className="w-4 h-4" /> Print Full Report
              </button>
            </div>

            <div className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="border-b border-white/10 bg-white/3">
                    <th className="px-6 py-4 text-left text-[10px] font-black uppercase text-white/30 tracking-widest">Student Information</th>
                    <th className="px-6 py-4 text-center text-[10px] font-black uppercase text-white/30 tracking-widest">Present</th>
                    <th className="px-6 py-4 text-center text-[10px] font-black uppercase text-white/30 tracking-widest">Late/Excused</th>
                    <th className="px-6 py-4 text-center text-[10px] font-black uppercase text-white/30 tracking-widest">Attendance %</th>
                    <th className="px-6 py-4 text-right text-[10px] font-black uppercase text-white/30 tracking-widest">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {students.map(student => {
                    const studentRecords = fullAttendanceData.filter(d => d.user_id === student.id);
                    const present = studentRecords.filter(r => r.status === 'present').length;
                    const late = studentRecords.filter(r => r.status === 'late' || r.status === 'excused').length;
                    const absenteeism = studentRecords.filter(r => r.status === 'absent').length;
                    const total = sessions.length;
                    const rate = total > 0 ? Math.round((present / total) * 100) : 0;
                    
                    return (
                      <tr key={student.id} className="hover:bg-white/[0.02] transition-colors">
                        <td className="px-6 py-4 text-sm">
                          <div className="font-bold text-white">{student.full_name}</div>
                          <div className="text-[10px] text-white/20 font-medium">{student.email}</div>
                        </td>
                        <td className="px-6 py-4 text-center">
                          <span className="text-emerald-400 font-bold">{present}</span>
                          <span className="text-white/10 mx-1">/</span>
                          <span className="text-white/30">{total}</span>
                        </td>
                        <td className="px-6 py-4 text-center">
                          <span className="text-amber-400 font-bold">{late}</span>
                        </td>
                        <td className="px-6 py-4 text-center">
                          <div className="flex flex-col items-center gap-1.5">
                             <span className={`text-sm font-black ${rate >= 75 ? 'text-emerald-400' : 'text-rose-400'}`}>{rate}%</span>
                             <div className="w-16 h-1 bg-white/5 rounded-full overflow-hidden">
                                <div className={`h-full ${rate >= 75 ? 'bg-emerald-500' : 'bg-rose-500'}`} style={{ width: `${rate}%` }} />
                             </div>
                          </div>
                        </td>
                        <td className="px-6 py-4 text-right">
                          {rate >= 75 ? (
                            <span className="px-2 py-1 bg-emerald-500/10 text-emerald-400 text-[10px] font-black uppercase rounded-lg border border-emerald-500/20">Good Standing</span>
                          ) : rate >= 50 ? (
                            <span className="px-2 py-1 bg-amber-500/10 text-amber-500 text-[10px] font-black uppercase rounded-lg border border-amber-500/20">At Risk</span>
                          ) : (
                            <span className="px-2 py-1 bg-rose-500/10 text-rose-400 text-[10px] font-black uppercase rounded-lg border border-rose-500/20">Critical</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
