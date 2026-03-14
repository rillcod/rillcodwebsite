// @refresh reset
'use client';

import { useState, useEffect, useMemo } from 'react';
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
} from '@/lib/icons';

interface StudentRow {
  id: string;
  full_name: string;
  email: string;
  section_class: string;
  school_name: string;
  school_id: string;
}

interface EnrollResult {
  enrolled: number;
  skipped: number;
  program_id: string;
  section_class: string | null;
  school_id: string | null;
}

export default function BulkEnrollPage() {
  const { profile, loading: authLoading } = useAuth();

  const [students,    setStudents]    = useState<StudentRow[]>([]);
  const [programs,    setPrograms]    = useState<any[]>([]);
  const [schools,     setSchools]     = useState<any[]>([]);
  const [loading,     setLoading]     = useState(false);
  const [selected,    setSelected]    = useState<Set<string>>(new Set());
  const [search,      setSearch]      = useState('');
  const [classFilter, setClassFilter] = useState('');
  const [enrolling,   setEnrolling]   = useState(false);
  const [result,      setResult]      = useState<EnrollResult | null>(null);

  const [programId,    setProgramId]    = useState('');
  const [schoolId,     setSchoolId]     = useState('');
  const [sectionClass, setSectionClass] = useState('');
  const [showSettings, setShowSettings] = useState(true);

  const canAccess = profile?.role === 'admin' || profile?.role === 'teacher';

  async function load() {
    setLoading(true);
    const db = createClient();
    const [studRes, progRes, schoolRes] = await Promise.all([
      db.from('portal_users')
        .select('id, full_name, email, section_class, school_name, school_id')
        .eq('role', 'student')
        .order('full_name'),
      db.from('programs').select('id, name').order('name'),
      db.from('schools').select('id, name').eq('status', 'approved').order('name'),
    ]);
    
    const mappedStudents = (studRes.data ?? []).map(s => ({
      ...s,
      section_class: s.section_class ?? '',
      school_name: s.school_name ?? '',
      school_id: s.school_id ?? ''
    }));

    setStudents(mappedStudents);
    setPrograms(progRes.data ?? []);
    setSchools(schoolRes.data ?? []);
    setLoading(false);
  }

  useEffect(() => {
    if (profile && canAccess) load();
  }, [profile?.id]); // eslint-disable-line

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return students.filter((s) => {
      const matchSearch =
        !q ||
        s.full_name.toLowerCase().includes(q) ||
        s.email.toLowerCase().includes(q) ||
        (s.school_name ?? '').toLowerCase().includes(q);
      const matchClass =
        !classFilter || (s.section_class ?? '').toLowerCase() === classFilter.toLowerCase();
      return matchSearch && matchClass;
    });
  }, [students, search, classFilter]);

  const allClasses = useMemo(
    () => [...new Set(students.map((s) => s.section_class).filter(Boolean) as string[])].sort(),
    [students],
  );

  const allFilteredSelected = filtered.length > 0 && filtered.every((s) => selected.has(s.id));

  function toggleAll() {
    if (allFilteredSelected) {
      const next = new Set(selected);
      filtered.forEach((s) => next.delete(s.id));
      setSelected(next);
    } else {
      const next = new Set(selected);
      filtered.forEach((s) => next.add(s.id));
      setSelected(next);
    }
  }

  function toggleOne(id: string) {
    const next = new Set(selected);
    next.has(id) ? next.delete(id) : next.add(id);
    setSelected(next);
  }

  async function handleEnroll() {
    if (!programId || selected.size === 0) return;
    setEnrolling(true);
    try {
      const res = await fetch('/api/students/bulk-enroll', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userIds:       [...selected],
          program_id:    programId,
          school_id:     schoolId     || undefined,
          section_class: sectionClass || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Enrollment failed');
      setResult(data);
      if (schoolId || sectionClass) {
        setStudents((prev) =>
          prev.map((s) =>
            selected.has(s.id)
              ? {
                  ...s,
                  school_id:     schoolId     || s.school_id,
                  school_name:   schools.find((sc) => sc.id === schoolId)?.name ?? s.school_name,
                  section_class: sectionClass || s.section_class,
                }
              : s,
          ),
        );
      }
      setSelected(new Set());
    } catch (err: any) {
      alert(err.message);
    } finally {
      setEnrolling(false);
    }
  }

  const selectedProgram = programs.find((p) => p.id === programId);

  if (authLoading || !profile) return (
    <div className="min-h-screen bg-[#0f0f1a] flex items-center justify-center">
      <div className="w-10 h-10 border-4 border-violet-500 border-t-transparent rounded-full animate-spin" />
    </div>
  );
  if (!canAccess) return (
    <div className="min-h-screen bg-[#0f0f1a] flex items-center justify-center">
      <p className="text-white/40">Access restricted to admins and teachers.</p>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#0f0f1a] px-4 py-6 md:px-8 max-w-6xl mx-auto">

      {/* Header */}
      <div className="flex items-start justify-between mb-6 gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-black text-white flex items-center gap-2">
            <AcademicCapIcon className="w-5 h-5 sm:w-6 sm:h-6 text-violet-400 flex-shrink-0" />
            Bulk Enrol Students
          </h1>
          <p className="text-white/40 text-xs sm:text-sm mt-1">
            Select students → assign programme &amp; class → enrol
          </p>
        </div>
        <Link href="/dashboard/students" className="text-white/40 hover:text-white text-xs sm:text-sm transition-colors flex-shrink-0">
          ← Back
        </Link>
      </div>

      {/* Result banner */}
      {result && (
        <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-2xl p-4 mb-5 flex items-start gap-3">
          <CheckCircleIcon className="w-5 h-5 text-emerald-400 flex-shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="text-white font-bold text-sm">
              {result.enrolled} student{result.enrolled !== 1 ? 's' : ''} enrolled into{' '}
              <span className="text-violet-300">{selectedProgram?.name ?? result.program_id}</span>
              {result.section_class && <> · <span className="text-cyan-300">{result.section_class}</span></>}
            </p>
            {result.skipped > 0 && (
              <p className="text-amber-400 text-xs mt-1">{result.skipped} skipped (not student accounts).</p>
            )}
          </div>
          <button onClick={() => setResult(null)} className="text-white/30 hover:text-white flex-shrink-0">
            <XMarkIcon className="w-5 h-5" />
          </button>
        </div>
      )}

      {/* Enrolment settings card */}
      <div className="bg-[#0d1526] border border-white/10 rounded-2xl mb-5 overflow-hidden">
        <button
          onClick={() => setShowSettings((v) => !v)}
          className="w-full flex items-center justify-between px-4 sm:px-5 py-4 hover:bg-white/[0.02] transition-colors"
        >
          <div className="flex items-center gap-2 flex-wrap">
            <BookOpenIcon className="w-4 h-4 text-violet-400 flex-shrink-0" />
            <span className="text-white font-bold text-sm">Enrolment Settings</span>
            {programId && (
              <span className="text-violet-300 text-xs bg-violet-500/15 px-2 py-0.5 rounded-full border border-violet-500/20 font-bold truncate max-w-[120px] sm:max-w-none">
                {selectedProgram?.name}
              </span>
            )}
            {sectionClass && (
              <span className="text-cyan-300 text-xs bg-cyan-500/15 px-2 py-0.5 rounded-full border border-cyan-500/20 font-bold font-mono">
                {sectionClass}
              </span>
            )}
          </div>
          <ChevronDownIcon className={`w-4 h-4 text-white/40 transition-transform flex-shrink-0 ${showSettings ? 'rotate-180' : ''}`} />
        </button>

        {showSettings && (
          <div className="px-4 sm:px-5 pb-5 border-t border-white/10 pt-4 grid sm:grid-cols-2 md:grid-cols-3 gap-4">

            {/* Programme — required */}
            <div className="sm:col-span-2 md:col-span-1">
              <label className="block text-white/60 text-xs font-bold uppercase tracking-widest mb-2">
                Programme <span className="text-rose-400">*</span>
              </label>
              <select
                value={programId}
                onChange={(e) => setProgramId(e.target.value)}
                className="w-full px-3 py-2.5 bg-white/5 border border-white/10 rounded-xl text-sm text-white focus:outline-none focus:border-violet-500/50 transition-colors"
              >
                <option value="">— Select a programme —</option>
                {programs.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>

            {/* Class override */}
            <div>
              <label className="block text-white/60 text-xs font-bold uppercase tracking-widest mb-2">
                Assign Class <span className="text-white/30 normal-case font-normal text-[10px]">(optional)</span>
              </label>
              <input
                value={sectionClass}
                onChange={(e) => setSectionClass(e.target.value.toUpperCase())}
                placeholder="e.g. JSS2A, SS1B…"
                className="w-full px-3 py-2.5 bg-white/5 border border-white/10 rounded-xl text-sm text-white font-mono focus:outline-none focus:border-cyan-500/50 placeholder-white/20 transition-colors"
              />
              <p className="text-white/20 text-[10px] mt-1">Leave blank to keep current class.</p>
            </div>

            {/* School override */}
            <div>
              <label className="block text-white/60 text-xs font-bold uppercase tracking-widest mb-2">
                Assign School <span className="text-white/30 normal-case font-normal text-[10px]">(optional)</span>
              </label>
              <select
                value={schoolId}
                onChange={(e) => setSchoolId(e.target.value)}
                className="w-full px-3 py-2.5 bg-white/5 border border-white/10 rounded-xl text-sm text-white focus:outline-none focus:border-blue-500/50 transition-colors"
              >
                <option value="">— Keep current school —</option>
                {schools.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>
          </div>
        )}
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-2 sm:gap-3 mb-4">
        <div className="relative flex-1">
          <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, email or school…"
            className="w-full pl-9 pr-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-sm text-white placeholder-white/20 focus:outline-none focus:border-violet-500/50 transition-colors"
          />
        </div>
        <div className="flex gap-2">
          {allClasses.length > 0 && (
            <select
              value={classFilter}
              onChange={(e) => setClassFilter(e.target.value)}
              className="flex-1 sm:flex-none px-3 py-2.5 bg-white/5 border border-white/10 rounded-xl text-sm text-white focus:outline-none focus:border-violet-500/50 transition-colors"
            >
              <option value="">All classes</option>
              {allClasses.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          )}
          <button
            onClick={load}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 sm:px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-sm text-white/60 hover:text-white hover:bg-white/10 transition-colors"
          >
            <ArrowPathIcon className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">Refresh</span>
          </button>
        </div>
      </div>

      {/* Selection action bar */}
      {selected.size > 0 && (
        <div className="flex items-center justify-between px-4 py-3 mb-4 bg-violet-500/10 border border-violet-500/30 rounded-xl gap-3 flex-wrap">
          <div className="flex items-center gap-2 text-sm">
            <UserGroupIcon className="w-4 h-4 text-violet-400" />
            <span className="text-violet-300 font-bold">{selected.size} selected</span>
            <button onClick={() => setSelected(new Set())} className="text-white/30 hover:text-white text-xs underline">
              Clear
            </button>
          </div>
          {!programId ? (
            <div className="flex items-center gap-2 text-amber-400 text-xs font-bold">
              <ExclamationTriangleIcon className="w-4 h-4" />
              <span>Select a programme above first</span>
            </div>
          ) : (
            <button
              onClick={handleEnroll}
              disabled={enrolling}
              className="flex items-center gap-2 px-4 py-2 bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white font-bold rounded-xl text-sm transition-colors"
            >
              <AcademicCapIcon className="w-4 h-4" />
              <span>
                {enrolling
                  ? 'Enrolling…'
                  : `Enrol ${selected.size} into ${selectedProgram?.title ?? '…'}`}
              </span>
            </button>
          )}
        </div>
      )}

      {/* Student table */}
      <div className="bg-[#0d1526] border border-white/10 rounded-2xl overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-8 h-8 border-4 border-violet-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-white/20">
            <UserGroupIcon className="w-10 h-10 mb-3" />
            <p className="font-bold">No students found</p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto max-h-[560px] overflow-y-auto">
              <table className="w-full text-xs min-w-[300px]">
                <thead className="sticky top-0 bg-[#0b1020] z-10">
                  <tr className="border-b border-white/10 text-white/40 uppercase tracking-wider text-[10px]">
                    <th className="px-3 sm:px-4 py-3 w-10">
                      <input
                        type="checkbox"
                        checked={allFilteredSelected}
                        onChange={toggleAll}
                        className="w-3.5 h-3.5 rounded border-white/20 accent-violet-500 cursor-pointer"
                      />
                    </th>
                    <th className="text-left px-3 py-3">Name</th>
                    <th className="text-left px-3 py-3 hidden sm:table-cell">Email</th>
                    <th className="text-left px-3 py-3">Class</th>
                    <th className="text-left px-3 py-3 hidden md:table-cell">School</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((s) => {
                    const isSel = selected.has(s.id);
                    return (
                      <tr
                        key={s.id}
                        onClick={() => toggleOne(s.id)}
                        className={`border-b border-white/5 cursor-pointer transition-colors ${
                          isSel ? 'bg-violet-500/10 hover:bg-violet-500/15' : 'hover:bg-white/[0.02]'
                        }`}
                      >
                        <td className="px-3 sm:px-4 py-2.5 text-center" onClick={(e) => e.stopPropagation()}>
                          <input
                            type="checkbox"
                            checked={isSel}
                            onChange={() => toggleOne(s.id)}
                            className="w-3.5 h-3.5 rounded border-white/20 accent-violet-500 cursor-pointer"
                          />
                        </td>
                        <td className="px-3 py-2.5">
                          <span className={`font-medium ${isSel ? 'text-violet-200' : 'text-white'}`}>
                            {s.full_name}
                          </span>
                          <span className="block sm:hidden text-white/30 font-mono text-[10px] mt-0.5 truncate max-w-[160px]">
                            {s.email}
                          </span>
                        </td>
                        <td className="px-3 py-2.5 text-white/50 font-mono hidden sm:table-cell">{s.email}</td>
                        <td className="px-3 py-2.5">
                          {s.section_class
                            ? <span className="inline-block px-2 py-0.5 bg-cyan-500/15 text-cyan-300 text-[10px] font-bold rounded-full border border-cyan-500/20">{s.section_class}</span>
                            : <span className="text-white/20">—</span>}
                        </td>
                        <td className="px-3 py-2.5 text-white/40 hidden md:table-cell">
                          {s.school_name
                            ? <span className="flex items-center gap-1"><BuildingOfficeIcon className="w-3 h-3 flex-shrink-0" />{s.school_name}</span>
                            : <span className="text-white/20">—</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="px-4 py-3 border-t border-white/10 flex items-center justify-between text-xs text-white/30">
              <span>{filtered.length} shown · {students.length} total</span>
              {selected.size > 0 && <span className="text-violet-400 font-bold">{selected.size} selected</span>}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
