'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/contexts/auth-context';

// ── Types ─────────────────────────────────────────────────────────────────────

interface ScannedStudent {
  id: string;
  full_name: string;
  school_name: string | null;
  is_active: boolean;
  enrollment_type: string | null;
  avatar_url: string | null;
  source: 'portal' | 'students';
}

type AttendanceStatus = 'present' | 'late' | 'absent' | 'excused';
type ScannerState = 'idle' | 'scanning' | 'loading' | 'action' | 'done';

// ── Helpers ───────────────────────────────────────────────────────────────────

function extractStudentId(raw: string): string | null {
  // Matches https://rillcod.com/student/UUID or /student/UUID
  const match = raw.match(/\/student\/([0-9a-f-]{36})/i);
  return match ? match[1] : null;
}

const STATUS_CONFIG: Record<AttendanceStatus, { label: string; emoji: string; bg: string; ring: string; text: string }> = {
  present:  { label: 'Present',  emoji: '✅', bg: 'bg-emerald-500/20 hover:bg-emerald-500/40', ring: 'ring-emerald-500', text: 'text-emerald-400' },
  late:     { label: 'Late',     emoji: '⏰', bg: 'bg-amber-500/20  hover:bg-amber-500/40',  ring: 'ring-amber-500',   text: 'text-amber-400'   },
  absent:   { label: 'Absent',   emoji: '❌', bg: 'bg-red-500/20    hover:bg-red-500/40',    ring: 'ring-red-500',     text: 'text-red-400'     },
  excused:  { label: 'Excused',  emoji: '📋', bg: 'bg-blue-500/20   hover:bg-blue-500/40',   ring: 'ring-blue-500',    text: 'text-blue-400'    },
};

// ── Main component ─────────────────────────────────────────────────────────────

export default function StaffQRScanner() {
  const { profile } = useAuth();
  const router = useRouter();
  const pathname = typeof window !== 'undefined' ? window.location.pathname : '';
  const db = createClient();

  const [open, setOpen] = useState(false);
  const [state, setState] = useState<ScannerState>('idle');
  const [student, setStudent] = useState<ScannedStudent | null>(null);
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);
  const [attendanceDone, setAttendanceDone] = useState<AttendanceStatus | null>(null);
  const [supportsBarcodeDetector, setSupportsBarcodeDetector] = useState<boolean | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const detectorRef = useRef<any>(null);
  const scanLoopRef = useRef<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isStaff = profile?.role === 'admin' || profile?.role === 'teacher' || profile?.role === 'school';

  // Check BarcodeDetector support
  useEffect(() => {
    setSupportsBarcodeDetector('BarcodeDetector' in window);
  }, []);

  // Cleanup on close
  const closeScanner = useCallback(() => {
    if (scanLoopRef.current) cancelAnimationFrame(scanLoopRef.current);
    if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop());
    streamRef.current = null;
    detectorRef.current = null;
    scanLoopRef.current = null;
    setState('idle');
    setStudent(null);
    setAttendanceDone(null);
    setToast(null);
    setOpen(false);
  }, []);

  // Start camera scan
  const startCamera = useCallback(async () => {
    setState('scanning');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }

      // @ts-ignore
      detectorRef.current = new window.BarcodeDetector({ formats: ['qr_code'] });

      const scan = async () => {
        if (!videoRef.current || !detectorRef.current || state === 'action') return;
        try {
          const barcodes = await detectorRef.current.detect(videoRef.current);
          if (barcodes.length > 0) {
            const raw = barcodes[0].rawValue;
            await handleRawValue(raw);
            return;
          }
        } catch { /* detector may fail on first frames */ }
        scanLoopRef.current = requestAnimationFrame(scan);
      };
      scanLoopRef.current = requestAnimationFrame(scan);
    } catch (err: any) {
      showToast('Camera access denied. Use the photo upload instead.', false);
      setState('idle');
    }
  }, []);

  // Handle scanned value (URL or raw UUID)
  const handleRawValue = useCallback(async (raw: string) => {
    if (scanLoopRef.current) cancelAnimationFrame(scanLoopRef.current);
    if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop());

    const studentId = extractStudentId(raw) ?? (raw.match(/^[0-9a-f-]{36}$/i) ? raw : null);
    if (!studentId) {
      showToast('Not a valid student QR code.', false);
      setState('scanning');
      startCamera();
      return;
    }

    setState('loading');
    try {
      const res = await fetch(`/api/public/student/${studentId}`);
      if (!res.ok) throw new Error('Student not found');
      const data = await res.json();
      setStudent(data);
      setAttendanceDone(null);
      setState('action');
    } catch {
      showToast('Student not found in the system.', false);
      setState('idle');
    }
  }, [startCamera]);

  // Photo upload fallback (for non-BarcodeDetector browsers)
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setState('loading');

    // Use canvas + BarcodeDetector on the image file
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = async () => {
      try {
        // @ts-ignore
        const detector = new window.BarcodeDetector({ formats: ['qr_code'] });
        const barcodes = await detector.detect(img);
        URL.revokeObjectURL(url);
        if (barcodes.length > 0) {
          await handleRawValue(barcodes[0].rawValue);
        } else {
          showToast('No QR code found in photo. Try again.', false);
          setState('idle');
        }
      } catch {
        URL.revokeObjectURL(url);
        showToast('Could not read QR code. Try a clearer photo.', false);
        setState('idle');
      }
    };
    img.src = url;
  };

  // Mark attendance
  const markAttendance = async (status: AttendanceStatus) => {
    if (!student || !profile) return;
    try {
      const payload: any = {
        user_id: student.id,
        status,
        recorded_by: profile.id,
        notes: `QR scan by ${profile.full_name ?? 'staff'} on ${new Date().toLocaleDateString('en-NG')}`,
      };

      const { error } = await db.from('attendance').insert(payload);
      if (error) throw error;
      setAttendanceDone(status);
      showToast(`${STATUS_CONFIG[status].emoji} Marked ${status} for ${student.full_name}`, true);
    } catch (err: any) {
      showToast('Failed to save attendance. Try again.', false);
    }
  };

  const showToast = (msg: string, ok: boolean) => {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 3500);
  };

  const scanNext = () => {
    setStudent(null);
    setAttendanceDone(null);
    setState('idle');
  };

  if (!isStaff || pathname === '/dashboard/inbox') return null;

  return (
    <>
      {/* ── Floating scan button ── */}
      <button
        onClick={() => setOpen(true)}
        title="Scan Student QR Code"
        className="fixed bottom-24 right-4 md:bottom-6 md:right-6 z-50 w-12 h-12 md:w-14 md:h-14 rounded-full bg-[#7a0606] hover:bg-red-700 shadow-2xl shadow-red-900/50 flex items-center justify-center transition-all hover:scale-110 active:scale-95 print:hidden"
      >
        <svg viewBox="0 0 24 24" fill="none" className="w-6 h-6 text-white" stroke="currentColor" strokeWidth="2">
          <path d="M3 7V5a2 2 0 012-2h2M3 17v2a2 2 0 002 2h2M17 3h2a2 2 0 012 2v2M17 21h2a2 2 0 002-2v-2" strokeLinecap="round"/>
          <rect x="7" y="7" width="4" height="4" rx="0.5" fill="currentColor" stroke="none"/>
          <rect x="13" y="7" width="4" height="4" rx="0.5" fill="currentColor" stroke="none"/>
          <rect x="7" y="13" width="4" height="4" rx="0.5" fill="currentColor" stroke="none"/>
          <rect x="13" y="13" width="2" height="2" fill="currentColor" stroke="none"/>
          <rect x="15" y="15" width="2" height="2" fill="currentColor" stroke="none"/>
        </svg>
      </button>

      {/* ── Modal overlay ── */}
      {open && (
        <div className="fixed inset-0 z-[200] flex items-end sm:items-center justify-center bg-black/80 backdrop-blur-sm p-0 sm:p-4 print:hidden">
          <div className="w-full sm:max-w-md bg-[#0f0f1a] border border-white/10 rounded-t-2xl sm:rounded-2xl shadow-2xl overflow-hidden">

            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-[#7a0606]/30 flex items-center justify-center">
                  <svg viewBox="0 0 24 24" fill="none" className="w-4 h-4 text-red-400" stroke="currentColor" strokeWidth="2">
                    <path d="M3 7V5a2 2 0 012-2h2M3 17v2a2 2 0 002 2h2M17 3h2a2 2 0 012 2v2M17 21h2a2 2 0 002-2v-2" strokeLinecap="round"/>
                    <rect x="7" y="7" width="4" height="4" fill="currentColor" stroke="none"/>
                    <rect x="13" y="7" width="4" height="4" fill="currentColor" stroke="none"/>
                    <rect x="7" y="13" width="4" height="4" fill="currentColor" stroke="none"/>
                  </svg>
                </div>
                <div>
                  <p className="text-sm font-black text-white">QR Staff Scanner</p>
                  <p className="text-[10px] text-white/40 uppercase tracking-widest">Scan a student ID card</p>
                </div>
              </div>
              <button onClick={closeScanner} className="text-white/40 hover:text-white transition-colors p-1">
                <svg viewBox="0 0 24 24" fill="none" className="w-5 h-5" stroke="currentColor" strokeWidth="2">
                  <path d="M6 18L18 6M6 6l12 12" strokeLinecap="round"/>
                </svg>
              </button>
            </div>

            {/* Body */}
            <div className="p-5 space-y-4">

              {/* ── IDLE: Choose scan method ── */}
              {state === 'idle' && (
                <div className="space-y-3">
                  <p className="text-xs text-white/50 text-center">Choose how to scan the student's QR code</p>

                  {supportsBarcodeDetector && (
                    <button onClick={startCamera}
                      className="w-full flex items-center gap-4 p-4 bg-white/5 hover:bg-white/10 border border-white/10 hover:border-white/20 rounded-xl transition-all">
                      <div className="w-10 h-10 rounded-full bg-violet-500/20 flex items-center justify-center flex-shrink-0">
                        <svg viewBox="0 0 24 24" fill="none" className="w-5 h-5 text-violet-400" stroke="currentColor" strokeWidth="2">
                          <circle cx="12" cy="12" r="3"/>
                          <path d="M3 9V7a2 2 0 012-2h2M3 15v2a2 2 0 002 2h2M17 5h2a2 2 0 012 2v2M17 19h2a2 2 0 002-2v-2"/>
                        </svg>
                      </div>
                      <div className="text-left">
                        <p className="text-sm font-bold text-white">Use Camera</p>
                        <p className="text-[11px] text-white/40">Point phone camera at QR code</p>
                      </div>
                    </button>
                  )}

                  <button onClick={() => fileInputRef.current?.click()}
                    className="w-full flex items-center gap-4 p-4 bg-white/5 hover:bg-white/10 border border-white/10 hover:border-white/20 rounded-xl transition-all">
                    <div className="w-10 h-10 rounded-full bg-emerald-500/20 flex items-center justify-center flex-shrink-0">
                      <svg viewBox="0 0 24 24" fill="none" className="w-5 h-5 text-emerald-400" stroke="currentColor" strokeWidth="2">
                        <path d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" strokeLinecap="round"/>
                      </svg>
                    </div>
                    <div className="text-left">
                      <p className="text-sm font-bold text-white">Upload Photo</p>
                      <p className="text-[11px] text-white/40">Take or upload a photo of the QR code</p>
                    </div>
                  </button>
                  <input ref={fileInputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handleFileUpload} />

                  {!supportsBarcodeDetector && (
                    <p className="text-[10px] text-white/30 text-center">Camera scanner not supported in this browser. Use photo upload instead.</p>
                  )}
                </div>
              )}

              {/* ── SCANNING: Camera view ── */}
              {state === 'scanning' && (
                <div className="space-y-3">
                  <div className="relative rounded-xl overflow-hidden bg-black aspect-square">
                    <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover" />
                    {/* Viewfinder overlay */}
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                      <div className="w-48 h-48 relative">
                        {/* Corner brackets */}
                        {[['top-0 left-0','border-t-2 border-l-2'],['top-0 right-0','border-t-2 border-r-2'],['bottom-0 left-0','border-b-2 border-l-2'],['bottom-0 right-0','border-b-2 border-r-2']].map(([pos, cls]) => (
                          <div key={pos} className={`absolute ${pos} w-8 h-8 ${cls} border-red-400 rounded-none`} />
                        ))}
                        {/* Scanning line */}
                        <div className="absolute inset-x-0 h-px bg-red-400/60 animate-[scan_2s_ease-in-out_infinite]" style={{ top: '50%' }} />
                      </div>
                    </div>
                    <div className="absolute bottom-3 inset-x-0 text-center">
                      <span className="text-[11px] text-white/60 bg-black/50 px-3 py-1 rounded-full">Align QR code in the frame</span>
                    </div>
                  </div>
                  <canvas ref={canvasRef} className="hidden" />
                  <button onClick={() => { if (scanLoopRef.current) cancelAnimationFrame(scanLoopRef.current); if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop()); setState('idle'); }}
                    className="w-full py-2.5 text-sm text-white/50 hover:text-white border border-white/10 rounded-xl transition-colors">
                    Cancel
                  </button>
                </div>
              )}

              {/* ── LOADING ── */}
              {state === 'loading' && (
                <div className="flex flex-col items-center justify-center py-10 gap-4">
                  <div className="w-10 h-10 border-4 border-violet-500 border-t-transparent rounded-full animate-spin" />
                  <p className="text-white/40 text-sm">Looking up student...</p>
                </div>
              )}

              {/* ── ACTION: Student found ── */}
              {state === 'action' && student && (
                <div className="space-y-4">
                  {/* Student card */}
                  <div className="flex items-center gap-4 p-4 bg-white/5 rounded-xl border border-white/10">
                    {student.avatar_url ? (
                      <img src={student.avatar_url} alt={student.full_name} className="w-14 h-14 rounded-full object-cover border-2 border-white/10 flex-shrink-0" />
                    ) : (
                      <div className="w-14 h-14 rounded-full bg-white/10 flex items-center justify-center flex-shrink-0 text-2xl">
                        {student.full_name?.charAt(0)?.toUpperCase() ?? '?'}
                      </div>
                    )}
                    <div className="min-w-0">
                      <p className="font-black text-white text-base truncate">{student.full_name}</p>
                      <p className="text-[11px] text-white/40">{student.school_name || 'Rillcod Academy'}</p>
                      <span className={`inline-flex items-center gap-1 mt-1 text-[10px] font-bold px-2 py-0.5 rounded-full ${student.is_active ? 'bg-emerald-500/15 text-emerald-400' : 'bg-red-500/15 text-red-400'}`}>
                        {student.is_active ? '● Active' : '● Inactive'}
                      </span>
                    </div>
                  </div>

                  {/* Attendance section */}
                  {!attendanceDone ? (
                    <div className="space-y-2">
                      <p className="text-[10px] font-black text-white/40 uppercase tracking-widest">Mark Attendance</p>
                      <div className="grid grid-cols-2 gap-2">
                        {(Object.entries(STATUS_CONFIG) as [AttendanceStatus, typeof STATUS_CONFIG[AttendanceStatus]][]).map(([status, cfg]) => (
                          <button key={status} onClick={() => markAttendance(status)}
                            className={`flex items-center gap-2 px-3 py-3 ${cfg.bg} rounded-xl border border-white/5 transition-all`}>
                            <span className="text-lg">{cfg.emoji}</span>
                            <span className={`text-sm font-black ${cfg.text}`}>{cfg.label}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div className={`flex items-center gap-3 p-3 rounded-xl ${STATUS_CONFIG[attendanceDone].bg} border border-white/5`}>
                      <span className="text-2xl">{STATUS_CONFIG[attendanceDone].emoji}</span>
                      <div>
                        <p className={`text-sm font-black ${STATUS_CONFIG[attendanceDone].text}`}>
                          Marked {attendanceDone}
                        </p>
                        <p className="text-[10px] text-white/40">Attendance saved successfully</p>
                      </div>
                    </div>
                  )}

                  {/* Navigation actions */}
                  <div className="space-y-2">
                    <p className="text-[10px] font-black text-white/40 uppercase tracking-widest">Quick Actions</p>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        onClick={() => { router.push(`/dashboard/students?highlight=${student.id}`); closeScanner(); }}
                        className="flex items-center gap-2 px-3 py-2.5 bg-white/5 hover:bg-white/10 rounded-xl text-left transition-all border border-white/5">
                        <span className="text-base">👤</span>
                        <span className="text-[11px] font-bold text-white/70">View Profile</span>
                      </button>
                      <button
                        onClick={() => { router.push(`/dashboard/results?studentId=${student.id}`); closeScanner(); }}
                        className="flex items-center gap-2 px-3 py-2.5 bg-white/5 hover:bg-white/10 rounded-xl text-left transition-all border border-white/5">
                        <span className="text-base">📊</span>
                        <span className="text-[11px] font-bold text-white/70">Progress Report</span>
                      </button>
                      <button
                        onClick={() => { router.push(`/dashboard/attendance?studentId=${student.id}`); closeScanner(); }}
                        className="flex items-center gap-2 px-3 py-2.5 bg-white/5 hover:bg-white/10 rounded-xl text-left transition-all border border-white/5">
                        <span className="text-base">📅</span>
                        <span className="text-[11px] font-bold text-white/70">Attendance Log</span>
                      </button>
                      <button
                        onClick={() => { router.push(`/dashboard/assignments?studentId=${student.id}`); closeScanner(); }}
                        className="flex items-center gap-2 px-3 py-2.5 bg-white/5 hover:bg-white/10 rounded-xl text-left transition-all border border-white/5">
                        <span className="text-base">📝</span>
                        <span className="text-[11px] font-bold text-white/70">Assignments</span>
                      </button>
                    </div>
                  </div>

                  {/* Scan next */}
                  <button onClick={scanNext}
                    className="w-full py-3 bg-[#7a0606]/80 hover:bg-[#7a0606] text-white text-sm font-black uppercase tracking-widest rounded-xl transition-all flex items-center justify-center gap-2">
                    <svg viewBox="0 0 24 24" fill="none" className="w-4 h-4" stroke="currentColor" strokeWidth="2">
                      <path d="M4 4v5h5M20 20v-5h-5M4 9a9 9 0 0115.8-4.8M20 15a9 9 0 01-15.8 4.8" strokeLinecap="round"/>
                    </svg>
                    Scan Next Student
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Toast notification ── */}
      {toast && (
        <div className={`fixed bottom-28 md:bottom-24 right-4 z-[300] px-4 py-3 rounded-xl shadow-xl text-sm font-bold transition-all max-w-xs print:hidden ${toast.ok ? 'bg-emerald-500 text-white' : 'bg-red-500 text-white'}`}>
          {toast.msg}
        </div>
      )}

      {/* Keyframe for scan line */}
      <style>{`@keyframes scan{0%,100%{top:20%}50%{top:80%}}`}</style>
    </>
  );
}
