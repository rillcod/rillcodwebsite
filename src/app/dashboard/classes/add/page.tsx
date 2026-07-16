// @refresh reset
'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/contexts/auth-context';
import { createClient } from '@/lib/supabase/client';
import {
  ArrowLeftIcon, AcademicCapIcon, CheckIcon,
  ExclamationTriangleIcon, ArrowPathIcon, UserIcon,
  BuildingOfficeIcon, UserGroupIcon,
} from '@/lib/icons';
import { GradeBandPicker } from '@/components/classes/GradeBandPicker';
import { composeClassName, type BandGranularity } from '@/lib/classes/naming';
import { liveAcademicSession } from '@/lib/reports/academic-period';

const INPUT = 'w-full px-4 py-2.5 bg-card shadow-sm border border-border rounded-xl text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary transition-colors';
const LABEL = 'block text-xs font-bold text-muted-foreground mb-1.5';

type AcademicTermOption = {
  id: string;
  academic_year: string;
  term_number: number;
  term_label: string;
  start_date: string | null;
  end_date: string | null;
  is_current: boolean;
};

export default function AddClassPage() {
  const router = useRouter();
  const { profile, loading: authLoading } = useAuth();
  const [programs, setPrograms] = useState<any[]>([]);
  const [courses, setCourses] = useState<any[]>([]);
  const [teachers, setTeachers] = useState<any[]>([]);
  const [schools, setSchools] = useState<any[]>([]);
  const [academicTerms, setAcademicTerms] = useState<AcademicTermOption[]>([]);
  const [liveCurrentTermId, setLiveCurrentTermId] = useState<string | null>(null);
  const [availableStudents, setAvailableStudents] = useState<any[]>([]);
  const [selectedStudents, setSelectedStudents] = useState<string[]>([]);
  const [loadingStudents, setLoadingStudents] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState({
    name: '',
    description: '',
    program_id: '',
    current_course_id: '',
    teacher_id: '',
    school_id: '',
    max_students: '20',
    start_date: '',
    end_date: '',
    term_id: '',
    schedule: '',
    status: 'scheduled',
  });

  // Grade drives the canonical name — no free-typed class names.
  const [grade, setGrade] = useState('');
  const [granularity, setGranularity] = useState<BandGranularity>('fixed');

  const set = (key: string, val: string) => setForm(f => ({ ...f, [key]: val }));
  const setTerm = (termId: string) => {
    const term = academicTerms.find(t => t.id === termId);
    setForm(f => ({
      ...f,
      term_id: termId,
      start_date: term?.start_date ?? f.start_date,
      end_date: term?.end_date ?? f.end_date,
    }));
  };

  const programmeName = programs.find(p => p.id === form.program_id)?.name ?? null;
  const schoolName = schools.find(s => s.id === form.school_id)?.name ?? null;
  const composed = composeClassName({ schoolName, programme: programmeName, grade, granularity });

  // Load programmes, teachers, schools
  useEffect(() => {
    if (authLoading || !profile) return;
    const p = profile;
    async function loadData() {
      const [programsRes, coursesRes, teachersRes, schRes, termsRes] = await Promise.all([
        fetch('/api/programs?is_active=true', { cache: 'no-store' }).then(r => r.json()),
        fetch('/api/courses?limit=1000&is_published=true', { cache: 'no-store' }).then(r => r.json()).catch(() => ({ data: [] })),
        p.role === 'admin'
          ? fetch('/api/portal-users?role=teacher', { cache: 'no-store' }).then(r => r.json()).catch(() => ({ data: [] }))
          : Promise.resolve({ data: [] }),
        fetch('/api/schools', { cache: 'no-store' }).then(r => r.json()),
        fetch('/api/settings/academic-year', { cache: 'no-store' }).then(r => r.json()).catch(() => ({ terms: [] })),
      ]);
      const loadedSchools = schRes.data ?? [];
      const terms = ((termsRes.terms ?? []) as AcademicTermOption[]);
      const live = liveAcademicSession();
      const currentTerm =
        (termsRes.current_term as AcademicTermOption | undefined)
        ?? terms.find(t => t.academic_year === live.periodLabel && t.term_label === live.termLabel)
        ?? terms.find(t => t.is_current)
        ?? terms[0];
      setPrograms(programsRes.data ?? []);
      setCourses(coursesRes.data ?? []);
      setTeachers(teachersRes.data ?? []);
      setSchools(loadedSchools);
      setAcademicTerms(terms);
      if (currentTerm) {
        setLiveCurrentTermId(currentTerm.id);
        setForm(f => ({
          ...f,
          term_id: f.term_id || currentTerm.id,
          start_date: f.start_date || currentTerm.start_date || '',
          end_date: f.end_date || currentTerm.end_date || '',
        }));
      }
      if (p.role === 'teacher') {
        setForm(f => ({
          ...f,
          teacher_id: p.id,
          school_id: loadedSchools.length === 1 ? loadedSchools[0].id : f.school_id,
        }));
      }
    }
    loadData();
  }, [profile?.id, authLoading]);

  // Load available students when programme or school changes
  useEffect(() => {
    if (!form.program_id) {
      setAvailableStudents([]);
      setSelectedStudents([]);
      return;
    }
    const db = createClient();
    setLoadingStudents(true);

    async function fetchStudents() {
      try {
        const { data: assignments } = await db
          .from('teacher_schools')
          .select('school_id')
          .eq('teacher_id', profile?.id || '');
        const assignedSchoolIds: string[] = (assignments ?? []).map((a: any) => a.school_id).filter(Boolean);
        if (profile?.school_id && !assignedSchoolIds.includes(profile.school_id)) {
          assignedSchoolIds.push(profile.school_id);
        }

        let poolQuery = db
          .from('portal_users')
          .select('id, full_name, email, school_id, school_name, section_class')
          .eq('role', 'student')
          .neq('is_deleted', true);

        const sName = form.school_id ? schools.find(s => s.id === form.school_id)?.name : null;

        if (profile?.role === 'admin') {
          if (form.school_id) {
            const unassigned = 'and(school_id.is.null,school_name.is.null)';
            poolQuery = poolQuery.or(
              sName
                ? `school_id.eq.${form.school_id},school_name.eq.${JSON.stringify(sName)},${unassigned}`
                : `school_id.eq.${form.school_id},${unassigned}`
            );
          }
        } else {
          if (form.school_id) {
            poolQuery = sName
              ? poolQuery.or(`school_id.eq.${form.school_id},school_name.eq.${JSON.stringify(sName)}`)
              : (poolQuery as any).in('school_id', [form.school_id]);
          } else if (assignedSchoolIds.length > 0) {
            const idPart = `school_id.in.(${assignedSchoolIds.join(',')})`;
            const nameParts = schools
              .filter(s => assignedSchoolIds.includes(s.id))
              .map(s => `school_name.eq.${JSON.stringify(s.name)}`)
              .filter(Boolean);
            poolQuery = (poolQuery as any).or(nameParts.length ? `${idPart},${nameParts.join(',')}` : idPart);
          }
          // No school filter — teacher with no school associations sees all students
          // (admin can always further restrict via school_id selection)
        }

        const { data: studs } = await poolQuery.order('full_name');
        setAvailableStudents(studs ?? []);

        // Count pending (students table, no portal account yet)
        let pendingQuery = db.from('students').select('id').is('user_id', null);
        if (form.school_id) {
          pendingQuery = sName
            ? pendingQuery.or(`school_id.eq.${form.school_id},school_name.eq.${JSON.stringify(sName)},created_by.eq.${profile?.id || ''}`)
            : pendingQuery.or(`school_id.eq.${form.school_id},created_by.eq.${profile?.id || ''}`);
        } else if (profile?.role === 'teacher') {
          pendingQuery = assignedSchoolIds.length > 0
            ? pendingQuery.or(`school_id.in.(${assignedSchoolIds.join(',')}),created_by.eq.${profile.id}`)
            : pendingQuery.eq('created_by', profile.id);
        }
        const { data: pData } = await pendingQuery;
        setPendingCount(pData?.length ?? 0);
      } catch (err) {
        console.error('Error fetching students:', err);
      } finally {
        setLoadingStudents(false);
      }
    }

    fetchStudents();
  }, [form.program_id, form.school_id]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.program_id || !grade || !form.school_id) {
      setError('Programme, grade, and school are required — the class name is composed from them.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const payload: any = {
        // No free-typed name — the server composes "School · Programme · Band".
        auto_name: true,
        grade,
        band_granularity: granularity,
        description: form.description.trim() || null,
        program_id: form.program_id,
        current_course_id: form.current_course_id || null,
        teacher_id: form.teacher_id || (profile?.role === 'teacher' ? profile.id : ''),
        auto_assign_teacher: !form.teacher_id && profile?.role === 'admin',
        school_id: form.school_id || null,
        max_students: parseInt(form.max_students) || 20,
        status: form.status,
        schedule: form.schedule.trim() || null,
        current_students: selectedStudents.length,
      };
      if (form.start_date) payload.start_date = form.start_date;
      if (form.end_date) payload.end_date = form.end_date;
      if (form.term_id) payload.term_id = form.term_id;

      const classRes = await fetch('/api/classes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const classJson = await classRes.json();
      if (!classRes.ok) throw new Error(classJson.error || 'Failed to create class');
      const newClass = classJson.data;

      if (selectedStudents.length > 0 && newClass?.id) {
        const patchUpdate: Record<string, string | null> = { class_id: newClass.id };
        if (form.school_id) patchUpdate.school_id = form.school_id;
        await fetch('/api/portal-users', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ids: selectedStudents, update: patchUpdate }),
        });
        const enrollRes = await fetch('/api/students/bulk-enroll', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userIds: selectedStudents,
            program_id: form.program_id,
            class_id: newClass.id,
            school_id: form.school_id || undefined,
          }),
        });
        const enrollJson = await enrollRes.json();
        if (!enrollRes.ok) {
          // Class was created — just warn, don't fail
          console.warn('Bulk enroll partially failed:', enrollJson.error);
        } else if (enrollJson.warning) {
          console.warn('Bulk enroll warning:', enrollJson.warning);
        }
      }

      router.push('/dashboard/classes');
    } catch (e: any) {
      setError(e.message ?? 'Failed to create class');
    } finally {
      setSaving(false);
    }
  };

  if (authLoading) return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin" />
    </div>
  );

  const isStaff = ['admin', 'teacher'].includes(profile?.role ?? '');
  if (!isStaff) return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="bg-card shadow-sm border border-border rounded-xl p-8 text-center max-w-sm">
        <ExclamationTriangleIcon className="w-8 h-8 text-rose-400 mx-auto mb-3" />
        <p className="text-sm font-bold text-foreground mb-1">Access Denied</p>
        <p className="text-xs text-muted-foreground">Staff access is required to create classes.</p>
      </div>
    </div>
  );

  return (
    <div className="space-y-6 pb-20 max-w-2xl">

      {/* Back link + header */}
      <div>
        <Link
          href="/dashboard/classes"
          className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors mb-4"
        >
          <ArrowLeftIcon className="w-3.5 h-3.5" /> Back to Classes
        </Link>
        <div className="flex items-center gap-2 mb-1">
          <AcademicCapIcon className="w-5 h-5 text-primary" />
          <span className="text-xs font-bold text-primary uppercase tracking-widest">New Class</span>
        </div>
        <h1 className="text-3xl font-extrabold text-foreground">Add Class</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Fill in the details below to create a new class and optionally enrol students.
        </p>
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-3 p-4 bg-rose-500/10 border border-rose-500/30 text-rose-400 text-sm rounded-xl">
          <ExclamationTriangleIcon className="w-4 h-4 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">

        {/* Class Details */}
        <div className="bg-card shadow-sm border border-border rounded-xl p-6 space-y-5">
          <h2 className="text-sm font-bold text-foreground">Class Details</h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className={LABEL}>Programme <span className="text-primary">*</span></label>
              <select
                required
                value={form.program_id}
                onChange={e => setForm(f => ({ ...f, program_id: e.target.value, current_course_id: '' }))}
                className={INPUT}
              >
                <option value="">Select programme...</option>
                {programs.map(p => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>

            <div>
              <label className={LABEL}>Grade <span className="text-primary">*</span></label>
              <GradeBandPicker grade={grade}
                onChange={({ granularity: g, grade: v }) => { setGranularity(g); setGrade(v); }}
                selectClass={INPUT} />
            </div>
          </div>

          <div>
            <label className={LABEL}>Course Focus <span className="text-xs font-normal text-muted-foreground">(recommended)</span></label>
            <select
              value={form.current_course_id}
              onChange={e => set('current_course_id', e.target.value)}
              disabled={!form.program_id || courses.filter(c => c.program_id === form.program_id).length === 0}
              className={`${INPUT} disabled:cursor-not-allowed disabled:opacity-60`}
            >
              <option value="">
                {!form.program_id
                  ? 'Select a programme first'
                  : courses.some(c => c.program_id === form.program_id)
                    ? 'Select the course used for result entry'
                    : 'No published courses in this programme'}
              </option>
              {courses.filter(c => c.program_id === form.program_id).map(c => (
                <option key={c.id} value={c.id}>{c.title}</option>
              ))}
            </select>
            <p className="mt-1.5 text-[10px] text-muted-foreground">
              This becomes the default in Report Builder. You can still choose another course from the same programme during result entry.
            </p>
          </div>

          {/* Live view of the class being created — composed automatically, never typed. */}
          <div className="rounded-2xl border border-primary/25 bg-gradient-to-br from-primary/10 to-transparent p-4">
            <div className="flex items-center gap-2 mb-2">
              <AcademicCapIcon className="w-4 h-4 text-primary" />
              <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/70">Class preview</span>
            </div>
            <p className="text-lg font-black text-foreground leading-tight">{composed.name || <span className="text-muted-foreground font-normal text-base">Pick a programme and grade…</span>}</p>
            {composed.name && (
              <div className="flex flex-wrap gap-1.5 mt-2.5">
                {composed.tier && <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wide bg-primary/15 text-primary border border-primary/20">{composed.tier}</span>}
                {composed.band?.label && <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wide bg-sky-500/15 text-sky-400 border border-sky-500/20">{composed.band.label}</span>}
                <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wide bg-muted text-muted-foreground border border-border">{schoolName || 'Independent / Online'}</span>
                {(() => {
                  const t = academicTerms.find(term => term.id === form.term_id);
                  return t ? (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wide bg-emerald-500/15 text-emerald-400 border border-emerald-500/20">
                      {t.academic_year} · {t.term_label}
                    </span>
                  ) : null;
                })()}
              </div>
            )}
            <p className="text-[10px] text-muted-foreground mt-2.5">Auto-named <span className="font-mono">School · Programme · Band</span> — no typing, always consistent.</p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">

            <div>
              <label className={LABEL}>Teacher</label>
              {profile?.role === 'teacher' ? (
                <div className={`${INPUT} flex items-center gap-2 text-muted-foreground bg-muted cursor-not-allowed`}>
                  <UserIcon className="w-4 h-4 text-primary flex-shrink-0" />
                  <span className="truncate">{profile.full_name ?? 'You'}</span>
                  <span className="ml-auto text-[10px] text-muted-foreground">Locked</span>
                </div>
              ) : (
                <select
                  value={form.teacher_id}
                  onChange={e => set('teacher_id', e.target.value)}
                  className={INPUT}
                >
                  <option value="">{profile?.role === 'admin' ? 'Auto-assign or Select teacher...' : 'Default (me)'}</option>
                  {teachers.map(t => (
                    <option key={t.id} value={t.id}>{t.full_name}</option>
                  ))}
                </select>
              )}
            </div>
          </div>

          <div>
            <label className={LABEL}>School <span className="text-primary">*</span></label>
            {profile?.role === 'teacher' && schools.length === 1 ? (
              <div className={`${INPUT} flex items-center gap-2 text-muted-foreground bg-muted cursor-not-allowed`}>
                <BuildingOfficeIcon className="w-4 h-4 text-primary flex-shrink-0" />
                <span className="truncate">{schools[0].name}</span>
                <span className="ml-auto text-[10px] text-muted-foreground">Locked</span>
              </div>
            ) : (
              <select
                required
                value={form.school_id}
                onChange={e => set('school_id', e.target.value)}
                className={INPUT}
              >
                <option value="">Select school...</option>
                {schools.map(s => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            )}
          </div>
        </div>

        {/* Schedule & Settings */}
        <div className="bg-card shadow-sm border border-border rounded-xl p-6 space-y-5">
          <h2 className="text-sm font-bold text-foreground">Schedule & Settings</h2>

          <div>
            <label className={LABEL}>Academic Year / Term</label>
            <select
              value={form.term_id}
              onChange={e => setTerm(e.target.value)}
              className={INPUT}
            >
              <option value="">Select academic year / term</option>
              {academicTerms.map(term => (
                <option key={term.id} value={term.id}>
                  {term.academic_year} · {term.term_label}{term.id === liveCurrentTermId ? ' (Current)' : ''}
                </option>
              ))}
            </select>
            <p className="text-[10px] text-muted-foreground mt-1.5">
              Use this to place the class in the correct term. Attendance, rosters, lesson plans, and reports follow this term.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className={LABEL}>Max Students</label>
              <input
                type="number" min="1" max="200"
                value={form.max_students}
                onChange={e => set('max_students', e.target.value)}
                className={INPUT}
              />
            </div>
            <div>
              <label className={LABEL}>Start Date</label>
              <input
                type="date"
                value={form.start_date}
                onChange={e => set('start_date', e.target.value)}
                className={INPUT}
                style={{ colorScheme: 'dark' }}
              />
            </div>
            <div>
              <label className={LABEL}>End Date</label>
              <input
                type="date"
                value={form.end_date}
                onChange={e => set('end_date', e.target.value)}
                className={INPUT}
                style={{ colorScheme: 'dark' }}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className={LABEL}>Schedule</label>
              <input
                type="text"
                value={form.schedule}
                onChange={e => set('schedule', e.target.value)}
                placeholder="e.g. Mon / Wed 4:00 PM"
                className={INPUT}
              />
            </div>
            <div>
              <label className={LABEL}>Status</label>
              <select
                value={form.status}
                onChange={e => set('status', e.target.value)}
                className={INPUT}
              >
                <option value="scheduled">Scheduled</option>
                <option value="active">Active</option>
              </select>
            </div>
          </div>

          <div>
            <label className={LABEL}>Description <span className="text-xs font-normal text-muted-foreground">(optional)</span></label>
            <textarea
              rows={3}
              value={form.description}
              onChange={e => set('description', e.target.value)}
              placeholder="Add notes about this class, objectives, or requirements..."
              className={`${INPUT} resize-none`}
            />
          </div>
        </div>

        {/* Enrol Students */}
        <div className="bg-card shadow-sm border border-border rounded-xl p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-bold text-foreground">Enrol Students</h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                {!form.program_id
                  ? 'Select a programme above to see available students.'
                  : `${selectedStudents.length} student${selectedStudents.length !== 1 ? 's' : ''} selected`}
              </p>
            </div>
            {pendingCount > 0 && (
              <span className="px-2.5 py-0.5 rounded-full text-xs font-bold border bg-primary/20 text-primary border-primary/30">
                {pendingCount} pending admission
              </span>
            )}
          </div>

          {!form.program_id ? (
            <div className="py-12 border border-dashed border-border flex flex-col items-center justify-center text-center">
              <UserGroupIcon className="w-8 h-8 text-muted-foreground/30 mb-3" />
              <p className="text-xs text-muted-foreground">Choose a programme first</p>
            </div>
          ) : loadingStudents ? (
            <div className="py-12 flex items-center justify-center gap-3">
              <ArrowPathIcon className="w-4 h-4 text-primary animate-spin" />
              <span className="text-xs text-muted-foreground">Loading students...</span>
            </div>
          ) : availableStudents.length === 0 ? (
            <div className="py-12 border border-dashed border-border flex flex-col items-center justify-center text-center">
              <ExclamationTriangleIcon className="w-7 h-7 text-amber-400/40 mb-3" />
              <p className="text-sm font-bold text-foreground mb-1">No students found</p>
              <p className="text-xs text-muted-foreground max-w-xs">
                No verified student accounts match this programme and school combination.
              </p>
            </div>
          ) : (
            <div className="border border-border rounded-xl overflow-hidden">
              {/* Select all bar */}
              <div className="flex items-center justify-between px-4 py-2.5 bg-muted border-b border-border">
                <span className="text-xs text-muted-foreground">
                  {availableStudents.length} student{availableStudents.length !== 1 ? 's' : ''} available
                </span>
                <button
                  type="button"
                  onClick={() => {
                    if (selectedStudents.length === availableStudents.length) setSelectedStudents([]);
                    else setSelectedStudents(availableStudents.map(s => s.id));
                  }}
                  className="text-xs font-bold text-primary hover:text-primary transition-colors"
                >
                  {selectedStudents.length === availableStudents.length ? 'Deselect all' : 'Select all'}
                </button>
              </div>

              {/* Student list */}
              <div className="max-h-72 overflow-y-auto divide-y divide-border">
                {availableStudents.map(student => (
                  <label
                    key={student.id}
                    className="flex items-center gap-3 px-4 py-3 hover:bg-primary/5 cursor-pointer transition-colors"
                  >
                    <input
                      type="checkbox"
                      checked={selectedStudents.includes(student.id)}
                      onChange={e => {
                        if (e.target.checked) setSelectedStudents(prev => [...prev, student.id]);
                        else setSelectedStudents(prev => prev.filter(id => id !== student.id));
                      }}
                      className="w-4 h-4 rounded-xl border-border bg-card text-primary focus:ring-primary focus:ring-offset-0 cursor-pointer"
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-foreground truncate">{student.full_name}</p>
                      <p className="text-xs text-muted-foreground truncate">{student.email}</p>
                    </div>
                    {selectedStudents.includes(student.id) && (
                      <CheckIcon className="w-3.5 h-3.5 text-primary flex-shrink-0" />
                    )}
                  </label>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex flex-col sm:flex-row items-center gap-3">
          <Link
            href="/dashboard/classes"
            className="w-full sm:w-auto px-5 py-2.5 bg-card shadow-sm border border-border text-sm font-bold text-muted-foreground hover:text-foreground hover:bg-muted rounded-xl transition-colors text-center"
          >
            Cancel
          </Link>
          <button
            type="submit"
            disabled={saving}
            className="w-full sm:flex-1 inline-flex items-center justify-center gap-2 px-5 py-2.5 bg-primary hover:bg-primary text-white text-sm font-bold rounded-xl transition-colors disabled:opacity-50 shadow-lg shadow-primary/30"
          >
            {saving
              ? <><ArrowPathIcon className="w-4 h-4 animate-spin" /> Creating class...</>
              : <><CheckIcon className="w-4 h-4" /> Create Class</>}
          </button>
        </div>

      </form>
    </div>
  );
}
