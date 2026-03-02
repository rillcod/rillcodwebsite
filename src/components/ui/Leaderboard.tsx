'use client';

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Trophy, Medal, Zap, TrendingUp, ChevronUp } from 'lucide-react';

interface Entry {
    id: string;
    user_id: string;
    points: number;
    rank: number;
    portal_users: { full_name: string; profile_image_url?: string };
}

interface LeaderboardProps {
    entries: Entry[];
}

export function Leaderboard({ entries }: LeaderboardProps) {
    const topThree = entries.slice(0, 3);
    const rest = entries.slice(3);

    return (
        <div className="space-y-8 max-w-2xl mx-auto p-4">
            {/* Top 3 Podium View */}
            <div className="flex justify-center items-end gap-2 md:gap-8 pb-8 pt-12 relative">
                <div className="absolute top-0 left-1/2 -translate-x-1/2 w-32 h-32 bg-teal-500/10 blur-[100px] rounded-full" />

                {/* Second Place */}
                {topThree[1] && (
                    <div className="flex flex-col items-center group animate-in slide-in-from-bottom-5 duration-700 delay-200">
                        <div className="relative mb-3">
                            <Avatar className="w-16 h-16 border-4 border-slate-200 dark:border-slate-800 ring-4 ring-slate-100 dark:ring-slate-900 group-hover:scale-110 transition-transform">
                                <AvatarImage src={topThree[1].portal_users.profile_image_url} />
                                <AvatarFallback className="bg-slate-200">{topThree[1].portal_users.full_name.substring(0, 2)}</AvatarFallback>
                            </Avatar>
                            <div className="absolute -bottom-2 -right-2 bg-slate-300 text-slate-900 w-7 h-7 rounded-full flex items-center justify-center text-xs font-black ring-2 ring-white">2</div>
                        </div>
                        <p className="text-sm font-bold text-slate-700 dark:text-slate-300 truncate w-24 text-center">{topThree[1].portal_users.full_name}</p>
                        <Badge variant="secondary" className="mt-2 font-mono text-teal-600 bg-teal-50">{topThree[1].points} pts</Badge>
                    </div>
                )}

                {/* First Place */}
                {topThree[0] && (
                    <div className="flex flex-col items-center group -mt-12 animate-in slide-in-from-bottom-8 duration-1000">
                        <div className="relative mb-4">
                            <div className="absolute -top-10 left-1/2 -translate-x-1/2">
                                <Trophy className="w-10 h-10 text-yellow-500 animate-bounce" />
                            </div>
                            <Avatar className="w-24 h-24 border-4 border-yellow-400 ring-8 ring-teal-500/5 group-hover:scale-110 transition-transform shadow-2xl shadow-yellow-500/20">
                                <AvatarImage src={topThree[0].portal_users.profile_image_url} />
                                <AvatarFallback className="bg-yellow-400 text-yellow-900">{topThree[0].portal_users.full_name.substring(0, 2)}</AvatarFallback>
                            </Avatar>
                            <div className="absolute -bottom-2 -right-2 bg-yellow-400 text-yellow-900 w-8 h-8 rounded-full flex items-center justify-center text-sm font-black ring-4 ring-white">1</div>
                        </div>
                        <p className="text-base font-black text-slate-800 dark:text-slate-100 truncate w-32 text-center">{topThree[0].portal_users.full_name}</p>
                        <Badge className="mt-2 bg-yellow-400 hover:bg-yellow-500 text-yellow-900 px-4 py-1 rounded-full font-bold">{topThree[0].points} XP</Badge>
                    </div>
                )}

                {/* Third Place */}
                {topThree[2] && (
                    <div className="flex flex-col items-center group animate-in slide-in-from-bottom-5 duration-700 delay-400">
                        <div className="relative mb-3">
                            <Avatar className="w-14 h-14 border-4 border-orange-200 dark:border-orange-900 ring-4 ring-orange-50 dark:ring-orange-950 group-hover:scale-110 transition-transform">
                                <AvatarImage src={topThree[2].portal_users.profile_image_url} />
                                <AvatarFallback className="bg-orange-100">{topThree[2].portal_users.full_name.substring(0, 2)}</AvatarFallback>
                            </Avatar>
                            <div className="absolute -bottom-2 -right-2 bg-orange-300 text-orange-900 w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-black ring-2 ring-white">3</div>
                        </div>
                        <p className="text-sm font-bold text-slate-700 dark:text-slate-300 truncate w-24 text-center">{topThree[2].portal_users.full_name}</p>
                        <Badge variant="secondary" className="mt-2 font-mono text-teal-600 bg-teal-50">{topThree[2].points} pts</Badge>
                    </div>
                )}
            </div>

            {/* List View */}
            <Card className="border-none shadow-xl shadow-teal-500/5 overflow-hidden rounded-3xl">
                <CardHeader className="bg-white dark:bg-slate-900 border-b border-slate-50 dark:border-slate-800 flex flex-row justify-between items-center py-4">
                    <CardTitle className="text-sm font-bold text-slate-500 flex items-center gap-2">
                        <Medal className="w-4 h-4" /> RECENT MOVERS
                    </CardTitle>
                    <TrendingUp className="w-4 h-4 text-green-500" />
                </CardHeader>
                <CardContent className="p-0 bg-white dark:bg-slate-900">
                    <div className="divide-y divide-slate-50 dark:divide-slate-800">
                        {rest.map((entry, idx) => (
                            <div key={entry.id} className="flex items-center justify-between px-6 py-4 hover:bg-slate-50/50 dark:hover:bg-slate-800/50 transition-colors group">
                                <div className="flex items-center gap-4">
                                    <span className="text-xs font-black text-slate-300 dark:text-slate-600 w-4 group-hover:text-teal-500 transition-colors">#{entry.rank}</span>
                                    <Avatar className="w-10 h-10 border-2 border-slate-100 dark:border-slate-800">
                                        <AvatarImage src={entry.portal_users.profile_image_url} />
                                        <AvatarFallback>{entry.portal_users.full_name.substring(0, 2)}</AvatarFallback>
                                    </Avatar>
                                    <div>
                                        <p className="text-sm font-bold text-slate-800 dark:text-slate-200">{entry.portal_users.full_name}</p>
                                        <div className="flex items-center gap-1">
                                            <Zap className="w-3 h-3 text-yellow-500 fill-yellow-500" />
                                            <span className="text-[10px] text-slate-400 font-bold">Lvl 12 Polymath</span>
                                        </div>
                                    </div>
                                </div>
                                <div className="flex items-center gap-4">
                                    <div className="text-right">
                                        <p className="text-sm font-black text-teal-600">{entry.points}</p>
                                        <div className="flex items-center gap-1 justify-end text-[10px] text-green-500 font-bold uppercase">
                                            <ChevronUp className="w-3 h-3" /> 2
                                        </div>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
