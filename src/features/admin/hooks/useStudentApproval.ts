'use client';

import { useState, useCallback } from 'react';
import { getProspectiveStudents, approveStudent, rejectStudent } from '@/services/students.service';
import type { ProspectiveStudent, LoadingState } from '@/types';

interface UseStudentApprovalReturn {
    students: ProspectiveStudent[];
    loadingState: LoadingState;
    actionId: string | null;
    error: string | null;
    refresh: () => Promise<void>;
    approve: (student: ProspectiveStudent) => Promise<void>;
    reject: (id: string) => Promise<void>;
}

/** Encapsulates all data + actions for the Student Approval admin panel. */
export function useStudentApproval(): UseStudentApprovalReturn {
    const [students, setStudents] = useState<ProspectiveStudent[]>([]);
    const [loadingState, setLoadingState] = useState<LoadingState>('idle');
    const [actionId, setActionId] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    const refresh = useCallback(async () => {
        setLoadingState('loading');
        setError(null);
        const { data, error } = await getProspectiveStudents();
        if (error) {
            setError(error);
            setLoadingState('error');
        } else {
            setStudents(data ?? []);
            setLoadingState('success');
        }
    }, []);

    const approve = useCallback(async (student: ProspectiveStudent) => {
        setActionId(student.id);
        const { error } = await approveStudent(student.id, student);
        if (error) setError(error);
        else await refresh();
        setActionId(null);
    }, [refresh]);

    const reject = useCallback(async (id: string) => {
        setActionId(id);
        const { error } = await rejectStudent(id);
        if (error) setError(error);
        else await refresh();
        setActionId(null);
    }, [refresh]);

    return { students, loadingState, actionId, error, refresh, approve, reject };
}
