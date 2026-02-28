'use client';

import { useState, useCallback } from 'react';
import { getStudents, deleteStudent } from '@/services/students.service';
import type { Student, LoadingState } from '@/types';

interface UseStudentsReturn {
    students: Student[];
    filteredStudents: Student[];
    loadingState: LoadingState;
    error: string | null;
    searchTerm: string;
    setSearchTerm: (v: string) => void;
    statusFilter: string;
    setStatusFilter: (v: string) => void;
    refresh: () => Promise<void>;
    remove: (id: string) => Promise<void>;
}

export function useStudents(schoolId?: string): UseStudentsReturn {
    const [students, setStudents] = useState<Student[]>([]);
    const [loadingState, setLoadingState] = useState<LoadingState>('idle');
    const [error, setError] = useState<string | null>(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [statusFilter, setStatusFilter] = useState('all');

    const refresh = useCallback(async () => {
        setLoadingState('loading');
        setError(null);
        const { data, error } = await getStudents(schoolId);
        if (error) { setError(error); setLoadingState('error'); }
        else { setStudents(data ?? []); setLoadingState('success'); }
    }, [schoolId]);

    const remove = useCallback(async (id: string) => {
        const { error } = await deleteStudent(id);
        if (error) setError(error);
        else await refresh();
    }, [refresh]);

    const filteredStudents = students.filter((s) => {
        const matchesSearch = !searchTerm ||
            s.full_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
            s.email?.toLowerCase().includes(searchTerm.toLowerCase());
        const matchesStatus = statusFilter === 'all' || s.status === statusFilter;
        return matchesSearch && matchesStatus;
    });

    return { students, filteredStudents, loadingState, error, searchTerm, setSearchTerm, statusFilter, setStatusFilter, refresh, remove };
}
