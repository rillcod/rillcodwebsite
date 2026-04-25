'use client';

import React, { useState } from 'react';
import { usePresence } from '@/hooks/use-presence';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Search, Users as UsersIcon } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';

export function PresenceSidebar() {
    const presence = usePresence();
    const [search, setSearch] = useState('');

    const sortedUsers = Object.values(presence)
        .filter(u => !search || u.userName?.toLowerCase().includes(search.toLowerCase()))
        .sort((a, b) => {
            if (a.status === 'online' && b.status !== 'online') return -1;
            if (a.status !== 'online' && b.status === 'online') return 1;
            return 0;
        });

    return (
        <div className="w-80 h-full bg-[#0a0a14]/50 backdrop-blur-xl border-l border-border flex flex-col overflow-hidden hidden xl:flex">
            <div className="p-6 border-b border-border space-y-6">
                <div className="flex items-center justify-between">
                    <h3 className="text-[10px] font-black text-primary uppercase tracking-[0.2em]">Active Learners</h3>
                    <div className="px-2 py-0.5 rounded-md bg-primary/10 border border-primary/20 text-[10px] text-primary font-bold">
                        {sortedUsers.length} Online
                    </div>
                </div>
                <div className="relative group">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-white/20 group-focus-within:text-primary transition-colors" />
                    <input
                        placeholder="Search peers..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="w-full pl-11 pr-4 py-3 bg-white/5 border border-border rounded-2xl text-xs text-white placeholder-muted-foreground focus:outline-none focus:border-primary/30 focus:bg-white/10 transition-all font-medium"
                    />
                </div>
            </div>

            <ScrollArea className="flex-1">
                <div className="p-4 space-y-2">
                    {sortedUsers.map((user) => (
                        <button
                            key={user.userId}
                            className="w-full flex items-center gap-4 p-3 rounded-[1.25rem] hover:bg-white/5 transition-all duration-200 group text-left border border-transparent hover:border-border"
                        >
                            <div className="relative">
                                <Avatar className="w-10 h-10 border border-border">
                                    <AvatarFallback className="bg-primary/10 text-primary text-xs font-black">
                                        {user.userName?.substring(0, 2).toUpperCase() || '??'}
                                    </AvatarFallback>
                                </Avatar>
                                <div className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full border-2 border-[#0a0a14] bg-emerald-500 shadow-sm" />
                            </div>
                            <div className="flex-1 overflow-hidden">
                                <p className="text-sm font-bold text-white/80 truncate group-hover:text-white transition-colors">
                                    {user.userName}
                                </p>
                                <p className="text-[10px] text-white/30 font-bold uppercase tracking-widest mt-0.5">
                                    Enrolled
                                </p>
                            </div>
                        </button>
                    ))}

                    {sortedUsers.length === 0 && (
                        <div className="p-12 text-center space-y-4 opacity-20">
                            <UsersIcon className="w-10 h-10 text-white mx-auto stroke-1" />
                            <p className="text-[10px] font-black text-white uppercase tracking-[0.2em]">No peers online</p>
                        </div>
                    )}
                </div>
            </ScrollArea>
        </div>
    );
}
