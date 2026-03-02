'use client';

import { useState, useEffect } from 'react';
import { ExclamationTriangleIcon, UserCircleIcon, ClockIcon, ChartBarIcon } from '@heroicons/react/24/outline';
import { fetchAtRiskStudents } from '@/services/dashboard.service';

interface Student {
    student_id: string;
    full_name: string;
    last_login: string | null;
    avg_grade: number;
    risk_level: 'High' | 'Medium' | 'Low';
}

export function AtRiskList({ schoolId }: { schoolId?: string }) {
    const [students, setStudents] = useState<Student[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        async function load() {
            try {
                const data = await fetchAtRiskStudents(schoolId);
                setStudents(data || []);
            } catch (error) {
                console.error('Failed to load at-risk students:', error);
            } finally {
                setLoading(false);
            }
        }
        load();
    }, [schoolId]);

    if (loading) return (
        <div className="animate-pulse space-y-4">
            {[1, 2, 3].map(i => (
                <div key={i} className="h-16 bg-white/5 rounded-2xl" />
            ))}
        </div>
    );

    const atRisk = students.filter(s => s.risk_level !== 'Low');

    if (atRisk.length === 0) return (
        <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-2xl p-8 text-center">
            <div className="w-12 h-12 bg-emerald-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
                <UserCircleIcon className="w-6 h-6 text-emerald-400" />
            </div>
            <p className="text-emerald-400 font-bold">All students on track!</p>
            <p className="text-emerald-400/60 text-sm mt-1">No learners flagged for risk currently.</p>
        </div>
    );

    return (
        <div className="space-y-4">
            {atRisk.map(student => (
                <div key={student.student_id} className="bg-white/5 border border-white/10 rounded-2xl p-4 flex items-center justify-between hover:bg-white/8 transition-all">
                    <div className="flex items-center gap-4">
                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${student.risk_level === 'High' ? 'bg-rose-500/20' : 'bg-amber-500/20'
                            }`}>
                            <ExclamationTriangleIcon className={`w-5 h-5 ${student.risk_level === 'High' ? 'text-rose-400' : 'text-amber-400'
                                }`} />
                        </div>
                        <div>
                            <p className="font-bold text-white">{student.full_name}</p>
                            <div className="flex items-center gap-3 mt-1">
                                <span className="flex items-center gap-1 text-xs text-white/40">
                                    <ClockIcon className="w-3.5 h-3.5" />
                                    {student.last_login ? `Last active ${new Date(student.last_login).toLocaleDateString()}` : 'Never logged in'}
                                </span>
                                <span className="flex items-center gap-1 text-xs text-white/40">
                                    <ChartBarIcon className="w-3.5 h-3.5" />
                                    Avg Grade: {Math.round(student.avg_grade)}%
                                </span>
                            </div>
                        </div>
                    </div>
                    <div className="text-right">
                        <span className={`px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-widest ${student.risk_level === 'High' ? 'bg-rose-500/20 text-rose-400' : 'bg-amber-500/20 text-amber-400'
                            }`}>
                            {student.risk_level} Risk
                        </span>
                    </div>
                </div>
            ))}
        </div>
    );
}
