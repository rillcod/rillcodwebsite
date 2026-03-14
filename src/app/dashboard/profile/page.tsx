// @refresh reset
'use client';

import { useState, useEffect, useRef } from 'react';
import { useAuth } from '@/contexts/auth-context';
import { createClient } from '@/lib/supabase/client';
import Link from 'next/link';
import Image from 'next/image';
import {
  UserIcon, EnvelopeIcon, PhoneIcon, ShieldCheckIcon,
  AcademicCapIcon, BookOpenIcon, ClipboardDocumentListIcon,
  BuildingOfficeIcon, ChartBarIcon, PencilSquareIcon,
  CheckIcon, ArrowPathIcon, ChevronRightIcon, RocketLaunchIcon,
  CameraIcon,
} from '@heroicons/react/24/outline';

export default function ProfilePage() {
  const { profile, refreshProfile } = useAuth();
  const [stats, setStats] = useState<Record<string, number>>({});
  const [schools, setSchools] = useState<any[]>([]);
  const [programmes, setProgrammes] = useState<any[]>([]);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ full_name: '', phone: '', bio: '' });
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [avatarError, setAvatarError] = useState<string | null>(null);
  const avatarInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!profile) return;
    setForm({ full_name: profile.full_name ?? '', phone: profile.phone ?? '', bio: profile.bio ?? '' });
    setAvatarUrl((profile as any).avatar_url ?? null);
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
    } else if (profile.role === 'school' && profile.school_id) {
      Promise.all([
        db.from('students').select('id', { count: 'exact', head: true }).eq('school_id', profile.school_id),
        db.from('teacher_schools').select('id', { count: 'exact', head: true }).eq('school_id', profile.school_id),
        db.from('programs').select('id', { count: 'exact', head: true }).eq('is_active', true),
      ]).then(([stu, tea, prog]) => {
        setStats({ students: stu.count ?? 0, teachers: tea.count ?? 0, programmes: prog.count ?? 0 });
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

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !profile) return;
    setAvatarError(null);
    if (file.size > 1 * 1024 * 1024) {
      setAvatarError('Max file size is 1MB');
      return;
    }
    setUploadingAvatar(true);
    const db = createClient();
    const ext = file.name.split('.').pop() ?? 'jpg';
    const path = `${profile.id}/avatar.${ext}`;
    const { error: upErr } = await db.storage.from('avatars').upload(path, file, {
      contentType: file.type,
      upsert: true,
    });
    if (upErr) { setAvatarError(upErr.message); setUploadingAvatar(false); return; }
    const { data } = db.storage.from('avatars').getPublicUrl(path);
    const url = `${data.publicUrl}?t=${Date.now()}`;
    await db.from('portal_users').update({ avatar_url: url } as any).eq('id', profile.id);
    setAvatarUrl(url);
    await refreshProfile?.();
    setUploadingAvatar(false);
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
    school: 'text-blue-400 bg-blue-500/10 border-blue-500/20',
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
  } else if (profile.role === 'school') {
    statCards.push(
      { label: 'My Students', value: stats.students ?? 0, icon: UserIcon, color: 'text-indigo-400' },
      { label: 'Assigned Teachers', value: stats.teachers ?? 0, icon: AcademicCapIcon, color: 'text-teal-400' },
      { label: 'Programmes', value: stats.programmes ?? 0, icon: BookOpenIcon, color: 'text-amber-400' },
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
    <div className="min-h-screen bg-[#070710] text-white selection:bg-indigo-500 selection:text-white">
      <div className="max-w-5xl mx-auto px-6 sm:px-12 py-12 md:py-20 space-y-10 animate-in fade-in slide-in-from-bottom-4 duration-700">

        {/* Header card with profile gradient background */}
        <div className="relative overflow-hidden group">
            <div className={`absolute inset-0 bg-gradient-to-r ${profile.role === 'teacher' ? 'from-teal-600/20 to-cyan-500/10' : 'from-indigo-600/20 to-blue-500/10'} opacity-50 blur-3xl rounded-[40px] -z-10`} />
            <div className="bg-white/5 border border-white/10 rounded-[40px] p-8 md:p-12 backdrop-blur-xl flex flex-col md:flex-row items-center md:items-start gap-10 shadow-2xl">
              {/* Avatar Section */}
              <div className="relative shrink-0">
                <div className={`w-32 h-32 md:w-44 md:h-44 ${profile.role === 'teacher' ? 'bg-teal-600' : 'bg-indigo-600'} border-4 border-white/20 rounded-[48px] overflow-hidden flex items-center justify-center text-5xl md:text-7xl font-black text-white uppercase shadow-2xl rotate-3 group-hover:rotate-0 transition-transform duration-500`}>
                    {avatarUrl
                      ? <Image src={avatarUrl} alt={profile.full_name ?? 'Avatar'} fill className="object-cover" unoptimized />
                      : (profile.full_name?.charAt(0) ?? 'U')
                    }
                </div>
                {/* Upload button */}
                <button
                  onClick={() => avatarInputRef.current?.click()}
                  disabled={uploadingAvatar}
                  className="absolute -bottom-2 -left-2 bg-[#070710] border border-white/10 p-3 rounded-2xl shadow-xl hover:bg-white/10 transition-colors disabled:opacity-50"
                  title="Change profile photo"
                >
                  {uploadingAvatar
                    ? <ArrowPathIcon className="w-5 h-5 text-white/60 animate-spin" />
                    : <CameraIcon className="w-5 h-5 text-white/60" />
                  }
                </button>
                <input ref={avatarInputRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={handleAvatarChange} />
                <div className="absolute -bottom-2 -right-2 bg-[#070710] border border-white/10 p-3 rounded-2xl shadow-xl">
                    <ShieldCheckIcon className={`w-6 h-6 ${profile.role === 'teacher' ? 'text-teal-400' : 'text-indigo-400'}`} />
                </div>
                {avatarError && (
                  <p className="absolute -bottom-10 left-0 text-xs text-red-400 whitespace-nowrap">{avatarError}</p>
                )}
              </div>

              <div className="flex-1 text-center md:text-left space-y-6">
                <div className="space-y-2">
                    {editing ? (
                      <input
                        value={form.full_name}
                        onChange={e => setForm(f => ({ ...f, full_name: e.target.value }))}
                        className="text-3xl md:text-5xl font-black bg-white/5 border border-white/20 rounded-2xl px-6 py-2 text-white outline-none focus:border-indigo-500 w-full"
                        autoFocus
                      />
                    ) : (
                      <h1 className="text-4xl md:text-6xl font-black tracking-tight leading-tight">{profile.full_name}</h1>
                    )}
                    <div className="flex flex-wrap items-center justify-center md:justify-start gap-3 mt-4">
                      <span className={`px-5 py-1.5 rounded-full text-[10px] font-black border uppercase tracking-[0.2em] shadow-lg ${roleColor[profile.role]}`}>
                        {profile.role}
                      </span>
                      <span className="text-sm font-medium text-white/30 lowercase tracking-tight">{profile.email}</span>
                    </div>
                </div>

                {!editing && profile.bio && (
                    <p className="text-lg text-white/50 max-w-2xl leading-relaxed italic border-l-2 border-white/10 pl-6">
                        "{profile.bio}"
                    </p>
                )}
                
                {editing && (
                    <textarea
                        rows={3}
                        value={form.bio}
                        onChange={e => setForm(f => ({ ...f, bio: e.target.value }))}
                        placeholder="Share your journey..."
                        className="w-full bg-white/5 border border-white/20 rounded-2xl p-6 text-white outline-none focus:border-indigo-500 resize-none text-lg"
                    />
                )}

                <div className="flex items-center justify-center md:justify-start gap-4 pt-4">
                    {editing ? (
                      <>
                        <button onClick={() => setEditing(false)} className="px-8 py-3 text-xs font-black uppercase tracking-widest text-white/40 hover:text-white transition-colors bg-white/5 rounded-2xl">
                          Cancel
                        </button>
                        <button onClick={handleSave} disabled={saving} className={`flex items-center gap-2 px-10 py-3 text-xs font-black uppercase tracking-widest text-white ${profile.role === 'teacher' ? 'bg-teal-600 hover:bg-teal-500' : 'bg-indigo-600 hover:bg-indigo-500'} rounded-2xl transition-all shadow-xl disabled:opacity-50`}>
                          {saving ? <ArrowPathIcon className="w-4 h-4 animate-spin" /> : <CheckIcon className="w-4 h-4" />}
                          Save Changes
                        </button>
                      </>
                    ) : (
                      <button onClick={() => setEditing(true)} className="flex items-center gap-2 px-8 py-3 text-xs font-black uppercase tracking-widest text-white/40 bg-white/5 hover:bg-white/10 border border-white/10 rounded-2xl transition-all">
                        <PencilSquareIcon className="w-4 h-4" /> Edit Profile
                      </button>
                    )}
                </div>
              </div>
            </div>
        </div>

        {/* Stats Grid - Modern High-Contrast */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
          {statCards.map(s => (
            <div key={s.label} className="bg-white/5 border border-white/10 rounded-[32px] p-8 flex flex-col items-center justify-center text-center group hover:bg-white/[0.08] transition-all relative overflow-hidden">
              <div className={`absolute -right-4 -top-4 w-24 h-24 ${s.color.replace('text-', 'bg-')}/5 rounded-full blur-2xl group-hover:scale-150 transition-transform duration-700`} />
              <div className={`w-14 h-14 rounded-2xl ${s.color.replace('text-', 'bg-')}/10 flex items-center justify-center ${s.color} mb-6 border border-current/10`}>
                <s.icon className="w-7 h-7" />
              </div>
              <span className="text-4xl font-black tracking-tighter text-white">{s.value}{s.label === 'Avg Score' ? '%' : ''}</span>
              <span className="text-[10px] font-black text-white/30 uppercase tracking-[0.2em] mt-2">{s.label}</span>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Main Info Column */}
            <div className="lg:col-span-2 space-y-8">
                {/* Detailed Sections */}
                <div className="bg-white/5 border border-white/10 rounded-[32px] overflow-hidden">
                    <div className="px-8 py-5 bg-white/[0.02] border-b border-white/10 flex items-center justify-between">
                        <h2 className="text-[10px] font-black text-white/40 uppercase tracking-[0.2em]">Contact Information</h2>
                        <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.5)]" />
                    </div>
                    <div className="p-8 grid grid-cols-1 sm:grid-cols-2 gap-10">
                        <div className="space-y-3">
                            <label className="text-[10px] font-black text-white/20 uppercase tracking-widest block">Primary Email</label>
                            <div className="flex items-center gap-4 text-xl font-bold group">
                                <EnvelopeIcon className="w-6 h-6 text-indigo-400 group-hover:scale-110 transition-transform" />
                                <span className="selection:bg-indigo-500">{profile.email}</span>
                            </div>
                        </div>
                        <div className="space-y-3">
                            <label className="text-[10px] font-black text-white/20 uppercase tracking-widest block">Phone Number</label>
                            {editing ? (
                                <input
                                    value={form.phone}
                                    onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
                                    placeholder="e.g. +234 800 000 0000"
                                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2 text-white outline-none focus:border-indigo-500"
                                />
                            ) : (
                                <div className="flex items-center gap-4 text-xl font-bold group">
                                    <PhoneIcon className="w-6 h-6 text-emerald-400 group-hover:scale-110 transition-transform" />
                                    <span className={profile.phone ? 'text-white' : 'text-white/20 italic font-medium'}>{profile.phone || 'None provided'}</span>
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* Role Specific Detailed Sections */}
                {profile.role === 'teacher' && schools.length > 0 && (
                  <div className="space-y-4">
                    <h3 className="text-[10px] font-black text-white/40 uppercase tracking-[0.2em] px-4">Affiliated Institutions</h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        {schools.map((s: any, i: number) => (
                          <div key={i} className="flex items-center gap-5 bg-white/5 border border-white/10 rounded-[28px] p-6 hover:bg-teal-500/5 hover:border-teal-500/30 transition-all group">
                            <div className="w-14 h-14 rounded-2xl bg-teal-500/10 border border-teal-500/20 flex items-center justify-center text-teal-400 group-hover:scale-110 transition-transform">
                                <BuildingOfficeIcon className="w-6 h-6" />
                            </div>
                            <div>
                              <p className="text-xl font-black text-white/90 truncate">{s.name}</p>
                              {s.city && <p className="text-xs font-bold text-white/30 uppercase tracking-widest mt-1">{s.city}</p>}
                            </div>
                          </div>
                        ))}
                    </div>
                  </div>
                )}

                {profile.role === 'student' && programmes.length > 0 && (
                  <div className="space-y-4">
                    <h3 className="text-[10px] font-black text-white/40 uppercase tracking-[0.2em] px-4">Active Learning Paths</h3>
                    <div className="flex flex-wrap gap-3">
                      {programmes.map((name, i) => (
                        <div key={i} className="px-6 py-3 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 font-black text-xs uppercase tracking-widest flex items-center gap-3">
                          <div className="w-2 h-2 rounded-full bg-indigo-400" />
                          {name}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
            </div>

            {/* Sidebar Column */}
            <div className="space-y-6">
                <div className="bg-[#10101a] border border-white/10 rounded-[32px] p-8 space-y-6 relative overflow-hidden">
                    <div className="absolute top-0 left-0 w-1 h-full bg-indigo-500/50" />
                    <h3 className="text-[10px] font-black text-white/40 uppercase tracking-[0.2em]">Quick Access</h3>
                    <div className="grid grid-cols-1 gap-2">
                        <Link href="/dashboard" className="flex items-center justify-between p-4 bg-white/5 rounded-2xl font-bold text-sm hover:bg-white/10 transition-all group">
                            <span>Dashboard</span>
                            <ChevronRightIcon className="w-4 h-4 text-white/20 group-hover:translate-x-1 transition-transform" />
                        </Link>
                        <Link href="/dashboard/settings" className="flex items-center justify-between p-4 bg-white/5 rounded-2xl font-bold text-sm hover:bg-white/10 transition-all group">
                            <span>Settings</span>
                            <ChevronRightIcon className="w-4 h-4 text-white/20 group-hover:translate-x-1 transition-transform" />
                        </Link>
                        {(profile.role === 'teacher' || profile.role === 'admin') && (
                          <Link href="/dashboard/students" className="flex items-center justify-between p-4 bg-white/5 rounded-2xl font-bold text-sm hover:bg-white/10 transition-all group">
                            <span>Manage Roster</span>
                            <ChevronRightIcon className="w-4 h-4 text-white/20 group-hover:translate-x-1 transition-transform" />
                          </Link>
                        )}
                        {profile.role === 'student' && (
                          <Link href="/dashboard/courses" className="flex items-center justify-between p-4 bg-white/5 rounded-2xl font-bold text-sm hover:bg-white/10 transition-all group">
                            <span>My Curriculum</span>
                            <ChevronRightIcon className="w-4 h-4 text-white/20 group-hover:translate-x-1 transition-transform" />
                          </Link>
                        )}
                    </div>
                </div>

                <div className="p-8 bg-gradient-to-br from-indigo-600/10 to-transparent border border-indigo-500/20 rounded-[32px] space-y-4">
                    <RocketLaunchIcon className="w-8 h-8 text-indigo-400" />
                    <h4 className="font-black text-white">Unlock New Skills</h4>
                    <p className="text-xs font-medium text-white/40 leading-relaxed">Your progress is being tracked across all programmes. Keep pushing boundaries to reach of your full potential.</p>
                </div>
            </div>
        </div>
      </div>
    </div>
  );
}
