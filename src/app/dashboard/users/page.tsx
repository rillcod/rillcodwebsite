'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/auth-context';
import { createClient } from '@/lib/supabase/client';
import {
    ShieldCheckIcon, MagnifyingGlassIcon, UserGroupIcon,
    AcademicCapIcon, BuildingOfficeIcon, UserIcon,
    XMarkIcon, ArrowPathIcon, EnvelopeIcon, PhoneIcon,
} from '@heroicons/react/24/outline';

export default function UsersPage() {
    const { profile } = useAuth();
    const [users, setUsers] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [roleFilter, setRoleFilter] = useState('all');

    const load = async () => {
        setLoading(true);
        const supabase = createClient();
        const { data } = await supabase
            .from('portal_users')
            .select('*')
            .order('created_at', { ascending: false });
        setUsers(data ?? []);
        setLoading(false);
    };

    useEffect(() => { load(); }, []);

    const filtered = users.filter(u => {
        const matchesSearch =
            (u.full_name ?? '').toLowerCase().includes(search.toLowerCase()) ||
            (u.email ?? '').toLowerCase().includes(search.toLowerCase());
        const matchesRole = roleFilter === 'all' || u.role === roleFilter;
        return matchesSearch && matchesRole;
    });

    const roles = [
        { id: 'all', label: 'All Users', icon: UserGroupIcon },
        { id: 'admin', label: 'Admins', icon: ShieldCheckIcon },
        { id: 'teacher', label: 'Teachers', icon: AcademicCapIcon },
        { id: 'school', label: 'Partners', icon: BuildingOfficeIcon },
        { id: 'student', label: 'Students', icon: UserIcon },
    ];

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
                        {roles.map(r => (
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
                                        <div className={`w-12 h-12 rounded-2xl bg-gradient-to-br flex items-center justify-center text-sm font-black text-white flex-shrink-0 shadow-lg
                      ${u.role === 'admin' ? 'from-rose-600 to-rose-400' :
                                                u.role === 'teacher' ? 'from-violet-600 to-violet-400' :
                                                    u.role === 'school' ? 'from-blue-600 to-blue-400' :
                                                        'from-emerald-600 to-emerald-400'}`}>
                                            {(u.full_name ?? '?')[0].toUpperCase()}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2 mb-0.5">
                                                <p className="font-bold text-white truncate">{u.full_name}</p>
                                                <span className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-widest border
                          ${u.role === 'admin' ? 'bg-rose-500/10 text-rose-400 border-rose-500/20' :
                                                        u.role === 'teacher' ? 'bg-violet-500/10 text-violet-400 border-violet-500/20' :
                                                            u.role === 'school' ? 'bg-blue-500/10 text-blue-400 border-blue-500/20' :
                                                                'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'}`}>
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
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
