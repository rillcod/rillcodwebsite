// @refresh reset
'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useAuth } from '@/contexts/auth-context';
import {
    ShieldCheckIcon, MagnifyingGlassIcon, UserGroupIcon,
    AcademicCapIcon, BuildingOfficeIcon, UserIcon,
    ArrowPathIcon, EnvelopeIcon, PhoneIcon,
    PencilIcon, TrashIcon, XMarkIcon, CheckIcon, PlusIcon,
    BoltIcon, ExclamationTriangleIcon, KeyIcon, CheckCircleIcon,
    UserPlusIcon, ClipboardDocumentCheckIcon,
} from '@/lib/icons';

type PortalUser = {
    id: string;
    full_name: string;
    email: string;
    role: string;
    phone?: string;
    is_active: boolean;
    created_at: string;
    school_id?: string;
};

const ROLES = ['admin', 'teacher', 'school', 'student'];

export default function UsersPage() {
    const { profile, loading: authLoading } = useAuth();
    const [users, setUsers] = useState<PortalUser[]>([]);
    const [loading, setLoading] = useState(false);
    const [search, setSearch] = useState('');
    const [roleFilter, setRoleFilter] = useState('all');

    // Edit modal state
    const [editing, setEditing] = useState<PortalUser | null>(null);
    const [editForm, setEditForm] = useState({ full_name: '', role: '', phone: '', is_active: true });
    const [saving, setSaving] = useState(false);
    const [editErr, setEditErr] = useState('');

    // Delete state
    const [deleting, setDeleting] = useState<string | null>(null);

    // Create user modal state
    const [showCreate, setShowCreate] = useState(false);
    const [createForm, setCreateForm] = useState({ email: '', password: '', fullName: '', role: 'student' });
    const [creating, setCreating] = useState(false);
    const [createErr, setCreateErr] = useState('');

    // Sync state
    const [syncing, setSyncing] = useState(false);
    const [syncResult, setSyncResult] = useState<any | null>(null);
    const [gapData, setGapData] = useState<any | null>(null);
    const [gapCount, setGapCount] = useState<number | null>(null);
    const [showConflicts, setShowConflicts] = useState(false);

    // Reset password state
    const [resetTarget, setResetTarget] = useState<{ id: string; name: string } | null>(null);
    const [resetPw, setResetPw] = useState('');
    const [resetting, setResetting] = useState(false);
    const [resetMsg, setResetMsg] = useState<{ ok: boolean; text: string } | null>(null);

    const handleResetPw = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!resetTarget || resetPw.length < 8) return;
        setResetting(true); setResetMsg(null);
        try {
            const res = await fetch('/api/auth/reset-password', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId: resetTarget.id, newPassword: resetPw }),
            });
            const json = await res.json();
            if (!res.ok) throw new Error(json.error ?? 'Failed');
            setResetMsg({ ok: true, text: `Password updated for ${resetTarget.name}` });
            setResetPw('');
            setTimeout(() => { setResetTarget(null); setResetMsg(null); }, 2000);
        } catch (err: any) {
            setResetMsg({ ok: false, text: err.message });
        } finally {
            setResetting(false);
        }
    };

    const load = async () => {
        setLoading(true);
        try {
            const res = await fetch('/api/portal-users');
            const json = await res.json();
            setUsers(json.data ?? []);
        } catch {
            setUsers([]);
        }
        setLoading(false);
    };

    useEffect(() => {
        if (authLoading || profile?.role !== 'admin') return;
        load(); checkGaps();
    }, [profile?.id, authLoading]); // eslint-disable-line

    const openEdit = (u: PortalUser) => {
        setEditing(u);
        setEditForm({ full_name: u.full_name, role: u.role, phone: u.phone ?? '', is_active: u.is_active });
        setEditErr('');
    };

    const saveEdit = async () => {
        if (!editing) return;
        setSaving(true);
        setEditErr('');
        try {
            const res = await fetch(`/api/portal-users/${editing.id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(editForm),
            });
            const json = await res.json();
            if (!res.ok) throw new Error(json.error || 'Update failed');
            setUsers(prev => prev.map(u => u.id === editing.id ? { ...u, ...editForm } : u));
            setEditing(null);
        } catch (e: any) {
            setEditErr(e.message);
        }
        setSaving(false);
    };

    const handleCreate = async () => {
        if (!createForm.email || !createForm.password || !createForm.fullName) {
            setCreateErr('All fields are required');
            return;
        }
        setCreating(true);
        setCreateErr('');
        try {
            const res = await fetch('/api/auth/signup', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    email: createForm.email,
                    password: createForm.password,
                    fullName: createForm.fullName,
                    role: createForm.role,
                }),
            });
            const json = await res.json();
            if (!res.ok) throw new Error(json.error || 'Failed to create user');
            setShowCreate(false);
            setCreateForm({ email: '', password: '', fullName: '', role: 'student' });
            await load(); // refresh list
        } catch (e: any) {
            setCreateErr(e.message);
        }
        setCreating(false);
    };

    const checkGaps = async () => {
        try {
            const res = await fetch('/api/admin/sync-users');
            const json = await res.json();
            if (res.ok) {
                const total = Object.values(json.gaps as Record<string, number>).reduce((a, b) => a + b, 0);
                setGapCount(total);
                setGapData(json.details);
            }
        } catch { /* ignore */ }
    };

    const handleSync = async () => {
        if (!confirm('This will create auth accounts for approved students and fix all user inconsistencies. Continue?')) return;
        setSyncing(true);
        setSyncResult(null);
        try {
            const res = await fetch('/api/admin/sync-users', { method: 'POST' });
            const json = await res.json();
            setSyncResult(json);
            await load();
            await checkGaps();
        } catch (e: any) {
            setSyncResult({ error: e.message });
        }
        setSyncing(false);
    };

    const handleRemoveOrphans = async () => {
        if (!confirm('This will permanently delete all portal user rows that have no matching auth account. This cannot be undone. Continue?')) return;
        setSyncing(true);
        try {
            const res = await fetch('/api/admin/sync-users', { method: 'DELETE' });
            const json = await res.json();
            await load();
            await checkGaps();
            setSyncResult({
                success: true,
                summary: { orphans_deleted: json.deleted, skipped: json.skipped },
                credentials: [],
                errors: json.skipped_list ?? [],
            });
        } catch (e: any) {
            setSyncResult({ error: e.message });
        }
        setSyncing(false);
    };

    const handleDelete = async (u: { id: string, full_name?: string, name?: string, email?: string }) => {
        const name = u.full_name || u.name || u.email || 'this user';
        if (!confirm(`Delete "${name}"? This removes their account permanently and clears any "already registered" conflicts.`)) return;
        setDeleting(u.id);
        try {
            const res = await fetch(`/api/portal-users/${u.id}`, { method: 'DELETE' });
            const json = await res.json();
            if (!res.ok) throw new Error(json.error || 'Delete failed');
            setUsers(prev => prev.filter(x => x.id !== u.id));
            await checkGaps();
        } catch (e: any) {
            alert(e.message);
        }
        setDeleting(null);
    };

    const filtered = users.filter(u => {
        const matchesSearch =
            (u.full_name ?? '').toLowerCase().includes(search.toLowerCase()) ||
            (u.email ?? '').toLowerCase().includes(search.toLowerCase());
        const matchesRole = roleFilter === 'all' || u.role === roleFilter;
        return matchesSearch && matchesRole;
    });

    const roleFilters = [
        { id: 'all', label: 'All Users', icon: UserGroupIcon },
        { id: 'admin', label: 'Admins', icon: ShieldCheckIcon },
        { id: 'teacher', label: 'Teachers', icon: AcademicCapIcon },
        { id: 'school', label: 'Partners', icon: BuildingOfficeIcon },
        { id: 'student', label: 'Students', icon: UserIcon },
    ];

    const roleBadge = (role: string) => {
        const map: Record<string, string> = {
            admin: 'bg-rose-500/10 text-rose-400 border-rose-500/20',
            teacher: 'bg-orange-500/10 text-orange-400 border-orange-500/20',
            school: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
            student: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
        };
        return map[role] ?? 'bg-card shadow-sm text-muted-foreground border-border';
    };

    const avatarGrad = (role: string) => {
        const map: Record<string, string> = {
            admin: 'from-rose-600 to-rose-400',
            teacher: 'from-orange-600 to-orange-400',
            school: 'from-orange-600 to-orange-400 from-orange-600 to-orange-400',
            student: 'from-orange-600 to-orange-400 from-orange-600 to-orange-400',
        };
        return map[role] ?? 'from-gray-600 to-gray-400';
    };

    if (authLoading || !profile) return (
        <div className="min-h-screen flex items-center justify-center bg-background">
            <div className="w-10 h-10 border-4 border-orange-500 border-t-transparent rounded-full animate-spin" />
        </div>
    );

    if (profile.role !== 'admin') {
        return (
            <div className="min-h-screen flex items-center justify-center bg-background">
                <p className="text-muted-foreground">Only admins can access this page.</p>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-background text-foreground">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">

                {/* Tab bar — People */}
                <div className="flex items-center gap-1 bg-card border border-border rounded-xl p-1 w-fit flex-wrap">
                    <Link href="/dashboard/schools" className="flex items-center gap-2 px-4 py-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/50 text-sm font-bold transition-all">
                        <BuildingOfficeIcon className="w-4 h-4" /> Schools
                    </Link>
                    <Link href="/dashboard/teachers" className="flex items-center gap-2 px-4 py-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/50 text-sm font-bold transition-all">
                        <AcademicCapIcon className="w-4 h-4" /> Teachers
                    </Link>
                    <Link href="/dashboard/students" className="flex items-center gap-2 px-4 py-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/50 text-sm font-bold transition-all">
                        <UserGroupIcon className="w-4 h-4" /> Students
                    </Link>
                    <Link href="/dashboard/parents" className="flex items-center gap-2 px-4 py-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/50 text-sm font-bold transition-all">
                        <UserPlusIcon className="w-4 h-4" /> Parents
                    </Link>
                    <span className="flex items-center gap-2 px-4 py-2 rounded-lg bg-violet-600 text-white text-sm font-black">
                        <ShieldCheckIcon className="w-4 h-4" /> Users
                    </span>
                    <Link href="/dashboard/approvals" className="flex items-center gap-2 px-4 py-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/50 text-sm font-bold transition-all">
                        <ClipboardDocumentCheckIcon className="w-4 h-4" /> Approvals
                    </Link>
                </div>

                {/* Header */}
                <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
                    <div>
                        <div className="flex items-center gap-2 mb-1">
                            <ShieldCheckIcon className="w-5 h-5 text-orange-400" />
                            <span className="text-xs font-bold text-orange-400 uppercase tracking-widest">System Administration</span>
                        </div>
                        <h1 className="text-3xl font-extrabold">All Portal Users</h1>
                        <p className="text-muted-foreground text-sm mt-1">Manage and verify all user accounts across the system</p>
                    </div>

                    <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                        <div className="flex items-center gap-2">
                            <button
                                onClick={() => { setShowCreate(true); setCreateErr(''); }}
                                className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-2.5 bg-orange-600 hover:bg-orange-500 text-foreground text-sm font-bold rounded-none transition-all shadow-lg shadow-orange-600/20"
                            >
                                <PlusIcon className="w-4 h-4" /> Create User
                            </button>
                            <button
                                onClick={handleSync}
                                disabled={syncing}
                                className={`flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-bold rounded-none transition-all disabled:opacity-50 ${gapCount ? 'bg-amber-500/20 border border-amber-500/40 text-amber-400 hover:bg-amber-500/30' : 'bg-card shadow-sm border border-border text-muted-foreground hover:bg-muted hover:text-foreground'}`}
                            >
                                {syncing ? <ArrowPathIcon className="w-4 h-4 animate-spin" /> : <BoltIcon className="w-4 h-4" />}
                                {syncing ? 'Syncing…' : gapCount ? `Sync (${gapCount} gaps)` : 'Sync'}
                            </button>
                        </div>

                        <div className="flex items-center gap-2">
                            <button
                                onClick={handleRemoveOrphans}
                                disabled={syncing}
                                className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-bold rounded-none transition-all disabled:opacity-50 bg-rose-500/10 border border-rose-500/20 text-rose-400 hover:bg-rose-500/20"
                                title="Delete portal rows with no auth account"
                            >
                                <TrashIcon className="w-4 h-4" />
                                Orphans
                            </button>

                            <div className="flex-1 sm:flex-none bg-card shadow-sm border border-border rounded-none p-2 px-4 flex items-center justify-between sm:justify-start gap-4 h-[44px]">
                                <div className="flex items-baseline gap-1.5">
                                    <p className="text-xl font-black text-foreground">{users.length}</p>
                                    <p className="text-[8px] text-muted-foreground uppercase font-black tracking-widest leading-none">Total</p>
                                </div>
                                <div className="h-6 w-px bg-muted hidden sm:block" />
                                <button onClick={load} className="p-1.5 hover:bg-muted rounded-none transition-colors text-muted-foreground hover:text-foreground">
                                    <ArrowPathIcon className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                                </button>
                            </div>
                            {gapCount !== null && gapCount > 0 && (
                                <button
                                    onClick={() => setShowConflicts(!showConflicts)}
                                    className={`flex items-center gap-2 px-4 py-2 rounded-none text-xs font-black uppercase tracking-widest transition-all border
                                        ${showConflicts
                                            ? 'bg-amber-500 text-black border-amber-400'
                                            : 'bg-amber-600/10 text-amber-500 border-amber-500/20 hover:bg-amber-600/20'}`}
                                >
                                    <ExclamationTriangleIcon className="w-4 h-4" />
                                    {gapCount} Conflicts Found
                                </button>
                            )}
                        </div>
                    </div>
                </div>

                {/* Conflict Details Panel */}
                {showConflicts && gapData && (
                    <div className="bg-amber-600/10 border border-amber-500/20 rounded-none p-6 mb-8 animate-in fade-in slide-in-from-top-4 duration-500">
                        <div className="flex items-center justify-between mb-6">
                            <div>
                                <h3 className="text-amber-500 font-black text-lg flex items-center gap-2 italic uppercase">
                                    <BoltIcon className="w-5 h-5 text-amber-400" /> Conflict Audit
                                </h3>
                                <p className="text-muted-foreground text-xs mt-1">These users are in a broken state (e.g., Auth account exists but Portal profile is missing). Deleting them clears "Already Registered" errors.</p>
                            </div>
                            <button onClick={() => setShowConflicts(false)} className="text-muted-foreground hover:text-foreground">
                                <XMarkIcon className="w-5 h-5" />
                            </button>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {/* Ghost Accounts (Auth without Portal) */}
                            {gapData.auth_without_portal?.length > 0 && (
                                <div className="bg-card shadow-sm rounded-none p-4 border border-border">
                                    <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground mb-3 ml-1">Ghost Accounts (Auth-Only)</h4>
                                    <div className="space-y-2">
                                        {gapData.auth_without_portal.map((u: any) => (
                                            <div key={u.id} className="flex items-center justify-between p-3 bg-card shadow-sm rounded-none border border-border hover:border-amber-500/30 transition-all group">
                                                <div className="min-w-0">
                                                    <p className="text-xs font-bold text-foreground truncate">{u.email}</p>
                                                    <p className="text-[9px] text-muted-foreground font-mono truncate">{u.id}</p>
                                                </div>
                                                <button
                                                    onClick={() => handleDelete(u)}
                                                    className="p-1 px-3 text-[10px] font-black bg-rose-600/20 text-rose-500 rounded-none hover:bg-rose-600 hover:text-foreground transition-all opacity-0 group-hover:opacity-100"
                                                >
                                                    DELETE CONFLICT
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Portal ID Mismatches */}
                            {gapData.id_mismatches?.length > 0 && (
                                <div className="bg-card shadow-sm rounded-none p-4 border border-border">
                                    <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground mb-3 ml-1">ID Mismatches</h4>
                                    <div className="space-y-2">
                                        {gapData.id_mismatches.map((u: any) => (
                                            <div key={u.id} className="flex items-center justify-between p-3 bg-card shadow-sm rounded-none border border-border hover:border-amber-500/30 transition-all group">
                                                <div className="min-w-0">
                                                    <p className="text-xs font-bold text-foreground truncate">{u.name || u.email}</p>
                                                    <p className="text-[9px] text-amber-500/60 font-mono truncate">ID: {u.id}</p>
                                                </div>
                                                <button
                                                    onClick={() => handleDelete(u)}
                                                    className="p-1 px-3 text-[10px] font-black bg-rose-600/20 text-rose-500 rounded-none hover:bg-rose-600 hover:text-foreground transition-all opacity-0 group-hover:opacity-100"
                                                >
                                                    PURGE
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Portal Needing Auth */}
                            {gapData.portal_needing_auth?.length > 0 && (
                                <div className="bg-card shadow-sm rounded-none p-4 border border-border col-span-full">
                                    <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground mb-3 ml-1">Orphaned Profiles (Portal-Only)</h4>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                                        {gapData.portal_needing_auth.map((u: any) => (
                                            <div key={u.id} className="flex items-center justify-between p-3 bg-card shadow-sm rounded-none border border-border hover:border-amber-500/30 transition-all group">
                                                <div className="min-w-0">
                                                    <p className="text-xs font-bold text-foreground truncate">{u.name || u.email}</p>
                                                    <p className="text-[9px] text-muted-foreground uppercase font-black">{u.role}</p>
                                                </div>
                                                <button
                                                    onClick={() => handleDelete(u)}
                                                    className="p-1 px-3 text-[10px] font-black bg-rose-600/20 text-rose-500 rounded-none hover:bg-rose-600 hover:text-foreground transition-all opacity-0 group-hover:opacity-100"
                                                >
                                                    PURGE
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>

                        <div className="mt-6 pt-4 border-t border-amber-500/20 flex items-center justify-between">
                            <p className="text-[10px] text-amber-500/60 font-bold uppercase tracking-widest">Warning: Purging or deleting records here is permanent.</p>
                            <button onClick={handleSync} className="text-[11px] font-black text-amber-500 hover:text-amber-400 underline underline-offset-4 decoration-2">RUN AUTO-REPAIR INSTEAD →</button>
                        </div>
                    </div>
                )}

                {/* Filters */}
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <div className="md:col-span-2 relative">
                        <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                        <input
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                            placeholder="Search by name or email..."
                            className="w-full pl-10 pr-4 py-3 bg-card shadow-sm border border-border rounded-none text-sm text-foreground focus:outline-none focus:border-orange-500 transition-colors placeholder-muted-foreground"
                        />
                    </div>
                    <div className="md:col-span-2 flex gap-2 overflow-x-auto pb-1 no-scrollbar">
                        {roleFilters.map(r => (
                            <button
                                key={r.id}
                                onClick={() => setRoleFilter(r.id)}
                                className={`flex items-center gap-2 px-4 py-2 rounded-none text-xs font-bold whitespace-nowrap border transition-all
                                    ${roleFilter === r.id
                                        ? 'bg-orange-600 text-foreground border-orange-500 shadow-lg shadow-orange-600/20'
                                        : 'bg-card shadow-sm text-muted-foreground border-border hover:border-border hover:text-foreground'}`}
                            >
                                <r.icon className="w-4 h-4" />
                                {r.label}
                            </button>
                        ))}
                    </div>
                </div>

                {/* List */}
                <div className="bg-card shadow-sm border border-border rounded-none overflow-hidden">
                    {loading ? (
                        <div className="p-12 flex flex-col items-center justify-center gap-3">
                            <div className="w-8 h-8 border-4 border-orange-500 border-t-transparent rounded-full animate-spin" />
                            <p className="text-muted-foreground text-xs font-bold uppercase tracking-widest">Loading Users...</p>
                        </div>
                    ) : filtered.length === 0 ? (
                        <div className="p-12 text-center">
                            <UserGroupIcon className="w-12 h-12 mx-auto text-muted-foreground mb-3" />
                            <p className="text-muted-foreground">No users found matching your filters.</p>
                        </div>
                    ) : (
                        <div className="divide-y divide-white/5">
                            {filtered.map(u => (
                                <div key={u.id} className="p-5 hover:bg-white/[0.02] transition-colors group">
                                    <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                                        <div className="flex items-center gap-4 flex-1 min-w-0">
                                            <div className={`w-12 h-12 rounded-none bg-gradient-to-br flex items-center justify-center text-sm font-black text-foreground flex-shrink-0 shadow-lg ${avatarGrad(u.role)}`}>
                                                {(u.full_name ?? '?')[0].toUpperCase()}
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                                                    <p className="font-bold text-foreground truncate">{u.full_name}</p>
                                                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-widest border ${roleBadge(u.role)}`}>
                                                        {u.role}
                                                    </span>
                                                    {!u.is_active && (
                                                        <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-widest bg-gray-500/10 text-gray-400 border border-gray-500/20">
                                                            Inactive
                                                        </span>
                                                    )}
                                                </div>
                                                <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                                                    <span className="flex items-center gap-1 truncate max-w-[200px] sm:max-w-none"><EnvelopeIcon className="w-3.5 h-3.5 flex-shrink-0" />{u.email}</span>
                                                    {u.phone && <span className="flex items-center gap-1"><PhoneIcon className="w-3.5 h-3.5" />{u.phone}</span>}
                                                    <span className="hidden sm:inline">Joined {new Date(u.created_at).toLocaleDateString()}</span>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Action buttons — always visible on mobile, visible on hover on desktop */}
                                        <div className="flex flex-wrap items-center gap-2 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity ml-0 sm:ml-0 mt-3 sm:mt-0 w-full sm:w-auto pt-2 sm:pt-0 border-t sm:border-t-0 border-border">
                                            {u.role === 'teacher' && (
                                                <Link
                                                    href="/dashboard/teachers"
                                                    className="inline-flex items-center gap-2 px-3 py-2 bg-blue-600/10 hover:bg-blue-600/20 text-blue-400 text-[10px] font-black uppercase rounded-none border border-blue-500/20 transition-all flex-grow sm:flex-grow-0 justify-center"
                                                >
                                                    <BuildingOfficeIcon className="w-3.5 h-3.5" />
                                                    Manage Access
                                                </Link>
                                            )}
                                            <div className="flex items-center gap-1.5 ml-auto sm:ml-0">
                                                <button
                                                    onClick={() => openEdit(u)}
                                                    className="p-2.5 sm:p-2 rounded-none bg-card shadow-sm sm:bg-transparent hover:bg-orange-500/20 hover:text-orange-400 text-muted-foreground transition-all flex items-center justify-center border border-border sm:border-none"
                                                    title="Edit user"
                                                >
                                                    <PencilIcon className="w-4 h-4" />
                                                </button>
                                                <button
                                                    onClick={() => { setResetTarget({ id: u.id, name: u.full_name }); setResetPw(''); setResetMsg(null); }}
                                                    className="p-2.5 sm:p-2 rounded-none bg-card shadow-sm sm:bg-transparent hover:bg-amber-500/20 hover:text-amber-400 text-muted-foreground transition-all flex items-center justify-center border border-border sm:border-none"
                                                    title="Reset password"
                                                >
                                                    <KeyIcon className="w-4 h-4" />
                                                </button>
                                                {u.id !== profile?.id && (
                                                    <button
                                                        onClick={() => handleDelete(u)}
                                                        disabled={deleting === u.id}
                                                        className="p-2.5 sm:p-2 rounded-none bg-card shadow-sm sm:bg-transparent hover:bg-rose-500/20 hover:text-rose-400 text-muted-foreground transition-all disabled:opacity-40 flex items-center justify-center border border-border sm:border-none"
                                                        title="Delete user"
                                                    >
                                                        {deleting === u.id
                                                            ? <ArrowPathIcon className="w-4 h-4 animate-spin" />
                                                            : <TrashIcon className="w-4 h-4" />}
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            {/* ── Sync Result Modal ── */}
            {syncResult && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
                    <div className="bg-background border border-border rounded-none w-full max-w-lg shadow-2xl max-h-[80vh] flex flex-col">
                        <div className="flex items-center justify-between p-6 border-b border-border flex-shrink-0">
                            <div className="flex items-center gap-3">
                                <BoltIcon className="w-5 h-5 text-amber-400" />
                                <h2 className="text-lg font-extrabold text-foreground">Sync Complete</h2>
                            </div>
                            <button onClick={() => setSyncResult(null)} className="p-2 rounded-none hover:bg-muted text-muted-foreground hover:text-foreground transition-all">
                                <XMarkIcon className="w-5 h-5" />
                            </button>
                        </div>
                        <div className="p-6 overflow-y-auto space-y-4">
                            {syncResult.error ? (
                                <div className="flex items-center gap-3 bg-rose-500/10 border border-rose-500/20 rounded-none p-4">
                                    <ExclamationTriangleIcon className="w-5 h-5 text-rose-400 flex-shrink-0" />
                                    <p className="text-rose-400 text-sm">{syncResult.error}</p>
                                </div>
                            ) : (
                                <>
                                    <div className="grid grid-cols-2 gap-3">
                                        {(syncResult.summary?.orphans_deleted !== undefined ? [
                                            { label: 'Orphans Deleted', value: syncResult.summary?.orphans_deleted ?? 0, color: 'text-rose-400' },
                                            { label: 'Skipped (has data)', value: syncResult.summary?.skipped ?? 0, color: 'text-muted-foreground' },
                                        ] : [
                                            { label: 'Students Fixed', value: syncResult.summary?.students_fixed ?? 0, color: 'text-emerald-400' },
                                            { label: 'Schools Fixed', value: syncResult.summary?.schools_fixed ?? 0, color: 'text-amber-400' },
                                            { label: 'Auth Created (injected)', value: syncResult.summary?.portal_auth_created ?? 0, color: 'text-cyan-400' },
                                            { label: 'Portal Rows Created', value: syncResult.summary?.portal_rows_created ?? 0, color: 'text-blue-400' },
                                            { label: 'ID Mismatches Fixed', value: syncResult.summary?.id_mismatches_fixed ?? 0, color: 'text-orange-400' },
                                        ]).map(s => (
                                            <div key={s.label} className="bg-card shadow-sm border border-border rounded-none p-3 text-center">
                                                <p className={`text-2xl font-black ${s.color}`}>{s.value}</p>
                                                <p className="text-[10px] text-muted-foreground mt-0.5">{s.label}</p>
                                            </div>
                                        ))}
                                    </div>

                                    {syncResult.credentials?.length > 0 && (
                                        <div>
                                            <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest mb-2">New Credentials — share with each user</p>
                                            <div className="space-y-2 max-h-48 overflow-y-auto">
                                                {syncResult.credentials.map((c: any, i: number) => (
                                                    <div key={i} className="bg-card shadow-sm border border-border rounded-none p-3 font-mono text-xs">
                                                        <p className="text-foreground font-bold">{c.name}</p>
                                                        <p className="text-muted-foreground mt-0.5">{c.email}</p>
                                                        <p className="text-emerald-400 font-bold mt-0.5">pw: {c.password}</p>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                    {syncResult.errors?.length > 0 && (
                                        <div>
                                            <p className="text-xs font-bold text-rose-400/60 uppercase tracking-widest mb-2">Errors ({syncResult.errors.length})</p>
                                            <div className="space-y-1 text-xs text-rose-400/80 bg-rose-500/5 border border-rose-500/20 rounded-none p-3">
                                                {syncResult.errors.map((e: string, i: number) => <p key={i}>• {e}</p>)}
                                            </div>
                                        </div>
                                    )}
                                </>
                            )}
                        </div>
                        <div className="p-4 border-t border-border flex-shrink-0">
                            <button onClick={() => setSyncResult(null)} className="w-full py-2.5 bg-orange-600 hover:bg-orange-500 text-foreground font-bold rounded-none text-sm transition-all">
                                Done
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ── Create User Modal ── */}
            {showCreate && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
                    <div className="bg-background border border-border rounded-none w-full max-w-md shadow-2xl">
                        <div className="flex items-center justify-between p-6 border-b border-border">
                            <h2 className="text-lg font-extrabold text-foreground">Create User</h2>
                            <button onClick={() => setShowCreate(false)} className="p-2 rounded-none hover:bg-muted text-muted-foreground hover:text-foreground transition-all">
                                <XMarkIcon className="w-5 h-5" />
                            </button>
                        </div>
                        <div className="p-6 space-y-4">
                            <div>
                                <label className="block text-xs font-bold text-muted-foreground uppercase tracking-widest mb-1.5">Full Name</label>
                                <input value={createForm.fullName} onChange={e => setCreateForm(p => ({ ...p, fullName: e.target.value }))}
                                    placeholder="e.g. Amaka Osei"
                                    className="w-full px-4 py-2.5 bg-card shadow-sm border border-border rounded-none text-sm text-foreground focus:outline-none focus:border-orange-500 transition-colors placeholder-muted-foreground" />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-muted-foreground uppercase tracking-widest mb-1.5">Email</label>
                                <input type="email" value={createForm.email} onChange={e => setCreateForm(p => ({ ...p, email: e.target.value }))}
                                    placeholder="user@example.com"
                                    className="w-full px-4 py-2.5 bg-card shadow-sm border border-border rounded-none text-sm text-foreground focus:outline-none focus:border-orange-500 transition-colors placeholder-muted-foreground" />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-muted-foreground uppercase tracking-widest mb-1.5">Password</label>
                                <input type="text" value={createForm.password} onChange={e => setCreateForm(p => ({ ...p, password: e.target.value }))}
                                    placeholder="At least 8 characters"
                                    className="w-full px-4 py-2.5 bg-card shadow-sm border border-border rounded-none text-sm text-foreground focus:outline-none focus:border-orange-500 transition-colors placeholder-muted-foreground" />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-muted-foreground uppercase tracking-widest mb-1.5">Role</label>
                                <select value={createForm.role} onChange={e => setCreateForm(p => ({ ...p, role: e.target.value }))}
                                    className="w-full px-4 py-2.5 bg-card shadow-sm border border-border rounded-none text-sm text-foreground focus:outline-none focus:border-orange-500 transition-colors appearance-none cursor-pointer">
                                    {ROLES.map(r => <option key={r} value={r} className="bg-background">{r.charAt(0).toUpperCase() + r.slice(1)}</option>)}
                                </select>
                            </div>
                            {createErr && <p className="text-rose-400 text-sm">{createErr}</p>}
                        </div>
                        <div className="flex gap-3 p-6 border-t border-border">
                            <button onClick={() => setShowCreate(false)}
                                className="flex-1 px-4 py-2.5 rounded-none text-sm font-bold text-muted-foreground bg-card shadow-sm hover:bg-muted transition-all">
                                Cancel
                            </button>
                            <button onClick={handleCreate} disabled={creating}
                                className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-none text-sm font-bold bg-orange-600 hover:bg-orange-500 text-foreground transition-all disabled:opacity-50">
                                {creating ? <ArrowPathIcon className="w-4 h-4 animate-spin" /> : <><CheckIcon className="w-4 h-4" /> Create</>}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ── Edit Modal ── */}
            {editing && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
                    <div className="bg-background border border-border rounded-none w-full max-w-md shadow-2xl">
                        {/* Modal header */}
                        <div className="flex items-center justify-between p-6 border-b border-border">
                            <div>
                                <h2 className="text-lg font-extrabold text-foreground">Edit User</h2>
                                <p className="text-xs text-muted-foreground mt-0.5">{editing.email}</p>
                            </div>
                            <button
                                onClick={() => setEditing(null)}
                                className="p-2 rounded-none hover:bg-muted text-muted-foreground hover:text-foreground transition-all"
                            >
                                <XMarkIcon className="w-5 h-5" />
                            </button>
                        </div>

                        {/* Modal body */}
                        <div className="p-6 space-y-4">
                            <div>
                                <label className="block text-xs font-bold text-muted-foreground uppercase tracking-widest mb-1.5">Full Name</label>
                                <input
                                    value={editForm.full_name}
                                    onChange={e => setEditForm(p => ({ ...p, full_name: e.target.value }))}
                                    className="w-full px-4 py-2.5 bg-card shadow-sm border border-border rounded-none text-sm text-foreground focus:outline-none focus:border-orange-500 transition-colors"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-muted-foreground uppercase tracking-widest mb-1.5">Role</label>
                                <select
                                    value={editForm.role}
                                    onChange={e => setEditForm(p => ({ ...p, role: e.target.value }))}
                                    className="w-full px-4 py-2.5 bg-card shadow-sm border border-border rounded-none text-sm text-foreground focus:outline-none focus:border-orange-500 transition-colors appearance-none cursor-pointer"
                                >
                                    {ROLES.map(r => (
                                        <option key={r} value={r} className="bg-background">{r.charAt(0).toUpperCase() + r.slice(1)}</option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-muted-foreground uppercase tracking-widest mb-1.5">Phone (optional)</label>
                                <input
                                    value={editForm.phone}
                                    onChange={e => setEditForm(p => ({ ...p, phone: e.target.value }))}
                                    placeholder="+234 800 000 0000"
                                    className="w-full px-4 py-2.5 bg-card shadow-sm border border-border rounded-none text-sm text-foreground focus:outline-none focus:border-orange-500 transition-colors placeholder-muted-foreground"
                                />
                            </div>
                            <div className="flex items-center justify-between p-3 bg-card shadow-sm border border-border rounded-none">
                                <div>
                                    <p className="text-sm font-bold text-foreground">Account Active</p>
                                    <p className="text-xs text-muted-foreground">Inactive users cannot log in</p>
                                </div>
                                <button
                                    onClick={() => setEditForm(p => ({ ...p, is_active: !p.is_active }))}
                                    className={`w-11 h-6 rounded-full transition-all flex-shrink-0 relative ${editForm.is_active ? 'bg-emerald-500' : 'bg-muted'}`}
                                >
                                    <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow-sm transition-all ${editForm.is_active ? 'left-[22px]' : 'left-0.5'}`} />
                                </button>
                            </div>

                            {editErr && <p className="text-rose-400 text-sm">{editErr}</p>}
                        </div>

                        {/* Modal footer */}
                        <div className="flex gap-3 p-6 border-t border-border">
                            <button
                                onClick={() => setEditing(null)}
                                className="flex-1 px-4 py-2.5 rounded-none text-sm font-bold text-muted-foreground bg-card shadow-sm hover:bg-muted transition-all"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={saveEdit}
                                disabled={saving}
                                className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-none text-sm font-bold bg-orange-600 hover:bg-orange-500 text-foreground transition-all shadow-lg shadow-orange-600/20 disabled:opacity-50"
                            >
                                {saving ? (
                                    <ArrowPathIcon className="w-4 h-4 animate-spin" />
                                ) : (
                                    <><CheckIcon className="w-4 h-4" /> Save Changes</>
                                )}
                            </button>
                        </div>
                    </div>
                </div>
            )}
            {/* ── Reset Password Modal ── */}
            {resetTarget && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setResetTarget(null)} />
                    <div className="relative w-full max-w-md bg-background border border-border rounded-none shadow-2xl">
                        <div className="flex items-center justify-between p-6 border-b border-border">
                            <div>
                                <p className="text-xs font-bold text-amber-400 uppercase tracking-widest mb-0.5">Admin Action</p>
                                <h2 className="text-lg font-extrabold text-foreground">Reset Password</h2>
                                <p className="text-sm text-muted-foreground mt-0.5">For: <span className="text-muted-foreground font-semibold">{resetTarget.name}</span></p>
                            </div>
                            <button onClick={() => setResetTarget(null)} className="p-2 rounded-none hover:bg-muted text-muted-foreground hover:text-foreground transition-colors">
                                <XMarkIcon className="w-5 h-5" />
                            </button>
                        </div>
                        <form onSubmit={handleResetPw} className="p-6 space-y-4">
                            {resetMsg && (
                                <div className={`rounded-none px-4 py-3 text-sm border ${resetMsg.ok ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' : 'bg-rose-500/10 border-rose-500/20 text-rose-400'}`}>
                                    {resetMsg.text}
                                </div>
                            )}
                            <div>
                                <label className="block text-xs font-bold text-muted-foreground uppercase tracking-widest mb-1.5">New Password</label>
                                <input type="password" required minLength={8} value={resetPw} onChange={e => setResetPw(e.target.value)}
                                    placeholder="Minimum 8 characters"
                                    className="w-full px-4 py-3 bg-card shadow-sm border border-border rounded-none text-sm text-foreground focus:outline-none focus:border-amber-500 transition-colors placeholder-muted-foreground" />
                                <p className="text-xs text-white/25 mt-1.5">Share this new password with the user directly.</p>
                            </div>
                            <div className="flex gap-3 pt-2">
                                <button type="button" onClick={() => setResetTarget(null)}
                                    className="flex-1 py-3 bg-card shadow-sm hover:bg-muted text-muted-foreground text-sm font-bold rounded-none border border-border transition-all">
                                    Cancel
                                </button>
                                <button type="submit" disabled={resetting || resetPw.length < 8}
                                    className="flex-1 flex items-center justify-center gap-2 py-3 bg-amber-600 hover:bg-amber-500 text-foreground text-sm font-bold rounded-none transition-all disabled:opacity-50">
                                    {resetting ? <ArrowPathIcon className="w-4 h-4 animate-spin" /> : <CheckCircleIcon className="w-4 h-4" />}
                                    {resetting ? 'Updating…' : 'Set Password'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
