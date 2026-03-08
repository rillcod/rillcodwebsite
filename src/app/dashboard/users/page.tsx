'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/auth-context';
import {
    ShieldCheckIcon, MagnifyingGlassIcon, UserGroupIcon,
    AcademicCapIcon, BuildingOfficeIcon, UserIcon,
    ArrowPathIcon, EnvelopeIcon, PhoneIcon,
    PencilIcon, TrashIcon, XMarkIcon, CheckIcon,
} from '@heroicons/react/24/outline';

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
    const { profile } = useAuth();
    const [users, setUsers] = useState<PortalUser[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [roleFilter, setRoleFilter] = useState('all');

    // Edit modal state
    const [editing, setEditing] = useState<PortalUser | null>(null);
    const [editForm, setEditForm] = useState({ full_name: '', role: '', phone: '', is_active: true });
    const [saving, setSaving] = useState(false);
    const [editErr, setEditErr] = useState('');

    // Delete state
    const [deleting, setDeleting] = useState<string | null>(null);

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

    useEffect(() => { load(); }, []);

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

    const handleDelete = async (u: PortalUser) => {
        if (!confirm(`Delete "${u.full_name}"? This removes their account permanently.`)) return;
        setDeleting(u.id);
        try {
            const res = await fetch(`/api/portal-users/${u.id}`, { method: 'DELETE' });
            const json = await res.json();
            if (!res.ok) throw new Error(json.error || 'Delete failed');
            setUsers(prev => prev.filter(x => x.id !== u.id));
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
            teacher: 'bg-violet-500/10 text-violet-400 border-violet-500/20',
            school: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
            student: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
        };
        return map[role] ?? 'bg-white/5 text-white/40 border-white/10';
    };

    const avatarGrad = (role: string) => {
        const map: Record<string, string> = {
            admin: 'from-rose-600 to-rose-400',
            teacher: 'from-violet-600 to-violet-400',
            school: 'from-blue-600 to-blue-400',
            student: 'from-emerald-600 to-emerald-400',
        };
        return map[role] ?? 'from-gray-600 to-gray-400';
    };

    if (profile?.role !== 'admin') {
        return (
            <div className="min-h-screen flex items-center justify-center bg-[#0f0f1a]">
                <p className="text-white/40">Only admins can access this page.</p>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-[#0f0f1a] text-white">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">

                {/* Header */}
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                    <div>
                        <div className="flex items-center gap-2 mb-1">
                            <ShieldCheckIcon className="w-5 h-5 text-violet-400" />
                            <span className="text-xs font-bold text-violet-400 uppercase tracking-widest">System Administration</span>
                        </div>
                        <h1 className="text-3xl font-extrabold">All Portal Users</h1>
                        <p className="text-white/40 text-sm mt-1">Manage and verify all user accounts across the system</p>
                    </div>
                    <div className="bg-white/5 border border-white/10 rounded-2xl p-4 flex items-center gap-6">
                        <div>
                            <p className="text-2xl font-black text-white">{users.length}</p>
                            <p className="text-[10px] text-white/40 uppercase font-black tracking-widest">Total Accounts</p>
                        </div>
                        <div className="h-8 w-px bg-white/10" />
                        <button onClick={load} className="p-2 hover:bg-white/10 rounded-xl transition-colors text-white/40 hover:text-white">
                            <ArrowPathIcon className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
                        </button>
                    </div>
                </div>

                {/* Filters */}
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <div className="md:col-span-2 relative">
                        <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
                        <input
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                            placeholder="Search by name or email..."
                            className="w-full pl-10 pr-4 py-3 bg-white/5 border border-white/10 rounded-xl text-sm text-white focus:outline-none focus:border-violet-500 transition-colors placeholder-white/20"
                        />
                    </div>
                    <div className="md:col-span-2 flex gap-2 overflow-x-auto pb-1 no-scrollbar">
                        {roleFilters.map(r => (
                            <button
                                key={r.id}
                                onClick={() => setRoleFilter(r.id)}
                                className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold whitespace-nowrap border transition-all
                                    ${roleFilter === r.id
                                        ? 'bg-violet-600 text-white border-violet-500 shadow-lg shadow-violet-600/20'
                                        : 'bg-white/5 text-white/40 border-white/10 hover:border-white/20 hover:text-white'}`}
                            >
                                <r.icon className="w-4 h-4" />
                                {r.label}
                            </button>
                        ))}
                    </div>
                </div>

                {/* List */}
                <div className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden">
                    {loading ? (
                        <div className="p-12 flex flex-col items-center justify-center gap-3">
                            <div className="w-8 h-8 border-4 border-violet-500 border-t-transparent rounded-full animate-spin" />
                            <p className="text-white/20 text-xs font-bold uppercase tracking-widest">Loading Users...</p>
                        </div>
                    ) : filtered.length === 0 ? (
                        <div className="p-12 text-center">
                            <UserGroupIcon className="w-12 h-12 mx-auto text-white/10 mb-3" />
                            <p className="text-white/30">No users found matching your filters.</p>
                        </div>
                    ) : (
                        <div className="divide-y divide-white/5">
                            {filtered.map(u => (
                                <div key={u.id} className="p-5 hover:bg-white/[0.02] transition-colors group">
                                    <div className="flex items-center gap-4">
                                        <div className={`w-12 h-12 rounded-2xl bg-gradient-to-br flex items-center justify-center text-sm font-black text-white flex-shrink-0 shadow-lg ${avatarGrad(u.role)}`}>
                                            {(u.full_name ?? '?')[0].toUpperCase()}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                                                <p className="font-bold text-white truncate">{u.full_name}</p>
                                                <span className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-widest border ${roleBadge(u.role)}`}>
                                                    {u.role}
                                                </span>
                                                {!u.is_active && (
                                                    <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-widest bg-gray-500/10 text-gray-400 border border-gray-500/20">
                                                        Inactive
                                                    </span>
                                                )}
                                            </div>
                                            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-white/40">
                                                <span className="flex items-center gap-1"><EnvelopeIcon className="w-3.5 h-3.5" />{u.email}</span>
                                                {u.phone && <span className="flex items-center gap-1"><PhoneIcon className="w-3.5 h-3.5" />{u.phone}</span>}
                                                <span>Joined {new Date(u.created_at).toLocaleDateString()}</span>
                                            </div>
                                        </div>
                                        {/* Action buttons — visible on hover */}
                                        <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                                            <button
                                                onClick={() => openEdit(u)}
                                                className="p-2 rounded-xl bg-white/5 hover:bg-violet-500/20 hover:text-violet-400 text-white/40 transition-all"
                                                title="Edit user"
                                            >
                                                <PencilIcon className="w-4 h-4" />
                                            </button>
                                            {u.id !== profile?.id && (
                                                <button
                                                    onClick={() => handleDelete(u)}
                                                    disabled={deleting === u.id}
                                                    className="p-2 rounded-xl bg-white/5 hover:bg-rose-500/20 hover:text-rose-400 text-white/40 transition-all disabled:opacity-40"
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
                            ))}
                        </div>
                    )}
                </div>
            </div>

            {/* ── Edit Modal ── */}
            {editing && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
                    <div className="bg-[#0f0f1a] border border-white/10 rounded-2xl w-full max-w-md shadow-2xl">
                        {/* Modal header */}
                        <div className="flex items-center justify-between p-6 border-b border-white/10">
                            <div>
                                <h2 className="text-lg font-extrabold text-white">Edit User</h2>
                                <p className="text-xs text-white/40 mt-0.5">{editing.email}</p>
                            </div>
                            <button
                                onClick={() => setEditing(null)}
                                className="p-2 rounded-xl hover:bg-white/10 text-white/40 hover:text-white transition-all"
                            >
                                <XMarkIcon className="w-5 h-5" />
                            </button>
                        </div>

                        {/* Modal body */}
                        <div className="p-6 space-y-4">
                            <div>
                                <label className="block text-xs font-bold text-white/40 uppercase tracking-widest mb-1.5">Full Name</label>
                                <input
                                    value={editForm.full_name}
                                    onChange={e => setEditForm(p => ({ ...p, full_name: e.target.value }))}
                                    className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-sm text-white focus:outline-none focus:border-violet-500 transition-colors"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-white/40 uppercase tracking-widest mb-1.5">Role</label>
                                <select
                                    value={editForm.role}
                                    onChange={e => setEditForm(p => ({ ...p, role: e.target.value }))}
                                    className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-sm text-white focus:outline-none focus:border-violet-500 transition-colors appearance-none cursor-pointer"
                                >
                                    {ROLES.map(r => (
                                        <option key={r} value={r} className="bg-[#0f0f1a]">{r.charAt(0).toUpperCase() + r.slice(1)}</option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-white/40 uppercase tracking-widest mb-1.5">Phone (optional)</label>
                                <input
                                    value={editForm.phone}
                                    onChange={e => setEditForm(p => ({ ...p, phone: e.target.value }))}
                                    placeholder="+234 800 000 0000"
                                    className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-sm text-white focus:outline-none focus:border-violet-500 transition-colors placeholder-white/20"
                                />
                            </div>
                            <div className="flex items-center justify-between p-3 bg-white/5 border border-white/10 rounded-xl">
                                <div>
                                    <p className="text-sm font-bold text-white">Account Active</p>
                                    <p className="text-xs text-white/40">Inactive users cannot log in</p>
                                </div>
                                <button
                                    onClick={() => setEditForm(p => ({ ...p, is_active: !p.is_active }))}
                                    className={`w-11 h-6 rounded-full transition-all flex-shrink-0 relative ${editForm.is_active ? 'bg-emerald-500' : 'bg-white/10'}`}
                                >
                                    <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow-sm transition-all ${editForm.is_active ? 'left-[22px]' : 'left-0.5'}`} />
                                </button>
                            </div>

                            {editErr && <p className="text-rose-400 text-sm">{editErr}</p>}
                        </div>

                        {/* Modal footer */}
                        <div className="flex gap-3 p-6 border-t border-white/10">
                            <button
                                onClick={() => setEditing(null)}
                                className="flex-1 px-4 py-2.5 rounded-xl text-sm font-bold text-white/50 bg-white/5 hover:bg-white/10 transition-all"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={saveEdit}
                                disabled={saving}
                                className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold bg-violet-600 hover:bg-violet-500 text-white transition-all shadow-lg shadow-violet-600/20 disabled:opacity-50"
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
        </div>
    );
}
