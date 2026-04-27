// @refresh reset
'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/auth-context';
import { createClient } from '@/lib/supabase/client';
import {
  UserIcon, BellIcon, ShieldCheckIcon, CogIcon,
  EyeIcon, EyeSlashIcon, CameraIcon, PencilIcon,
  CheckIcon, KeyIcon, EnvelopeIcon, PhoneIcon,
  ExclamationTriangleIcon, CheckCircleIcon, ArrowPathIcon,
  BuildingOfficeIcon, MapPinIcon, StarIcon, CpuChipIcon,
  DocumentTextIcon, ExclamationCircleIcon, TableCellsIcon,
  CommandLineIcon, XMarkIcon,
} from '@/lib/icons';

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
  const [pushState, setPushState] = useState<string>('default');
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);
  const [schools, setSchools] = useState<any[]>([]);
  const [schoolsLoading, setSchoolsLoading] = useState(false);
  const [avatarUploading, setAvatarUploading] = useState(false);

  // Teacher sees Schools tab; Admin sees extra management tabs
  const TABS = profile?.role === 'teacher'
    ? [...BASE_TABS, { id: 'schools', label: 'My Schools', icon: BuildingOfficeIcon }]
    : profile?.role === 'admin'
      ? [
          ...BASE_TABS,
          { id: 'ai-config',   label: 'AI Config',   icon: CpuChipIcon },
          { id: 'templates',   label: 'Templates',   icon: DocumentTextIcon },
          { id: 'lms-config',  label: 'LMS Config',  icon: CogIcon },
          { id: 'moderation',  label: 'Moderation',  icon: ExclamationCircleIcon },
          { id: 'audit-log',   label: 'Audit Log',   icon: TableCellsIcon },
          { id: 'repair',      label: 'Database Repair', icon: CommandLineIcon },
        ]
      : BASE_TABS;

  // ── AI Config state (admin only) ────────────────────────────
  const [aiSettings, setAiSettings] = useState<Record<string, string>>({});
  const [aiLoading, setAiLoading] = useState(false);
  const [aiSaving, setAiSaving] = useState(false);

  // ── Notification Templates state (admin only) ────────────────
  const [templates, setTemplates] = useState<any[]>([]);
  const [templatesLoading, setTemplatesLoading] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<any | null>(null);
  const [templateSaving, setTemplateSaving] = useState(false);

  // ── Moderation state (admin only) ────────────────────────────
  const [flaggedItems, setFlaggedItems] = useState<any[]>([]);
  const [moderationLoading, setModerationLoading] = useState(false);
  const [resolvingId, setResolvingId] = useState<string | null>(null);

  // ── Audit Log state (admin only) ─────────────────────────────
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [auditLoading, setAuditLoading] = useState(false);

  // ── Repair Tools state (admin only) ──────────────────────────
  const [mismatches, setMismatches] = useState<any[]>([]);
  const [repairLoading, setRepairLoading] = useState(false);
  const [repairing, setRepairing] = useState(false);

  useEffect(() => {
    if (profile?.role !== 'admin' || (tab !== 'ai-config' && tab !== 'lms-config')) return;
    setAiLoading(true);
    fetch('/api/app-settings')
      .then(r => r.json())
      .then(d => {
        const map: Record<string, string> = {};
        (d.data ?? []).forEach((row: any) => { map[row.key] = row.value ?? ''; });
        setAiSettings(map);
      })
      .finally(() => setAiLoading(false));
  }, [profile?.role, tab]);

  useEffect(() => {
    if (profile?.role !== 'admin' || tab !== 'templates') return;
    (async () => {
      setTemplatesLoading(true);
      const { data } = await createClient().from('notification_templates').select('*').order('type').order('name');
      setTemplates(data ?? []);
      setTemplatesLoading(false);
    })();
  }, [profile?.role, tab]);

  useEffect(() => {
    if (profile?.role !== 'admin' || tab !== 'moderation') return;
    (async () => {
      setModerationLoading(true);
      const r = await fetch('/api/moderation');
      const d = await r.json();
      setFlaggedItems(d.data ?? []);
      setModerationLoading(false);
    })();
  }, [profile?.role, tab]);

  useEffect(() => {
    if (profile?.role !== 'admin' || tab !== 'audit-log') return;
    (async () => {
      setAuditLoading(true);
      const { data } = await createClient().from('activity_logs').select('*, portal_users(full_name)').order('created_at', { ascending: false }).limit(5);
      setAuditLogs(data ?? []);
      setAuditLoading(false);
    })();
  }, [profile?.role, tab]);

  useEffect(() => {
    if (profile?.role !== 'admin' || tab !== 'repair') return;
    loadMismatches();
  }, [profile?.role, tab]);

  const loadMismatches = async () => {
    setRepairLoading(true);
    try {
      const r = await fetch('/api/admin/fix-school-mismatch');
      const d = await r.json();
      setMismatches(d.mismatches ?? []);
    } catch (e) {
      console.error(e);
    } finally {
      setRepairLoading(false);
    }
  };

  const runRepair = async (action: 'align_student' | 'unenroll', studentIds: string[]) => {
    if (!confirm(`Are you sure you want to apply "${action}" to ${studentIds.length} records?`)) return;
    setRepairing(true);
    try {
      const res = await fetch('/api/admin/fix-school-mismatch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, studentIds }),
      });
      const d = await res.json();
      if (d.success) {
        showToast(`Successfully repaired ${d.applied} records`);
        loadMismatches();
      } else {
        throw new Error(d.error || 'Repair failed');
      }
    } catch (e: any) {
      showToast(e.message, false);
    } finally {
      setRepairing(false);
    }
  };

  const saveAiSettings = async () => {
    setAiSaving(true);
    try {
      const settings = Object.entries(aiSettings).map(([key, value]) => ({ key, value }));
      const res = await fetch('/api/app-settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ settings }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? 'Save failed');
      showToast('AI settings saved');
    } catch (e: any) {
      showToast(e.message ?? 'Failed to save', false);
    } finally {
      setAiSaving(false);
    }
  };

  const saveTemplate = async () => {
    if (!editingTemplate) return;
    setTemplateSaving(true);
    try {
      const { id, ...payload } = editingTemplate;
      const { error } = await createClient()
        .from('notification_templates')
        .upsert({ ...payload, ...(id ? { id } : {}) }, { onConflict: 'name,type' });
      if (error) throw error;
      setEditingTemplate(null);
      // Reload
      const { data } = await createClient().from('notification_templates').select('*').order('type').order('name');
      setTemplates(data ?? []);
      showToast('Template saved');
    } catch (e: any) {
      showToast(e.message ?? 'Failed to save template', false);
    } finally {
      setTemplateSaving(false);
    }
  };

  const resolveFlag = async (id: string, status: 'resolved' | 'dismissed') => {
    setResolvingId(id);
    try {
      const res = await fetch('/api/moderation', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, status }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      setFlaggedItems(prev => prev.filter(f => f.id !== id));
      showToast(status === 'resolved' ? 'Marked as resolved' : 'Dismissed');
    } catch (e: any) {
      showToast(e.message ?? 'Failed', false);
    } finally {
      setResolvingId(null);
    }
  };

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
    if (typeof window !== 'undefined' && 'Notification' in window) {
      setPushState(Notification.permission);
    }
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
      const res = await fetch(`/api/portal-users/${profile?.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          full_name: profileData.full_name,
          phone: profileData.phone,
          bio: profileData.bio,
        }),
      });
      if (!res.ok) { const j = await res.json(); throw new Error(j.error || 'Failed to save profile'); }
      await refreshProfile();
      setEditing(false);
      showToast('Profile updated successfully');
    } catch (e: any) {
      showToast(e.message ?? 'Failed to save profile', false);
    } finally {
      setSaving(false);
    }
  };

  const enablePush = async () => {
    if (typeof window === 'undefined' || !('Notification' in window)) return;
    const perm = await Notification.requestPermission();
    setPushState(perm);
    if (perm === 'granted') {
      showToast('Push notifications enabled. Refresh to sync with the server!');
    } else {
      showToast('Push permission denied. Check your browser settings.', false);
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

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      showToast('Please select an image file', false);
      return;
    }

    if (file.size > 2 * 1024 * 1024) {
      showToast('Image size must be less than 2MB', false);
      return;
    }

    setAvatarUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);

      const res = await fetch('/api/upload/avatar', {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Upload failed');
      }

      await refreshProfile();
      showToast('Avatar updated successfully');
    } catch (e: any) {
      showToast(e.message || 'Failed to upload avatar', false);
    } finally {
      setAvatarUploading(false);
    }
  };

  const roleColor: Record<string, string> = {
    admin: 'bg-red-500/20 text-red-400 border-red-500/30',
    teacher: 'bg-primary/20 text-primary border-primary/30',
    student: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
  };

  if (authLoading) return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="w-10 h-10 border-4 border-border border-t-primary rounded-full animate-spin" />
    </div>
  );
  if (!profile) return null;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">

        {/* Header */}
        <div>
          <div className="flex items-center gap-2 mb-1">
            <CogIcon className="w-5 h-5 text-primary" />
            <span className="text-xs font-bold text-primary uppercase tracking-widest">Account Settings</span>
          </div>
          <h1 className="text-3xl font-extrabold">Settings</h1>
          <p className="text-muted-foreground text-sm mt-1">Manage your account preferences and security</p>
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
            <div className="bg-card shadow-sm border border-border rounded-xl p-5 text-center">
              <div className="relative inline-block mb-4">
                <div className="w-20 h-20 rounded-xl bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center text-2xl font-black text-foreground mx-auto overflow-hidden border border-primary/20">
                  {profile.profile_image_url ? (
                    <img src={profile.profile_image_url} alt={profile.full_name} className="w-full h-full object-cover" />
                  ) : (
                    (profile.full_name ?? 'U')[0].toUpperCase()
                  )}
                  {avatarUploading && (
                    <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                      <ArrowPathIcon className="w-6 h-6 text-white animate-spin" />
                    </div>
                  )}
                </div>
                <label className="absolute -bottom-1 -right-1 w-7 h-7 bg-background border border-border rounded-xl flex items-center justify-center hover:bg-muted transition-colors cursor-pointer">
                  <CameraIcon className="w-3.5 h-3.5 text-muted-foreground" />
                  <input type="file" className="hidden" accept="image/*" onChange={handleAvatarUpload} disabled={avatarUploading} />
                </label>
              </div>
              <p className="font-bold text-foreground text-sm truncate">{profile.full_name}</p>
              <p className="text-xs text-muted-foreground mt-0.5 truncate">{profile.email}</p>
              <span className={`inline-block mt-2 px-2.5 py-0.5 rounded-full text-xs font-bold border capitalize
                ${roleColor[profile.role] ?? 'bg-muted text-muted-foreground border-border'}`}>
                {profile.role}
              </span>
            </div>

            {/* Tabs */}
            <nav className="bg-card shadow-sm border border-border rounded-xl p-2 space-y-1">
              {TABS.map(t => (
                <button key={t.id} onClick={() => setTab(t.id)}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-bold transition-all
                    ${tab === t.id ? 'bg-primary text-foreground shadow-lg shadow-primary/20' : 'text-muted-foreground hover:bg-card shadow-sm hover:text-foreground'}`}>
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
              <div className="bg-card shadow-sm border border-border rounded-xl overflow-hidden">
                <div className="flex items-center justify-between p-6 border-b border-border">
                  <div>
                    <h2 className="font-bold text-foreground">Profile Information</h2>
                    <p className="text-xs text-muted-foreground mt-0.5">Update your personal details</p>
                  </div>
                  {!editing ? (
                    <button onClick={() => setEditing(true)}
                      className="flex items-center gap-2 px-4 py-2 bg-muted hover:bg-white/15 rounded-xl text-sm font-bold transition-colors">
                      <PencilIcon className="w-3.5 h-3.5" /> Edit
                    </button>
                  ) : (
                    <div className="flex gap-2">
                      <button onClick={() => { setEditing(false); }}
                        className="px-4 py-2 bg-card shadow-sm hover:bg-muted rounded-xl text-sm font-bold text-muted-foreground transition-colors">
                        Cancel
                      </button>
                      <button onClick={saveProfile} disabled={saving}
                        className="flex items-center gap-2 px-4 py-2 bg-primary hover:bg-primary rounded-xl text-sm font-bold transition-colors disabled:opacity-50">
                        {saving ? <ArrowPathIcon className="w-3.5 h-3.5 animate-spin" /> : <CheckIcon className="w-3.5 h-3.5" />}
                        Save
                      </button>
                    </div>
                  )}
                </div>

                <div className="p-6 space-y-5">
                  {/* Full name */}
                  <div>
                    <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-1.5">Full Name</label>
                    {editing ? (
                      <input type="text" value={profileData.full_name}
                        onChange={e => setProfileData(p => ({ ...p, full_name: e.target.value }))}
                        className="w-full px-4 py-3 bg-card shadow-sm border border-border rounded-xl text-sm text-foreground focus:outline-none focus:border-primary transition-colors" />
                    ) : (
                      <p className="text-foreground font-semibold">{profileData.full_name || '—'}</p>
                    )}
                  </div>

                  {/* Email - always read-only */}
                  <div>
                    <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-1.5">Email Address</label>
                    <div className="flex items-center gap-2">
                      <EnvelopeIcon className="w-4 h-4 text-muted-foreground" />
                      <p className="text-muted-foreground text-sm">{profileData.email}</p>
                      <span className="text-[10px] font-bold px-2 py-0.5 bg-card shadow-sm border border-border rounded-full text-muted-foreground">Cannot edit</span>
                    </div>
                  </div>

                  {/* Phone */}
                  <div>
                    <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-1.5">Phone Number</label>
                    {editing ? (
                      <div className="relative">
                        <PhoneIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                        <input type="tel" value={profileData.phone}
                          onChange={e => setProfileData(p => ({ ...p, phone: e.target.value }))}
                          placeholder="+234 800 000 0000"
                          className="w-full pl-10 pr-4 py-3 bg-card shadow-sm border border-border rounded-xl text-sm text-foreground focus:outline-none focus:border-primary transition-colors placeholder-muted-foreground" />
                      </div>
                    ) : (
                      <p className="text-foreground font-semibold">{profileData.phone || <span className="text-muted-foreground">Not set</span>}</p>
                    )}
                  </div>

                  {/* Bio */}
                  <div>
                    <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-1.5">Bio</label>
                    {editing ? (
                      <textarea value={profileData.bio} rows={3}
                        onChange={e => setProfileData(p => ({ ...p, bio: e.target.value }))}
                        placeholder="Tell us a little about yourself…"
                        className="w-full px-4 py-3 bg-card shadow-sm border border-border rounded-xl text-sm text-foreground focus:outline-none focus:border-primary transition-colors resize-none placeholder-muted-foreground" />
                    ) : (
                      <p className="text-muted-foreground text-sm leading-relaxed">{profileData.bio || <span className="text-muted-foreground">No bio yet</span>}</p>
                    )}
                  </div>

                  {/* Role (read-only) */}
                  <div className="pt-4 border-t border-border">
                    <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-1.5">Account Role</label>
                    <span className={`inline-block px-3 py-1 rounded-full text-sm font-bold border capitalize
                      ${roleColor[profile.role] ?? 'bg-muted text-muted-foreground border-border'}`}>
                      {profile.role}
                    </span>
                    <p className="text-xs text-muted-foreground mt-1.5">Contact an admin to change your role.</p>
                  </div>
                </div>
              </div>
            )}

            {/* Security tab */}
            {tab === 'security' && (
              <div className="space-y-4">
                <div className="bg-card shadow-sm border border-border rounded-xl overflow-hidden">
                  <div className="p-6 border-b border-border">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-primary/20 rounded-xl flex items-center justify-center">
                        <KeyIcon className="w-5 h-5 text-primary" />
                      </div>
                      <div>
                        <h2 className="font-bold text-foreground">Change Password</h2>
                        <p className="text-xs text-muted-foreground mt-0.5">You are already signed in — no current password needed</p>
                      </div>
                    </div>
                  </div>
                  <form onSubmit={changePassword} className="p-6 space-y-4">
                    {(['newPw', 'confirm'] as const).map((field) => (
                      <div key={field}>
                        <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-1.5">
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
                            className="w-full pl-4 pr-10 py-3 bg-card shadow-sm border border-border rounded-xl text-sm text-foreground focus:outline-none focus:border-primary transition-colors placeholder-muted-foreground"
                          />
                          <button type="button" onClick={() => setShowPw(v => !v)}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-muted-foreground transition-colors">
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
                      className="flex items-center gap-2 px-6 py-3 bg-primary hover:bg-primary rounded-xl text-sm font-bold transition-all disabled:opacity-50">
                      {saving ? <ArrowPathIcon className="w-4 h-4 animate-spin" /> : <ShieldCheckIcon className="w-4 h-4" />}
                      Update Password
                    </button>
                  </form>
                </div>

                {/* Active Sessions Info */}
                <div className="bg-card shadow-sm border border-border rounded-xl p-6 space-y-3">
                  <h3 className="font-bold text-foreground flex items-center gap-2">
                    <ShieldCheckIcon className="w-4 h-4 text-primary" /> Account Security
                  </h3>
                  <div className="space-y-2 text-sm">
                    <div className="flex items-center justify-between py-2 border-b border-border">
                      <span className="text-muted-foreground">Email</span>
                      <span className="text-muted-foreground font-medium">{profile.email}</span>
                    </div>
                    <div className="flex items-center justify-between py-2 border-b border-border">
                      <span className="text-muted-foreground">Role</span>
                      <span className="capitalize font-bold text-primary">{profile.role}</span>
                    </div>
                    <div className="flex items-center justify-between py-2">
                      <span className="text-muted-foreground">Account Status</span>
                      <span className="text-emerald-400 font-bold flex items-center gap-1">
                        <CheckIcon className="w-3.5 h-3.5" /> Active
                      </span>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground pt-1">
                    Contact an admin if you suspect unauthorised access to your account.
                  </p>
                </div>
              </div>
            )}

            {/* Notifications tab */}
            {tab === 'notifications' && (
              <div className="bg-card shadow-sm border border-border rounded-xl overflow-hidden">
                <div className="p-6 border-b border-border">
                  <h2 className="font-bold text-foreground">Notification Preferences</h2>
                  <p className="text-xs text-muted-foreground mt-0.5">Choose what you want to be notified about</p>
                </div>
                <div className="p-6 space-y-4">
                  {(Object.entries(notifs)).map(([key, val]) => (
                    <div key={key} className="flex items-center justify-between py-3 border-b border-border last:border-0">
                      <div>
                        <p className="font-semibold text-foreground capitalize text-sm">{key}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {key === 'assignments' && 'New assignments and due date reminders'}
                          {key === 'grades' && 'When your submissions are graded'}
                          {key === 'announcements' && 'Important school announcements'}
                          {key === 'newsletters' && 'Monthly newsletters and updates'}
                        </p>
                      </div>
                      <button onClick={() => setNotifs(p => ({ ...p, [key]: !val }))}
                        className={`relative w-11 h-6 rounded-full transition-all ${val ? 'bg-primary' : 'bg-muted'}`}>
                        <span className={`absolute top-0.5 w-5 h-5 bg-card rounded-full shadow transition-all ${val ? 'left-5.5 translate-x-0.5' : 'left-0.5'}`} />
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
                    className="flex items-center gap-2 px-5 py-2.5 bg-primary hover:bg-primary rounded-xl text-sm font-bold transition-all mt-4">
                    <CheckIcon className="w-4 h-4" /> Save Preferences
                  </button>
                  
                  {/* Push Notifications Enable Box */}
                  <div className="mt-8 pt-6 border-t border-border">
                    <h3 className="font-bold text-foreground text-sm">Browser Push Notifications</h3>
                    <p className="text-xs text-muted-foreground mt-1 mb-4">
                      {pushState === 'granted' 
                        ? 'Push notifications are currently enabled on this device.'
                        : pushState === 'denied'
                        ? 'Push notifications are blocked by your browser. Please change your browser settings to allow them.'
                        : 'Receive instant alerts on this device even when the app is closed.'}
                    </p>
                    {pushState !== 'granted' && pushState !== 'denied' && (
                      <button onClick={enablePush} className="flex items-center gap-2 px-4 py-2 bg-card border border-border hover:bg-muted text-foreground rounded-xl text-xs font-bold transition-all">
                        <BellIcon className="w-4 h-4 text-primary" /> Enable Push on this Device
                      </button>
                    )}
                    {pushState === 'granted' && (
                      <button 
                        onClick={async () => {
                          const res = await fetch('/api/test-push', { method: 'POST' });
                          const data = await res.json();
                          if (res.ok && data.debug?.success) {
                            showToast('Server reports success! If no popup appears, check Windows Focus Assist.');
                          } else {
                            showToast(`Push failed: ${data.error || data.debug?.error || 'Unknown error'}`, false);
                            console.error('Push test details:', data);
                          }
                        }}
                        className="flex items-center gap-2 px-4 py-2 bg-primary/10 border border-primary/20 hover:bg-primary/20 text-primary rounded-xl text-xs font-bold transition-all mt-2">
                        <BellIcon className="w-4 h-4" /> Send Test Notification
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* ── Schools tab (teacher only) ── */}
            {tab === 'schools' && profile?.role === 'teacher' && (
              <div className="bg-card shadow-sm border border-border rounded-xl overflow-hidden">
                <div className="p-6 border-b border-border flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-2 mb-0.5">
                      <BuildingOfficeIcon className="w-4 h-4 text-primary" />
                      <h2 className="font-bold text-foreground">Assigned Schools</h2>
                    </div>
                    <p className="text-xs text-muted-foreground">Partner schools you currently teach at</p>
                  </div>
                  <span className="text-xs font-bold text-primary bg-primary/10 border border-primary/20 px-2.5 py-1 rounded-full">
                    {schools.length} school{schools.length !== 1 ? 's' : ''}
                  </span>
                </div>

                {schoolsLoading ? (
                  <div className="p-8 flex items-center justify-center">
                    <div className="w-7 h-7 border-4 border-border border-t-primary rounded-full animate-spin" />
                  </div>
                ) : schools.length === 0 ? (
                  <div className="p-10 text-center">
                    <BuildingOfficeIcon className="w-12 h-12 mx-auto text-muted-foreground mb-3" />
                    <p className="text-muted-foreground font-semibold">No schools assigned yet</p>
                    <p className="text-muted-foreground text-xs mt-1">Ask an admin to assign you to a partner school.</p>
                  </div>
                ) : (
                  <div className="divide-y divide-white/5">
                    {schools.map((ts: any) => {
                      const s = ts.schools ?? {};
                      return (
                        <div key={ts.id} className="p-5 hover:bg-card shadow-sm transition-colors">
                          <div className="flex items-start gap-4">
                            <div className="w-11 h-11 rounded-xl bg-primary/15 border border-primary/20 flex items-center justify-center flex-shrink-0">
                              <BuildingOfficeIcon className="w-5 h-5 text-primary" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap mb-1">
                                <p className="font-bold text-foreground">{s.name}</p>
                                {ts.is_primary && (
                                  <span className="flex items-center gap-1 px-2 py-0.5 bg-amber-500/20 text-amber-400 text-xs font-bold rounded-full border border-amber-500/30">
                                    <StarIcon className="w-3 h-3" /> Primary
                                  </span>
                                )}
                                <span className={`px-2 py-0.5 text-xs font-bold rounded-full border ${s.is_active
                                  ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
                                  : 'bg-muted text-muted-foreground border-border'
                                  }`}>
                                  {s.is_active ? 'Active' : 'Inactive'}
                                </span>
                              </div>
                              <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
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
                                <p className="text-xs text-muted-foreground mt-1.5 italic">{ts.notes}</p>
                              )}
                              <p className="text-xs text-muted-foreground mt-1">
                                Assigned {ts.assigned_at ? new Date(ts.assigned_at).toLocaleDateString() : '—'}
                              </p>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                <div className="p-4 border-t border-border bg-white/[0.02]">
                  <p className="text-xs text-muted-foreground text-center">
                    Contact an admin to update your school assignments.
                  </p>
                </div>
              </div>
            )}

            {/* ── AI Config tab (admin only) ── */}
            {tab === 'ai-config' && profile?.role === 'admin' && (
              <div className="bg-card shadow-sm border border-border rounded-xl overflow-hidden">
                <div className="p-6 border-b border-border flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <CpuChipIcon className="w-4 h-4 text-primary" />
                    <div>
                      <h2 className="font-bold text-foreground">AI Configuration</h2>
                      <p className="text-xs text-muted-foreground mt-0.5">API keys for AI features. Stored securely in the database.</p>
                    </div>
                  </div>
                </div>

                {aiLoading ? (
                  <div className="p-10 flex justify-center">
                    <div className="w-7 h-7 border-4 border-border border-t-primary rounded-full animate-spin" />
                  </div>
                ) : (
                  <div className="p-6 space-y-5">
                    {/* Info box */}
                    <div className="p-3 bg-primary/5 border border-primary/20 rounded-xl">
                      <p className="text-xs text-primary leading-relaxed">
                        These keys are loaded at runtime for AI features (image generation, project generation, etc.).
                        Changes take effect immediately — no redeployment needed.
                      </p>
                    </div>

                    {/* Known settings rows */}
                    {[
                      { key: 'openrouter_api_key', label: 'OpenRouter API Key', hint: 'Used for Gemini text generation fallback. Get it at openrouter.ai', placeholder: 'sk-or-v1-...' },
                      { key: 'gemini_api_key', label: 'Google Gemini API Key', hint: 'Primary key for Gemini 2.5 Flash text and image generation.', placeholder: 'AIza...' },
                      { key: 'pollinations_enabled', label: 'Pollinations Fallback', hint: 'Set to "true" to enable the free Pollinations.ai image fallback.', placeholder: 'true or false' },
                    ].map(({ key, label, hint, placeholder }) => (
                      <div key={key}>
                        <label className="block text-xs font-black uppercase tracking-widest text-muted-foreground mb-1.5">{label}</label>
                        <div className="flex gap-2">
                          <input
                            type="text"
                            value={aiSettings[key] ?? ''}
                            onChange={e => setAiSettings(prev => ({ ...prev, [key]: e.target.value }))}
                            placeholder={placeholder}
                            className="flex-1 px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-sm text-foreground placeholder-muted-foreground focus:outline-none focus:border-primary transition-colors font-mono"
                          />
                          {(aiSettings[key] ?? '').length > 4 && (
                            <button
                              onClick={() => setAiSettings(prev => ({ ...prev, [key]: '' }))}
                              className="px-3 py-2 bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs font-black hover:bg-rose-500/20 transition-colors"
                              title="Clear">✕</button>
                          )}
                        </div>
                        <p className="text-[10px] text-muted-foreground mt-1">{hint}</p>
                      </div>
                    ))}

                    {/* Dynamic: any extra keys in DB not in the list above */}
                    {Object.entries(aiSettings)
                      .filter(([k]) => !['openrouter_api_key', 'gemini_api_key', 'pollinations_enabled'].includes(k))
                      .map(([key, value]) => (
                        <div key={key}>
                          <label className="block text-xs font-black uppercase tracking-widest text-muted-foreground mb-1.5">{key.replace(/_/g, ' ')}</label>
                          <input
                            type="text"
                            value={value}
                            onChange={e => setAiSettings(prev => ({ ...prev, [key]: e.target.value }))}
                            className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-sm text-foreground placeholder-muted-foreground focus:outline-none focus:border-primary transition-colors font-mono"
                          />
                        </div>
                      ))
                    }

                    <button
                      onClick={saveAiSettings}
                      disabled={aiSaving}
                      className="flex items-center gap-2 px-6 py-2.5 bg-primary hover:bg-primary disabled:opacity-50 rounded-xl text-sm font-bold text-white transition-all mt-2">
                      {aiSaving
                        ? <ArrowPathIcon className="w-4 h-4 animate-spin" />
                        : <CheckIcon className="w-4 h-4" />}
                      {aiSaving ? 'Saving…' : 'Save AI Settings'}
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* ── LMS Config tab (admin only) ── */}
            {tab === 'lms-config' && profile?.role === 'admin' && (
              <div className="bg-card shadow-sm border border-border rounded-xl overflow-hidden">
                <div className="p-6 border-b border-border flex items-center justify-between bg-primary/5">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-primary/20 rounded-xl flex items-center justify-center">
                      <CogIcon className="w-5 h-5 text-primary" />
                    </div>
                    <div>
                      <h2 className="font-bold text-foreground">Platform Policy & Branding</h2>
                      <p className="text-xs text-muted-foreground mt-0.5">Manage global LMS behavior, academic rules, and brand assets.</p>
                    </div>
                  </div>
                </div>

                {aiLoading ? (
                  <div className="p-10 flex justify-center">
                    <div className="w-7 h-7 border-4 border-border border-t-primary rounded-full animate-spin" />
                  </div>
                ) : (
                  <div className="p-6 space-y-8">
                    
                    {/* Branding Section */}
                    <div>
                      <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-primary mb-4">Institutional Branding</h3>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="space-y-4">
                          <div>
                            <label className="block text-xs font-bold text-foreground mb-1.5">Platform Brand Color</label>
                            <div className="flex items-center gap-3">
                              <input type="color" value={aiSettings.brand_primary_color || '#1A3A8F'} 
                                onChange={e => setAiSettings(p => ({ ...p, brand_primary_color: e.target.value }))}
                                className="w-10 h-10 cursor-pointer border border-border bg-transparent p-0 rounded-lg" />
                              <input type="text" value={aiSettings.brand_primary_color || '#1A3A8F'}
                                onChange={e => setAiSettings(p => ({ ...p, brand_primary_color: e.target.value }))}
                                className="flex-1 px-4 py-2 bg-background border border-border rounded-xl text-sm font-mono focus:outline-none focus:border-primary" />
                            </div>
                            <p className="text-[10px] text-muted-foreground mt-1.5">Affects navigation, buttons, and system accents globally.</p>
                          </div>
                        </div>
                        <div className="space-y-4">
                          <div>
                            <label className="block text-xs font-bold text-foreground mb-1.5">Platform Logo URL</label>
                            <input type="text" value={aiSettings.platform_logo_url || ''} 
                              onChange={e => setAiSettings(p => ({ ...p, platform_logo_url: e.target.value }))}
                              placeholder="https://..."
                              className="w-full px-4 py-2 bg-background border border-border rounded-xl text-sm focus:outline-none focus:border-primary" />
                            <p className="text-[10px] text-muted-foreground mt-1.5">SVG or Transparent PNG recommended (128x128px).</p>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="h-px bg-border" />

                    {/* Academic Policies */}
                    <div>
                      <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-primary mb-4">Academic & Engagement Policies</h3>
                      <div className="space-y-4">
                        {[
                          { key: 'lms_teacher_isolation', label: 'Teacher Data Isolation', desc: 'Teachers only see their own assigned classes and students.' },
                          { key: 'lms_auto_portals', label: 'Automated Student Portals', desc: 'Automatically create accounts for new student registrations.' },
                          { key: 'lms_gamification_enabled', label: 'Engagement Gamification', desc: 'Enable XP, Badges, and Leaderboards for all students.' },
                          { key: 'lms_auto_certificates', label: 'Auto-Certificate Issuance', desc: 'Generate completion certificates automatically on course finish.' },
                          { key: 'lms_course_locking', label: 'Syllabus Progression Lock', desc: 'Force students to complete lessons in linear order.' },
                        ].map(opt => (
                          <div key={opt.key} className="flex items-start justify-between py-2">
                            <div className="max-w-md">
                              <p className="font-bold text-foreground text-sm">{opt.label}</p>
                              <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{opt.desc}</p>
                            </div>
                            <button 
                              onClick={() => setAiSettings(p => ({ ...p, [opt.key]: p[opt.key] === 'true' ? 'false' : 'true' }))}
                              className={`relative w-11 h-6 rounded-full transition-all mt-1 ${aiSettings[opt.key] === 'true' ? 'bg-primary' : 'bg-muted'}`}
                            >
                              <span className={`absolute top-0.5 w-5 h-5 bg-card rounded-full shadow transition-all ${aiSettings[opt.key] === 'true' ? 'left-5.5 translate-x-0.5' : 'left-0.5'}`} />
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="h-px bg-border" />

                    {/* Communication Section */}
                    <div>
                      <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-primary mb-4">Communication Controls</h3>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div>
                          <label className="block text-xs font-bold text-foreground mb-1.5">Messaging Restriction</label>
                          <select 
                            value={aiSettings.lms_messaging_policy || 'open'}
                            onChange={e => setAiSettings(p => ({ ...p, lms_messaging_policy: e.target.value }))}
                            className="w-full px-4 py-2 bg-background border border-border rounded-xl text-sm focus:outline-none focus:border-primary appearance-none cursor-pointer"
                          >
                            <option value="open">Open (Collaborative)</option>
                            <option value="support_only">Support Only (Staff-to-Student)</option>
                            <option value="restricted">Restricted (No peer-to-peer)</option>
                          </select>
                          <p className="text-[10px] text-muted-foreground mt-1.5">Defines who students and parents can message in the inbox.</p>
                        </div>
                        <div>
                          <label className="block text-xs font-bold text-foreground mb-1.5">Global Attendance Threshold</label>
                          <div className="flex items-center gap-3">
                            <input type="number" value={aiSettings.lms_attendance_threshold || '75'}
                              onChange={e => setAiSettings(p => ({ ...p, lms_attendance_threshold: e.target.value }))}
                              className="w-24 px-4 py-2 bg-background border border-border rounded-xl text-sm focus:outline-none focus:border-primary" />
                            <span className="text-sm font-bold text-muted-foreground">%</span>
                          </div>
                          <p className="text-[10px] text-muted-foreground mt-1.5">Minimum attendance required for exam eligibility.</p>
                        </div>
                      </div>
                    </div>

                    <div className="pt-4 flex flex-col sm:flex-row gap-3">
                      <button
                        onClick={saveAiSettings}
                        disabled={aiSaving}
                        className="flex-1 flex items-center justify-center gap-2 px-6 py-3 bg-primary hover:bg-primary shadow-lg shadow-primary/20 disabled:opacity-50 rounded-xl text-sm font-black text-white transition-all uppercase tracking-widest">
                        {aiSaving
                          ? <ArrowPathIcon className="w-4 h-4 animate-spin" />
                          : <CheckCircleIcon className="w-4 h-4" />}
                        {aiSaving ? 'Synchronizing…' : 'Apply Global Policies'}
                      </button>
                      <button
                        onClick={() => {
                          if (confirm('Reset all LMS policies to platform defaults?')) {
                            setAiSettings(p => ({
                              ...p,
                              lms_teacher_isolation: 'false',
                              lms_auto_portals: 'true',
                              lms_gamification_enabled: 'true',
                              lms_auto_certificates: 'false',
                              lms_course_locking: 'true',
                              lms_messaging_policy: 'open',
                              brand_primary_color: '#1A3A8F'
                            }));
                          }
                        }}
                        className="px-6 py-3 border border-border text-muted-foreground hover:text-foreground hover:bg-muted rounded-xl text-sm font-bold transition-all">
                        Reset Defaults
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
            {tab === 'templates' && profile?.role === 'admin' && (
              <div className="bg-card shadow-sm border border-border rounded-xl overflow-hidden">
                <div className="p-6 border-b border-border flex items-center gap-2">
                  <DocumentTextIcon className="w-4 h-4 text-primary" />
                  <div>
                    <h2 className="font-bold text-foreground">Notification Templates</h2>
                    <p className="text-xs text-muted-foreground mt-0.5">Edit email and SMS templates used by the system.</p>
                  </div>
                </div>

                {templatesLoading ? (
                  <div className="p-10 flex justify-center"><div className="w-7 h-7 border-4 border-border border-t-primary rounded-full animate-spin" /></div>
                ) : (
                  <div className="divide-y divide-border">
                    {templates.length === 0 && (
                      <div className="p-8 text-center text-muted-foreground text-sm">No templates found. They are seeded on first use.</div>
                    )}
                    {templates.map(tmpl => (
                      <div key={tmpl.id} className="p-5">
                        <div className="flex items-center justify-between gap-4 mb-3">
                          <div className="flex items-center gap-2">
                            <span className={`px-2 py-0.5 text-[10px] font-black uppercase tracking-widest border ${tmpl.type === 'email' ? 'bg-primary/10 text-primary border-primary/20' : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'}`}>{tmpl.type}</span>
                            <p className="text-sm font-bold text-foreground">{tmpl.name}</p>
                          </div>
                          <button onClick={() => setEditingTemplate(editingTemplate?.id === tmpl.id ? null : { ...tmpl })}
                            className="text-xs font-bold text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1">
                            <PencilIcon className="w-3.5 h-3.5" /> Edit
                          </button>
                        </div>

                        {editingTemplate?.id === tmpl.id ? (
                          <div className="space-y-3 border border-border p-4 bg-background">
                            {editingTemplate.subject !== undefined && (
                              <div>
                                <label className="block text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-1.5">Subject</label>
                                <input value={editingTemplate.subject ?? ''} onChange={e => setEditingTemplate((t: any) => ({ ...t, subject: e.target.value }))}
                                  className="w-full px-3 py-2.5 bg-card border border-border text-sm text-foreground focus:outline-none focus:border-primary transition-all" />
                              </div>
                            )}
                            <div>
                              <label className="block text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-1.5">Content</label>
                              <textarea rows={6} value={editingTemplate.content ?? ''} onChange={e => setEditingTemplate((t: any) => ({ ...t, content: e.target.value }))}
                                className="w-full px-3 py-2.5 bg-card border border-border text-sm text-foreground font-mono resize-none focus:outline-none focus:border-primary transition-all" />
                            </div>
                            <div className="flex gap-2">
                              <button onClick={() => setEditingTemplate(null)} className="flex-1 py-2.5 text-xs font-bold text-muted-foreground border border-border hover:text-foreground transition-all">Cancel</button>
                              <button onClick={saveTemplate} disabled={templateSaving}
                                className="flex-1 flex items-center justify-center gap-2 py-2.5 text-xs font-black bg-primary hover:bg-primary text-white transition-all disabled:opacity-50">
                                {templateSaving ? <ArrowPathIcon className="w-3.5 h-3.5 animate-spin" /> : <CheckIcon className="w-3.5 h-3.5" />}
                                Save
                              </button>
                            </div>
                          </div>
                        ) : (
                          <p className="text-xs text-muted-foreground font-mono leading-relaxed line-clamp-3">{tmpl.content}</p>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* ── Moderation tab (admin only) — links to dedicated page ── */}
            {tab === 'moderation' && profile?.role === 'admin' && (
              <div className="bg-card shadow-sm border border-border rounded-xl overflow-hidden">
                <div className="p-6 border-b border-border flex items-center gap-2">
                  <ExclamationCircleIcon className="w-4 h-4 text-rose-400" />
                  <div>
                    <h2 className="font-bold text-foreground">Content Moderation</h2>
                    <p className="text-xs text-muted-foreground mt-0.5">Review and action flagged community content.</p>
                  </div>
                </div>
                <div className="p-6 space-y-4">
                  {moderationLoading ? (
                    <div className="flex justify-center py-6"><div className="w-7 h-7 border-4 border-border border-t-rose-400 rounded-full animate-spin" /></div>
                  ) : (
                    <>
                      {/* Quick stats */}
                      <div className="grid grid-cols-3 gap-3">
                        {[
                          { label: 'Pending', count: flaggedItems.filter(f => f.status === 'pending').length, color: 'text-amber-400 bg-amber-500/10 border-amber-500/20' },
                          { label: 'Reviewed', count: flaggedItems.filter(f => f.status === 'reviewed').length, color: 'text-primary bg-primary/10 border-primary/20' },
                          { label: 'Dismissed', count: flaggedItems.filter(f => f.status === 'dismissed').length, color: 'text-muted-foreground/70 bg-zinc-500/10 border-zinc-500/20' },
                        ].map(s => (
                          <div key={s.label} className={`border rounded-xl p-3 text-center ${s.color}`}>
                            <p className="text-xl font-black">{s.count}</p>
                            <p className="text-[10px] font-bold uppercase tracking-wider opacity-70">{s.label}</p>
                          </div>
                        ))}
                      </div>
                      {/* Recent pending items preview */}
                      {flaggedItems.filter(f => f.status === 'pending').slice(0, 3).map(item => (
                        <div key={item.id} className="flex items-center gap-3 p-3 bg-white/[0.02] border border-border rounded-xl">
                          <span className="px-2 py-0.5 text-[10px] font-black uppercase tracking-widest bg-rose-500/10 text-rose-400 border border-rose-500/20 shrink-0">{item.content_type}</span>
                          <p className="text-xs text-foreground flex-1 truncate">{item.reason}</p>
                          <p className="text-[10px] text-muted-foreground shrink-0">{new Date(item.created_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}</p>
                        </div>
                      ))}
                      {flaggedItems.filter(f => f.status === 'pending').length === 0 && (
                        <div className="flex items-center gap-2 text-emerald-400 text-sm">
                          <CheckCircleIcon className="w-4 h-4" />
                          <span className="font-semibold">No pending flags — all clear</span>
                        </div>
                      )}
                    </>
                  )}
                  <a href="/dashboard/moderation"
                    className="flex items-center justify-center gap-2 w-full py-2.5 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/20 text-rose-400 text-sm font-bold rounded-xl transition-all">
                    Open Moderation Dashboard →
                  </a>
                </div>
              </div>
            )}

            {/* ── Audit Log tab (admin only) — links to dedicated page ── */}
            {tab === 'audit-log' && profile?.role === 'admin' && (
              <div className="bg-card shadow-sm border border-border rounded-xl overflow-hidden">
                <div className="p-6 border-b border-border flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <TableCellsIcon className="w-4 h-4 text-muted-foreground/70" />
                    <div>
                      <h2 className="font-bold text-foreground">Activity & Audit Log</h2>
                      <p className="text-xs text-muted-foreground mt-0.5">Recent platform activity — last 5 events.</p>
                    </div>
                  </div>
                  <button onClick={async () => {
                    setAuditLoading(true);
                    const { data } = await createClient().from('activity_logs').select('*, portal_users(full_name)').order('created_at', { ascending: false }).limit(5);
                    setAuditLogs(data ?? []);
                    setAuditLoading(false);
                  }} className="p-2 bg-white/5 hover:bg-white/10 text-muted-foreground hover:text-foreground border border-border transition-all">
                    <ArrowPathIcon className={`w-4 h-4 ${auditLoading ? 'animate-spin' : ''}`} />
                  </button>
                </div>

                {auditLoading ? (
                  <div className="p-10 flex justify-center"><div className="w-7 h-7 border-4 border-border border-t-slate-400 rounded-full animate-spin" /></div>
                ) : auditLogs.length === 0 ? (
                  <div className="p-6 text-center text-muted-foreground text-sm">No activity logged yet.</div>
                ) : (
                  <div className="divide-y divide-border">
                    {auditLogs.slice(0, 5).map((log: any) => (
                      <div key={log.id} className="px-5 py-3 flex items-center gap-3">
                        <span className="px-2 py-0.5 bg-white/5 border border-white/10 text-[10px] font-black uppercase tracking-wider text-white/60 whitespace-nowrap shrink-0">
                          {log.event_type}
                        </span>
                        <span className="text-xs font-medium text-foreground truncate flex-1">
                          {log.portal_users?.full_name ?? '—'}
                        </span>
                        <span className="text-[10px] text-muted-foreground shrink-0 whitespace-nowrap">
                          {new Date(log.created_at).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
                <div className="p-4 border-t border-border">
                  <a href="/dashboard/activity-logs"
                    className="flex items-center justify-center gap-2 w-full py-2.5 bg-slate-500/10 hover:bg-slate-500/20 border border-slate-500/20 text-slate-300 text-sm font-bold rounded-xl transition-all">
                    View Full Activity & Audit Log →
                  </a>
                </div>
              </div>
            )}

            {/* ── Repair Tools tab (admin only) ── */}
            {tab === 'repair' && profile?.role === 'admin' && (
              <div className="bg-card shadow-sm border border-border rounded-xl overflow-hidden">
                <div className="p-6 border-b border-border flex items-center gap-2 bg-rose-500/5">
                  <CommandLineIcon className="w-4 h-4 text-rose-400" />
                  <div>
                    <h2 className="font-bold text-foreground">Database Repair Tools</h2>
                    <p className="text-xs text-muted-foreground mt-0.5">Detect and fix school boundary violations and data inconsistencies.</p>
                  </div>
                </div>

                <div className="p-6 space-y-6">
                  {/* School Mismatch Section */}
                  <div>
                    <div className="flex items-center justify-between mb-4">
                      <div>
                        <h3 className="text-sm font-bold text-foreground">School-Class Mismatches</h3>
                        <p className="text-xs text-muted-foreground">Students enrolled in classes belonging to a different school.</p>
                      </div>
                      <button onClick={loadMismatches} disabled={repairLoading} className="p-2 hover:bg-muted rounded-lg transition-colors">
                        <ArrowPathIcon className={`w-4 h-4 ${repairLoading ? 'animate-spin' : ''}`} />
                      </button>
                    </div>

                    {repairLoading ? (
                      <div className="py-8 flex justify-center"><div className="w-6 h-6 border-2 border-border border-t-primary rounded-full animate-spin" /></div>
                    ) : mismatches.length === 0 ? (
                      <div className="py-8 text-center bg-emerald-500/5 border border-emerald-500/10 rounded-xl">
                        <CheckCircleIcon className="w-8 h-8 text-emerald-500/40 mx-auto mb-2" />
                        <p className="text-sm font-bold text-emerald-400">Integrity Check Passed</p>
                        <p className="text-xs text-emerald-500/60">No school boundary violations detected.</p>
                      </div>
                    ) : (
                      <div className="space-y-4">
                        <div className="p-3 bg-rose-500/10 border border-rose-500/20 rounded-xl flex items-center justify-between">
                          <p className="text-xs font-bold text-rose-400">Found {mismatches.length} students with incorrect school assignments.</p>
                          <div className="flex gap-2">
                            <button 
                              onClick={() => runRepair('align_student', mismatches.map(m => m.student_id))}
                              disabled={repairing}
                              className="px-3 py-1.5 bg-primary text-white text-[10px] font-black uppercase tracking-widest rounded-lg hover:shadow-lg hover:shadow-primary/20 transition-all disabled:opacity-50"
                            >
                              Align All to Class
                            </button>
                            <button 
                              onClick={() => runRepair('unenroll', mismatches.map(m => m.student_id))}
                              disabled={repairing}
                              className="px-3 py-1.5 bg-rose-500 text-white text-[10px] font-black uppercase tracking-widest rounded-lg hover:shadow-lg hover:shadow-rose-500/20 transition-all disabled:opacity-50"
                            >
                              Unenroll All
                            </button>
                          </div>
                        </div>

                        <div className="max-h-[400px] overflow-y-auto border border-border rounded-xl divide-y divide-border">
                          {mismatches.map((m: any) => (
                            <div key={m.student_id} className="p-4 flex items-center justify-between hover:bg-muted/50 transition-colors">
                              <div className="min-w-0 flex-1 mr-4">
                                <p className="text-sm font-bold text-foreground truncate">{m.student_name}</p>
                                <div className="flex items-center gap-2 mt-1 flex-wrap">
                                  <span className="text-[10px] px-1.5 py-0.5 bg-zinc-500/10 text-zinc-400 border border-zinc-500/20 rounded uppercase font-bold whitespace-nowrap">
                                    Current: {m.student_school_name || 'No School'}
                                  </span>
                                  <span className="text-[10px] text-muted-foreground">→</span>
                                  <span className="text-[10px] px-1.5 py-0.5 bg-primary/10 text-primary border border-primary/20 rounded uppercase font-bold whitespace-nowrap">
                                    Class: {m.class_name}
                                  </span>
                                </div>
                              </div>
                              <div className="flex gap-1 shrink-0">
                                <button 
                                  onClick={() => runRepair('align_student', [m.student_id])}
                                  className="p-1.5 hover:bg-primary/10 text-primary rounded-lg transition-colors" title="Align Student to School"
                                >
                                  <CheckIcon className="w-4 h-4" />
                                </button>
                                <button 
                                  onClick={() => runRepair('unenroll', [m.student_id])}
                                  className="p-1.5 hover:bg-rose-500/10 text-rose-400 rounded-lg transition-colors" title="Unenroll Student"
                                >
                                  <XMarkIcon className="w-4 h-4" />
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="p-4 bg-amber-500/5 border border-amber-500/10 rounded-xl">
                    <div className="flex gap-3">
                      <ExclamationTriangleIcon className="w-5 h-5 text-amber-500 shrink-0" />
                      <div>
                        <p className="text-xs font-bold text-amber-500 uppercase tracking-widest mb-1">Safety Note</p>
                        <p className="text-[11px] text-amber-600/80 leading-relaxed">
                          Aligning a student will update their record to match the school of the class they are currently in. 
                          Unenrolling will remove them from the class so they can be placed in a correct one. 
                          These actions are permanent and affect reporting.
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

          </div>
        </div>
      </div>
    </div>
  );
}