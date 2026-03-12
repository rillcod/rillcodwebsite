'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/auth-context';
import { createClient } from '@/lib/supabase/client';
import {
  UserIcon, BellIcon, ShieldCheckIcon, CogIcon,
  EyeIcon, EyeSlashIcon, CameraIcon, PencilIcon,
  CheckIcon, KeyIcon, EnvelopeIcon, PhoneIcon,
  ExclamationTriangleIcon, CheckCircleIcon, ArrowPathIcon,
  BuildingOfficeIcon, MapPinIcon, StarIcon,
} from '@heroicons/react/24/outline';

const BASE_TABS = [
  { id: 'profile', label: 'Profile', icon: UserIcon },
  { id: 'security', label: 'Security', icon: ShieldCheckIcon },
  { id: 'notifications', label: 'Notifications', icon: BellIcon },
];

export default function SettingsPage() {
  const { profile, refreshProfile, loading: authLoading } = useAuth();
  const [tab, setTab] = useState('profile');
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showPw, setShowPw] = useState(false);
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);
  const [schools, setSchools] = useState<any[]>([]);
  const [schoolsLoading, setSchoolsLoading] = useState(false);

  // Teacher sees a Schools tab too
  const TABS = profile?.role === 'teacher'
    ? [...BASE_TABS, { id: 'schools', label: 'My Schools', icon: BuildingOfficeIcon }]
    : BASE_TABS;

  const [profileData, setProfileData] = useState({
    full_name: '', email: '', phone: '', bio: '',
  });

  const [pwData, setPwData] = useState({
    newPw: '', confirm: '',
  });

  const [notifs, setNotifs] = useState<Record<string, boolean>>(() => {
    try {
      const saved = localStorage.getItem('rillcod_notif_prefs');
      if (saved) return JSON.parse(saved);
    } catch { }
    return { assignments: true, grades: true, announcements: true, newsletters: false };
  });

  // Populate from profile
  useEffect(() => {
    if (profile) {
      setProfileData({
        full_name: profile.full_name ?? '',
        email: profile.email ?? '',
        phone: profile.phone ?? '',
        bio: profile.bio ?? '',
      });
    }
  }, [profile]);

  // Fetch teacher's assigned schools
  useEffect(() => {
    if (!profile || profile.role !== 'teacher') return;
    let cancelled = false;
    setSchoolsLoading(true);
    createClient()
      .from('teacher_schools')
      .select('id, is_primary, assigned_at, notes, schools(id, name, city, state, phone, email, is_active)')
      .eq('teacher_id', profile.id)
      .order('is_primary', { ascending: false })
      .then(({ data }) => {
        if (!cancelled) setSchools(data ?? []);
        setSchoolsLoading(false);
      });
    return () => { cancelled = true; };
  }, [profile?.id]);

  const showToast = (msg: string, ok = true) => {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 3500);
  };

  const saveProfile = async () => {
    setSaving(true);
    try {
      const { error } = await createClient()
        .from('portal_users')
        .update({
          full_name: profileData.full_name,
          phone: profileData.phone,
          bio: profileData.bio,
        })
        .eq('id', profile?.id || '');
      if (error) throw error;
      await refreshProfile();
      setEditing(false);
      showToast('Profile updated successfully');
    } catch (e: any) {
      showToast(e.message ?? 'Failed to save profile', false);
    } finally {
      setSaving(false);
    }
  };

  const changePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pwData.newPw !== pwData.confirm) { showToast('New passwords do not match', false); return; }
    if (pwData.newPw.length < 8) { showToast('Password must be at least 8 characters', false); return; }
    setSaving(true);
    try {
      const { error } = await createClient().auth.updateUser({ password: pwData.newPw });
      if (error) throw error;
      setPwData({ newPw: '', confirm: '' });
      showToast('Password changed successfully');
    } catch (e: any) {
      showToast(e.message ?? 'Failed to change password', false);
    } finally {
      setSaving(false);
    }
  };

  const roleColor: Record<string, string> = {
    admin: 'bg-red-500/20 text-red-400 border-red-500/30',
    teacher: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
    student: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
  };

  if (authLoading) return (
    <div className="min-h-screen bg-[#0f0f1a] flex items-center justify-center">
      <div className="w-10 h-10 border-4 border-white/10 border-t-violet-500 rounded-full animate-spin" />
    </div>
  );
  if (!profile) return null;

  return (
    <div className="min-h-screen bg-[#0f0f1a] text-white">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">

        {/* Header */}
        <div>
          <div className="flex items-center gap-2 mb-1">
            <CogIcon className="w-5 h-5 text-violet-400" />
            <span className="text-xs font-bold text-violet-400 uppercase tracking-widest">Account Settings</span>
          </div>
          <h1 className="text-3xl font-extrabold">Settings</h1>
          <p className="text-white/40 text-sm mt-1">Manage your account preferences and security</p>
        </div>

        {/* Toast */}
        {toast && (
          <div className={`flex items-center gap-3 px-4 py-3 rounded-xl border text-sm font-semibold
            ${toast.ok
              ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
              : 'bg-rose-500/10 border-rose-500/20 text-rose-400'}`}>
            {toast.ok
              ? <CheckCircleIcon className="w-4 h-4 flex-shrink-0" />
              : <ExclamationTriangleIcon className="w-4 h-4 flex-shrink-0" />}
            {toast.msg}
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">

          {/* ── Sidebar ── */}
          <div className="lg:col-span-1 space-y-4">

            {/* Avatar card */}
            <div className="bg-white/5 border border-white/10 rounded-2xl p-5 text-center">
              <div className="relative inline-block mb-4">
                <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-violet-600 to-blue-600 flex items-center justify-center text-2xl font-black text-white mx-auto">
                  {(profile.full_name ?? 'U')[0].toUpperCase()}
                </div>
                <button className="absolute -bottom-1 -right-1 w-7 h-7 bg-[#0f0f1a] border border-white/10 rounded-lg flex items-center justify-center hover:bg-white/10 transition-colors">
                  <CameraIcon className="w-3.5 h-3.5 text-white/50" />
                </button>
              </div>
              <p className="font-bold text-white text-sm truncate">{profile.full_name}</p>
              <p className="text-xs text-white/40 mt-0.5 truncate">{profile.email}</p>
              <span className={`inline-block mt-2 px-2.5 py-0.5 rounded-full text-xs font-bold border capitalize
                ${roleColor[profile.role] ?? 'bg-white/10 text-white/40 border-white/10'}`}>
                {profile.role}
              </span>
            </div>

            {/* Tabs */}
            <nav className="bg-white/5 border border-white/10 rounded-2xl p-2 space-y-1">
              {TABS.map(t => (
                <button key={t.id} onClick={() => setTab(t.id)}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-bold transition-all
                    ${tab === t.id ? 'bg-violet-600 text-white shadow-lg shadow-violet-600/20' : 'text-white/50 hover:bg-white/5 hover:text-white'}`}>
                  <t.icon className="w-4 h-4" />
                  {t.label}
                </button>
              ))}
            </nav>
          </div>

          {/* ── Content ── */}
          <div className="lg:col-span-3">

            {/* Profile tab */}
            {tab === 'profile' && (
              <div className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden">
                <div className="flex items-center justify-between p-6 border-b border-white/10">
                  <div>
                    <h2 className="font-bold text-white">Profile Information</h2>
                    <p className="text-xs text-white/40 mt-0.5">Update your personal details</p>
                  </div>
                  {!editing ? (
                    <button onClick={() => setEditing(true)}
                      className="flex items-center gap-2 px-4 py-2 bg-white/10 hover:bg-white/15 rounded-xl text-sm font-bold transition-colors">
                      <PencilIcon className="w-3.5 h-3.5" /> Edit
                    </button>
                  ) : (
                    <div className="flex gap-2">
                      <button onClick={() => { setEditing(false); }}
                        className="px-4 py-2 bg-white/5 hover:bg-white/10 rounded-xl text-sm font-bold text-white/50 transition-colors">
                        Cancel
                      </button>
                      <button onClick={saveProfile} disabled={saving}
                        className="flex items-center gap-2 px-4 py-2 bg-violet-600 hover:bg-violet-500 rounded-xl text-sm font-bold transition-colors disabled:opacity-50">
                        {saving ? <ArrowPathIcon className="w-3.5 h-3.5 animate-spin" /> : <CheckIcon className="w-3.5 h-3.5" />}
                        Save
                      </button>
                    </div>
                  )}
                </div>

                <div className="p-6 space-y-5">
                  {/* Full name */}
                  <div>
                    <label className="block text-xs font-semibold text-white/40 uppercase tracking-widest mb-1.5">Full Name</label>
                    {editing ? (
                      <input type="text" value={profileData.full_name}
                        onChange={e => setProfileData(p => ({ ...p, full_name: e.target.value }))}
                        className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-sm text-white focus:outline-none focus:border-violet-500 transition-colors" />
                    ) : (
                      <p className="text-white font-semibold">{profileData.full_name || '—'}</p>
                    )}
                  </div>

                  {/* Email - always read-only */}
                  <div>
                    <label className="block text-xs font-semibold text-white/40 uppercase tracking-widest mb-1.5">Email Address</label>
                    <div className="flex items-center gap-2">
                      <EnvelopeIcon className="w-4 h-4 text-white/20" />
                      <p className="text-white/60 text-sm">{profileData.email}</p>
                      <span className="text-[10px] font-bold px-2 py-0.5 bg-white/5 border border-white/10 rounded-full text-white/30">Cannot edit</span>
                    </div>
                  </div>

                  {/* Phone */}
                  <div>
                    <label className="block text-xs font-semibold text-white/40 uppercase tracking-widest mb-1.5">Phone Number</label>
                    {editing ? (
                      <div className="relative">
                        <PhoneIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/20" />
                        <input type="tel" value={profileData.phone}
                          onChange={e => setProfileData(p => ({ ...p, phone: e.target.value }))}
                          placeholder="+234 800 000 0000"
                          className="w-full pl-10 pr-4 py-3 bg-white/5 border border-white/10 rounded-xl text-sm text-white focus:outline-none focus:border-violet-500 transition-colors placeholder-white/20" />
                      </div>
                    ) : (
                      <p className="text-white font-semibold">{profileData.phone || <span className="text-white/30">Not set</span>}</p>
                    )}
                  </div>

                  {/* Bio */}
                  <div>
                    <label className="block text-xs font-semibold text-white/40 uppercase tracking-widest mb-1.5">Bio</label>
                    {editing ? (
                      <textarea value={profileData.bio} rows={3}
                        onChange={e => setProfileData(p => ({ ...p, bio: e.target.value }))}
                        placeholder="Tell us a little about yourself…"
                        className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-sm text-white focus:outline-none focus:border-violet-500 transition-colors resize-none placeholder-white/20" />
                    ) : (
                      <p className="text-white/60 text-sm leading-relaxed">{profileData.bio || <span className="text-white/20">No bio yet</span>}</p>
                    )}
                  </div>

                  {/* Role (read-only) */}
                  <div className="pt-4 border-t border-white/10">
                    <label className="block text-xs font-semibold text-white/40 uppercase tracking-widest mb-1.5">Account Role</label>
                    <span className={`inline-block px-3 py-1 rounded-full text-sm font-bold border capitalize
                      ${roleColor[profile.role] ?? 'bg-white/10 text-white/40 border-white/10'}`}>
                      {profile.role}
                    </span>
                    <p className="text-xs text-white/20 mt-1.5">Contact an admin to change your role.</p>
                  </div>
                </div>
              </div>
            )}

            {/* Security tab */}
            {tab === 'security' && (
              <div className="space-y-4">
                <div className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden">
                  <div className="p-6 border-b border-white/10">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-violet-500/20 rounded-xl flex items-center justify-center">
                        <KeyIcon className="w-5 h-5 text-violet-400" />
                      </div>
                      <div>
                        <h2 className="font-bold text-white">Change Password</h2>
                        <p className="text-xs text-white/40 mt-0.5">You are already signed in — no current password needed</p>
                      </div>
                    </div>
                  </div>
                  <form onSubmit={changePassword} className="p-6 space-y-4">
                    {(['newPw', 'confirm'] as const).map((field) => (
                      <div key={field}>
                        <label className="block text-xs font-semibold text-white/40 uppercase tracking-widest mb-1.5">
                          {field === 'newPw' ? 'New Password' : 'Confirm New Password'}
                        </label>
                        <div className="relative">
                          <input
                            type={showPw ? 'text' : 'password'}
                            value={pwData[field]}
                            onChange={e => setPwData(p => ({ ...p, [field]: e.target.value }))}
                            required
                            minLength={8}
                            placeholder="Minimum 8 characters"
                            className="w-full pl-4 pr-10 py-3 bg-white/5 border border-white/10 rounded-xl text-sm text-white focus:outline-none focus:border-violet-500 transition-colors placeholder-white/20"
                          />
                          <button type="button" onClick={() => setShowPw(v => !v)}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/60 transition-colors">
                            {showPw ? <EyeSlashIcon className="w-4 h-4" /> : <EyeIcon className="w-4 h-4" />}
                          </button>
                        </div>
                      </div>
                    ))}

                    {pwData.newPw && pwData.confirm && (
                      <p className={`text-xs font-semibold flex items-center gap-1.5 ${pwData.newPw === pwData.confirm ? 'text-emerald-400' : 'text-rose-400'}`}>
                        {pwData.newPw === pwData.confirm ? <CheckIcon className="w-3.5 h-3.5" /> : '✗'}
                        {pwData.newPw === pwData.confirm ? 'Passwords match' : 'Passwords do not match'}
                      </p>
                    )}

                    <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-3 text-xs text-amber-400">
                      For security, you will be signed out of other devices after changing your password.
                    </div>

                    <button type="submit" disabled={saving || pwData.newPw !== pwData.confirm || pwData.newPw.length < 8}
                      className="flex items-center gap-2 px-6 py-3 bg-violet-600 hover:bg-violet-500 rounded-xl text-sm font-bold transition-all disabled:opacity-50">
                      {saving ? <ArrowPathIcon className="w-4 h-4 animate-spin" /> : <ShieldCheckIcon className="w-4 h-4" />}
                      Update Password
                    </button>
                  </form>
                </div>

                {/* Active Sessions Info */}
                <div className="bg-white/5 border border-white/10 rounded-2xl p-6 space-y-3">
                  <h3 className="font-bold text-white flex items-center gap-2">
                    <ShieldCheckIcon className="w-4 h-4 text-blue-400" /> Account Security
                  </h3>
                  <div className="space-y-2 text-sm">
                    <div className="flex items-center justify-between py-2 border-b border-white/5">
                      <span className="text-white/50">Email</span>
                      <span className="text-white/80 font-medium">{profile.email}</span>
                    </div>
                    <div className="flex items-center justify-between py-2 border-b border-white/5">
                      <span className="text-white/50">Role</span>
                      <span className="capitalize font-bold text-violet-400">{profile.role}</span>
                    </div>
                    <div className="flex items-center justify-between py-2">
                      <span className="text-white/50">Account Status</span>
                      <span className="text-emerald-400 font-bold flex items-center gap-1">
                        <CheckIcon className="w-3.5 h-3.5" /> Active
                      </span>
                    </div>
                  </div>
                  <p className="text-xs text-white/20 pt-1">
                    Contact an admin if you suspect unauthorised access to your account.
                  </p>
                </div>
              </div>
            )}

            {/* Notifications tab */}
            {tab === 'notifications' && (
              <div className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden">
                <div className="p-6 border-b border-white/10">
                  <h2 className="font-bold text-white">Notification Preferences</h2>
                  <p className="text-xs text-white/40 mt-0.5">Choose what you want to be notified about</p>
                </div>
                <div className="p-6 space-y-4">
                  {(Object.entries(notifs)).map(([key, val]) => (
                    <div key={key} className="flex items-center justify-between py-3 border-b border-white/5 last:border-0">
                      <div>
                        <p className="font-semibold text-white capitalize text-sm">{key}</p>
                        <p className="text-xs text-white/30 mt-0.5">
                          {key === 'assignments' && 'New assignments and due date reminders'}
                          {key === 'grades' && 'When your submissions are graded'}
                          {key === 'announcements' && 'Important school announcements'}
                          {key === 'newsletters' && 'Monthly newsletters and updates'}
                        </p>
                      </div>
                      <button onClick={() => setNotifs(p => ({ ...p, [key]: !val }))}
                        className={`relative w-11 h-6 rounded-full transition-all ${val ? 'bg-violet-600' : 'bg-white/10'}`}>
                        <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-all ${val ? 'left-5.5 translate-x-0.5' : 'left-0.5'}`} />
                      </button>
                    </div>
                  ))}
                  <button
                    onClick={() => {
                      try {
                        localStorage.setItem('rillcod_notif_prefs', JSON.stringify(notifs));
                        showToast('Notification preferences saved');
                      } catch {
                        showToast('Failed to save preferences', false);
                      }
                    }}
                    className="flex items-center gap-2 px-5 py-2.5 bg-violet-600 hover:bg-violet-500 rounded-xl text-sm font-bold transition-all mt-4">
                    <CheckIcon className="w-4 h-4" /> Save Preferences
                  </button>
                </div>
              </div>
            )}

            {/* ── Schools tab (teacher only) ── */}
            {tab === 'schools' && profile?.role === 'teacher' && (
              <div className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden">
                <div className="p-6 border-b border-white/10 flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-2 mb-0.5">
                      <BuildingOfficeIcon className="w-4 h-4 text-blue-400" />
                      <h2 className="font-bold text-white">Assigned Schools</h2>
                    </div>
                    <p className="text-xs text-white/40">Partner schools you currently teach at</p>
                  </div>
                  <span className="text-xs font-bold text-blue-400 bg-blue-500/10 border border-blue-500/20 px-2.5 py-1 rounded-full">
                    {schools.length} school{schools.length !== 1 ? 's' : ''}
                  </span>
                </div>

                {schoolsLoading ? (
                  <div className="p-8 flex items-center justify-center">
                    <div className="w-7 h-7 border-4 border-white/10 border-t-blue-400 rounded-full animate-spin" />
                  </div>
                ) : schools.length === 0 ? (
                  <div className="p-10 text-center">
                    <BuildingOfficeIcon className="w-12 h-12 mx-auto text-white/10 mb-3" />
                    <p className="text-white/30 font-semibold">No schools assigned yet</p>
                    <p className="text-white/20 text-xs mt-1">Ask an admin to assign you to a partner school.</p>
                  </div>
                ) : (
                  <div className="divide-y divide-white/5">
                    {schools.map((ts: any) => {
                      const s = ts.schools ?? {};
                      return (
                        <div key={ts.id} className="p-5 hover:bg-white/5 transition-colors">
                          <div className="flex items-start gap-4">
                            <div className="w-11 h-11 rounded-xl bg-blue-500/15 border border-blue-500/20 flex items-center justify-center flex-shrink-0">
                              <BuildingOfficeIcon className="w-5 h-5 text-blue-400" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap mb-1">
                                <p className="font-bold text-white">{s.name}</p>
                                {ts.is_primary && (
                                  <span className="flex items-center gap-1 px-2 py-0.5 bg-amber-500/20 text-amber-400 text-xs font-bold rounded-full border border-amber-500/30">
                                    <StarIcon className="w-3 h-3" /> Primary
                                  </span>
                                )}
                                <span className={`px-2 py-0.5 text-xs font-bold rounded-full border ${s.is_active
                                  ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
                                  : 'bg-white/10 text-white/30 border-white/10'
                                  }`}>
                                  {s.is_active ? 'Active' : 'Inactive'}
                                </span>
                              </div>
                              <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-white/40">
                                {(s.city || s.state) && (
                                  <span className="flex items-center gap-1">
                                    <MapPinIcon className="w-3.5 h-3.5" />
                                    {[s.city, s.state].filter(Boolean).join(', ')}
                                  </span>
                                )}
                                {s.phone && (
                                  <span>{s.phone}</span>
                                )}
                                {s.email && (
                                  <span>{s.email}</span>
                                )}
                              </div>
                              {ts.notes && (
                                <p className="text-xs text-white/30 mt-1.5 italic">{ts.notes}</p>
                              )}
                              <p className="text-xs text-white/20 mt-1">
                                Assigned {ts.assigned_at ? new Date(ts.assigned_at).toLocaleDateString() : '—'}
                              </p>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                <div className="p-4 border-t border-white/10 bg-white/[0.02]">
                  <p className="text-xs text-white/20 text-center">
                    Contact an admin to update your school assignments.
                  </p>
                </div>
              </div>
            )}

          </div>
        </div>
      </div>
    </div>
  );
}