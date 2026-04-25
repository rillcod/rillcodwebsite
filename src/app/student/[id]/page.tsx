'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import {
  AcademicCapIcon,
  BuildingOffice2Icon,
  CheckBadgeIcon,
  XCircleIcon,
  UserCircleIcon,
  BookOpenIcon,
  CalendarIcon,
  ShieldCheckIcon,
} from '@/lib/icons';

interface StudentProfile {
  id: string;
  full_name: string;
  school_name: string | null;
  is_active: boolean;
  enrollment_type: string | null;
  avatar_url: string | null;
  class_name: string | null;
  school_logo: string | null;
  enrolled_at: string | null;
}

const TYPE_LABELS: Record<string, string> = {
  school: 'Partner School',
  bootcamp: 'Summer Bootcamp',
  online: 'Online School',
  in_person: 'In-Person Centre',
};

export default function PublicStudentProfilePage() {
  const { id } = useParams<{ id: string }>();
  const [student, setStudent] = useState<StudentProfile | null>(null);
  const [status, setStatus] = useState<'loading' | 'found' | 'notfound'>('loading');

  useEffect(() => {
    if (!id) { setStatus('notfound'); return; }

    fetch(`/api/public/student/${id}`)
      .then(res => {
        if (!res.ok) { setStatus('notfound'); return null; }
        return res.json();
      })
      .then(data => {
        if (!data) return;
        setStudent(data);
        setStatus('found');
      })
      .catch(() => setStatus('notfound'));
  }, [id]);

  const studentCode = student ? `RC-${student.id.slice(0, 8).toUpperCase()}` : '';
  const enrolledDate = student?.enrolled_at
    ? new Date(student.enrolled_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
    : null;

  return (
    <div className="min-h-screen bg-[#0a0a14] flex flex-col items-center justify-center p-4 sm:p-6 relative overflow-hidden">
      {/* Background grid pattern */}
      <div
        className="absolute inset-0 opacity-[0.03]"
        style={{
          backgroundImage: `linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)`,
          backgroundSize: '40px 40px',
        }}
      />

      {/* Glow effects */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[300px] bg-primary/5 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-[400px] h-[200px] bg-violet-500/5 rounded-full blur-[100px] pointer-events-none" />

      {/* Header */}
      <div className="mb-8 text-center relative z-10">
        <Link href="/" className="inline-flex items-center gap-3 group">
          <img src="/logo.png" alt="Rillcod" className="w-8 h-8 opacity-80 group-hover:opacity-100 transition-opacity" />
          <span className="text-xl font-black text-white/90 tracking-tight uppercase">
            RILLCOD <span className="text-primary">TECHNOLOGIES</span>
          </span>
        </Link>
        <p className="text-white/30 text-[10px] font-bold uppercase tracking-[0.3em] mt-2">
          Student Identity Verification
        </p>
      </div>

      {/* Card */}
      <div className="w-full max-w-sm relative z-10">
        {status === 'loading' && (
          <div className="bg-white/[0.03] border border-white/10 backdrop-blur-sm flex flex-col items-center justify-center py-20 gap-4">
            <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin" />
            <p className="text-white/40 text-xs font-bold uppercase tracking-widest">Verifying identity…</p>
          </div>
        )}

        {status === 'notfound' && (
          <div className="bg-white/[0.03] border border-red-500/20 backdrop-blur-sm flex flex-col items-center justify-center py-16 gap-4 px-6">
            <div className="w-16 h-16 bg-red-500/10 flex items-center justify-center">
              <XCircleIcon className="w-8 h-8 text-red-400" />
            </div>
            <h2 className="text-white font-black text-lg uppercase tracking-tight">Identity Not Found</h2>
            <p className="text-white/40 text-xs text-center leading-relaxed max-w-[260px]">
              This QR code does not match any registered student. The card may be expired or invalid.
            </p>
            <Link
              href="/"
              className="mt-2 px-6 py-3 bg-white/5 hover:bg-white/10 border border-white/10 text-white text-[10px] font-black uppercase tracking-widest transition-all"
            >
              Go to Homepage
            </Link>
          </div>
        )}

        {status === 'found' && student && (
          <div className="bg-white/[0.03] border border-white/10 backdrop-blur-sm overflow-hidden">
            {/* Top accent */}
            <div className="h-1.5 bg-gradient-to-r from-primary via-primary to-amber-500" />

            {/* Verified Banner */}
            <div className={`flex items-center justify-center gap-2 py-2.5 text-[10px] font-black uppercase tracking-widest ${
              student.is_active
                ? 'bg-emerald-500/10 text-emerald-400 border-b border-emerald-500/10'
                : 'bg-red-500/10 text-red-400 border-b border-red-500/10'
            }`}>
              {student.is_active ? (
                <><ShieldCheckIcon className="w-3.5 h-3.5" /> Verified Active Student</>
              ) : (
                <><XCircleIcon className="w-3.5 h-3.5" /> Inactive Account</>
              )}
            </div>

            <div className="p-6 flex flex-col items-center gap-5">
              {/* Avatar */}
              {student.avatar_url ? (
                <img
                  src={student.avatar_url}
                  alt={student.full_name}
                  className="w-20 h-20 rounded-full object-cover ring-4 ring-white/5 ring-offset-2 ring-offset-[#0a0a14]"
                />
              ) : (
                <div className="w-20 h-20 bg-gradient-to-br from-primary/20 to-amber-500/10 flex items-center justify-center ring-4 ring-white/5 ring-offset-2 ring-offset-[#0a0a14]">
                  <UserCircleIcon className="w-12 h-12 text-primary/60" />
                </div>
              )}

              {/* Name & Code */}
              <div className="text-center">
                <h1 className="text-white font-black text-xl leading-tight uppercase tracking-tight">
                  {student.full_name}
                </h1>
                <p className="text-primary font-mono font-bold text-sm mt-1.5 tracking-wider">
                  {studentCode}
                </p>
              </div>

              {/* Info Grid */}
              <div className="w-full space-y-2">
                <InfoRow
                  icon={<BuildingOffice2Icon className="w-4 h-4" />}
                  label="School"
                  value={student.school_name || 'Rillcod Academy'}
                />
                {student.class_name && (
                  <InfoRow
                    icon={<BookOpenIcon className="w-4 h-4" />}
                    label="Class"
                    value={student.class_name}
                  />
                )}
                {student.enrollment_type && (
                  <InfoRow
                    icon={<AcademicCapIcon className="w-4 h-4" />}
                    label="Programme"
                    value={TYPE_LABELS[student.enrollment_type] || student.enrollment_type}
                  />
                )}
                {enrolledDate && (
                  <InfoRow
                    icon={<CalendarIcon className="w-4 h-4" />}
                    label="Enrolled"
                    value={enrolledDate}
                  />
                )}
              </div>
            </div>

            {/* Footer */}
            <div className="border-t border-white/5 px-6 py-3 bg-white/[0.01] flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <CheckBadgeIcon className="w-3.5 h-3.5 text-primary" />
                <span className="text-white/25 text-[9px] font-bold uppercase tracking-widest">Verified by Rillcod</span>
              </div>
              <span className="text-white/15 text-[9px] font-mono">{student.id.slice(0, 8)}</span>
            </div>
          </div>
        )}
      </div>

      <p className="mt-6 text-white/15 text-[9px] text-center relative z-10 font-bold uppercase tracking-widest">
        Scan the QR code on any Rillcod student ID card to verify identity
      </p>
    </div>
  );
}

function InfoRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-center gap-3 bg-white/[0.03] border border-white/5 px-4 py-3">
      <div className="text-white/30 flex-shrink-0">{icon}</div>
      <div className="min-w-0">
        <p className="text-white/30 text-[9px] font-black uppercase tracking-widest">{label}</p>
        <p className="text-white/90 text-sm font-bold truncate">{value}</p>
      </div>
    </div>
  );
}
