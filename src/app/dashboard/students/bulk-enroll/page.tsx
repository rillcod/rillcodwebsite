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
  const [result,      setResult]      = useState<{ enrolled: number; skipped: number; className: string; programName?: string } | null>(null);

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
    if (next.has(id)) next.delete(id); else next.add(id);
    setSelected(next);
  }

  // Scope classes to the selected school filter, selected students' schools, and programme filter
  const scopedClasses = useMemo(() => {
    if (classesList.length === 0) return [];
    const selectedStudentObjs = students.filter(s => selected.has(s.id));
    const relevantSchoolIds = new Set(selectedStudentObjs.map(s => s.school_id).filter(Boolean));
    const relevantSchoolNames = new Set(selectedStudentObjs.map(s => s.school_name).filter(Boolean));

    return classesList.filter((c: any) => {
      // School filter — if students selected, restrict to their schools; else show all
      const noSchoolScope = relevantSchoolIds.size === 0 && relevantSchoolNames.size === 0;
      const schoolMatch = noSchoolScope ||
        (c.school_id && relevantSchoolIds.has(c.school_id)) ||
        (c.schools?.name && relevantSchoolNames.has(c.schools.name));
      if (!schoolMatch) return false;

      // Programme filter — only when a programme is chosen
      if (programId && c.program_id !== programId) return false;

      return true;
    });
  }, [classesList, students, selected, programId]);

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
        const prog = cls?.programs?.name ?? programs.find((p: any) => p.id === cls?.program_id)?.name;
        setResult({ enrolled: data.enrolled ?? studentIds.length, skipped: data.skipped ?? 0, className: cls?.name ?? 'class', programName: prog || undefined });
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

        const progName = programs.find((p: any) => p.id === programId)?.name;
        setResult({ enrolled: enrJson.enrolled ?? studentIds.length, skipped: enrJson.skipped ?? 0, className, programName: progName || undefined });
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
      <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin" />
    </div>
  );
  if (!canAccess) return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <p className="text-muted-foreground">Access restricted to admins and teachers.</p>
    </div>
  );

  return (
    <div className="min-h-screen bg-background px-4 py-8 md:px-8 max-w-6xl mx-auto font-sans">

      {/* Header */}
      <div className="flex items-center justify-between mb-8 gap-4 pb-6 border-b border-white/5">
        <div>
          <h1 className="text-xl sm:text-3xl font-black text-foreground flex items-center gap-3 tracking-tight">
            <div className="w-10 h-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center">
              <AcademicCapIcon className="w-5 h-5 sm:w-6 sm:h-6 text-primary" />
            </div>
            Bulk Enrol Students
          </h1>
          <p className="text-muted-foreground text-xs sm:text-sm mt-1.5 font-medium">
            Select students → pick or create a class → enrol
          </p>
        </div>
        <Link 
          href="/dashboard/students" 
          className="px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/5 hover:border-white/10 rounded-xl text-xs font-black uppercase tracking-wider text-muted-foreground hover:text-foreground transition-all duration-200"
        >
          ← Back
        </Link>
      </div>

      {/* Result banner */}
      {result && (
        <div className="bg-emerald-500/[0.03] border border-emerald-500/20 rounded-2xl p-4 mb-6 flex items-start gap-3.5 shadow-xl shadow-emerald-500/[0.02] animate-in fade-in slide-in-from-top-2 duration-300">
          <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center shrink-0">
            <CheckCircleIcon className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-foreground font-bold text-sm">
              {result.enrolled} student{result.enrolled !== 1 ? 's' : ''} enrolled into{' '}
              <span className="text-primary font-black">{result.className}</span>
            </p>
            {result.programName && (
              <p className="text-emerald-600 dark:text-emerald-400 text-xs mt-1 flex items-center gap-1.5 font-medium">
                <CheckCircleIcon className="w-3.5 h-3.5 shrink-0" />
                Also enrolled in programme: <span className="font-extrabold">{result.programName}</span>
              </p>
            )}
            {result.skipped > 0 && (
              <p className="text-amber-600 dark:text-amber-400 text-xs mt-1.5 font-medium bg-amber-500/5 border border-amber-500/10 px-2 py-1 rounded inline-block">
                ⚠️ {result.skipped} skipped (outside school boundary).
              </p>
            )}
          </div>
          <button 
            onClick={() => setResult(null)} 
            className="text-muted-foreground hover:text-foreground shrink-0 w-8 h-8 rounded-lg hover:bg-white/5 flex items-center justify-center transition-colors"
          >
            <XMarkIcon className="w-5 h-5" />
          </button>
        </div>
      )}

      {/* Enrolment settings Accordion */}
      <div className="bg-[#080d19]/60 backdrop-blur-md border border-white/5 rounded-2xl mb-6 overflow-hidden shadow-xl">
        <button
          onClick={() => setShowSettings(v => !v)}
          className="w-full flex items-center justify-between px-5 sm:px-6 py-5 hover:bg-white/[0.02] transition-colors"
        >
          <div className="flex items-center gap-3 flex-wrap">
            <div className="w-8 h-8 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center">
              <BookOpenIcon className="w-4 h-4 text-primary" />
            </div>
            <span className="text-foreground font-bold text-sm uppercase tracking-wider">Enrolment Settings</span>
            {selectedClass && (
              <span className="text-primary text-[10px] bg-primary/10 px-2.5 py-0.5 rounded-full border border-primary/20 font-black uppercase tracking-wider">
                {selectedClass.name}
              </span>
            )}
            {classMode === 'create' && (newClass.grade_level || newClass.name) && (
              <span className="text-emerald-600 dark:text-emerald-400 text-[10px] bg-emerald-500/10 px-2.5 py-0.5 rounded-full border border-emerald-500/20 font-black uppercase tracking-wider">
                New: {newClass.grade_level || newClass.name}
              </span>
            )}
          </div>
          <ChevronDownIcon className={`w-4 h-4 text-muted-foreground transition-transform duration-300 ${showSettings ? 'rotate-180' : ''}`} />
        </button>

        {showSettings && (
          <div className="border-t border-white/5 bg-white/[0.01]">
            {/* Class mode tabs */}
            <div className="px-5 sm:px-6 pt-5 pb-3 flex gap-3">
              <button
                onClick={() => setClassMode('pick')}
                className={`flex-1 py-3 rounded-xl text-xs font-black uppercase tracking-widest transition-all duration-300 ${
                  classMode === 'pick' 
                    ? 'bg-primary text-primary-foreground shadow-lg shadow-primary/10' 
                    : 'bg-white/5 border border-white/5 text-muted-foreground hover:bg-white/10 hover:text-foreground'
                }`}
              >
                Pick Existing Class
              </button>
              <button
                onClick={() => setClassMode('create')}
                className={`flex-1 py-3 rounded-xl text-xs font-black uppercase tracking-widest transition-all duration-300 flex items-center justify-center gap-2 ${
                  classMode === 'create' 
                    ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/10' 
                    : 'bg-white/5 border border-white/5 text-muted-foreground hover:bg-white/10 hover:text-foreground'
                }`}
              >
                <PlusIcon className="w-3.5 h-3.5 stroke-2" /> Create New Class
              </button>
            </div>

            <div className="px-5 sm:px-6 pb-6 space-y-5">
              {classMode === 'pick' ? (
                <>
                  {/* Programme filter */}
                  <div>
                    <label className="block text-muted-foreground text-[10px] font-black uppercase tracking-widest mb-2 flex items-center gap-1.5">
                      <BookOpenIcon className="w-3.5 h-3.5 text-primary" />
                      Filter by Programme
                      {programId && (
                        <button 
                          onClick={() => { setProgramId(''); setClassId(''); }} 
                          className="ml-auto text-[9px] text-primary hover:underline font-black uppercase tracking-widest flex items-center gap-0.5"
                        >
                          <XMarkIcon className="w-3 h-3" /> Clear
                        </button>
                      )}
                    </label>
                    <select
                      value={programId}
                      onChange={e => { setProgramId(e.target.value); setClassId(''); }}
                      className="w-full px-4 py-3 bg-[#080d19] border border-white/5 rounded-xl text-sm text-foreground focus:outline-none focus:border-primary/50 transition-colors font-medium appearance-none cursor-pointer"
                    >
                      <option value="">— All programmes (show all classes) —</option>
                      {programs.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                    {programId && (
                      <p className="text-[10px] text-emerald-600 dark:text-emerald-400 mt-2 flex items-center gap-1.5 font-semibold bg-emerald-500/5 border border-emerald-500/10 px-2 py-1 rounded inline-block">
                        <CheckCircleIcon className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                        Showing only classes in this programme. Students will also be enrolled in it.
                      </p>
                    )}
                  </div>

                  {/* Class picker — grouped by school */}
                  <div>
                    <label className="block text-muted-foreground text-[10px] font-black uppercase tracking-widest mb-2 flex items-center gap-1.5">
                      <AcademicCapIcon className="w-3.5 h-3.5 text-primary" />
                      Select Class <span className="text-rose-600 dark:text-rose-400">*</span>
                      <span className="ml-auto text-[9px] font-black uppercase tracking-widest text-muted-foreground/60">
                        {scopedClasses.length} available
                      </span>
                    </label>
                    {scopedClasses.length === 0 ? (
                      <div className="py-8 text-center bg-[#080d19] border border-dashed border-white/5 rounded-2xl space-y-3">
                        <AcademicCapIcon className="w-8 h-8 text-muted-foreground/40 mx-auto" />
                        <p className="text-sm text-muted-foreground font-medium">
                          {programId ? 'No classes found for this programme.' : 'No classes found for the selected students\' school.'}
                        </p>
                        <div className="flex items-center justify-center gap-4">
                          {programId && (
                            <button onClick={() => { setProgramId(''); setClassId(''); }} className="text-xs font-black uppercase tracking-widest text-primary hover:text-primary/80 transition-colors">
                              Show all classes
                            </button>
                          )}
                          <button onClick={() => setClassMode('create')} className="text-xs font-black uppercase tracking-widest text-emerald-600 dark:text-emerald-400 hover:text-emerald-700 dark:hover:text-emerald-300 transition-colors">
                            Create a new class
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-4 max-h-72 overflow-y-auto pr-1">
                        {classGroups.map(([schoolName, classes]) => (
                          <div key={schoolName} className="space-y-2">
                            <p className="text-[9px] font-black text-primary/60 uppercase tracking-widest px-1.5 flex items-center gap-1.5">
                              <BuildingOfficeIcon className="w-3 h-3" /> {schoolName}
                            </p>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                              {classes.map((c: any) => {
                                const enrolledCount = c.current_students ?? 0;
                                const maxStudents = c.max_students ?? 0;
                                const isFull = maxStudents > 0 && enrolledCount >= maxStudents;
                                const isSelected = classId === c.id;

                                return (
                                  <div
                                    key={c.id}
                                    onClick={() => {
                                      if (!isFull) {
                                        setClassId(c.id);
                                      }
                                    }}
                                    className={`flex items-center gap-3 p-3.5 border rounded-2xl transition-all duration-200 ${
                                      isFull 
                                        ? 'bg-rose-950/[0.02] border-rose-500/10 opacity-60 cursor-not-allowed' 
                                        : isSelected 
                                        ? 'bg-primary/10 border-primary/30 shadow-lg shadow-primary/5' 
                                        : 'bg-[#080d19] border-white/5 hover:border-primary/20 hover:bg-white/[0.03] cursor-pointer'
                                    }`}
                                  >
                                    {/* Selection dot */}
                                    <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 transition-all ${
                                      isFull 
                                        ? 'border-rose-500/20 bg-rose-500/5' 
                                        : isSelected 
                                        ? 'border-primary bg-primary' 
                                        : 'border-white/10'
                                    }`}>
                                      {isSelected && !isFull && <div className="w-1.5 h-1.5 rounded-full bg-black" />}
                                      {isFull && <div className="w-1.5 h-1.5 rounded-full bg-rose-500" />}
                                    </div>

                                    {/* Name and program info */}
                                    <div className="min-w-0 flex-1">
                                      <div className="flex items-center gap-1.5 flex-wrap">
                                        <p className={`text-sm font-bold truncate ${isFull ? 'text-rose-600 dark:text-rose-400 line-through decoration-rose-500/30' : isSelected ? 'text-primary font-black' : 'text-foreground'}`}>
                                          {c.name}
                                        </p>
                                        {isFull && (
                                          <span className="text-[8px] font-black uppercase tracking-wider bg-rose-500/10 border border-rose-500/20 px-1.5 py-0.5 rounded text-rose-600 dark:text-rose-400 shrink-0">
                                            FULL
                                          </span>
                                        )}
                                      </div>
                                      {c.programs?.name ? (
                                        <p className="text-[10px] text-muted-foreground/60 mt-0.5 flex items-center gap-1">
                                          <BookOpenIcon className="w-3 h-3 text-primary/40 shrink-0" />
                                          <span className="truncate">{c.programs.name}</span>
                                        </p>
                                      ) : (
                                        <p className="text-[10px] text-muted-foreground/30 mt-0.5">No programme linked</p>
                                      )}

                                      {/* Capacity Bar helper */}
                                      {maxStudents > 0 && (
                                        <div className="w-full bg-white/5 h-1 rounded-full overflow-hidden mt-2 border border-white/[0.02]">
                                          <div 
                                            className={`h-full rounded-full transition-all duration-300 ${
                                              isFull 
                                                ? 'bg-rose-500' 
                                                : enrolledCount >= maxStudents * 0.8 
                                                ? 'bg-amber-500' 
                                                : 'bg-primary'
                                            }`} 
                                            style={{ width: `${Math.min(100, (enrolledCount / maxStudents) * 100)}%` }}
                                          />
                                        </div>
                                      )}
                                    </div>

                                    {/* Capacity Numbers */}
                                    <div className="flex flex-col items-end gap-1 shrink-0 text-right">
                                      <span className={`text-xs font-bold tabular-nums ${isFull ? 'text-rose-600 dark:text-rose-400' : 'text-muted-foreground'}`}>
                                        {enrolledCount}
                                        <span className="text-muted-foreground/30 font-normal">/</span>
                                        {maxStudents || '∞'}
                                      </span>
                                      {c.program_id && !isFull && (
                                        <span className="text-[8px] font-black text-emerald-600/60 dark:text-emerald-400/60 uppercase tracking-widest bg-emerald-500/10 px-1 py-0.5 rounded border border-emerald-500/20">
                                          Active
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Selected class program indicator */}
                    {classId && (() => {
                      const cls = classesList.find((c: any) => c.id === classId);
                      if (!cls?.program_id) return null;
                      const progName = cls.programs?.name ?? programs.find((p: any) => p.id === cls.program_id)?.name;
                      return progName ? (
                        <div className="mt-3 flex items-center gap-2 px-3 py-2.5 bg-emerald-500/5 border border-emerald-500/20 rounded-xl text-xs text-emerald-700 dark:text-emerald-300 font-medium">
                          <CheckCircleIcon className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                          Students will be auto-enrolled in: <span className="font-extrabold text-foreground">{progName}</span>
                        </div>
                      ) : null;
                    })()}
                  </div>

                  {/* School override */}
                  <div>
                    <label className="block text-muted-foreground text-[10px] font-black uppercase tracking-widest mb-2">
                      Assign School <span className="text-muted-foreground/60 normal-case font-normal text-[10px]">(optional)</span>
                    </label>
                    <div className="relative">
                      <select 
                        value={schoolId} 
                        onChange={e => setSchoolId(e.target.value)}
                        className="w-full px-4 py-3 bg-[#080d19] border border-white/5 rounded-xl text-sm text-foreground focus:outline-none focus:border-primary/50 transition-colors font-medium appearance-none cursor-pointer"
                      >
                        <option value="">— Keep current school —</option>
                        {schools.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                      </select>
                      <div className="absolute inset-y-0 right-3 flex items-center pointer-events-none text-muted-foreground/60">
                        <ChevronDownIcon className="w-4 h-4" />
                      </div>
                    </div>
                  </div>
                </>
              ) : (
                /* Create new class form */
                <div className="space-y-4">
                  <p className="text-xs text-muted-foreground bg-white/5 border border-white/5 px-3 py-2 rounded-xl inline-block font-medium">
                    💡 Create a new class and immediately enrol {selected.size > 0 ? `${selected.size} selected` : 'selected'} students into it.
                  </p>

                  {/* Grade preset */}
                  <div>
                    <label className="block text-muted-foreground text-[10px] font-black uppercase tracking-widest mb-2">Grade / Section</label>
                    <div className="relative">
                      <select
                        value={newClass.grade_level}
                        onChange={e => setNewClass(q => ({ ...q, grade_level: e.target.value, name: e.target.value ? '' : q.name }))}
                        className="w-full px-4 py-3 bg-[#080d19] border border-white/5 rounded-xl text-sm text-foreground focus:outline-none focus:border-emerald-500/50 cursor-pointer transition-colors font-medium appearance-none"
                      >
                        <option value="">— Pick grade level —</option>
                        {GRADE_PRESETS.map(g => <option key={g} value={g}>{g}</option>)}
                      </select>
                      <div className="absolute inset-y-0 right-3 flex items-center pointer-events-none text-muted-foreground/60">
                        <ChevronDownIcon className="w-4 h-4" />
                      </div>
                    </div>
                  </div>

                  <div>
                    <label className="block text-muted-foreground text-[10px] font-black uppercase tracking-widest mb-2">
                      Custom Name {!newClass.grade_level && <span className="text-rose-600 dark:text-rose-400">*</span>}
                    </label>
                    <input
                      value={newClass.name}
                      onChange={e => setNewClass(q => ({ ...q, name: e.target.value, grade_level: e.target.value ? '' : q.grade_level }))}
                      placeholder={newClass.grade_level ? `Leave blank to use "${newClass.grade_level}"` : 'e.g. JSS1A, Coding Club…'}
                      className="w-full px-4 py-3 bg-[#080d19] border border-white/5 rounded-xl text-sm text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:border-emerald-500/50 transition-colors font-medium"
                    />
                  </div>

                  <div>
                    <label className="block text-muted-foreground text-[10px] font-black uppercase tracking-widest mb-2">
                      Programme <span className="text-rose-600 dark:text-rose-400">*</span>
                    </label>
                    <div className="relative">
                      <select 
                        value={programId} 
                        onChange={e => setProgramId(e.target.value)}
                        className="w-full px-4 py-3 bg-[#080d19] border border-white/5 rounded-xl text-sm text-foreground focus:outline-none focus:border-emerald-500/50 cursor-pointer transition-colors font-medium appearance-none"
                      >
                        <option value="">— Select a programme —</option>
                        {programs.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                      </select>
                      <div className="absolute inset-y-0 right-3 flex items-center pointer-events-none text-muted-foreground/60">
                        <ChevronDownIcon className="w-4 h-4" />
                      </div>
                    </div>
                  </div>

                  <div>
                    <label className="block text-muted-foreground text-[10px] font-black uppercase tracking-widest mb-2">
                      School <span className="text-muted-foreground/60 normal-case font-normal text-[10px]">(optional)</span>
                    </label>
                    <div className="relative">
                      <select
                        value={newClass.school_id || schoolId}
                        onChange={e => { setNewClass(q => ({ ...q, school_id: e.target.value })); setSchoolId(e.target.value); }}
                        className="w-full px-4 py-3 bg-[#080d19] border border-white/5 rounded-xl text-sm text-foreground focus:outline-none focus:border-emerald-500/50 cursor-pointer transition-colors font-medium appearance-none"
                      >
                        <option value="">— Select school —</option>
                        {schools.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                      </select>
                      <div className="absolute inset-y-0 right-3 flex items-center pointer-events-none text-muted-foreground/60">
                        <ChevronDownIcon className="w-4 h-4" />
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Search & Filters */}
      <div className="flex flex-col sm:flex-row gap-3 mb-5">
        <div className="relative flex-1">
          <MagnifyingGlassIcon className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/60" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search by name, email or school…"
            className="w-full pl-10 pr-4 py-3 bg-[#080d19] border border-white/5 rounded-xl text-sm text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:border-primary/50 transition-colors font-medium"
          />
        </div>
        <div className="flex gap-3">
          {allClasses.length > 0 && (
            <div className="relative flex-1 sm:flex-none">
              <select 
                value={classFilter} 
                onChange={e => setClassFilter(e.target.value)}
                className="w-full sm:w-auto px-4 py-3 bg-[#080d19] border border-white/5 rounded-xl text-sm text-foreground focus:outline-none focus:border-primary/50 transition-colors font-medium appearance-none cursor-pointer pr-10"
              >
                <option value="">All classes</option>
                {allClasses.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
              <div className="absolute inset-y-0 right-3 flex items-center pointer-events-none text-muted-foreground/60">
                <ChevronDownIcon className="w-4 h-4" />
              </div>
            </div>
          )}
          <button 
            onClick={load} 
            disabled={loading}
            className="flex items-center gap-2 px-5 py-3 bg-white/5 hover:bg-white/10 border border-white/5 rounded-xl text-xs font-black uppercase tracking-wider text-muted-foreground hover:text-foreground transition-all duration-200"
          >
            <ArrowPathIcon className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* School filter chips */}
      {schools.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-6">
          <button 
            onClick={() => setSchoolFilter('')}
            className={`px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider border transition-all duration-200 ${
              !schoolFilter 
                ? 'bg-primary text-primary-foreground border-primary shadow-lg shadow-primary/10' 
                : 'bg-white/5 text-muted-foreground border-white/5 hover:text-foreground hover:bg-white/10'
            }`}
          >
            All Schools
          </button>
          {schools.map(sc => {
            const count = students.filter(s => s.school_name === sc.name).length;
            const active = schoolFilter === sc.name;
            return (
              <button 
                key={sc.id} 
                onClick={() => setSchoolFilter(active ? '' : sc.name)}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider border transition-all duration-200 ${
                  active 
                    ? 'bg-primary text-primary-foreground border-primary shadow-lg shadow-primary/10' 
                    : 'bg-white/5 text-muted-foreground border-white/5 hover:text-foreground hover:bg-white/10'
                }`}
              >
                <BuildingOfficeIcon className="w-3.5 h-3.5 shrink-0" />
                <span>{sc.name}</span>
                <span className={`rounded-full px-2 py-0.5 text-[9px] font-black font-mono tracking-normal leading-none ${
                  active ? 'bg-primary-foreground/20 text-primary-foreground' : 'bg-white/5 text-muted-foreground'
                }`}>
                  {count}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {/* Selection action bar */}
      {selected.size > 0 && (
        <div className="flex items-center justify-between p-4 mb-6 bg-primary/5 border border-primary/20 rounded-2xl gap-4 flex-wrap shadow-lg shadow-primary/[0.01] animate-in fade-in zoom-in-95 duration-200">
          <div className="flex items-center gap-3 text-sm">
            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
              <UserGroupIcon className="w-4 h-4 text-primary" />
            </div>
            <div className="flex flex-col sm:flex-row sm:items-center sm:gap-2">
              <span className="text-primary font-black uppercase tracking-wider text-xs">
                {selected.size} Student{selected.size !== 1 ? 's' : ''} Selected
              </span>
              <button 
                onClick={() => setSelected(new Set())} 
                className="text-muted-foreground/60 hover:text-foreground text-xs underline font-semibold text-left"
              >
                Clear Selection
              </button>
            </div>
          </div>
          
          {/* Action validation warnings */}
          {classMode === 'pick' && !classId ? (
            <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400 text-xs font-black uppercase tracking-wider bg-amber-500/10 border border-amber-500/20 px-3 py-2 rounded-xl">
              <ExclamationTriangleIcon className="w-4 h-4 shrink-0" />
              <span>Select a class above first</span>
            </div>
          ) : classMode === 'create' && (!newClass.grade_level && !newClass.name.trim()) ? (
            <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400 text-xs font-black uppercase tracking-wider bg-amber-500/10 border border-amber-500/20 px-3 py-2 rounded-xl">
              <ExclamationTriangleIcon className="w-4 h-4 shrink-0" />
              <span>Set class name above first</span>
            </div>
          ) : classMode === 'create' && !programId ? (
            <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400 text-xs font-black uppercase tracking-wider bg-amber-500/10 border border-amber-500/20 px-3 py-2 rounded-xl">
              <ExclamationTriangleIcon className="w-4 h-4 shrink-0" />
              <span>Select a programme above first</span>
            </div>
          ) : (
            <button
              onClick={handleEnroll}
              disabled={enrolling || creatingClass}
              className="flex items-center gap-2 px-5 py-3 bg-primary hover:bg-primary/95 disabled:opacity-40 text-primary-foreground font-black uppercase tracking-wider text-xs rounded-xl shadow-xl shadow-primary/10 transition-all hover:scale-[1.01] active:scale-[0.99] cursor-pointer"
            >
              <AcademicCapIcon className="w-4 h-4 stroke-2" />
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
      <div className="bg-[#080d19]/40 border border-white/5 rounded-2xl overflow-hidden shadow-2xl backdrop-blur-md">
        {loading ? (
          <div className="flex items-center justify-center py-24">
            <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
            <UserGroupIcon className="w-12 h-12 mb-4 text-muted-foreground/30" />
            <p className="font-extrabold text-sm uppercase tracking-widest text-muted-foreground/60">No students found</p>
            <p className="text-xs text-muted-foreground/40 mt-1 font-medium">Try matching search terms or refreshing.</p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto max-h-[600px] overflow-y-auto pr-1">
              <table className="w-full text-xs min-w-[300px]">
                <thead className="sticky top-0 bg-[#080d19] z-10 border-b border-white/5">
                  <tr className="border-b border-white/5 text-muted-foreground uppercase tracking-widest text-[9px] font-black">
                    <th className="px-3 py-4 w-12 text-center">
                      <label className="flex items-center justify-center w-8 h-8 cursor-pointer mx-auto rounded-lg hover:bg-white/5 transition-colors">
                        <input 
                          type="checkbox" 
                          checked={allFilteredSelected} 
                          onChange={toggleAll}
                          className="w-4 h-4 rounded border-white/10 accent-primary cursor-pointer bg-black/40" 
                        />
                      </label>
                    </th>
                    <th className="text-left px-4 py-4">Name</th>
                    <th className="text-left px-4 py-4 hidden sm:table-cell">Email</th>
                    <th className="text-left px-4 py-4">Class</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.02]">
                  {groupedBySchool.map(([schoolName, schoolStudents]) => {
                    const enrollable = schoolStudents.filter(s => !enrolledIds.has(s.id));
                    const allSchoolSelected = enrollable.length > 0 && enrollable.every(s => selected.has(s.id));
                    const someSchoolSelected = enrollable.some(s => selected.has(s.id));
                    return (
                      <React.Fragment key={schoolName}>
                        {/* School Group Header Row */}
                        <tr className="bg-white/[0.01] sticky top-12 z-[5] backdrop-blur-sm border-y border-white/5">
                          <td className="px-3 py-2 text-center">
                            <label className="flex items-center justify-center w-8 h-8 cursor-pointer mx-auto rounded-lg hover:bg-white/5 transition-colors">
                              <input 
                                type="checkbox" 
                                checked={allSchoolSelected}
                                ref={el => { if (el) el.indeterminate = someSchoolSelected && !allSchoolSelected; }}
                                onChange={() => {
                                  const next = new Set(selected);
                                  if (allSchoolSelected) enrollable.forEach(s => next.delete(s.id));
                                  else enrollable.forEach(s => next.add(s.id));
                                  setSelected(next);
                                }}
                                className="w-4 h-4 rounded border-white/10 accent-primary cursor-pointer bg-black/40" 
                              />
                            </label>
                          </td>
                          <td colSpan={3} className="px-4 py-3">
                            <span className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-primary/70">
                              <BuildingOfficeIcon className="w-3.5 h-3.5 shrink-0" />
                              {schoolName}
                              <span className="text-muted-foreground/50 font-bold normal-case tracking-normal text-[9px] bg-white/5 px-2 py-0.5 rounded-full border border-white/5">
                                {schoolStudents.length} student{schoolStudents.length !== 1 ? 's' : ''}
                              </span>
                            </span>
                          </td>
                        </tr>
                        
                        {/* Student Rows */}
                        {schoolStudents.map(s => {
                          const isSel = selected.has(s.id);
                          const isEnrolled = enrolledIds.has(s.id);
                          return (
                            <tr 
                              key={s.id}
                              onClick={() => !isEnrolled && toggleOne(s.id)}
                              className={`transition-all duration-150 ${
                                isEnrolled 
                                  ? 'opacity-40 cursor-not-allowed bg-black/10' 
                                  : isSel 
                                  ? 'bg-primary/[0.04] border-l-2 border-l-primary hover:bg-primary/[0.08] cursor-pointer' 
                                  : 'hover:bg-white/[0.02] cursor-pointer'
                              }`}
                            >
                              <td className="px-3 py-3 text-center" onClick={e => e.stopPropagation()}>
                                {isEnrolled ? (
                                  <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center mx-auto">
                                    <CheckCircleIcon className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                                  </div>
                                ) : (
                                  <label className="flex items-center justify-center w-8 h-8 cursor-pointer mx-auto rounded-lg hover:bg-white/5 transition-colors">
                                    <input 
                                      type="checkbox" 
                                      checked={isSel} 
                                      onChange={() => toggleOne(s.id)}
                                      className="w-4 h-4 rounded border-white/10 accent-primary cursor-pointer bg-black/40" 
                                    />
                                  </label>
                                )}
                              </td>
                              
                              <td className="px-4 py-3.5">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className={`font-semibold text-sm ${
                                    isEnrolled ? 'text-muted-foreground/60 line-through' : isSel ? 'text-primary font-black' : 'text-foreground'
                                  }`}>
                                    {s.full_name}
                                  </span>
                                  {isEnrolled && (
                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-[8px] font-black uppercase tracking-widest rounded-full border border-emerald-500/20 shadow-lg shadow-emerald-500/[0.02]">
                                      <CheckCircleIcon className="w-2.5 h-2.5" /> Enrolled
                                    </span>
                                  )}
                                </div>
                                <span className="block sm:hidden text-muted-foreground/50 font-mono text-[10px] mt-0.5 truncate max-w-[160px]">{s.email}</span>
                              </td>
                              
                              <td className="px-4 py-3.5 text-muted-foreground font-mono hidden sm:table-cell text-xs">{s.email}</td>
                              
                              <td className="px-4 py-3.5">
                                {s.section_class ? (
                                  <span className="inline-block px-2.5 py-0.5 bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 text-[9px] font-black uppercase tracking-wider rounded-full border border-cyan-500/20">
                                    {s.section_class}
                                  </span>
                                ) : (
                                  <span className="text-muted-foreground/30">—</span>
                                )}
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
            
            {/* Table Footer Stats */}
            <div className="px-5 py-4 border-t border-white/5 bg-white/[0.01] flex items-center justify-between text-xs text-muted-foreground font-medium">
              <span>{filtered.length} shown · {students.length} total</span>
              {selected.size > 0 && (
                <span className="text-primary font-black uppercase tracking-widest text-[10px]">
                  {selected.size} selected
                </span>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

