// @refresh reset
'use client';

import { useEffect } from 'react';
import {
    CheckCircleIcon, XCircleIcon, ClockIcon, UserIcon,
    AcademicCapIcon, PhoneIcon, EnvelopeIcon, BuildingOfficeIcon,
    ArrowPathIcon,
} from '@/lib/icons';
import { useStudentApproval } from '../hooks/useStudentApproval';
import type { ProspectiveStudent } from '@/types';

// ─── Status badge ─────────────────────────────────────────────────────────────
function StatusBadge({ isActive, isDeleted }: { isActive: boolean; isDeleted: boolean }) {
    if (isDeleted) return (
        <span className="inline-flex items-center gap-1.5 px-3 py-1 border-2 border-black text-xs font-black uppercase tracking-wider bg-red-100 text-black shadow-[2px_2px_0_0_rgba(0,0,0,1)]">
            <XCircleIcon className="w-3.5 h-3.5" /> Rejected
        </span>
    );
    if (isActive) return (
        <span className="inline-flex items-center gap-1.5 px-3 py-1 border-2 border-black text-xs font-black uppercase tracking-wider bg-blue-100 text-black shadow-[2px_2px_0_0_rgba(0,0,0,1)]">
            <CheckCircleIcon className="w-3.5 h-3.5" /> Approved
        </span>
    );
    return (
        <span className="inline-flex items-center gap-1.5 px-3 py-1 border-2 border-black text-xs font-black uppercase tracking-wider bg-yellow-100 text-black shadow-[2px_2px_0_0_rgba(0,0,0,1)]">
            <ClockIcon className="w-3.5 h-3.5" /> Pending
        </span>
    );
}

// ─── Student card ─────────────────────────────────────────────────────────────
interface StudentCardProps {
    student: ProspectiveStudent;
    onApprove: (s: ProspectiveStudent) => void;
    onReject: (id: string) => void;
    isProcessing: boolean;
}

function StudentCard({ student, onApprove, onReject, isProcessing }: StudentCardProps) {
    const isPending = !student.is_active && !student.is_deleted;
    return (
        <div className="p-6 bg-white border-b-2 border-black last:border-b-0 hover:bg-gray-50 transition-colors">
            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
                <div className="flex-1">
                    {/* Header */}
                    <div className="flex flex-wrap items-center gap-3 mb-4">
                        <h4 className="text-xl font-extrabold text-black uppercase tracking-tight">
                            {student.full_name}
                        </h4>
                        <StatusBadge isActive={student.is_active} isDeleted={student.is_deleted} />
                    </div>

                    {/* Details grid */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 text-sm">
                        {[
                            { icon: AcademicCapIcon, text: `${student.grade} · ${student.age}y` },
                            { icon: BuildingOfficeIcon, text: student.school_name },
                            { icon: UserIcon, text: student.gender },
                            { icon: UserIcon, text: `Parent: ${student.parent_name}` },
                            { icon: PhoneIcon, text: student.parent_phone },
                            { icon: EnvelopeIcon, text: student.parent_email },
                        ].map(({ icon: Icon, text }, i) => (
                            <div key={i} className="flex items-center gap-2 border-2 border-black/10 bg-gray-50 px-3 py-2">
                                <Icon className="w-4 h-4 flex-shrink-0 text-gray-400" />
                                <span className="font-bold text-black truncate">{text}</span>
                            </div>
                        ))}
                    </div>

                    {/* Extras */}
                    <div className="mt-4 border-l-4 border-[#FF914D] pl-4 py-2 bg-gray-50 text-sm space-y-1">
                        <p><span className="font-black uppercase tracking-tight">Course:</span>{' '}<span className="text-gray-700">{student.course_interest}</span></p>
                        <p><span className="font-black uppercase tracking-tight">Schedule:</span>{' '}<span className="text-gray-700">{student.preferred_schedule}</span></p>
                        <p><span className="font-black uppercase tracking-tight">Heard via:</span>{' '}<span className="text-gray-700">{student.hear_about_us}</span></p>
                    </div>
                </div>

                {/* Actions */}
                {isPending && (
                    <div className="flex flex-col gap-3 sm:ml-4 flex-shrink-0">
                        <button
                            onClick={() => onApprove(student)}
                            disabled={isProcessing}
                            className="px-5 py-2.5 bg-green-100 text-black font-black text-xs border-2 border-black shadow-[3px_3px_0_0_rgba(0,0,0,1)] hover:shadow-[5px_5px_0_0_rgba(0,0,0,1)] hover:-translate-x-[2px] hover:-translate-y-[2px] transition-all uppercase tracking-wide disabled:opacity-50 disabled:pointer-events-none"
                        >
                            {isProcessing ? '…' : '✓ Approve'}
                        </button>
                        <button
                            onClick={() => onReject(student.id)}
                            disabled={isProcessing}
                            className="px-5 py-2.5 bg-red-100 text-black font-black text-xs border-2 border-black shadow-[3px_3px_0_0_rgba(0,0,0,1)] hover:shadow-[5px_5px_0_0_rgba(0,0,0,1)] hover:-translate-x-[2px] hover:-translate-y-[2px] transition-all uppercase tracking-wide disabled:opacity-50 disabled:pointer-events-none"
                        >
                            {isProcessing ? '…' : '✗ Reject'}
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}

// ─── Main component ───────────────────────────────────────────────────────────
export function StudentApproval() {
    const { students, loadingState, actionId, error, refresh, approve, reject } = useStudentApproval();

    useEffect(() => { refresh(); }, [refresh]);

    if (loadingState === 'loading' || loadingState === 'idle') {
        return (
            <div className="flex items-center justify-center h-64">
                <div className="w-14 h-14 border-4 border-black border-t-[#FF914D] animate-spin" />
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-2 border-black shadow-[6px_6px_0_0_rgba(0,0,0,1)] bg-white p-6">
                <div>
                    <p className="text-xs font-black uppercase tracking-widest text-[#FF914D] mb-1">Admin</p>
                    <h2 className="text-2xl font-extrabold text-black uppercase tracking-tight">Student Approvals</h2>
                    <p className="text-gray-500 text-sm mt-1">Review and approve pending student registrations</p>
                </div>
                <button
                    onClick={refresh}
                    className="flex items-center gap-2 px-5 py-2.5 bg-white text-black font-black text-xs border-2 border-black shadow-[3px_3px_0_0_rgba(0,0,0,1)] hover:shadow-[5px_5px_0_0_rgba(0,0,0,1)] hover:-translate-x-[2px] hover:-translate-y-[2px] transition-all uppercase tracking-wide"
                >
                    <ArrowPathIcon className="w-4 h-4" /> Refresh
                </button>
            </div>

            {/* Error */}
            {error && (
                <div className="border-2 border-red-400 bg-red-50 p-4">
                    <p className="text-sm font-bold text-red-700">{error}</p>
                </div>
            )}

            {/* Table */}
            <div className="border-2 border-black shadow-[6px_6px_0_0_rgba(0,0,0,1)]">
                {/* Table header */}
                <div className="px-6 py-4 bg-black border-b-2 border-black">
                    <h3 className="text-xs font-black uppercase tracking-widest text-[#FF914D]">
                        Prospective Students ({students.length})
                    </h3>
                </div>

                {students.length === 0 ? (
                    <div className="p-16 text-center bg-gray-50">
                        <UserIcon className="mx-auto h-12 w-12 text-gray-300 mb-4" />
                        <h3 className="text-lg font-extrabold text-black uppercase">No pending students</h3>
                        <p className="text-gray-500 text-sm mt-2">New registrations will appear here for review.</p>
                    </div>
                ) : (
                    <div>
                        {students.map((student) => (
                            <StudentCard
                                key={student.id}
                                student={student}
                                onApprove={approve}
                                onReject={reject}
                                isProcessing={actionId === student.id}
                            />
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
