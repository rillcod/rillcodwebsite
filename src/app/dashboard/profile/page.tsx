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
} from '@/lib/icons';

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
        // Students: count from applications table + portal_users with student role, take the max
        db.from('students').select('id', { count: 'exact', head: true }).eq('school_id', profile.school_id),
        db.from('portal_users').select('id', { count: 'exact', head: true }).eq('role', 'student').eq('school_id', profile.school_id),
        // Teachers: count from junction table + directly assigned portal teachers
        db.from('teacher_schools').select('id', { count: 'exact', head: true }).eq('school_id', profile.school_id),
        db.from('portal_users').select('id', { count: 'exact', head: true }).eq('role', 'teacher').eq('school_id', profile.school_id),
        db.from('programs').select('id', { count: 'exact', head: true }).eq('is_active', true),
      ]).then(([stuApps, stuPortal, teaJunction, teaDirect, prog]) => {
        const students = Math.max(stuApps.count ?? 0, stuPortal.count ?? 0);
        const teachers = Math.max(teaJunction.count ?? 0, teaDirect.count ?? 0);
        setStats({ students, teachers, programmes: prog.count ?? 0 });
      });
    }
  }, [profile?.id]);

  const handleSave = async () => {
    if (!profile) return;
    setSaving(true);
    await fetch(`/api/portal-users/${profile.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        full_name: form.full_name.trim(),
        phone: form.phone.trim() || null,
        bio: form.bio.trim() || null,
      }),
    });
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
    await fetch(`/api/portal-users/${profile.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ avatar_url: url }),
    });
    setAvatarUrl(url);
    await refreshProfile?.();
    setUploadingAvatar(false);
  };

  if (!profile) return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin" />
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
      { label: 'Courses', value: stats.enrolled ?? 0, icon: BookOpenIcon, color: 'text-indigo-400' },
      { label: 'Work Submitted', value: stats.submissions ?? 0, icon: ClipboardDocumentListIcon, color: 'text-amber-400' },
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
      { label: 'Schools', value: stats.schools ?? 0, icon: BuildingOfficeIcon, color: 'text-primary' },
      { label: 'Programmes', value: stats.programmes ?? 0, icon: BookOpenIcon, color: 'text-amber-400' },
    );
  }

  return (
    <div className="bg-background text-foreground selection:bg-indigo-500 selection:text-foreground pb-20">
      <div className="max-w-5xl mx-auto px-6 sm:px-12 py-12 md:py-16 space-y-10 animate-in fade-in slide-in-from-bottom-4 duration-700">

        {/* Header card */}
        <div className="relative overflow-hidden group">
            <div className="bg-card border border-border rounded-none p-8 md:p-12 flex flex-col md:flex-row items-center md:items-start gap-10 shadow-2xl">
              {/* Avatar Section */}
              <div className="relative shrink-0">
                <div className={`w-32 h-32 md:w-44 md:h-44 ${profile.role === 'teacher' ? 'bg-teal-600' : 'bg-indigo-600'} border-4 border-border rounded-none overflow-hidden flex items-center justify-center text-5xl md:text-7xl font-black text-foreground uppercase shadow-2xl`}>
                    {avatarUrl
                      ? <Image src={avatarUrl} alt={profile.full_name ?? 'Avatar'} fill className="object-cover" unoptimized />
                      : (profile.full_name?.charAt(0) ?? 'U')
                    }
                </div>
                {/* Upload button */}
                <button
                  onClick={() => avatarInputRef.current?.click()}
                  disabled={uploadingAvatar}
                  className="absolute -bottom-2 -left-2 bg-background border border-border p-3 rounded-none shadow-xl hover:bg-muted transition-colors disabled:opacity-50"
                  title="Change profile photo"
                >
                  {uploadingAvatar
                    ? <ArrowPathIcon className="w-5 h-5 text-muted-foreground animate-spin" />
                    : <CameraIcon className="w-5 h-5 text-muted-foreground" />
                  }
                </button>
                <input ref={avatarInputRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={handleAvatarChange} />
                <div className="absolute -bottom-2 -right-2 bg-background border border-border p-3 rounded-none shadow-xl">
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
                        className="text-3xl md:text-5xl font-black bg-card shadow-sm border border-border rounded-none px-6 py-2 text-foreground outline-none focus:border-indigo-500 w-full"
                        autoFocus
                      />
                    ) : (
                      <h1 className="text-4xl md:text-6xl font-black tracking-tight leading-tight">{profile.full_name}</h1>
                    )}
                    <div className="flex flex-wrap items-center justify-center md:justify-start gap-3 mt-4">
                      <span className={`px-5 py-1.5 rounded-full text-[10px] font-black border uppercase tracking-[0.2em] shadow-lg ${roleColor[profile.role]}`}>
                        {profile.role}
                      </span>
                      <span className="text-sm font-medium text-muted-foreground lowercase tracking-tight">{profile.email}</span>
                    </div>
                </div>

                {!editing && profile.bio && (
                    <p className="text-lg text-muted-foreground max-w-2xl leading-relaxed italic border-l-2 border-border pl-6">
                        "{profile.bio}"
                    </p>
                )}
                
                {editing && (
                    <textarea
                        rows={3}
                        value={form.bio}
                        onChange={e => setForm(f => ({ ...f, bio: e.target.value }))}
                        placeholder="Write a short bio about yourself..."
                        className="w-full bg-card shadow-sm border border-border rounded-none p-6 text-foreground outline-none focus:border-indigo-500 resize-none text-lg"
                    />
                )}

                <div className="flex items-center justify-center md:justify-start gap-4 pt-4">
                    {editing ? (
                      <>
                        <button onClick={() => setEditing(false)} className="px-8 py-3 text-xs font-black uppercase tracking-widest text-muted-foreground hover:text-foreground transition-colors bg-card shadow-sm rounded-none">
                          Cancel
                        </button>
                        <button onClick={handleSave} disabled={saving} className={`flex items-center gap-2 px-10 py-3 text-xs font-black uppercase tracking-widest text-foreground ${profile.role === 'teacher' ? 'bg-teal-600 hover:bg-teal-500' : 'bg-indigo-600 hover:bg-indigo-500'} rounded-none transition-all shadow-xl disabled:opacity-50`}>
                          {saving ? <ArrowPathIcon className="w-4 h-4 animate-spin" /> : <CheckIcon className="w-4 h-4" />}
                          Save Changes
                        </button>
                      </>
                    ) : (
                      <button onClick={() => setEditing(true)} className="flex items-center gap-2 px-8 py-3 text-xs font-black uppercase tracking-widest text-muted-foreground bg-card shadow-sm hover:bg-muted border border-border rounded-none transition-all">
                        <PencilSquareIcon className="w-4 h-4" /> Edit Profile
                      </button>
                    )}
                </div>
              </div>
            </div>
        </div>

        {/* Stats Grid */}
        <div className={`grid grid-cols-2 gap-6 ${statCards.length >= 4 ? 'lg:grid-cols-4' : 'sm:grid-cols-3'}`}>
          {statCards.map(s => (
            <div key={s.label} className="bg-card shadow-sm border border-border rounded-none p-8 flex flex-col items-center justify-center text-center group hover:bg-white/[0.08] transition-all relative overflow-hidden">
              <div className={`absolute -right-4 -top-4 w-24 h-24 ${s.color.replace('text-', 'bg-')}/5 rounded-full blur-2xl group-hover:scale-150 transition-transform duration-700`} />
              <div className={`w-14 h-14 rounded-none ${s.color.replace('text-', 'bg-')}/10 flex items-center justify-center ${s.color} mb-6 border border-current/10`}>
                <s.icon className="w-7 h-7" />
              </div>
              <span className="text-4xl font-black tracking-tighter text-foreground">{s.value}{s.label === 'Avg Score' ? '%' : ''}</span>
              <span className="text-[10px] font-black text-muted-foreground uppercase tracking-[0.2em] mt-2">{s.label}</span>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Main Info Column */}
            <div className="lg:col-span-2 space-y-8">
                {/* Detailed Sections */}
                <div className="bg-card shadow-sm border border-border rounded-none overflow-hidden">
                    <div className="px-8 py-5 bg-white/[0.02] border-b border-border flex items-center justify-between">
                        <h2 className="text-[10px] font-black text-muted-foreground uppercase tracking-[0.2em]">Contact Information</h2>
                        <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.5)]" />
                    </div>
                    <div className="p-8 grid grid-cols-1 sm:grid-cols-2 gap-10">
                        <div className="space-y-3">
                            <label className="text-[10px] font-black text-muted-foreground uppercase tracking-widest block">Primary Email</label>
                            <div className="flex items-center gap-4 text-xl font-bold group min-w-0">
                                <EnvelopeIcon className="w-6 h-6 text-indigo-400 group-hover:scale-110 transition-transform shrink-0" />
                                <span className="selection:bg-indigo-500 truncate">{profile.email}</span>
                            </div>
                        </div>
                        <div className="space-y-3">
                            <label className="text-[10px] font-black text-muted-foreground uppercase tracking-widest block">Phone Number</label>
                            {editing ? (
                                <input
                                    value={form.phone}
                                    onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
                                    placeholder="e.g. +234 800 000 0000"
                                    className="w-full bg-card shadow-sm border border-border rounded-none px-4 py-2 text-foreground outline-none focus:border-indigo-500"
                                />
                            ) : (
                                <div className="flex items-center gap-4 text-xl font-bold group">
                                    <PhoneIcon className="w-6 h-6 text-emerald-400 group-hover:scale-110 transition-transform" />
                                    <span className={profile.phone ? 'text-foreground' : 'text-muted-foreground italic font-medium'}>{profile.phone || 'None provided'}</span>
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* Role Specific Detailed Sections */}
                {profile.role === 'teacher' && schools.length > 0 && (
                  <div className="space-y-4">
                    <h3 className="text-[10px] font-black text-muted-foreground uppercase tracking-[0.2em] px-4">Affiliated Institutions</h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        {schools.map((s: any, i: number) => (
                          <div key={i} className="flex items-center gap-5 bg-card shadow-sm border border-border rounded-none p-6 hover:bg-teal-500/5 hover:border-teal-500/30 transition-all group">
                            <div className="w-14 h-14 rounded-none bg-teal-500/10 border border-teal-500/20 flex items-center justify-center text-teal-400 group-hover:scale-110 transition-transform">
                                <BuildingOfficeIcon className="w-6 h-6" />
                            </div>
                            <div className="min-w-0">
                              <p className="text-xl font-black text-muted-foreground truncate">{s.name}</p>
                              {s.city && <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest mt-1">{s.city}</p>}
                            </div>
                          </div>
                        ))}
                    </div>
                  </div>
                )}

                {profile.role === 'student' && programmes.length > 0 && (
                  <div className="space-y-4">
                    <h3 className="text-[10px] font-black text-muted-foreground uppercase tracking-[0.2em] px-4">My Courses</h3>
                    <div className="flex flex-wrap gap-3">
                      {programmes.map((name, i) => (
                        <div key={i} className="px-5 py-2.5 rounded-none bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 font-bold text-sm flex items-center gap-2">
                          <BookOpenIcon className="w-4 h-4 flex-shrink-0" />
                          {name}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
            </div>

            {/* Sidebar Column */}
            <div className="space-y-6">
                <div className="bg-card border border-border rounded-none p-8 space-y-6 relative overflow-hidden">
                    <div className="absolute top-0 left-0 w-1 h-full bg-indigo-500/50" />
                    <h3 className="text-[10px] font-black text-muted-foreground uppercase tracking-[0.2em]">Quick Access</h3>
                    <div className="grid grid-cols-1 gap-2">
                        <Link href="/dashboard" className="flex items-center justify-between p-4 bg-card shadow-sm rounded-none font-bold text-sm hover:bg-muted transition-all group">
                            <span>Dashboard</span>
                            <ChevronRightIcon className="w-4 h-4 text-muted-foreground group-hover:translate-x-1 transition-transform" />
                        </Link>
                        <Link href="/dashboard/settings" className="flex items-center justify-between p-4 bg-card shadow-sm rounded-none font-bold text-sm hover:bg-muted transition-all group">
                            <span>Settings</span>
                            <ChevronRightIcon className="w-4 h-4 text-muted-foreground group-hover:translate-x-1 transition-transform" />
                        </Link>
                        {(profile.role === 'teacher' || profile.role === 'admin') && (
                          <Link href="/dashboard/students" className="flex items-center justify-between p-4 bg-card shadow-sm rounded-none font-bold text-sm hover:bg-muted transition-all group">
                            <span>My Students</span>
                            <ChevronRightIcon className="w-4 h-4 text-muted-foreground group-hover:translate-x-1 transition-transform" />
                          </Link>
                        )}
                        {profile.role === 'student' && (
                          <Link href="/dashboard/courses" className="flex items-center justify-between p-4 bg-card shadow-sm rounded-none font-bold text-sm hover:bg-muted transition-all group">
                            <span>My Courses</span>
                            <ChevronRightIcon className="w-4 h-4 text-muted-foreground group-hover:translate-x-1 transition-transform" />
                          </Link>
                        )}
                    </div>
                </div>

                {profile.role === 'student' ? (
                  <div className="p-8 bg-gradient-to-br from-indigo-600/10 to-transparent border border-indigo-500/20 rounded-none space-y-3">
                    <RocketLaunchIcon className="w-8 h-8 text-indigo-400" />
                    <h4 className="font-black text-foreground">Keep Going</h4>
                    <p className="text-sm text-muted-foreground leading-relaxed">
                      Your scores and submitted work are saved here. Open any course to continue where you left off.
                    </p>
                    <Link href="/dashboard/courses" className="inline-flex items-center gap-2 text-xs font-black uppercase tracking-widest text-indigo-400 hover:text-indigo-300 transition-colors pt-1">
                      Go to my courses <ChevronRightIcon className="w-3.5 h-3.5" />
                    </Link>
                  </div>
                ) : (
                  <div className="p-8 bg-gradient-to-br from-indigo-600/10 to-transparent border border-indigo-500/20 rounded-none space-y-3">
                    <RocketLaunchIcon className="w-8 h-8 text-indigo-400" />
                    <h4 className="font-black text-foreground">Learning Center</h4>
                    <p className="text-sm text-muted-foreground leading-relaxed">
                      Manage classes, lessons, and student progress from your dashboard.
                    </p>
                  </div>
                )}
            </div>
        </div>
      </div>
    </div>
  );
}
