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
} from '@heroicons/react/24/outline';

interface StudentProfile {
  id: string;
  full_name: string;
  school_name: string | null;
  is_active: boolean;
  enrollment_type: string | null;
  avatar_url: string | null;
}

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

  return (
    <div className="min-h-screen bg-[#0f0f1a] flex flex-col items-center justify-center p-6">
      {/* Header */}
      <div className="mb-8 text-center">
        <Link href="/" className="inline-block">
          <span className="text-2xl font-black text-white tracking-tight">
            RILLCOD <span className="text-[#7a0606]">ACADEMY</span>
          </span>
        </Link>
        <p className="text-white/40 text-xs mt-1">Student Verification</p>
      </div>

      {/* Card */}
      <div className="w-full max-w-sm bg-white/5 border border-white/10 rounded-2xl overflow-hidden shadow-2xl">
        {status === 'loading' && (
          <div className="flex flex-col items-center justify-center py-20 gap-4">
            <div className="w-10 h-10 border-4 border-violet-500 border-t-transparent rounded-full animate-spin" />
            <p className="text-white/40 text-sm">Verifying student...</p>
          </div>
        )}

        {status === 'notfound' && (
          <div className="flex flex-col items-center justify-center py-16 gap-4 px-6">
            <XCircleIcon className="w-14 h-14 text-red-400" />
            <h2 className="text-white font-bold text-lg">Student Not Found</h2>
            <p className="text-white/40 text-sm text-center">
              This QR code does not match any registered student. Please contact the school administrator.
            </p>
            <Link
              href="/"
              className="mt-2 px-5 py-2.5 bg-white/10 hover:bg-white/15 text-white text-sm rounded-xl transition-colors"
            >
              Go to Homepage
            </Link>
          </div>
        )}

        {status === 'found' && student && (
          <>
            {/* Top accent band */}
            <div className="h-2 bg-[#7a0606]" />

            <div className="p-6 flex flex-col items-center gap-4">
              {/* Avatar */}
              {student.avatar_url ? (
                <img
                  src={student.avatar_url}
                  alt={student.full_name}
                  className="w-24 h-24 rounded-full object-cover border-4 border-white/10"
                />
              ) : (
                <div className="w-24 h-24 rounded-full bg-white/10 flex items-center justify-center border-4 border-white/10">
                  <UserCircleIcon className="w-16 h-16 text-white/30" />
                </div>
              )}

              {/* Name & status badge */}
              <div className="text-center">
                <h1 className="text-white font-bold text-xl leading-tight">{student.full_name}</h1>
                <p className="text-white/50 text-sm mt-1">{studentCode}</p>

                <span
                  className={`inline-flex items-center gap-1.5 mt-3 px-3 py-1 rounded-full text-xs font-semibold ${
                    student.is_active
                      ? 'bg-green-500/15 text-green-400'
                      : 'bg-red-500/15 text-red-400'
                  }`}
                >
                  {student.is_active ? (
                    <CheckBadgeIcon className="w-4 h-4" />
                  ) : (
                    <XCircleIcon className="w-4 h-4" />
                  )}
                  {student.is_active ? 'Active Student' : 'Inactive'}
                </span>
              </div>

              {/* Info rows */}
              <div className="w-full mt-2 space-y-2.5">
                <div className="flex items-center gap-3 bg-white/5 rounded-xl px-4 py-3">
                  <BuildingOffice2Icon className="w-4 h-4 text-white/40 flex-shrink-0" />
                  <div>
                    <p className="text-white/40 text-xs">School</p>
                    <p className="text-white text-sm font-medium">{student.school_name || 'Rillcod Academy'}</p>
                  </div>
                </div>

                {student.enrollment_type && (
                  <div className="flex items-center gap-3 bg-white/5 rounded-xl px-4 py-3">
                    <AcademicCapIcon className="w-4 h-4 text-white/40 flex-shrink-0" />
                    <div>
                      <p className="text-white/40 text-xs">Programme</p>
                      <p className="text-white text-sm font-medium capitalize">{student.enrollment_type}</p>
                    </div>
                  </div>
                )}
              </div>

              {/* Verified seal */}
              <div className="mt-2 flex items-center gap-2 text-white/30 text-xs">
                <CheckBadgeIcon className="w-4 h-4 text-violet-400" />
                Verified by Rillcod Academy
              </div>
            </div>

            {/* Footer */}
            <div className="border-t border-white/5 px-6 py-4 bg-white/[0.02] text-center">
              <p className="text-white/25 text-xs">rillcod.com &mdash; STEM &amp; AI Learning Platform</p>
            </div>
          </>
        )}
      </div>

      <p className="mt-6 text-white/20 text-xs text-center">
        This page is automatically generated from a student ID card QR code.
      </p>
    </div>
  );
}
