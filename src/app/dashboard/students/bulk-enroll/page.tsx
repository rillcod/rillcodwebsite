// @refresh reset
'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '@/contexts/auth-context';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import {
  AcademicCapIcon,
  MagnifyingGlassIcon,
  UserGroupIcon,
  CheckCircleIcon,
  XMarkIcon,
  ArrowPathIcon,
  BuildingOfficeIcon,
  BookOpenIcon,
  ExclamationTriangleIcon,
  ChevronDownIcon,
  PlusIcon,
} from '@/lib/icons';

const GRADE_PRESETS = [
  'Primary 1','Primary 2','Primary 3','Primary 4','Primary 5','Primary 6',
  'JSS1','JSS2','JSS3','SS1','SS2','SS3',
  'Cohort A','Cohort B','Cohort C',
];

interface StudentRow {
  id: string;
  full_name: string;
  email: string;
  section_class: string;
  school_name: string;
  school_id: string;
}

export default function BulkEnrollPage() {
  const { profile, loading: authLoading, profileLoading } = useAuth();

  const [students,    setStudents]    = useState<StudentRow[]>([]);
  const [programs,    setPrograms]    = useState<any[]>([]);
  const [schools,     setSchools]     = useState<any[]>([]);
  const [classesList, setClassesList] = useState<any[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [selected,    setSelected]    = useState<Set<string>>(new Set());
  const [enrolledIds, setEnrolledIds] = useState<Set<string>>(new Set()); // persists across refreshes
  const [search,      setSearch]      = useState('');
  const [classFilter, setClassFilter] = useState('');
  const [enrolling,   setEnrolling]   = useState(false);
  const [result,      setResult]      = useState<{ enrolled: number; skipped: number; className: string } | null>(null);

  // Enrolment settings
  const [programId,   setProgramId]   = useState('');
  const [schoolId,    setSchoolId]    = useState('');
  const [showSettings, setShowSettings] = useState(true);

  // Class selection mode
  const [classMode,     setClassMode]     = useState<'pick' | 'create'>('pick');
  const [classId,       setClassId]       = useState('');
  const [newClass,      setNewClass]      = useState({ grade_level: '', name: '', school_id: '' });
  const [creatingClass, setCreatingClass] = useState(false);

  // Active school filter chip
  const [schoolFilter, setSchoolFilter] = useState('');

  const isAdmin   = profile?.role === 'admin';
  const canAccess = isAdmin || profile?.role === 'teacher';

  async function load() {
    setLoading(true);
    const db = createClient();

    const studentsUrl = isAdmin
      ? '/api/portal-users?role=student'
      : '/api/portal-users?role=student&scoped=true';

    const [studRes, progRes, schoolRes, tsRes, primarySchoolRes, clsRes] = await Promise.all([
      fetch(studentsUrl, { cache: 'no-store' }).then(r => r.json()),
      db.from('programs').select('id, name').order('name'),
      isAdmin
        ? db.from('schools').select('id, name').eq('status', 'approved').order('name')
        : Promise.resolve({ data: [] }),
      !isAdmin && profile?.id
        ? db.from('teacher_schools').select('school_id, schools(id, name)').eq('teacher_id', profile.id)
        : Promise.resolve({ data: [] }),
      !isAdmin && profile?.school_id
        ? db.from('schools').select('id, name').eq('id', profile.school_id).maybeSingle()
        : Promise.resolve({ data: null }),
      fetch('/api/classes', { cache: 'no-store' }).then(r => r.json()).catch(() => ({ data: [] })),
    ]);

    const allUsers: any[] = studRes.data ?? [];
    const mappedStudents = allUsers
      .sort((a: any, b: any) => (a.full_name ?? '').localeCompare(b.full_name ?? ''))
      .map((s: any) => ({
        id: s.id,
        full_name: s.full_name ?? '',
        email: s.email ?? '',
        section_class: s.section_class ?? '',
        school_name: s.school_name ?? '',
        school_id: s.school_id ?? '',
      }));

    setStudents(mappedStudents);
    setPrograms(progRes.data ?? []);
    setClassesList(clsRes.data ?? []);

    if (isAdmin) {
      setSchools(schoolRes.data ?? []);
    } else {
      const schoolMap = new Map<string, string>();
      (tsRes.data ?? []).forEach((r: any) => { if (r.schools?.id) schoolMap.set(r.schools.id, r.schools.name); });
      if (primarySchoolRes.data?.id) schoolMap.set(primarySchoolRes.data.id, primarySchoolRes.data.name);
      mappedStudents.forEach((s: StudentRow) => { if (s.school_id && s.school_name) schoolMap.set(s.school_id, s.school_name); });
      setSchools([...schoolMap.entries()].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name)));
    }

    setLoading(false);
  }

  useEffect(() => {
    if (authLoading || profileLoading) return;
    if (profile && canAccess) load();
    else setLoading(false);
  }, [profile?.id, authLoading, profileLoading]); // eslint-disable-line

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return students.filter((s) => {
      const matchSearch = !q || s.full_name.toLowerCase().includes(q) || s.email.toLowerCase().includes(q) || (s.school_name ?? '').toLowerCase().includes(q);
      const matchClass  = !classFilter || (s.section_class ?? '').toLowerCase() === classFilter.toLowerCase();
      const matchSchool = !schoolFilter || s.school_name === schoolFilter;
      return matchSearch && matchClass && matchSchool;
    });
  }, [students, search, classFilter, schoolFilter]);

  const allClasses = useMemo(
    () => [...new Set(students.map((s) => s.section_class).filter(Boolean) as string[])].sort(),
    [students],
  );

  const groupedBySchool = useMemo(() => {
    const map = new Map<string, StudentRow[]>();
    for (const s of filtered) {
      const key = s.school_name || '(No School)';
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(s);
    }
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [filtered]);

  const enrollableFiltered = filtered.filter(s => !enrolledIds.has(s.id));
  const allFilteredSelected = enrollableFiltered.length > 0 && enrollableFiltered.every((s) => selected.has(s.id));

  function toggleAll() {
    if (allFilteredSelected) {
      const next = new Set(selected);
      enrollableFiltered.forEach((s) => next.delete(s.id));
      setSelected(next);
    } else {
      const next = new Set(selected);
      enrollableFiltered.forEach((s) => next.add(s.id));
      setSelected(next);
    }
  }

  function toggleOne(id: string) {
    const next = new Set(selected);
    next.has(id) ? next.delete(id) : next.add(id);
    setSelected(next);
  }

  // Scope classes to the selected school filter or selected students' schools
  const scopedClasses = useMemo(() => {
    if (classesList.length === 0) return [];
    const selectedStudentObjs = students.filter(s => selected.has(s.id));
    const relevantSchoolIds = new Set(selectedStudentObjs.map(s => s.school_id).filter(Boolean));
    const relevantSchoolNames = new Set(selectedStudentObjs.map(s => s.school_name).filter(Boolean));
    if (relevantSchoolIds.size === 0 && relevantSchoolNames.size === 0) return classesList;
    return classesList.filter((c: any) => {
      if (c.school_id && relevantSchoolIds.has(c.school_id)) return true;
      const cName = c.schools?.name;
      if (cName && relevantSchoolNames.has(cName)) return true;
      return false;
    });
  }, [classesList, students, selected]);

  // Group scoped classes by school name
  const classGroups = useMemo(() => {
    const groups: Record<string, any[]> = {};
    scopedClasses.forEach((c: any) => {
      const key = c.schools?.name ?? '— No School —';
      if (!groups[key]) groups[key] = [];
      groups[key].push(c);
    });
    return Object.entries(groups).sort(([a], [b]) => a.localeCompare(b));
  }, [scopedClasses]);

  async function handleEnroll() {
    if (selected.size === 0) return;
    const studentIds = [...selected];

    if (classMode === 'pick') {
      if (!classId) { alert('Please pick a class or switch to Create New Class.'); return; }
      setEnrolling(true);
      try {
        const res = await fetch(`/api/classes/${classId}/enroll`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ studentIds }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Enrollment failed');
        const cls = classesList.find((c: any) => c.id === classId);
        setResult({ enrolled: data.enrolled ?? studentIds.length, skipped: data.skipped ?? 0, className: cls?.name ?? 'class' });
        setEnrolledIds(prev => { const n = new Set(prev); studentIds.forEach(id => n.add(id)); return n; });
        setSelected(new Set());
        // keep classId so user can enrol more students into the same class
      } catch (err: any) {
        alert(err.message);
      } finally {
        setEnrolling(false);
      }
    } else {
      // Create new class then enroll
      const className = newClass.grade_level || newClass.name.trim();
      if (!className || !programId) { alert('Class name (or grade) and programme are required.'); return; }
      setCreatingClass(true);
      try {
        const body: any = { name: className, program_id: programId, status: 'active' };
        const sid = newClass.school_id || schoolId;
        if (sid) body.school_id = sid;
        const clsRes = await fetch('/api/classes', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        const clsJson = await clsRes.json();
        if (!clsRes.ok) throw new Error(clsJson.error ?? 'Failed to create class');
        const newClassId = clsJson.data.id;

        const enrRes = await fetch(`/api/classes/${newClassId}/enroll`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ studentIds }),
        });
        const enrJson = await enrRes.json();
        if (!enrRes.ok) throw new Error(enrJson.error ?? 'Failed to enrol students');

        setResult({ enrolled: enrJson.enrolled ?? studentIds.length, skipped: enrJson.skipped ?? 0, className });
        setEnrolledIds(prev => { const n = new Set(prev); studentIds.forEach(id => n.add(id)); return n; });
        setSelected(new Set());
        // Optimistically add the new class to the list and switch to pick mode
        setClassesList(prev => [...prev, clsJson.data]);
        setClassId(newClassId);
        setClassMode('pick');
        setNewClass({ grade_level: '', name: '', school_id: '' });
      } catch (err: any) {
        alert(err.message ?? 'Failed');
      } finally {
        setCreatingClass(false);
      }
    }
  }

  const selectedClass = classesList.find((c: any) => c.id === classId);

  if (authLoading || profileLoading || !profile || loading) return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="w-10 h-10 border-4 border-orange-500 border-t-transparent rounded-full animate-spin" />
    </div>
  );
  if (!canAccess) return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <p className="text-muted-foreground">Access restricted to admins and teachers.</p>
    </div>
  );

  return (
    <div className="min-h-screen bg-background px-4 py-6 md:px-8 max-w-6xl mx-auto">

      {/* Header */}
      <div className="flex items-start justify-between mb-6 gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-black text-foreground flex items-center gap-2">
            <AcademicCapIcon className="w-5 h-5 sm:w-6 sm:h-6 text-orange-400 flex-shrink-0" />
            Bulk Enrol Students
          </h1>
          <p className="text-muted-foreground text-xs sm:text-sm mt-1">Select students → pick or create a class → enrol</p>
        </div>
        <Link href="/dashboard/students" className="text-muted-foreground hover:text-foreground text-xs sm:text-sm transition-colors flex-shrink-0">← Back</Link>
      </div>

      {/* Result banner */}
      {result && (
        <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-none p-4 mb-5 flex items-start gap-3">
          <CheckCircleIcon className="w-5 h-5 text-emerald-400 flex-shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="text-foreground font-bold text-sm">
              {result.enrolled} student{result.enrolled !== 1 ? 's' : ''} enrolled into{' '}
              <span className="text-cyan-300">{result.className}</span>
            </p>
            {result.skipped > 0 && (
              <p className="text-amber-400 text-xs mt-1">{result.skipped} skipped (outside school boundary).</p>
            )}
          </div>
          <button onClick={() => setResult(null)} className="text-muted-foreground hover:text-foreground flex-shrink-0">
            <XMarkIcon className="w-5 h-5" />
          </button>
        </div>
      )}

      {/* Enrolment settings */}
      <div className="bg-[#0d1526] border border-border rounded-none mb-5 overflow-hidden">
        <button
          onClick={() => setShowSettings(v => !v)}
          className="w-full flex items-center justify-between px-4 sm:px-5 py-4 hover:bg-white/[0.02] transition-colors"
        >
          <div className="flex items-center gap-2 flex-wrap">
            <BookOpenIcon className="w-4 h-4 text-orange-400 flex-shrink-0" />
            <span className="text-foreground font-bold text-sm">Enrolment Settings</span>
            {selectedClass && <span className="text-cyan-300 text-xs bg-cyan-500/15 px-2 py-0.5 rounded-full border border-cyan-500/20 font-bold">{selectedClass.name}</span>}
            {classMode === 'create' && (newClass.grade_level || newClass.name) && (
              <span className="text-emerald-300 text-xs bg-emerald-500/15 px-2 py-0.5 rounded-full border border-emerald-500/20 font-bold">
                New: {newClass.grade_level || newClass.name}
              </span>
            )}
          </div>
          <ChevronDownIcon className={`w-4 h-4 text-muted-foreground transition-transform flex-shrink-0 ${showSettings ? 'rotate-180' : ''}`} />
        </button>

        {showSettings && (
          <div className="border-t border-border">
            {/* Class mode tabs */}
            <div className="px-4 sm:px-5 pt-4 pb-3 flex gap-2">
              <button
                onClick={() => setClassMode('pick')}
                className={`flex-1 py-2.5 rounded-none text-xs font-bold transition-all ${classMode === 'pick' ? 'bg-orange-600 text-foreground shadow-lg shadow-orange-900/30' : 'bg-card shadow-sm text-muted-foreground hover:bg-muted border border-border'}`}
              >
                Pick Existing Class
              </button>
              <button
                onClick={() => setClassMode('create')}
                className={`flex-1 py-2.5 rounded-none text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${classMode === 'create' ? 'bg-emerald-600 text-foreground shadow-lg shadow-emerald-900/30' : 'bg-card shadow-sm text-muted-foreground hover:bg-muted border border-border'}`}
              >
                <PlusIcon className="w-3.5 h-3.5" /> Create New Class
              </button>
            </div>

            <div className="px-4 sm:px-5 pb-5 space-y-3">
              {classMode === 'pick' ? (
                <>
                  {/* Programme — required for programme enrollment tracking */}
                  <div>
                    <label className="block text-muted-foreground text-xs font-bold uppercase tracking-widest mb-1.5">
                      Programme <span className="text-muted-foreground normal-case font-normal text-[10px]">(optional — taken from class if not set)</span>
                    </label>
                    <select
                      value={programId}
                      onChange={e => setProgramId(e.target.value)}
                      className="w-full px-3 py-2.5 bg-card shadow-sm border border-border rounded-none text-sm text-foreground focus:outline-none focus:border-orange-500/50 transition-colors"
                    >
                      <option value="">— Select a programme —</option>
                      {programs.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                  </div>

                  {/* Class picker — grouped by school */}
                  <div>
                    <label className="block text-muted-foreground text-xs font-bold uppercase tracking-widest mb-1.5">
                      Class <span className="text-rose-400">*</span>
                    </label>
                    {scopedClasses.length === 0 ? (
                      <div className="py-6 text-center bg-card shadow-sm border border-border rounded-none">
                        <p className="text-sm text-muted-foreground">No classes found for the selected students' school.</p>
                        <button onClick={() => setClassMode('create')} className="text-xs font-bold text-emerald-400 hover:text-emerald-300 transition-colors mt-2">
                          Create a new class →
                        </button>
                      </div>
                    ) : (
                      <div className="space-y-3 max-h-60 overflow-y-auto pr-1">
                        {classGroups.map(([schoolName, classes]) => (
                          <div key={schoolName}>
                            <p className="text-[10px] font-black text-blue-400/60 uppercase tracking-widest mb-1.5 px-1">{schoolName}</p>
                            <div className="space-y-1">
                              {classes.map((c: any) => (
                                <div
                                  key={c.id}
                                  onClick={() => setClassId(c.id)}
                                  className={`flex items-center gap-3 p-3 border rounded-none cursor-pointer transition-all ${classId === c.id ? 'bg-orange-600/15 border-orange-500/40' : 'bg-card shadow-sm border-border hover:border-orange-500/20 hover:bg-white/[0.07]'}`}
                                >
                                  <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-all ${classId === c.id ? 'border-orange-400 bg-orange-600' : 'border-border'}`}>
                                    {classId === c.id && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                                  </div>
                                  <div className="min-w-0 flex-1">
                                    <p className="text-sm font-semibold text-foreground truncate">{c.name}</p>
                                    {c.programs?.name && <p className="text-[9px] text-muted-foreground mt-0.5">{c.programs.name}</p>}
                                  </div>
                                  <span className="text-[10px] font-bold text-muted-foreground flex-shrink-0 tabular-nums">
                                    {c.current_students ?? 0}{c.max_students ? `/${c.max_students}` : ''} <span className="text-white/15">stu.</span>
                                  </span>
                                </div>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* School override */}
                  <div>
                    <label className="block text-muted-foreground text-xs font-bold uppercase tracking-widest mb-1.5">
                      Assign School <span className="text-muted-foreground normal-case font-normal text-[10px]">(optional)</span>
                    </label>
                    <select value={schoolId} onChange={e => setSchoolId(e.target.value)}
                      className="w-full px-3 py-2.5 bg-card shadow-sm border border-border rounded-none text-sm text-foreground focus:outline-none focus:border-blue-500/50 transition-colors">
                      <option value="">— Keep current school —</option>
                      {schools.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                  </div>
                </>
              ) : (
                /* Create new class form */
                <div className="space-y-3">
                  <p className="text-xs text-muted-foreground">Create a new class and immediately enrol {selected.size > 0 ? `${selected.size} selected` : 'selected'} students into it.</p>

                  {/* Grade preset */}
                  <div>
                    <label className="block text-muted-foreground text-xs font-bold uppercase tracking-widest mb-1.5">Grade / Section</label>
                    <select
                      value={newClass.grade_level}
                      onChange={e => setNewClass(q => ({ ...q, grade_level: e.target.value, name: e.target.value ? '' : q.name }))}
                      className="w-full px-3 py-2.5 bg-card shadow-sm border border-border rounded-none text-sm text-foreground focus:outline-none focus:border-emerald-500/50 cursor-pointer transition-colors"
                    >
                      <option value="">— Pick grade level —</option>
                      {GRADE_PRESETS.map(g => <option key={g} value={g}>{g}</option>)}
                    </select>
                  </div>

                  <div>
                    <label className="block text-muted-foreground text-xs font-bold uppercase tracking-widest mb-1.5">
                      Custom Name {!newClass.grade_level && <span className="text-rose-400">*</span>}
                    </label>
                    <input
                      value={newClass.name}
                      onChange={e => setNewClass(q => ({ ...q, name: e.target.value, grade_level: e.target.value ? '' : q.grade_level }))}
                      placeholder={newClass.grade_level ? `Leave blank to use "${newClass.grade_level}"` : 'e.g. JSS1A, Coding Club…'}
                      className="w-full px-3 py-2.5 bg-card shadow-sm border border-border rounded-none text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-emerald-500/50 transition-colors"
                    />
                  </div>

                  <div>
                    <label className="block text-muted-foreground text-xs font-bold uppercase tracking-widest mb-1.5">
                      Programme <span className="text-rose-400">*</span>
                    </label>
                    <select value={programId} onChange={e => setProgramId(e.target.value)}
                      className="w-full px-3 py-2.5 bg-card shadow-sm border border-border rounded-none text-sm text-foreground focus:outline-none focus:border-emerald-500/50 cursor-pointer transition-colors">
                      <option value="">— Select a programme —</option>
                      {programs.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                  </div>

                  <div>
                    <label className="block text-muted-foreground text-xs font-bold uppercase tracking-widest mb-1.5">
                      School <span className="text-muted-foreground normal-case font-normal text-[10px]">(optional)</span>
                    </label>
                    <select
                      value={newClass.school_id || schoolId}
                      onChange={e => { setNewClass(q => ({ ...q, school_id: e.target.value })); setSchoolId(e.target.value); }}
                      className="w-full px-3 py-2.5 bg-card shadow-sm border border-border rounded-none text-sm text-foreground focus:outline-none focus:border-emerald-500/50 cursor-pointer transition-colors">
                      <option value="">— Select school —</option>
                      {schools.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-2 sm:gap-3 mb-4">
        <div className="relative flex-1">
          <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search by name, email or school…"
            className="w-full pl-9 pr-4 py-2.5 bg-card shadow-sm border border-border rounded-none text-sm text-foreground placeholder-muted-foreground focus:outline-none focus:border-orange-500/50 transition-colors"
          />
        </div>
        <div className="flex gap-2">
          {allClasses.length > 0 && (
            <select value={classFilter} onChange={e => setClassFilter(e.target.value)}
              className="flex-1 sm:flex-none px-3 py-2.5 bg-card shadow-sm border border-border rounded-none text-sm text-foreground focus:outline-none focus:border-orange-500/50 transition-colors">
              <option value="">All classes</option>
              {allClasses.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          )}
          <button onClick={load} disabled={loading}
            className="flex items-center gap-1.5 px-3 sm:px-4 py-2.5 bg-card shadow-sm border border-border rounded-none text-sm text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">
            <ArrowPathIcon className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">Refresh</span>
          </button>
        </div>
      </div>

      {/* School filter chips */}
      {schools.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-4">
          <button onClick={() => setSchoolFilter('')}
            className={`px-3 py-1.5 rounded-none text-xs font-bold border transition-all ${!schoolFilter ? 'bg-orange-600 text-foreground border-orange-500' : 'bg-card shadow-sm text-muted-foreground border-border hover:text-foreground hover:bg-muted'}`}>
            All Schools
          </button>
          {schools.map(sc => {
            const count = students.filter(s => s.school_name === sc.name).length;
            const active = schoolFilter === sc.name;
            return (
              <button key={sc.id} onClick={() => setSchoolFilter(active ? '' : sc.name)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-none text-xs font-bold border transition-all ${active ? 'bg-blue-600 text-foreground border-blue-500' : 'bg-card shadow-sm text-muted-foreground border-border hover:text-foreground hover:bg-muted'}`}>
                <BuildingOfficeIcon className="w-3 h-3 flex-shrink-0" />
                {sc.name}
                <span className={`rounded-full px-1.5 py-0.5 text-[10px] ${active ? 'bg-muted' : 'bg-muted'}`}>{count}</span>
              </button>
            );
          })}
        </div>
      )}

      {/* Selection action bar */}
      {selected.size > 0 && (
        <div className="flex items-center justify-between px-4 py-3 mb-4 bg-orange-500/10 border border-orange-500/30 rounded-none gap-3 flex-wrap">
          <div className="flex items-center gap-2 text-sm">
            <UserGroupIcon className="w-4 h-4 text-orange-400" />
            <span className="text-orange-500 font-bold">{selected.size} selected</span>
            <button onClick={() => setSelected(new Set())} className="text-muted-foreground hover:text-foreground text-xs underline">Clear</button>
          </div>
          {classMode === 'pick' && !classId ? (
            <div className="flex items-center gap-2 text-amber-400 text-xs font-bold">
              <ExclamationTriangleIcon className="w-4 h-4" />
              <span>Select a class above first</span>
            </div>
          ) : classMode === 'create' && (!newClass.grade_level && !newClass.name.trim()) ? (
            <div className="flex items-center gap-2 text-amber-400 text-xs font-bold">
              <ExclamationTriangleIcon className="w-4 h-4" />
              <span>Set class name above first</span>
            </div>
          ) : classMode === 'create' && !programId ? (
            <div className="flex items-center gap-2 text-amber-400 text-xs font-bold">
              <ExclamationTriangleIcon className="w-4 h-4" />
              <span>Select a programme above first</span>
            </div>
          ) : (
            <button
              onClick={handleEnroll}
              disabled={enrolling || creatingClass}
              className="flex items-center gap-2 px-4 py-2 bg-orange-600 hover:bg-orange-500 disabled:opacity-50 text-foreground font-bold rounded-none text-sm transition-colors"
            >
              <AcademicCapIcon className="w-4 h-4" />
              <span>
                {(enrolling || creatingClass)
                  ? classMode === 'create' ? 'Creating & Enrolling…' : 'Enrolling…'
                  : classMode === 'create'
                    ? `Create Class & Enrol ${selected.size}`
                    : `Enrol ${selected.size} into ${selectedClass?.name ?? '…'}`}
              </span>
            </button>
          )}
        </div>
      )}

      {/* Student table */}
      <div className="bg-[#0d1526] border border-border rounded-none overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-8 h-8 border-4 border-orange-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
            <UserGroupIcon className="w-10 h-10 mb-3" />
            <p className="font-bold">No students found</p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
              <table className="w-full text-xs min-w-[300px]">
                <thead className="sticky top-0 bg-[#0b1020] z-10">
                  <tr className="border-b border-border text-muted-foreground uppercase tracking-wider text-[10px]">
                    <th className="px-3 sm:px-4 py-3 w-10">
                      <input type="checkbox" checked={allFilteredSelected} onChange={toggleAll}
                        className="w-3.5 h-3.5 rounded border-border accent-orange-500 cursor-pointer" />
                    </th>
                    <th className="text-left px-3 py-3">Name</th>
                    <th className="text-left px-3 py-3 hidden sm:table-cell">Email</th>
                    <th className="text-left px-3 py-3">Class</th>
                  </tr>
                </thead>
                <tbody>
                  {groupedBySchool.map(([schoolName, schoolStudents]) => {
                    const enrollable = schoolStudents.filter(s => !enrolledIds.has(s.id));
                    const allSchoolSelected = enrollable.length > 0 && enrollable.every(s => selected.has(s.id));
                    const someSchoolSelected = enrollable.some(s => selected.has(s.id));
                    return (
                      <React.Fragment key={schoolName}>
                        <tr className="bg-[#0b1020] border-b border-border">
                          <td className="px-3 sm:px-4 py-2 text-center">
                            <input type="checkbox" checked={allSchoolSelected}
                              ref={el => { if (el) el.indeterminate = someSchoolSelected && !allSchoolSelected; }}
                              onChange={() => {
                                const next = new Set(selected);
                                if (allSchoolSelected) enrollable.forEach(s => next.delete(s.id));
                                else enrollable.forEach(s => next.add(s.id));
                                setSelected(next);
                              }}
                              className="w-3.5 h-3.5 rounded border-border accent-orange-500 cursor-pointer" />
                          </td>
                          <td colSpan={3} className="px-3 py-2">
                            <span className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                              <BuildingOfficeIcon className="w-3 h-3 flex-shrink-0" />
                              {schoolName}
                              <span className="text-muted-foreground font-normal normal-case tracking-normal">
                                {schoolStudents.length} student{schoolStudents.length !== 1 ? 's' : ''}
                              </span>
                            </span>
                          </td>
                        </tr>
                        {schoolStudents.map(s => {
                          const isSel = selected.has(s.id);
                          const isEnrolled = enrolledIds.has(s.id);
                          return (
                            <tr key={s.id}
                              onClick={() => !isEnrolled && toggleOne(s.id)}
                              className={`border-b border-border transition-colors ${isEnrolled ? 'opacity-60' : isSel ? 'bg-orange-500/10 hover:bg-orange-500/15 cursor-pointer' : 'hover:bg-white/[0.02] cursor-pointer'}`}>
                              <td className="px-3 sm:px-4 py-2.5 text-center" onClick={e => e.stopPropagation()}>
                                {isEnrolled
                                  ? <CheckCircleIcon className="w-4 h-4 text-emerald-400 mx-auto" />
                                  : <input type="checkbox" checked={isSel} onChange={() => toggleOne(s.id)}
                                      className="w-3.5 h-3.5 rounded border-border accent-orange-500 cursor-pointer" />}
                              </td>
                              <td className="px-3 py-2.5">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className={`font-medium ${isEnrolled ? 'text-muted-foreground' : isSel ? 'text-orange-500' : 'text-foreground'}`}>{s.full_name}</span>
                                  {isEnrolled && (
                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-emerald-500/15 text-emerald-400 text-[9px] font-black uppercase tracking-widest rounded-full border border-emerald-500/20">
                                      <CheckCircleIcon className="w-2.5 h-2.5" /> Enrolled
                                    </span>
                                  )}
                                </div>
                                <span className="block sm:hidden text-muted-foreground font-mono text-[10px] mt-0.5 truncate max-w-[160px]">{s.email}</span>
                              </td>
                              <td className="px-3 py-2.5 text-muted-foreground font-mono hidden sm:table-cell">{s.email}</td>
                              <td className="px-3 py-2.5">
                                {s.section_class
                                  ? <span className="inline-block px-2 py-0.5 bg-cyan-500/15 text-cyan-300 text-[10px] font-bold rounded-full border border-cyan-500/20">{s.section_class}</span>
                                  : <span className="text-muted-foreground">—</span>}
                              </td>
                            </tr>
                          );
                        })}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="px-4 py-3 border-t border-border flex items-center justify-between text-xs text-muted-foreground">
              <span>{filtered.length} shown · {students.length} total</span>
              {selected.size > 0 && <span className="text-orange-400 font-bold">{selected.size} selected</span>}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
