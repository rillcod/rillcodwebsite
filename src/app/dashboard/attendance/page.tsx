// @refresh reset
'use client';

import React, { useState, useEffect, useRef, useCallback, Suspense } from 'react';
import { useAuth } from '@/contexts/auth-context';
import { createClient } from '@/lib/supabase/client';
import {
  ClipboardDocumentCheckIcon, UserGroupIcon, CheckCircleIcon, XCircleIcon,
  ClockIcon, ExclamationCircleIcon, PlusIcon, ChevronDownIcon, CheckIcon,
  ArrowPathIcon, ArrowLeftIcon, PrinterIcon, TableCellsIcon, ChartPieIcon,
  CalendarIcon
} from '@/lib/icons';
import { useSearchParams, useRouter } from 'next/navigation';

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: any }> = {
  present: { label: 'Present', color: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30', icon: CheckCircleIcon },
  absent: { label: 'Absent', color: 'bg-rose-500/20 text-rose-400 border-rose-500/30', icon: XCircleIcon },
  late: { label: 'Late', color: 'bg-amber-500/20 text-amber-400 border-amber-500/30', icon: ClockIcon },
  excused: { label: 'Excused', color: 'bg-blue-500/20 text-blue-400 border-blue-500/30', icon: ExclamationCircleIcon },
};

export default function AttendancePage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="w-10 h-10 border-4 border-teal-500 border-t-transparent rounded-full animate-spin" />
      </div>
    }>
      <AttendanceContent />
    </Suspense>
  );
}

function AttendanceContent() {
  const { profile, loading: authLoading, profileLoading } = useAuth();
  const searchParams = useSearchParams();
  const isMinimal = searchParams.get('minimal') === 'true';
  const router = useRouter();
  const rawClassId = searchParams.get('class_id');
  const classIdFromQuery = React.useMemo(() => rawClassId, [rawClassId]);
  const isManager = profile?.role === 'admin' || profile?.role === 'teacher';
  const isSchoolRole = profile?.role === 'school';
  const isCanMark = isManager;
  const [activeTab, setActiveTab] = useState<'mark' | 'log'>(isCanMark ? 'mark' : 'log');
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

  // QR Scanner state
  const [showQrScanner, setShowQrScanner] = useState(false);
  const [qrScanning, setQrScanning] = useState(false);
  const [qrStudent, setQrStudent] = useState<{ id: string; name: string; school?: string } | null>(null);
  const [qrStatus, setQrStatus] = useState<string>('present');
  const [qrNotes, setQrNotes] = useState('');
  const [qrMsg, setQrMsg] = useState('');
  const [qrMsgType, setQrMsgType] = useState<'ok' | 'err'>('ok');
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const scanLoopRef = useRef<number | null>(null);
  const hasBarcodeDetector = typeof window !== 'undefined' && 'BarcodeDetector' in window;

  const isStaff = profile?.role === 'admin' || profile?.role === 'teacher' || profile?.role === 'school';

  useEffect(() => {
    if (authLoading || profileLoading || !profile) return;
    const db = createClient();
    if (isStaff) {
      if (profile.role === 'teacher') {
        // Get teacher's assigned school IDs so we show classes from their schools too
        Promise.all([
          db.from('teacher_schools').select('school_id').eq('teacher_id', profile.id),
        ]).then(async ([tsRes]) => {
          const schoolIds: string[] = (tsRes.data ?? []).map((r: any) => r.school_id).filter(Boolean);
          if (profile.school_id && !schoolIds.includes(profile.school_id)) schoolIds.push(profile.school_id);

          let q = db.from('classes').select('id, name, programs(name)');
          if (schoolIds.length > 0) {
            // teacher's own classes OR any class in their assigned schools
            q = (q as any).or(`teacher_id.eq.${profile.id},school_id.in.(${schoolIds.join(',')})`);
          } else {
            q = q.eq('teacher_id', profile.id);
          }
          const { data } = await q.order('name');
          setClasses(data ?? []);
        });
      } else {
        const q = profile.role === 'school' && profile.school_id
          ? db.from('classes').select('id, name, programs(name)').eq('school_id', profile.school_id).order('name')
          : db.from('classes').select('id, name, programs(name)').order('name');
        q.then(({ data }) => setClasses(data ?? []));
      }
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
    
    async function loadAttendance() {
      setLoading(true);
      const db = createClient();
      try {
        // Use the admin-client API route to reliably get enrolled students (bypasses RLS)
        const [studsHttpRes, attRes] = await Promise.all([
          fetch(`/api/classes/${selectedClass}/students`, { cache: 'no-store' }),
          db.from('attendance').select('*').eq('session_id', selectedSession),
        ]);

        const studsJson = await studsHttpRes.json();
        const studs: any[] = studsJson.students ?? [];
        setStudents(studs);
        
        const attMap: Record<string, { status: string; notes: string }> = {};
        (attRes.data ?? []).forEach((a: any) => {
          attMap[a.user_id] = { status: a.status, notes: a.notes ?? '' };
        });
        
        studs.forEach((s: any) => {
          if (!attMap[s.id]) attMap[s.id] = { status: 'present', notes: '' };
        });
        
        setAttendance(attMap);
        setSaved(false);
      } catch (err) {
        console.error('Attendance Load Error:', err);
      } finally {
        setLoading(false);
      }
    }

    loadAttendance();
  }, [selectedSession]); // eslint-disable-line

  // Load students for log view (independent of session selection)
  useEffect(() => {
    if (activeTab !== 'log' || !selectedClass) return;
    fetch(`/api/classes/${selectedClass}/students`, { cache: 'no-store' })
      .then(r => r.json())
      .then(json => setStudents(json.students ?? []));
  }, [activeTab, selectedClass]);

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
          Generated via Rillcod Technologies Portal
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
          Generated via Rillcod Technologies Portal
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
    const records = Object.entries(attendance).map(([user_id, val]) => ({
      session_id: selectedSession,
      user_id,
      status: val.status,
      notes: val.notes || null,
    }));
    const res = await fetch('/api/attendance/upsert', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ records }),
    });
    if (!res.ok) { const j = await res.json(); alert(j.error || 'Save failed'); }
    else { setSaved(true); }
    setSaving(false);
  };

  const quickMarkToday = async () => {
    if (!selectedClass) return;
    setLoading(true);
    const db = createClient();
    const today = new Date().toISOString().split('T')[0];

    // Check if today's session already exists (read-only — OK for teachers)
    const { data: existing } = await db.from('class_sessions')
      .select('*')
      .eq('class_id', selectedClass)
      .eq('session_date', today)
      .maybeSingle();

    if (existing) {
      setSelectedSession(existing.id);
    } else {
      // Create via API (bypasses RLS)
      const res = await fetch('/api/class-sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ class_id: selectedClass, session_date: today, topic: `Session on ${new Date().toLocaleDateString()}` }),
      });
      if (!res.ok) {
        const j = await res.json();
        alert(j.error || 'Failed to create session');
        setLoading(false);
        return;
      }
      const { data: created } = await res.json();
      setSessions(prev => [created, ...prev]);
      setSelectedSession(created.id);
    }
    setLoading(false);
  };

  // Auto-start camera when scanner opens (if BarcodeDetector supported)
  useEffect(() => {
    if (showQrScanner && hasBarcodeDetector && !qrStudent) {
      startQrCamera();
    }
    if (!showQrScanner) {
      stopQrCamera();
    }
  }, [showQrScanner]); // eslint-disable-line

  // Stop camera on unmount / when scanner closed
  useEffect(() => {
    return () => stopQrCamera();
  }, []);

  const stopQrCamera = useCallback(() => {
    if (scanLoopRef.current) cancelAnimationFrame(scanLoopRef.current);
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
    setQrScanning(false);
  }, []);

  const startQrCamera = useCallback(async () => {
    setQrStudent(null);
    setQrMsg('');
    setQrScanning(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      // @ts-ignore
      const detector = new (window as any).BarcodeDetector({ formats: ['qr_code'] });
      const tick = async () => {
        if (!videoRef.current || !streamRef.current) return;
        try {
          const codes = await detector.detect(videoRef.current);
          if (codes.length > 0) {
            const raw = codes[0].rawValue as string;
            const match = raw.match(/\/student\/([0-9a-f-]{36})/i);
            if (match) {
              stopQrCamera();
              await resolveScannedStudent(match[1]);
              return;
            }
          }
        } catch (_) {}
        scanLoopRef.current = requestAnimationFrame(tick);
      };
      scanLoopRef.current = requestAnimationFrame(tick);
    } catch (err: any) {
      setQrMsg('Camera error: ' + (err.message || 'denied'));
      setQrMsgType('err');
      setQrScanning(false);
    }
  }, [stopQrCamera]); // eslint-disable-line

  const handleQrPhoto = useCallback(async (file: File) => {
    setQrStudent(null);
    setQrMsg('');
    try {
      const bitmap = await createImageBitmap(file);
      // @ts-ignore
      const detector = new (window as any).BarcodeDetector({ formats: ['qr_code'] });
      const codes = await detector.detect(bitmap);
      if (codes.length === 0) { setQrMsg('No QR code found in image.'); setQrMsgType('err'); return; }
      const match = (codes[0].rawValue as string).match(/\/student\/([0-9a-f-]{36})/i);
      if (!match) { setQrMsg('QR code is not a student ID.'); setQrMsgType('err'); return; }
      await resolveScannedStudent(match[1]);
    } catch (err: any) {
      setQrMsg('Could not read image: ' + (err.message || 'error'));
      setQrMsgType('err');
    }
  }, []); // eslint-disable-line

  const resolveScannedStudent = useCallback(async (studentId: string) => {
    setQrMsg('Looking up student…');
    setQrMsgType('ok');
    try {
      const res = await fetch(`/api/public/student/${studentId}`);
      const json = await res.json();
      if (!res.ok || !json.student) { setQrMsg('Student not found.'); setQrMsgType('err'); return; }
      const s = json.student;
      setQrStudent({ id: s.id, name: s.full_name || s.name || 'Unknown', school: s.school_name });
      setQrStatus('present');
      setQrNotes('');
      setQrMsg('');
    } catch {
      setQrMsg('Failed to fetch student.'); setQrMsgType('err');
    }
  }, []);

  const markQrStudent = useCallback(async () => {
    if (!qrStudent || !selectedSession) return;
    const record = { session_id: selectedSession, user_id: qrStudent.id, status: qrStatus, notes: qrNotes || null };
    const res = await fetch('/api/attendance/upsert', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ records: [record] }),
    });
    if (!res.ok) { setQrMsg('Save failed — try again.'); setQrMsgType('err'); return; }
    // Update local attendance state if student is in the loaded list
    setAttendance(prev => ({ ...prev, [qrStudent.id]: { status: qrStatus, notes: qrNotes } }));
    setSaved(false);
    setQrMsg(`✓ ${qrStudent.name} marked as ${qrStatus}`);
    setQrMsgType('ok');
    setQrStudent(null);
  }, [qrStudent, selectedSession, qrStatus, qrNotes]);

  if (authLoading || profileLoading) return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="w-10 h-10 border-4 border-teal-500 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  // ── STUDENT VIEW ─────────────────────────────────────────────────────────
  if (!isStaff) {
    const present = myAttendance.filter(a => a.status === 'present').length;
    const rate = myAttendance.length ? Math.round((present / myAttendance.length) * 100) : 0;
    return (
      <div className="min-h-screen bg-background text-foreground">
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
              <div key={s.label} className="bg-card shadow-sm border border-border rounded-none p-5 text-center">
                <p className={`text-2xl font-extrabold ${s.color}`}>{s.value}</p>
                <p className="text-xs text-muted-foreground mt-1">{s.label}</p>
              </div>
            ))}
          </div>
          {myAttendance.length === 0 ? (
            <div className="text-center py-16 bg-card shadow-sm border border-border rounded-none">
              <ClipboardDocumentCheckIcon className="w-12 h-12 mx-auto text-muted-foreground mb-3" />
              <p className="text-muted-foreground">No attendance records yet.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {myAttendance.map((a: any) => {
                const cfg = STATUS_CONFIG[a.status] ?? STATUS_CONFIG.present;
                return (
                  <div key={a.id} className="bg-card shadow-sm border border-border rounded-none p-4 flex items-center justify-between gap-4">
                    <div>
                      <p className="font-semibold text-foreground">{a.class_sessions?.topic || 'Session'}</p>
                      <p className="text-xs text-muted-foreground">
                        {a.class_sessions?.classes?.name} · {a.class_sessions?.session_date && new Date(a.class_sessions.session_date).toLocaleDateString()}
                      </p>
                      {a.notes && <p className="text-xs text-muted-foreground mt-1">{a.notes}</p>}
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
    <div className="min-h-screen bg-background text-foreground">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">

        {!isMinimal && (
          <div className="flex flex-col md:flex-row md:items-center gap-6">
            <button onClick={() => router.back()}
              className="w-10 h-10 flex items-center justify-center rounded-none bg-card shadow-sm hover:bg-muted border border-border transition-colors flex-shrink-0">
              <ArrowLeftIcon className="w-5 h-5 text-muted-foreground" />
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
                    className="text-xs font-black text-muted-foreground hover:text-foreground uppercase tracking-widest flex items-center gap-2 transition-colors"
                  >
                    <ArrowLeftIcon className="w-3 h-3" /> Return to Class
                  </button>
                )}
              </div>
              <h1 className="text-3xl font-extrabold">{selectedClass ? 'Class Attendance' : 'Attendance Tracking'}</h1>
              <p className="text-muted-foreground text-sm mt-1">Mark and review student attendance per session</p>
            </div>
          </div>
        )}

        {/* Tabs */}
        {selectedClass && (
          <div className="flex items-center gap-1 p-1 bg-card shadow-sm border border-border rounded-none w-fit">
            {isCanMark && (
              <button onClick={() => setActiveTab('mark')}
                className={`flex items-center gap-2 px-4 py-2 text-xs font-bold rounded-none transition-all ${activeTab === 'mark' ? 'bg-teal-600 text-foreground shadow-lg shadow-teal-900/40' : 'text-muted-foreground hover:text-foreground hover:bg-card shadow-sm'}`}>
                <ClipboardDocumentCheckIcon className="w-4 h-4" /> Mark Attendance
              </button>
            )}
            <button onClick={() => setActiveTab('log')}
              className={`flex items-center gap-2 px-4 py-2 text-xs font-bold rounded-none transition-all ${activeTab === 'log' ? 'bg-teal-600 text-foreground shadow-lg shadow-teal-900/40' : 'text-muted-foreground hover:text-foreground hover:bg-card shadow-sm'}`}>
              <TableCellsIcon className="w-4 h-4" /> Attendance Log
            </button>
          </div>
        )}

        {/* Tab Content: MARK ATTENDANCE */}
        {activeTab === 'mark' && (
          <>
            {/* Selectors */}
            <div className="bg-card shadow-sm border border-border rounded-none p-5 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-1.5">Select Class</label>
                  <div className="relative">
                    <select value={selectedClass} onChange={e => { setSelectedClass(e.target.value); setSelectedSession(''); }}
                      className="w-full px-4 py-3 bg-card shadow-sm border border-border rounded-none text-sm text-foreground focus:outline-none focus:border-teal-500 cursor-pointer appearance-none">
                      <option value="">Choose a class…</option>
                      {classes.map(c => <option key={c.id} value={c.id}>{c.name}{c.programs?.name ? ` — ${c.programs.name}` : ''}</option>)}
                    </select>
                    <ChevronDownIcon className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-1.5">Select Session</label>
                  <div className="relative">
                    <select value={selectedSession} onChange={e => setSelectedSession(e.target.value)}
                      disabled={!selectedClass || sessions.length === 0}
                      className="w-full px-4 py-3 bg-card shadow-sm border border-border rounded-none text-sm text-foreground focus:outline-none focus:border-teal-500 cursor-pointer appearance-none disabled:opacity-40">
                      <option value="">Choose a session…</option>
                      {sessions.map(s => (
                        <option key={s.id} value={s.id}>
                          {new Date(s.session_date).toLocaleDateString()}{s.topic ? ` — ${s.topic}` : ''}
                        </option>
                      ))}
                    </select>
                    <ChevronDownIcon className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                  </div>
                </div>
              </div>

              {selectedClass && isCanMark && (
                <div className="flex flex-col gap-4 pt-2">
                  <div className="flex flex-col sm:flex-row items-center gap-3">
                    <button onClick={quickMarkToday} disabled={loading}
                      className="w-full sm:flex-1 flex items-center justify-center gap-2 py-3.5 bg-teal-600 hover:bg-teal-500 text-foreground font-extrabold rounded-none transition-all shadow-lg shadow-teal-900/30">
                      <CalendarIcon className="w-5 h-5 text-teal-200" />
                      {loading ? 'Processing…' : 'Mark Today\'s Attendance'}
                    </button>
                    <button onClick={() => setShowNewSession(!showNewSession)}
                      className="w-full sm:w-auto px-4 py-3.5 bg-card shadow-sm hover:bg-muted border border-border rounded-none text-xs font-bold text-muted-foreground hover:text-foreground transition-all">
                      Past / Custom Date
                    </button>
                    {selectedSession && (
                      <button
                        onClick={() => { setShowQrScanner(v => { if (v) { stopQrCamera(); setQrStudent(null); setQrMsg(''); } return !v; }); }}
                        className={`w-full sm:w-auto px-4 py-3.5 border rounded-none text-xs font-bold transition-all ${showQrScanner ? 'bg-violet-600 border-violet-500 text-white' : 'bg-card shadow-sm border-border text-muted-foreground hover:text-foreground hover:bg-muted'}`}>
                        📷 Scan QR
                      </button>
                    )}
                  </div>

                  {/* QR Scanner Panel */}
                  {showQrScanner && selectedSession && (
                    <div className="bg-card shadow-sm border border-violet-500/30 rounded-none p-4 space-y-4 animate-in fade-in slide-in-from-top-2 duration-300">
                      <p className="text-[10px] font-bold text-violet-400 uppercase tracking-widest">QR Code Attendance Scanner</p>

                      {/* No student yet — camera viewfinder + fallback */}
                      {!qrStudent && (
                        <div className="space-y-3">
                          {/* Camera viewfinder (auto-started) */}
                          {hasBarcodeDetector && (
                            <div className="relative w-full max-w-xs mx-auto aspect-square bg-black rounded-none overflow-hidden">
                              <video ref={videoRef} className="absolute inset-0 w-full h-full object-cover" playsInline muted />
                              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                                <div className="w-48 h-48 border-2 border-violet-400 rounded-sm relative">
                                  <div className="absolute top-0 left-0 w-6 h-6 border-t-4 border-l-4 border-violet-400" />
                                  <div className="absolute top-0 right-0 w-6 h-6 border-t-4 border-r-4 border-violet-400" />
                                  <div className="absolute bottom-0 left-0 w-6 h-6 border-b-4 border-l-4 border-violet-400" />
                                  <div className="absolute bottom-0 right-0 w-6 h-6 border-b-4 border-r-4 border-violet-400" />
                                  <div className="absolute top-0 left-0 right-0 h-0.5 bg-violet-400/70 animate-bounce" style={{ animationDuration: '1.5s' }} />
                                </div>
                                <p className="mt-3 text-white text-xs font-semibold drop-shadow">
                                  {qrScanning ? 'Point camera at student QR code' : 'Starting camera…'}
                                </p>
                              </div>
                            </div>
                          )}

                          <div className="flex gap-2">
                            {hasBarcodeDetector && !qrScanning && (
                              <button onClick={startQrCamera}
                                className="flex-1 py-2 rounded-none text-xs font-bold border border-violet-500/30 bg-violet-600/10 text-violet-400 hover:bg-violet-600/20 transition-all">
                                🔄 Restart Camera
                              </button>
                            )}
                            <label className={`${hasBarcodeDetector ? 'flex-1' : 'w-full'} py-2 rounded-none text-xs font-bold border border-violet-500/30 bg-violet-600/10 text-violet-400 hover:bg-violet-600/20 transition-all cursor-pointer text-center`}>
                              🖼 Upload Photo Instead
                              <input type="file" accept="image/*" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) { stopQrCamera(); handleQrPhoto(f); } e.target.value = ''; }} />
                            </label>
                          </div>

                          {qrMsg && (
                            <p className={`text-xs font-semibold px-1 ${qrMsgType === 'ok' ? 'text-teal-400' : 'text-rose-400'}`}>{qrMsg}</p>
                          )}
                        </div>
                      )}

                      {/* Student found — show card + status buttons */}
                      {qrStudent && (
                        <div className="space-y-3">
                          <div className="flex items-center gap-3 bg-white/5 border border-white/10 rounded-none p-3">
                            <div className="w-10 h-10 bg-violet-500/20 border border-violet-500/30 rounded-none flex items-center justify-center text-base font-black text-violet-400 flex-shrink-0">
                              {qrStudent.name.charAt(0)}
                            </div>
                            <div>
                              <p className="font-bold text-foreground text-sm">{qrStudent.name}</p>
                              {qrStudent.school && <p className="text-xs text-muted-foreground">{qrStudent.school}</p>}
                            </div>
                          </div>
                          <div>
                            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-2">Mark as</p>
                            <div className="flex flex-wrap gap-2">
                              {Object.entries(STATUS_CONFIG).map(([val, c]) => (
                                <button key={val} onClick={() => setQrStatus(val)}
                                  className={`px-3 py-1.5 rounded-none text-xs font-bold border transition-all ${qrStatus === val ? `${c.color} scale-105` : 'bg-card border-border text-muted-foreground hover:bg-muted'}`}>
                                  {c.label}
                                </button>
                              ))}
                            </div>
                          </div>
                          <input type="text" value={qrNotes} onChange={e => setQrNotes(e.target.value)}
                            placeholder="Notes (optional)"
                            className="w-full px-3 py-2 bg-background border border-border rounded-none text-xs text-foreground placeholder-muted-foreground focus:outline-none focus:border-violet-500 transition-colors" />
                          <div className="flex gap-2">
                            <button onClick={markQrStudent}
                              className="flex-1 py-2.5 bg-teal-600 hover:bg-teal-500 text-white rounded-none text-xs font-bold transition-all">
                              ✓ Confirm Attendance
                            </button>
                            <button onClick={() => { setQrStudent(null); setQrMsg(''); }}
                              className="px-4 py-2.5 bg-card border border-border text-muted-foreground hover:text-foreground rounded-none text-xs font-bold transition-all">
                              Cancel
                            </button>
                          </div>
                          {qrMsg && (
                            <p className={`text-xs font-semibold px-1 ${qrMsgType === 'ok' ? 'text-teal-400' : 'text-rose-400'}`}>{qrMsg}</p>
                          )}
                        </div>
                      )}

                      {/* Scan next after success */}
                      {!qrStudent && qrMsg && qrMsgType === 'ok' && (
                        <button onClick={() => { setQrMsg(''); startQrCamera(); }}
                          className="w-full py-2.5 bg-violet-600/20 border border-violet-500/30 text-violet-400 hover:bg-violet-600/30 rounded-none text-xs font-bold transition-all">
                          📷 Scan Next Student
                        </button>
                      )}
                    </div>
                  )}

                  {showNewSession && (
                    <div className="bg-card shadow-sm border border-teal-500/10 rounded-none p-4 space-y-3 animate-in fade-in slide-in-from-top-2 duration-300">
                      <p className="text-[10px] font-bold text-teal-400 uppercase tracking-widest px-1">Session Options</p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <input type="date" value={newSession.session_date}
                          onChange={e => setNewSession(f => ({ ...f, session_date: e.target.value }))}
                          className="px-4 py-2.5 bg-background border border-border rounded-none text-sm text-foreground focus:outline-none focus:border-teal-500 transition-colors" />
                        <button onClick={async () => {
                          if (!newSession.session_date) return;
                          setLoading(true);
                          const res = await fetch('/api/class-sessions', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                              class_id: selectedClass,
                              session_date: newSession.session_date,
                              topic: newSession.topic || `Session on ${newSession.session_date}`,
                              start_time: newSession.start_time || null,
                              end_time: newSession.end_time || null,
                            }),
                          });
                          if (!res.ok) { const j = await res.json(); alert(j.error || 'Failed'); }
                          else {
                            const { data } = await res.json();
                            setSessions(prev => [data, ...prev]);
                            setSelectedSession(data.id);
                            setShowNewSession(false);
                          }
                          setLoading(false);
                        }}
                          className="px-4 py-2.5 bg-teal-600/20 text-teal-400 border border-teal-500/20 rounded-none text-xs font-bold hover:bg-teal-600/30 transition-all">
                          Confirm & Create
                        </button>
                      </div>
                      <input type="text" value={newSession.topic}
                        onChange={e => setNewSession(f => ({ ...f, topic: e.target.value }))}
                        placeholder="Topic / Lessons (optional)"
                        className="w-full px-4 py-2.5 bg-background border border-border rounded-none text-sm text-foreground placeholder-muted-foreground focus:outline-none focus:border-teal-500 transition-colors" />
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
              <div className="text-center py-16 bg-card shadow-sm border border-border rounded-none">
                <UserGroupIcon className="w-12 h-12 mx-auto text-muted-foreground mb-3" />
                <p className="text-muted-foreground font-semibold">No enrolled students found for this class.</p>
                <p className="text-muted-foreground text-sm mt-1">Enroll students first from the class detail page.</p>
                {selectedClass && (
                  <a
                    href={`/dashboard/classes/${selectedClass}`}
                    className="inline-block mt-4 px-4 py-2 bg-teal-600/20 text-teal-400 border border-teal-500/20 rounded-none text-xs font-bold hover:bg-teal-600/30 transition-all"
                  >
                    Go to Class → Enroll Students
                  </a>
                )}
              </div>
            )}

            {!loading && selectedSession && students.length > 0 && (
              <div className="bg-card shadow-sm border border-border rounded-none overflow-hidden">
                <div className="p-5 border-b border-border flex items-center justify-between flex-wrap gap-3">
                  <div>
                    <h3 className="font-bold text-foreground">
                      {currentSession?.session_date && new Date(currentSession.session_date).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
                      {currentSession?.topic && ` — ${currentSession.topic}`}
                    </h3>
                    <p className="text-xs text-muted-foreground mt-0.5">{students.length} students</p>
                  </div>
                    <div className="flex items-center gap-2">
                      {/* Mark all buttons */}
                      {isCanMark && ['present', 'absent'].map(s => (
                        <button key={s} onClick={() => {
                          const next: Record<string, { status: string; notes: string }> = {};
                          students.forEach((st: any) => next[st.id] = { status: s, notes: attendance[st.id]?.notes ?? '' });
                          setAttendance(next);
                          setSaved(false);
                        }}
                          className="px-3 py-1.5 text-xs font-bold text-muted-foreground bg-card shadow-sm hover:bg-muted rounded-none transition-colors capitalize">
                          All {s}
                        </button>
                      ))}
                      <button onClick={handlePrintSession}
                        className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold bg-card shadow-sm hover:bg-muted text-muted-foreground hover:text-foreground border border-border rounded-none transition-colors">
                        <PrinterIcon className="w-4 h-4" />
                      </button>
                      {isCanMark && (
                        <button onClick={handleSave} disabled={saving}
                          className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold bg-teal-600 hover:bg-teal-500 text-foreground rounded-none transition-colors disabled:opacity-50">
                          {saving ? <ArrowPathIcon className="w-3.5 h-3.5 animate-spin" /> : saved ? <CheckIcon className="w-3.5 h-3.5" /> : <ClipboardDocumentCheckIcon className="w-3.5 h-3.5" />}
                          {saving ? 'Saving…' : saved ? 'Saved!' : 'Save Attendance'}
                        </button>
                      )}
                    </div>
                </div>

                <div className="divide-y divide-white/5">
                  {students.map((student: any, i: number) => {
                    const att = attendance[student.id] ?? { status: 'present', notes: '' };
                    const cfg = STATUS_CONFIG[att.status];
                    return (
                      <div key={student.id} className="px-5 py-4 flex flex-col sm:flex-row items-start sm:items-center gap-3">
                        <div className="flex items-center gap-3 flex-1 min-w-0">
                          <div className="w-9 h-9 bg-teal-500/10 border border-teal-500/20 rounded-none flex items-center justify-center text-sm font-black text-teal-400 flex-shrink-0">
                            {student.full_name?.charAt(0) ?? '?'}
                          </div>
                          <div className="min-w-0">
                            <p className="font-semibold text-foreground text-sm">{student.full_name}</p>
                            <p className="text-xs text-muted-foreground truncate">{student.email}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          {Object.entries(STATUS_CONFIG).map(([val, c]) => (
                          <button key={val} onClick={() => { 
                                if (!isCanMark) return;
                                setAttendance(a => ({ ...a, [student.id]: { ...a[student.id], status: val } })); 
                                setSaved(false); 
                            }}
                              disabled={!isCanMark}
                              className={`px-2.5 py-1.5 rounded-none text-xs font-bold border transition-all ${att.status === val ? `${c.color} scale-105` : 'bg-card shadow-sm border-border text-muted-foreground hover:bg-muted'} ${!isCanMark ? 'cursor-default' : ''}`}>
                              {c.label}
                            </button>
                          ))}
                          <input type="text" value={att.notes} placeholder="Notes"
                            readOnly={!isCanMark}
                            onChange={e => { 
                                if (!isCanMark) return;
                                setAttendance(a => ({ ...a, [student.id]: { ...a[student.id], notes: e.target.value } })); 
                                setSaved(false); 
                            }}
                            className="hidden sm:block w-28 px-2 py-1.5 bg-card shadow-sm border border-border rounded-none text-xs text-foreground placeholder-muted-foreground focus:outline-none focus:border-teal-500 transition-colors" />
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Summary bar */}
                <div className="px-5 py-4 border-t border-border bg-white/3 flex flex-wrap gap-4 text-xs text-muted-foreground">
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
            <div className="bg-card shadow-sm border border-border rounded-none p-6 flex items-center justify-between gap-4">
              <div>
                <h2 className="text-xl font-bold">Attendance History</h2>
                <p className="text-muted-foreground text-sm">Review student performance metrics across all {sessions.length} sessions</p>
              </div>
              <button 
                onClick={handlePrintLog}
                className="flex items-center gap-2 px-6 py-3 bg-muted hover:bg-muted text-foreground text-xs font-bold rounded-none transition-all border border-border"
              >
                <PrinterIcon className="w-4 h-4" /> Print Full Report
              </button>
            </div>

            <div className="bg-card shadow-sm border border-border rounded-none overflow-hidden">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="border-b border-border bg-white/3">
                    <th className="px-6 py-4 text-left text-[10px] font-black uppercase text-muted-foreground tracking-widest">Student Information</th>
                    <th className="px-6 py-4 text-center text-[10px] font-black uppercase text-muted-foreground tracking-widest">Present</th>
                    <th className="px-6 py-4 text-center text-[10px] font-black uppercase text-muted-foreground tracking-widest">Late/Excused</th>
                    <th className="px-6 py-4 text-center text-[10px] font-black uppercase text-muted-foreground tracking-widest">Attendance %</th>
                    <th className="px-6 py-4 text-right text-[10px] font-black uppercase text-muted-foreground tracking-widest">Status</th>
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
                          <div className="font-bold text-foreground">{student.full_name}</div>
                          <div className="text-[10px] text-muted-foreground font-medium">{student.email}</div>
                        </td>
                        <td className="px-6 py-4 text-center">
                          <span className="text-emerald-400 font-bold">{present}</span>
                          <span className="text-muted-foreground mx-1">/</span>
                          <span className="text-muted-foreground">{total}</span>
                        </td>
                        <td className="px-6 py-4 text-center">
                          <span className="text-amber-400 font-bold">{late}</span>
                        </td>
                        <td className="px-6 py-4 text-center">
                          <div className="flex flex-col items-center gap-1.5">
                             <span className={`text-sm font-black ${rate >= 75 ? 'text-emerald-400' : 'text-rose-400'}`}>{rate}%</span>
                             <div className="w-16 h-1 bg-card shadow-sm rounded-full overflow-hidden">
                                <div className={`h-full ${rate >= 75 ? 'bg-emerald-500' : 'bg-rose-500'}`} style={{ width: `${rate}%` }} />
                             </div>
                          </div>
                        </td>
                        <td className="px-6 py-4 text-right">
                          {rate >= 75 ? (
                            <span className="px-2 py-1 bg-emerald-500/10 text-emerald-400 text-[10px] font-black uppercase rounded-none border border-emerald-500/20">Good Standing</span>
                          ) : rate >= 50 ? (
                            <span className="px-2 py-1 bg-amber-500/10 text-amber-500 text-[10px] font-black uppercase rounded-none border border-amber-500/20">At Risk</span>
                          ) : (
                            <span className="px-2 py-1 bg-rose-500/10 text-rose-400 text-[10px] font-black uppercase rounded-none border border-rose-500/20">Critical</span>
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
