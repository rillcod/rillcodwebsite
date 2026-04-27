'use client';

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid,
    Tooltip, ResponsiveContainer, LineChart, Line, AreaChart, Area
} from 'recharts';
import { Brain, Target, TrendingUp, Clock, AlertCircle } from 'lucide-react';

interface Metric {
    name: string;
    value: number;
    change: number;
    status: 'excellent' | 'good' | 'average' | 'at-risk';
}

const data = [
    { name: 'Mon', score: 85, avg: 70 },
    { name: 'Tue', score: 78, avg: 72 },
    { name: 'Wed', score: 92, avg: 71 },
    { name: 'Thu', score: 88, avg: 75 },
    { name: 'Fri', score: 95, avg: 74 },
    { name: 'Sat', score: 82, avg: 72 },
    { name: 'Sun', score: 90, avg: 73 },
];

export function PerformanceInsights() {
    return (
        <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <Card className="border-none shadow-lg shadow-teal-500/5 bg-card dark:bg-slate-900 overflow-hidden">
                    <CardContent className="p-6">
                        <div className="flex justify-between items-start">
                            <div className="p-3 bg-teal-50 rounded-2xl">
                                <Target className="w-5 h-5 text-teal-600" />
                            </div>
                            <Badge variant="outline" className="text-green-600 bg-green-50 border-green-100">+12%</Badge>
                        </div>
                        <div className="mt-4">
                            <p className="text-2xl font-black text-foreground dark:text-slate-100">94.2%</p>
                            <p className="text-xs text-muted-foreground font-bold uppercase tracking-wider mt-1">Accuracy Rate</p>
                        </div>
                    </CardContent>
                </Card>

                <Card className="border-none shadow-lg shadow-primary/5 bg-card dark:bg-slate-900">
                    <CardContent className="p-6">
                        <div className="flex justify-between items-start">
                            <div className="p-3 bg-blue-50 rounded-2xl">
                                <Brain className="w-5 h-5 text-primary" />
                            </div>
                            <Badge variant="outline" className="text-primary bg-blue-50 border-blue-100">Top 5%</Badge>
                        </div>
                        <div className="mt-4">
                            <p className="text-2xl font-black text-foreground dark:text-slate-100">850</p>
                            <p className="text-xs text-muted-foreground font-bold uppercase tracking-wider mt-1">Total XP Points</p>
                        </div>
                    </CardContent>
                </Card>

                <Card className="border-none shadow-lg shadow-purple-500/5 bg-card dark:bg-slate-900">
                    <CardContent className="p-6">
                        <div className="flex justify-between items-start">
                            <div className="p-3 bg-purple-50 rounded-2xl">
                                <Clock className="w-5 h-5 text-purple-600" />
                            </div>
                            <Badge variant="outline" className="text-muted-foreground/70 bg-background border-slate-100">-2m</Badge>
                        </div>
                        <div className="mt-4">
                            <p className="text-2xl font-black text-foreground dark:text-slate-100">14.5h</p>
                            <p className="text-xs text-muted-foreground font-bold uppercase tracking-wider mt-1">Time Invested</p>
                        </div>
                    </CardContent>
                </Card>

                <Card className="border-none shadow-lg shadow-primary/5 bg-card dark:bg-slate-900">
                    <CardContent className="p-6">
                        <div className="flex justify-between items-start">
                            <div className="p-3 bg-orange-50 rounded-2xl">
                                <TrendingUp className="w-5 h-5 text-primary" />
                            </div>
                            <Badge variant="outline" className="text-primary bg-orange-50 border-orange-100">Steak: 12d</Badge>
                        </div>
                        <div className="mt-4">
                            <p className="text-2xl font-black text-foreground dark:text-slate-100">Gold</p>
                            <p className="text-xs text-muted-foreground font-bold uppercase tracking-wider mt-1">Achievement Tier</p>
                        </div>
                    </CardContent>
                </Card>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <Card className="border-none shadow-2xl shadow-slate-200/50 dark:shadow-none bg-card dark:bg-slate-900 rounded-3xl overflow-hidden">
                    <CardHeader className="p-8 pb-0">
                        <CardTitle className="text-lg font-bold flex items-center justify-between">
                            Activity Trends
                            <Badge variant="outline" className="text-[10px] font-black uppercase px-2">Weekly</Badge>
                        </CardTitle>
                        <CardDescription className="text-xs text-muted-foreground/70 font-medium">Comparative analysis of your scores vs class average</CardDescription>
                    </CardHeader>
                    <CardContent className="p-4 md:p-8">
                        <div className="h-[300px] w-full">
                            <ResponsiveContainer width="100%" height="100%">
                                <AreaChart data={data}>
                                    <defs>
                                        <linearGradient id="colorScore" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="5%" stopColor="#0d9488" stopOpacity={0.3} />
                                            <stop offset="95%" stopColor="#0d9488" stopOpacity={0} />
                                        </linearGradient>
                                    </defs>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                                    <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#94a3b8' }} />
                                    <YAxis hide />
                                    <Tooltip
                                        contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 20px 25px -5px rgb(0 0 0 / 0.1)' }}
                                        itemStyle={{ fontSize: '12px', fontWeight: 'bold' }}
                                    />
                                    <Area type="monotone" dataKey="score" stroke="#0d9488" strokeWidth={3} fillOpacity={1} fill="url(#colorScore)" />
                                    <Area type="monotone" dataKey="avg" stroke="#cbd5e1" strokeWidth={2} strokeDasharray="5 5" fill="transparent" />
                                </AreaChart>
                            </ResponsiveContainer>
                        </div>
                    </CardContent>
                </Card>

                <Card className="border-none shadow-2xl shadow-slate-200/50 dark:shadow-none bg-card dark:bg-slate-900 rounded-3xl">
                    <CardHeader className="p-8">
                        <CardTitle className="text-lg font-bold">Concept Mastery</CardTitle>
                        <CardDescription className="text-xs text-muted-foreground/70 font-medium">Performance broken down by subject matter</CardDescription>
                    </CardHeader>
                    <CardContent className="p-8 pt-0 space-y-6">
                        <div className="space-y-2">
                            <div className="flex justify-between items-center text-xs font-bold uppercase tracking-widest text-muted-foreground">
                                <span>Robotics & IoT</span>
                                <span className="text-teal-600">92%</span>
                            </div>
                            <div className="h-2 w-full bg-muted dark:bg-slate-800 rounded-full overflow-hidden">
                                <div className="h-full bg-teal-500 rounded-full" style={{ width: '92%' }} />
                            </div>
                        </div>

                        <div className="space-y-2">
                            <div className="flex justify-between items-center text-xs font-bold uppercase tracking-widest text-muted-foreground">
                                <span>Web Engineering</span>
                                <span className="text-primary">78%</span>
                            </div>
                            <div className="h-2 w-full bg-muted dark:bg-slate-800 rounded-full overflow-hidden">
                                <div className="h-full bg-primary rounded-full" style={{ width: '78%' }} />
                            </div>
                        </div>

                        <div className="space-y-2">
                            <div className="flex justify-between items-center text-xs font-bold uppercase tracking-widest text-muted-foreground">
                                <span>Artificial Intelligence</span>
                                <span className="text-purple-600">85%</span>
                            </div>
                            <div className="h-2 w-full bg-muted dark:bg-slate-800 rounded-full overflow-hidden">
                                <div className="h-full bg-purple-500 rounded-full" style={{ width: '85%' }} />
                            </div>
                        </div>

                        <div className="flex items-center gap-3 p-4 bg-orange-50 dark:bg-orange-950/20 border border-orange-100 dark:border-primary/70/30 rounded-2xl mt-8">
                            <AlertCircle className="w-5 h-5 text-primary shrink-0" />
                            <div className="text-[11px] leading-snug">
                                <p className="font-bold text-primary/80 dark:text-orange-200 uppercase tracking-tighter">Instructor Insight</p>
                                <p className="text-primary/90 dark:text-primary font-medium mt-0.5">Focus on "Data Structures" module. Suggested review time: 45 minutes.</p>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
