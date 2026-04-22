'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { useAuth } from '@/contexts/auth-context';
import { ParentForm, Student, Teacher, Parent } from '@/components/parents/ParentForm';
import { ArrowLeftIcon } from '@/lib/icons';

type ClassItem = { name: string; school_name: string | null };

export default function EditParentPage() {
  const router = useRouter();
  const { id } = useParams();
  const { profile, loading: authLoading } = useAuth();
  const [students, setStudents] = useState<Student[]>([]);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [schools, setSchools] = useState<string[]>([]);
  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [parent, setParent] = useState<Parent | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const schoolFetchedRef = useRef('');

  const fetchData = useCallback(async (schoolOverride?: string) => {
    if (!profile || !id) return;
    const isInitial = schoolOverride === undefined;
    if (isInitial) setLoading(true); // Only show full-page spinner on first load
    setError(null);
    try {
      const params = new URLSearchParams({ include_picker_data: 'true' });
      const school = schoolOverride ?? (profile.role === 'teacher' ? profile.school_name ?? '' : '');
      if (school) params.set('school', school);

      const res = await fetch(`/api/parents/manage?${params.toString()}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to load parent');

      if (isInitial) {
        const found = json.data?.find((p: any) => p.id === id);
        if (!found) throw new Error('Parent record not found');
        setParent(found);
      }

      setStudents(json.students || []);
      setTeachers(json.teachers || []);
      setClasses(json.classes || []);
      if (json.assigned_schools?.length > 0) setSchools(json.assigned_schools);
    } catch (err: any) {
      setError(err.message);
    } finally {
      if (isInitial) setLoading(false);
    }
  }, [profile, id]);  

  useEffect(() => {
    if (!authLoading && profile && id) fetchData();
  }, [authLoading, profile, id]); // eslint-disable-line react-hooks/exhaustive-deps

  // After initial load: for admin, re-fetch picker data filtered by the parent's school
  useEffect(() => {
    const school = parent?.children[0]?.school_name;
    if (school && profile?.role === 'admin' && school !== schoolFetchedRef.current) {
      schoolFetchedRef.current = school;
      fetchData(school);
    }
  }, [parent, profile?.role]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSchoolChange = useCallback(async (school: string) => {
    await fetchData(school);
  }, [fetchData]);

  if (authLoading || loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] space-y-4">
        <div className="w-8 h-8 border-2 border-orange-500 border-t-transparent animate-spin" />
        <p className="text-xs font-black uppercase tracking-widest text-muted-foreground">Loading parent account…</p>
      </div>
    );
  }

  const isStaff = profile?.role === 'admin' || profile?.role === 'teacher';
  if (!isStaff) return null;

  return (
    <div className="space-y-6 max-w-4xl mx-auto pb-12">
      <div className="flex items-center gap-4">
        <button
          onClick={() => router.back()}
          className="p-2 border border-border hover:border-foreground/30 text-muted-foreground hover:text-foreground transition-all"
        >
          <ArrowLeftIcon className="w-5 h-5" />
        </button>
        <div>
          <h1 className="text-2xl font-black text-foreground tracking-tight">Edit Parent</h1>
          <p className="text-sm text-muted-foreground mt-1">Updating profile for {parent?.full_name}.</p>
        </div>
      </div>

      {error ? (
        <div className="bg-rose-500/10 border border-rose-500/20 p-6 text-center">
          <p className="text-sm text-rose-400 font-bold">{error}</p>
          <button onClick={() => fetchData()} className="mt-4 text-xs font-black uppercase tracking-widest text-foreground underline">Retry</button>
        </div>
      ) : parent ? (
        <ParentForm
          initialData={parent}
          students={students}
          teachers={teachers}
          schools={schools}
          officialClasses={classes}
          defaultSchool={parent.children[0]?.school_name || (profile?.role === 'teacher' ? profile?.school_name || '' : '')}
          onSchoolChange={handleSchoolChange}
          onCancel={() => router.push('/dashboard/parents')}
          onSaved={() => router.push('/dashboard/parents')}
        />
      ) : null}
    </div>
  );
}
