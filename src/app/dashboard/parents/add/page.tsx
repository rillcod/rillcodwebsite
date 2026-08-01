'use client';

import { useState, useEffect, useCallback, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/contexts/auth-context';
import { ParentForm, Student, Teacher } from '@/components/parents/ParentForm';
import { ArrowLeftIcon } from '@/lib/icons';

type ClassItem = { name: string; school_name: string | null };

function AddParentPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const preselectedStudentIds = searchParams.get('student_id')
    ? [searchParams.get('student_id')!]
    : undefined;
  const { profile, loading: authLoading } = useAuth();
  const [students, setStudents] = useState<Student[]>([]);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [schools, setSchools] = useState<string[]>([]);
  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async (schoolOverride?: string) => {
    if (!profile) return;
    const isInitial = schoolOverride === undefined;
    if (isInitial) setLoading(true); // Only show full-page spinner on first load
    setError(null);
    try {
      const params = new URLSearchParams({ include_picker_data: 'true' });
      const school = schoolOverride ?? (profile.role === 'teacher' ? profile.school_name ?? '' : '');
      if (school) params.set('school', school);

      const res = await fetch(`/api/parents/manage?${params.toString()}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to load data');

      setStudents(json.students || []);
      setTeachers(json.teachers || []);
      setClasses(json.classes || []);
      if (json.assigned_schools?.length > 0) setSchools(json.assigned_schools);
    } catch (err: any) {
      setError(err.message);
    } finally {
      if (isInitial) setLoading(false);
    }
  }, [profile]);  

  useEffect(() => {
    if (!authLoading && profile) fetchData();
  }, [authLoading, profile]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSchoolChange = useCallback(async (school: string) => {
    await fetchData(school);
  }, [fetchData]);

  if (authLoading || loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] space-y-4 mobile-page-root">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent animate-spin" />
        <p className="text-xs font-black uppercase tracking-widest text-muted-foreground">Loading Form Data…</p>
      </div>
    );
  }

  const isStaff = profile?.role === 'admin' || profile?.role === 'teacher';
  if (!isStaff) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-muted-foreground text-sm">Access restricted to staff accounts.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-4xl mx-auto pb-12 mobile-page-root">
      <div className="flex items-center gap-4">
        <button
          onClick={() => router.back()}
          className="p-2 border border-border hover:border-foreground/30 text-muted-foreground hover:text-foreground transition-all"
        >
          <ArrowLeftIcon className="w-5 h-5" />
        </button>
        <div>
          <h1 className="text-2xl font-black text-foreground tracking-tight">
            {preselectedStudentIds?.length ? 'Add Co-Parent' : 'Add Parent'}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {preselectedStudentIds?.length
              ? 'Link a second guardian to the selected child — both parents can access the portal.'
              : 'Create a new parent account and link to students.'}
          </p>
        </div>
      </div>

      {error ? (
        <div className="bg-rose-500/10 border border-rose-500/20 p-6 text-center">
          <p className="text-sm text-rose-600 dark:text-rose-400 font-bold">{error}</p>
          <button onClick={() => fetchData()} className="mt-4 text-xs font-black uppercase tracking-widest text-foreground underline">Retry</button>
        </div>
      ) : (
        <ParentForm
          students={students}
          teachers={teachers}
          schools={schools}
          officialClasses={classes}
          defaultSchool={profile?.role === 'teacher' ? (profile?.school_name || '') : (schools.length === 1 ? schools[0] : '')}
          preselectedStudentIds={preselectedStudentIds}
          onSchoolChange={handleSchoolChange}
          onCancel={() => router.push('/dashboard/parents')}
          onSaved={() => router.push('/dashboard/parents')}
        />
      )}
    </div>
  );
}

export default function AddParentPage() {
  return (
    <Suspense fallback={
      <div className="flex flex-col items-center justify-center min-h-[60vh] space-y-4 mobile-page-root">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent animate-spin" />
        <p className="text-xs font-black uppercase tracking-widest text-muted-foreground">Loading…</p>
      </div>
    }>
      <AddParentPageContent />
    </Suspense>
  );
}
