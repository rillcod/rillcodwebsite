// @refresh reset
'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/contexts/auth-context';
import { createClient } from '@/lib/supabase/client';
import {
  ArrowLeftIcon, BookOpenIcon, CheckIcon,
  ExclamationTriangleIcon, ArrowPathIcon, UserIcon,
  BuildingOfficeIcon,
} from '@/lib/icons';

export default function AddClassPage() {
  const router = useRouter();
  const { profile, loading: authLoading } = useAuth();
  const [programs, setPrograms] = useState<any[]>([]);
  const [teachers, setTeachers] = useState<any[]>([]);
  const [schools, setSchools] = useState<any[]>([]);
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
    teacher_id: '',
    school_id: '',
    max_students: '20',
    start_date: '',
    end_date: '',
    schedule: '',
    status: 'scheduled',
  });

  useEffect(() => {
    if (authLoading || !profile) return;

    const p = profile; // captured non-null ref for async closure

    async function loadData() {
      const [programsRes, teachersRes, schRes] = await Promise.all([
        fetch('/api/programs?is_active=true', { cache: 'no-store' }).then(r => r.json()),
        // Only admins can pick any teacher; teachers are always locked to themselves
        p.role === 'admin'
          ? fetch('/api/portal-users?role=teacher', { cache: 'no-store' }).then(r => r.json()).catch(() => ({ data: [] }))
          : Promise.resolve({ data: [] }),
        fetch('/api/schools', { cache: 'no-store' }).then(r => r.json()),
      ]);

      const loadedSchools = schRes.data ?? [];
      setPrograms(programsRes.data ?? []);
      setTeachers(teachersRes.data ?? []);
      setSchools(loadedSchools);

      // For teachers: lock teacher_id to self, auto-select school if only one
      if (p.role === 'teacher') {
        setForm(f => ({
          ...f,
          teacher_id: p.id,
          // If only one school available, pre-select it
          school_id: loadedSchools.length === 1 ? loadedSchools[0].id : f.school_id,
        }));
      }
    }

    loadData();
  }, [profile?.id, authLoading]);

  // Fetch available students when program or school changes
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
        // 1. Get schools for permissions (teachers only)
        const { data: assignments } = await db
          .from('teacher_schools')
          .select('school_id')
          .eq('teacher_id', profile?.id || '');
        const assignedSchoolIds = assignments?.map(a => a.school_id).filter(Boolean) || [];
        if (profile?.school_id && !assignedSchoolIds.includes(profile.school_id)) assignedSchoolIds.push(profile.school_id);

        // 2. Fetch the "Pool" from portal_users (active students who can be assigned)
        let poolQuery = db.from('portal_users')
          .select('id, full_name, email, school_id, school_name, section_class')
          .eq('role', 'student')
          .neq('is_deleted', true);

        // Jurisdiction rule:
        //   Admin:   school_id match + school_name match + truly unassigned (both null)
        //   Teacher: school_id match + school_name match ONLY — no unclaimed students
        if (profile?.role === 'admin') {
          if (form.school_id) {
            const sName = schools.find(s => s.id === form.school_id)?.name;
            const unassigned = 'and(school_id.is.null,school_name.is.null)';
            if (sName) {
              poolQuery = poolQuery.or(`school_id.eq.${form.school_id},school_name.eq."${sName}",${unassigned}`);
            } else {
              poolQuery = poolQuery.or(`school_id.eq.${form.school_id},${unassigned}`);
            }
          }
        } else {
          // Teachers only see students from schools within their jurisdiction
          if (form.school_id) {
            const sName = schools.find(s => s.id === form.school_id)?.name;
            if (sName) {
              poolQuery = poolQuery.or(`school_id.eq.${form.school_id},school_name.eq."${sName}"`);
            } else {
              poolQuery = poolQuery.in('school_id', [form.school_id]);
            }
          } else if (assignedSchoolIds.length > 0) {
            const schoolNames = schools.filter(s => assignedSchoolIds.includes(s.id)).map(s => s.name).filter(Boolean);
            const idPart = `school_id.in.(${assignedSchoolIds.join(',')})`;
            const namePart = schoolNames.map(n => `school_name.eq.${n}`).join(',');
            poolQuery = (poolQuery as any).or(namePart ? `${idPart},${namePart}` : idPart);
          } else {
            // Teacher with no school assignment — show nothing
            setAvailableStudents([]);
            setLoadingStudents(false);
            return;
          }
        }

        const { data: studs } = await poolQuery.order('full_name');
        setAvailableStudents(studs ?? []);

        // 3. Count "Pending Admission" (students registry table where user_id is null)
        let pendingQuery = db.from('students')
          .select('id')
          .is('user_id', null);

        if (form.school_id) {
          const sName = schools.find(s => s.id === form.school_id)?.name;
          if (sName) {
            pendingQuery = pendingQuery.or(`school_id.eq.${form.school_id},school_name.eq."${sName}",created_by.eq.${profile?.id || ''}`);
          } else {
            pendingQuery = pendingQuery.or(`school_id.eq.${form.school_id},created_by.eq.${profile?.id || ''}`);
          }
        } else if (profile?.role === 'teacher') {
          if (assignedSchoolIds.length > 0) {
            pendingQuery = pendingQuery.or(`school_id.in.(${assignedSchoolIds.join(',')}),created_by.eq.${profile.id}`);
          } else {
            pendingQuery = pendingQuery.eq('created_by', profile.id);
          }
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

  const isStaff = profile?.role === 'admin' || profile?.role === 'teacher' || profile?.role === 'school';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim() || !form.program_id) {
      setError('Class name and programme are required.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const payload: any = {
        name: form.name.trim(),
        description: form.description.trim() || null,
        program_id: form.program_id,
        teacher_id: form.teacher_id || profile?.id || '',
        school_id: form.school_id || null,
        max_students: parseInt(form.max_students) || 20,
        status: form.status,
        schedule: form.schedule.trim() || null,
        current_students: selectedStudents.length,
      };
      if (form.start_date) payload.start_date = form.start_date;
      if (form.end_date) payload.end_date = form.end_date;

      const classRes = await fetch('/api/classes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const classJson = await classRes.json();
      if (!classRes.ok) throw new Error(classJson.error || 'Failed to create class');
      const newClass = classJson.data;

      // 2. Assign students via class_id FK and enroll in program
      if (selectedStudents.length > 0 && newClass?.id) {
        // Update class_id via API (bypasses RLS — teachers can't update other users)
        const patchUpdate: Record<string, string | null> = { class_id: newClass.id };
        if (form.school_id) patchUpdate.school_id = form.school_id;

        await fetch('/api/portal-users', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ids: selectedStudents, update: patchUpdate }),
        });

        // Ensure enrollment exists for each student in this program
        await fetch('/api/students/bulk-enroll', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userIds: selectedStudents,
            program_id: form.program_id,
            class_id: newClass.id,
            school_id: form.school_id || undefined,
          }),
        });
      }

      router.push('/dashboard/classes');
    } catch (e: any) {
      setError(e.message ?? 'Failed to create class');
    } finally {
      setSaving(false);
    }
  };

  if (authLoading) return (
    <div className="min-h-screen bg-[#050a17] flex items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <div className="w-12 h-12 border-4 border-violet-500 border-t-transparent rounded-full animate-spin" />
        <p className="text-white/40 font-medium animate-pulse uppercase tracking-[0.2em] text-[10px]">Loading Context...</p>
      </div>
    </div>
  );

  if (!isStaff) return (
    <div className="min-h-screen bg-[#050a17] flex items-center justify-center">
      <div className="bg-white/5 border border-white/10 rounded-[2rem] p-8 text-center max-w-sm">
        <ExclamationTriangleIcon className="w-12 h-12 text-rose-500/20 mx-auto mb-4" />
        <p className="text-white/40 font-black uppercase tracking-widest text-xs leading-relaxed">Administrator level access required to initialize new academy clusters.</p>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#050a17] text-white">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-12 space-y-8 pb-32">

        <Link href="/dashboard/classes"
          className="inline-flex items-center gap-3 px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-full text-[10px] font-black uppercase tracking-widest text-white/40 hover:text-white transition-all group">
          <ArrowLeftIcon className="w-4 h-4 group-hover:-translate-x-1 transition-transform" /> Back to Registry
        </Link>

        {/* Header Block */}
        <div className="bg-gradient-to-br from-violet-600/20 to-blue-600/20 border border-white/5 rounded-[2.5rem] p-10 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-48 h-48 bg-violet-500 opacity-[0.05] blur-3xl rounded-full" />
          <div className="relative z-10">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 bg-violet-600 rounded-2xl flex items-center justify-center shadow-lg shadow-violet-900/40">
                <BookOpenIcon className="w-6 h-6 text-white" />
              </div>
              <span className="text-[10px] font-black text-violet-400 uppercase tracking-[0.2em]">New Cluster initialization</span>
            </div>
            <h1 className="text-4xl sm:text-5xl font-black tracking-tighter text-white">Create <span className="bg-gradient-to-r from-violet-400 to-blue-400 bg-clip-text text-transparent">Class</span></h1>
            <p className="text-white/30 text-sm mt-3 font-medium max-w-md">Configure your new academic group, assign mentorship, and enroll initial student pioneers.</p>
          </div>
        </div>

        {error && (
          <div className="flex items-center gap-3 bg-rose-500/10 border border-rose-500/20 rounded-[2rem] p-6 animate-in fade-in slide-in-from-top-4">
            <div className="w-10 h-10 bg-rose-500 rounded-xl flex items-center justify-center flex-shrink-0 shadow-lg shadow-rose-900/40">
              <ExclamationTriangleIcon className="w-6 h-6 text-white" />
            </div>
            <p className="text-rose-400 text-xs font-black uppercase tracking-widest leading-relaxed">{error}</p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Primary Details Card */}
          <div className="bg-white/5 border border-white/10 rounded-[2.5rem] p-8 sm:p-10 space-y-8 shadow-2xl">
            <h3 className="text-white/20 text-[10px] font-black uppercase tracking-[0.4em] mb-4">Functional Definition</h3>
            
            <div className="space-y-6">
              <div>
                <label className="block text-[10px] font-black text-white/30 uppercase tracking-widest mb-3 px-1">
                  Class Designation <span className="text-violet-500">*</span>
                </label>
                <input type="text" required value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="e.g. Python Architects — Phase 1"
                  className="w-full px-6 py-5 bg-white/5 border border-white/5 rounded-2xl text-sm font-bold text-white placeholder:text-white/10 focus:outline-none focus:border-violet-500 focus:bg-white/10 transition-all outline-none" />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                <div>
                  <label className="block text-[10px] font-black text-white/30 uppercase tracking-widest mb-3 px-1">
                    Select Programme <span className="text-violet-500">*</span>
                  </label>
                  <select required value={form.program_id}
                    onChange={e => setForm(f => ({ ...f, program_id: e.target.value }))}
                    className="w-full px-6 py-5 bg-white/5 border border-white/5 rounded-2xl text-[11px] font-black text-white/70 focus:outline-none focus:border-violet-500 focus:bg-white/10 transition-all appearance-none cursor-pointer uppercase tracking-widest">
                    <option value="" className="bg-[#0f0f1a]">SELECT PATHWAY</option>
                    {programs.map(p => (
                      <option key={p.id} value={p.id} className="bg-[#0f0f1a]">{p.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-black text-white/30 uppercase tracking-widest mb-3 px-1">Curriculum Mentor</label>
                  {profile?.role === 'teacher' ? (
                    <div className="w-full px-6 py-5 bg-white/5 border border-violet-500/20 rounded-2xl flex items-center gap-3">
                      <UserIcon className="w-4 h-4 text-violet-400 flex-shrink-0" />
                      <span className="text-[11px] font-black text-white/70 uppercase tracking-widest">{profile.full_name ?? 'YOU'}</span>
                      <span className="ml-auto text-[9px] text-violet-400/60 font-bold uppercase tracking-widest">Locked</span>
                    </div>
                  ) : (
                    <select value={form.teacher_id}
                      onChange={e => setForm(f => ({ ...f, teacher_id: e.target.value }))}
                      className="w-full px-6 py-5 bg-white/5 border border-white/5 rounded-2xl text-[11px] font-black text-white/70 focus:outline-none focus:border-violet-500 focus:bg-white/10 transition-all appearance-none cursor-pointer uppercase tracking-widest">
                      <option value="" className="bg-[#0f0f1a]">SESSIONS LEAD (DEFAULT: ME)</option>
                      {teachers.map(t => (
                        <option key={t.id} value={t.id} className="bg-[#0f0f1a]">{t.full_name}</option>
                      ))}
                    </select>
                  )}
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-black text-white/30 uppercase tracking-widest mb-3 px-1">
                  Partner School <span className="text-white/10 font-medium normal-case">(required for school-linked classes)</span>
                </label>
                {profile?.role === 'teacher' && schools.length === 1 ? (
                  <div className="w-full px-6 py-5 bg-white/5 border border-blue-500/20 rounded-2xl flex items-center gap-3">
                    <BuildingOfficeIcon className="w-4 h-4 text-blue-400 flex-shrink-0" />
                    <span className="text-[11px] font-black text-white/70 uppercase tracking-widest">{schools[0].name}</span>
                    <span className="ml-auto text-[9px] text-blue-400/60 font-bold uppercase tracking-widest">Locked</span>
                  </div>
                ) : (
                  <select value={form.school_id}
                    onChange={e => setForm(f => ({ ...f, school_id: e.target.value }))}
                    className="w-full px-6 py-5 bg-white/5 border border-white/5 rounded-2xl text-[11px] font-black text-white/70 focus:outline-none focus:border-violet-500 focus:bg-white/10 transition-all appearance-none cursor-pointer uppercase tracking-widest">
                    <option value="" className="bg-[#0f0f1a]">INDEPENDENT / ONLINE CLUSTER</option>
                    {schools.map(s => (
                      <option key={s.id} value={s.id} className="bg-[#0f0f1a]">{s.name}</option>
                    ))}
                  </select>
                )}
              </div>
            </div>
          </div>

          {/* Configuration Card */}
          <div className="bg-white/5 border border-white/10 rounded-[2.5rem] p-8 sm:p-10 space-y-8 shadow-2xl">
            <h3 className="text-white/20 text-[10px] font-black uppercase tracking-[0.4em] mb-4">Operational parameters</h3>
            
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
              <div>
                <label className="block text-[10px] font-black text-white/30 uppercase tracking-widest mb-3 px-1">Capacity Limit</label>
                <input type="number" min="1" max="100" value={form.max_students}
                  onChange={e => setForm(f => ({ ...f, max_students: e.target.value }))}
                  className="w-full px-6 py-5 bg-white/5 border border-white/5 rounded-2xl text-sm font-bold text-white focus:outline-none focus:border-violet-500 focus:bg-white/10 transition-all" />
              </div>
              <div>
                <label className="block text-[10px] font-black text-white/30 uppercase tracking-widest mb-3 px-1">Cycle Start</label>
                <input type="date" value={form.start_date}
                  onChange={e => setForm(f => ({ ...f, start_date: e.target.value }))}
                  className="w-full px-6 py-5 bg-white/5 border border-white/5 rounded-2xl text-[10px] font-black text-white focus:outline-none focus:border-violet-500 focus:bg-white/10 transition-all uppercase tracking-widest inverted-calendar" />
              </div>
              <div>
                <label className="block text-[10px] font-black text-white/30 uppercase tracking-widest mb-3 px-1">Cycle End</label>
                <input type="date" value={form.end_date}
                  onChange={e => setForm(f => ({ ...f, end_date: e.target.value }))}
                  className="w-full px-6 py-5 bg-white/5 border border-white/5 rounded-2xl text-[10px] font-black text-white focus:outline-none focus:border-violet-500 focus:bg-white/10 transition-all uppercase tracking-widest inverted-calendar" />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              <div>
                <label className="block text-[10px] font-black text-white/30 uppercase tracking-widest mb-3 px-1">Frequency Rhythm</label>
                <input type="text" value={form.schedule}
                  onChange={e => setForm(f => ({ ...f, schedule: e.target.value }))}
                  placeholder="e.g. MON/WED 4:00 PM"
                  className="w-full px-6 py-5 bg-white/5 border border-white/5 rounded-2xl text-sm font-bold text-white placeholder:text-white/10 focus:outline-none focus:border-violet-500 focus:bg-white/10 transition-all outline-none" />
              </div>
              <div>
                <label className="block text-[10px] font-black text-white/30 uppercase tracking-widest mb-3 px-1">Initial State</label>
                <select value={form.status}
                  onChange={e => setForm(f => ({ ...f, status: e.target.value }))}
                  className="w-full px-6 py-5 bg-white/5 border border-white/5 rounded-2xl text-[11px] font-black text-white/70 focus:outline-none focus:border-violet-500 focus:bg-white/10 transition-all appearance-none cursor-pointer uppercase tracking-widest">
                  <option value="scheduled" className="bg-[#0f0f1a]">QUEUE (SCHEDULED)</option>
                  <option value="active" className="bg-[#0f0f1a]">ENGAGED (ACTIVE)</option>
                </select>
              </div>
            </div>
          </div>

          {/* Student Roster Card */}
          <div className="bg-white/5 border border-white/10 rounded-[2.5rem] p-8 sm:p-10 space-y-8 shadow-2xl">
            <h3 className="text-white/20 text-[10px] font-black uppercase tracking-[0.4em] mb-4">Initial roster pioneers</h3>
            
            <div className="space-y-4">
              <div className="flex items-center justify-between px-2">
                <span className="text-[10px] font-black text-white/30 uppercase tracking-widest">Population: {selectedStudents.length} Selected</span>
                {pendingCount > 0 && (
                  <div className="flex items-center gap-2 group cursor-help">
                    <div className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-ping" />
                    <span className="text-[9px] font-black text-blue-400 uppercase tracking-widest">{pendingCount} PENDING ADMISSIONS</span>
                  </div>
                )}
              </div>

              {!form.program_id ? (
                <div className="py-20 bg-white/5 border border-dashed border-white/5 rounded-3xl flex flex-col items-center justify-center text-center">
                  <div className="w-16 h-16 bg-white/5 rounded-full flex items-center justify-center mb-6 border border-white/5">
                    <UserIcon className="w-8 h-8 text-white/10" />
                  </div>
                  <h3 className="text-xs font-black text-white/20 uppercase tracking-widest">Awaiting pathway selection</h3>
                </div>
              ) : loadingStudents ? (
                <div className="py-20 bg-white/5 border border-dashed border-white/5 rounded-3xl flex flex-col items-center justify-center text-center">
                  <ArrowPathIcon className="w-8 h-8 text-violet-500 animate-spin mb-4" />
                  <p className="text-[10px] font-black text-white/20 uppercase tracking-widest">Synchronizing population...</p>
                </div>
              ) : availableStudents.length === 0 ? (
                <div className="space-y-4">
                  <div className="py-20 bg-white/5 border border-dashed border-white/5 rounded-3xl flex flex-col items-center justify-center text-center px-8">
                    <div className="w-16 h-16 bg-white/5 rounded-full flex items-center justify-center mb-6 border border-white/5">
                      <ExclamationTriangleIcon className="w-8 h-8 text-amber-500/20" />
                    </div>
                    <h3 className="text-xs font-black text-amber-500/40 uppercase tracking-widest mb-2">Zero matching pioneers found</h3>
                    <p className="text-[10px] text-white/20 uppercase tracking-[0.2em] leading-relaxed max-w-xs font-medium">No verified portal accounts matching this criteria are available for enrollment.</p>
                  </div>
                </div>
              ) : (
                <div className="bg-[#0B132B]/50 border border-white/5 rounded-3xl overflow-hidden shadow-inner">
                  <div className="max-h-80 overflow-y-auto divide-y divide-white/5 custom-scrollbar">
                    {availableStudents.map(student => (
                      <label key={student.id} className="flex items-center gap-4 px-6 py-5 hover:bg-violet-600/10 cursor-pointer transition-all group">
                        <div className="relative">
                          <input
                            type="checkbox"
                            checked={selectedStudents.includes(student.id)}
                            onChange={e => {
                              if (e.target.checked) setSelectedStudents(prev => [...prev, student.id]);
                              else setSelectedStudents(prev => prev.filter(id => id !== student.id));
                            }}
                            className="w-6 h-6 rounded-lg border-white/10 bg-white/5 text-violet-600 focus:ring-violet-500 focus:ring-offset-0 transition-all cursor-pointer"
                          />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-black text-white group-hover:text-violet-400 transition-colors truncate uppercase tracking-tighter">{student.full_name}</p>
                          <p className="text-[10px] text-white/20 truncate font-medium">{student.email}</p>
                        </div>
                        {selectedStudents.includes(student.id) && (
                          <div className="px-3 py-1 bg-violet-600/20 border border-violet-600/30 rounded-full">
                            <span className="text-[8px] font-black text-violet-400 uppercase tracking-widest">READY</span>
                          </div>
                        )}
                      </label>
                    ))}
                  </div>
                  <div className="px-6 py-4 bg-white/5 border-t border-white/5 flex justify-between items-center backdrop-blur-md">
                    <span className="text-[10px] text-white/30 uppercase font-black tracking-widest">
                      {availableStudents.length} DISCOVERED
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        if (selectedStudents.length === availableStudents.length) setSelectedStudents([]);
                        else setSelectedStudents(availableStudents.map(s => s.id));
                      }}
                      className="px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-[10px] font-black text-white/50 hover:text-white transition-all uppercase tracking-widest"
                    >
                      {selectedStudents.length === availableStudents.length ? 'DESELECT CLUSTER' : 'INITIALIZE ALL'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="bg-white/5 border border-white/10 rounded-[2.5rem] p-8 sm:p-10 space-y-8 shadow-2xl">
            <h3 className="text-white/20 text-[10px] font-black uppercase tracking-[0.4em] mb-4">Cluster annotations</h3>
            <textarea rows={4} value={form.description}
              onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              placeholder="Internal notes regarding cluster objectives, requirements, or mentor instructions..."
              className="w-full px-6 py-5 bg-white/5 border border-white/5 rounded-2xl text-sm font-bold text-white placeholder:text-white/10 focus:outline-none focus:border-violet-500 focus:bg-white/10 transition-all resize-none outline-none" />
          </div>

          <div className="flex flex-col sm:flex-row items-center gap-4 pt-4">
            <Link href="/dashboard/classes"
              className="w-full sm:w-fit px-8 py-5 bg-white/5 hover:bg-white/10 border border-white/10 text-white/40 hover:text-white text-[10px] font-black uppercase tracking-widest rounded-2xl transition-all text-center">
              Abort initialization
            </Link>
            <button type="submit" disabled={saving}
              className="w-full sm:flex-1 flex items-center justify-center gap-3 py-5 bg-violet-600 hover:bg-violet-500 text-white text-[11px] font-black uppercase tracking-[0.2em] rounded-2xl transition-all disabled:opacity-50 shadow-xl shadow-violet-900/40 active:scale-[0.98]">
              {saving ? <ArrowPathIcon className="w-5 h-5 animate-spin" /> : <CheckIcon className="w-5 h-5" />}
              {saving ? 'Synchronizing cluster...' : 'Initialize Registry Node'}
            </button>
          </div>
        </form>
      </div>
      <style jsx global>{`
        .inverted-calendar::-webkit-calendar-picker-indicator {
          filter: invert(1);
          opacity: 0.5;
          cursor: pointer;
        }
        .custom-scrollbar::-webkit-scrollbar {
          width: 6px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: rgba(255, 255, 255, 0.02);
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: rgba(255, 255, 255, 0.1);
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: rgba(139, 92, 246, 0.5);
        }
      `}</style>
    </div>
  );
}
