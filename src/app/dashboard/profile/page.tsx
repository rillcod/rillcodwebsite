'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/auth-context';
import { createClient } from '@/lib/supabase/client';
import Link from 'next/link';
import {
  UserIcon, EnvelopeIcon, PhoneIcon, ShieldCheckIcon,
  AcademicCapIcon, BookOpenIcon, ClipboardDocumentListIcon,
  BuildingOfficeIcon, ChartBarIcon, PencilSquareIcon,
  CheckIcon, ArrowPathIcon,
} from '@heroicons/react/24/outline';

export default function ProfilePage() {
  const { profile, refreshProfile } = useAuth();
  const [stats, setStats] = useState<Record<string, number>>({});
  const [schools, setSchools] = useState<any[]>([]);
  const [programmes, setProgrammes] = useState<any[]>([]);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ full_name: '', phone: '', bio: '' });

  useEffect(() => {
    if (!profile) return;
    setForm({ full_name: profile.full_name ?? '', phone: profile.phone ?? '', bio: profile.bio ?? '' });
    const db = createClient();
    if (profile.role === 'student') {
      Promise.all([
        db.from('enrollments').select('id', { count: 'exact', head: true }).eq('user_id', profile.id),
        db.from('assignment_submissions').select('id', { count: 'exact', head: true }).eq('portal_user_id', profile.id),
        db.from('assignment_submissions').select('grade').eq('portal_user_id', profile.id).not('grade', 'is', null),
        db.from('enrollments').select('programs(name)').eq('user_id', profile.id),
      ]).then(([enr, subs, scores, prog]) => {
        const avg = scores.data?.length ? Math.round(scores.data.reduce((a: number, b: any) => a + (b.grade ?? 0), 0) / scores.data.length) : 0;
        setStats({ enrolled: enr.count ?? 0, submissions: subs.count ?? 0, avgScore: avg });
        setProgrammes((prog.data ?? []).map((e: any) => e.programs?.name).filter(Boolean));
      });
    } else if (profile.role === 'teacher') {
      Promise.all([
        db.from('classes').select('id', { count: 'exact', head: true }).eq('teacher_id', profile.id),
        db.from('lessons').select('id', { count: 'exact', head: true }).eq('created_by', profile.id),
        db.from('assignments').select('id', { count: 'exact', head: true }).eq('created_by', profile.id),
        db.from('teacher_schools').select('schools(name, city)').eq('teacher_id', profile.id),
      ]).then(([cls, les, asg, schs]) => {
        setStats({ classes: cls.count ?? 0, lessons: les.count ?? 0, assignments: asg.count ?? 0 });
        setSchools((schs.data ?? []).map((r: any) => r.schools).filter(Boolean));
      });
    } else if (profile.role === 'admin') {
      Promise.all([
        db.from('portal_users').select('id', { count: 'exact', head: true }).eq('role', 'student'),
        db.from('portal_users').select('id', { count: 'exact', head: true }).eq('role', 'teacher'),
        db.from('schools').select('id', { count: 'exact', head: true }),
        db.from('programs').select('id', { count: 'exact', head: true }).eq('is_active', true),
      ]).then(([stu, tea, sch, prog]) => {
        setStats({ students: stu.count ?? 0, teachers: tea.count ?? 0, schools: sch.count ?? 0, programmes: prog.count ?? 0 });
      });
    }
  }, [profile?.id]);

  const handleSave = async () => {
    if (!profile) return;
    setSaving(true);
    await createClient().from('portal_users').update({
      full_name: form.full_name.trim(),
      phone: form.phone.trim() || null,
      bio: form.bio.trim() || null,
    }).eq('id', profile.id);
    await refreshProfile?.();
    setSaving(false);
    setEditing(false);
  };

  if (!profile) return (
    <div className="min-h-screen bg-[#0f0f1a] flex items-center justify-center">
      <div className="w-10 h-10 border-4 border-violet-500 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  const roleColor: Record<string, string> = {
    admin: 'text-purple-400 bg-purple-500/10 border-purple-500/20',
    teacher: 'text-teal-400 bg-teal-500/10 border-teal-500/20',
    student: 'text-indigo-400 bg-indigo-500/10 border-indigo-500/20',
  };

  const statCards: { label: string; value: number; icon: any; color: string }[] = [];
  if (profile.role === 'student') {
    statCards.push(
      { label: 'Enrolled', value: stats.enrolled ?? 0, icon: BookOpenIcon, color: 'text-indigo-400' },
      { label: 'Submissions', value: stats.submissions ?? 0, icon: ClipboardDocumentListIcon, color: 'text-amber-400' },
      { label: 'Avg Score', value: stats.avgScore ?? 0, icon: ChartBarIcon, color: 'text-emerald-400' },
    );
  } else if (profile.role === 'teacher') {
    statCards.push(
      { label: 'Classes', value: stats.classes ?? 0, icon: AcademicCapIcon, color: 'text-teal-400' },
      { label: 'Lessons', value: stats.lessons ?? 0, icon: BookOpenIcon, color: 'text-cyan-400' },
      { label: 'Assignments', value: stats.assignments ?? 0, icon: ClipboardDocumentListIcon, color: 'text-amber-400' },
    );
  } else {
    statCards.push(
      { label: 'Students', value: stats.students ?? 0, icon: UserIcon, color: 'text-indigo-400' },
      { label: 'Teachers', value: stats.teachers ?? 0, icon: AcademicCapIcon, color: 'text-teal-400' },
      { label: 'Schools', value: stats.schools ?? 0, icon: BuildingOfficeIcon, color: 'text-violet-400' },
      { label: 'Programmes', value: stats.programmes ?? 0, icon: BookOpenIcon, color: 'text-amber-400' },
    );
  }

  return (
    <div className="min-h-screen bg-[#0f0f1a] text-white">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">

        {/* Header card */}
        <div className="bg-white/5 border border-white/10 rounded-2xl p-6 flex flex-col sm:flex-row items-start sm:items-center gap-6">
          {/* Avatar */}
          <div className="w-20 h-20 bg-[#7a0606] border-2 border-white/20 rounded-2xl flex items-center justify-center flex-shrink-0 text-3xl font-black text-white uppercase shadow-lg">
            {profile.full_name?.charAt(0) ?? 'U'}
          </div>
          <div className="flex-1">
            {editing ? (
              <input
                value={form.full_name}
                onChange={e => setForm(f => ({ ...f, full_name: e.target.value }))}
                className="text-2xl font-extrabold bg-white/5 border border-white/20 rounded-xl px-3 py-1 text-white focus:outline-none focus:border-violet-500 w-full max-w-xs"
              />
            ) : (
              <h1 className="text-2xl font-extrabold">{profile.full_name}</h1>
            )}
            <div className="flex flex-wrap items-center gap-2 mt-2">
              <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold border capitalize ${roleColor[profile.role]}`}>
                <ShieldCheckIcon className="w-3.5 h-3.5" />
                {profile.role}
              </span>
              <span className="text-xs text-white/30">{profile.email}</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {editing ? (
              <>
                <button onClick={() => setEditing(false)} className="px-4 py-2 text-xs font-bold text-white/50 bg-white/5 hover:bg-white/10 rounded-xl transition-colors">
                  Cancel
                </button>
                <button onClick={handleSave} disabled={saving} className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold bg-violet-600 hover:bg-violet-500 rounded-xl transition-colors disabled:opacity-50">
                  {saving ? <ArrowPathIcon className="w-3.5 h-3.5 animate-spin" /> : <CheckIcon className="w-3.5 h-3.5" />}
                  Save
                </button>
              </>
            ) : (
              <button onClick={() => setEditing(true)} className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white/50 bg-white/5 hover:bg-white/10 rounded-xl transition-colors">
                <PencilSquareIcon className="w-4 h-4" /> Edit Profile
              </button>
            )}
          </div>
        </div>

        {/* Stats */}
        <div className={`grid gap-4 ${statCards.length === 4 ? 'grid-cols-2 sm:grid-cols-4' : 'grid-cols-3'}`}>
          {statCards.map(s => (
            <div key={s.label} className="bg-white/5 border border-white/10 rounded-2xl p-5 flex flex-col items-center text-center">
              <s.icon className={`w-6 h-6 ${s.color} mb-2`} />
              <span className="text-2xl font-extrabold">{s.value}{s.label === 'Avg Score' ? '%' : ''}</span>
              <span className="text-xs text-white/40 uppercase tracking-widest mt-0.5">{s.label}</span>
            </div>
          ))}
        </div>

        {/* Contact & Bio */}
        <div className="bg-white/5 border border-white/10 rounded-2xl p-6 space-y-4">
          <h2 className="text-xs font-bold text-white/40 uppercase tracking-widest">Contact & Details</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-xs text-white/40 uppercase tracking-widest block mb-1">Email</label>
              <div className="flex items-center gap-2 text-sm">
                <EnvelopeIcon className="w-4 h-4 text-white/30" />
                <span>{profile.email}</span>
              </div>
            </div>
            <div>
              <label className="text-xs text-white/40 uppercase tracking-widest block mb-1">Phone</label>
              {editing ? (
                <input
                  value={form.phone}
                  onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
                  placeholder="e.g. +234 800 000 0000"
                  className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-xl text-sm text-white placeholder-white/25 focus:outline-none focus:border-violet-500 transition-colors"
                />
              ) : (
                <div className="flex items-center gap-2 text-sm">
                  <PhoneIcon className="w-4 h-4 text-white/30" />
                  <span className={profile.phone ? '' : 'text-white/30'}>{profile.phone || 'Not set'}</span>
                </div>
              )}
            </div>
          </div>
          <div>
            <label className="text-xs text-white/40 uppercase tracking-widest block mb-1">Bio</label>
            {editing ? (
              <textarea
                rows={3}
                value={form.bio}
                onChange={e => setForm(f => ({ ...f, bio: e.target.value }))}
                placeholder="Tell us about yourself…"
                className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-xl text-sm text-white placeholder-white/25 focus:outline-none focus:border-violet-500 transition-colors resize-none"
              />
            ) : (
              <p className={profile.bio ? 'text-sm text-white/70' : 'text-sm text-white/30'}>
                {profile.bio || 'No bio added yet.'}
              </p>
            )}
          </div>
        </div>

        {/* Teacher: Assigned Schools */}
        {profile.role === 'teacher' && (
          <div className="bg-white/5 border border-white/10 rounded-2xl p-6 space-y-3">
            <h2 className="text-xs font-bold text-white/40 uppercase tracking-widest">Assigned Schools</h2>
            {schools.length === 0 ? (
              <p className="text-sm text-white/30">No schools assigned yet.</p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {schools.map((s: any, i: number) => (
                  <div key={i} className="flex items-center gap-3 bg-white/5 rounded-xl p-3">
                    <BuildingOfficeIcon className="w-5 h-5 text-teal-400 flex-shrink-0" />
                    <div>
                      <p className="text-sm font-semibold">{s.name}</p>
                      {s.city && <p className="text-xs text-white/40">{s.city}</p>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Student: Enrolled Programmes */}
        {profile.role === 'student' && programmes.length > 0 && (
          <div className="bg-white/5 border border-white/10 rounded-2xl p-6 space-y-3">
            <h2 className="text-xs font-bold text-white/40 uppercase tracking-widest">Enrolled Programmes</h2>
            <div className="flex flex-wrap gap-2">
              {programmes.map((name, i) => (
                <span key={i} className="px-3 py-1 text-xs font-bold bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 rounded-full">
                  {name}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Quick Links */}
        <div className="bg-white/5 border border-white/10 rounded-2xl p-6 space-y-3">
          <h2 className="text-xs font-bold text-white/40 uppercase tracking-widest">Quick Links</h2>
          <div className="flex flex-wrap gap-3">
            <Link href="/dashboard" className="px-4 py-2 text-xs font-bold text-white/60 bg-white/5 hover:bg-white/10 rounded-xl transition-colors">
              Dashboard
            </Link>
            <Link href="/dashboard/settings" className="px-4 py-2 text-xs font-bold text-white/60 bg-white/5 hover:bg-white/10 rounded-xl transition-colors">
              Settings
            </Link>
            {(profile.role === 'teacher' || profile.role === 'admin') && (
              <Link href="/dashboard/students" className="px-4 py-2 text-xs font-bold text-white/60 bg-white/5 hover:bg-white/10 rounded-xl transition-colors">
                Students
              </Link>
            )}
            {profile.role === 'student' && (
              <Link href="/dashboard/courses" className="px-4 py-2 text-xs font-bold text-white/60 bg-white/5 hover:bg-white/10 rounded-xl transition-colors">
                My Courses
              </Link>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}
