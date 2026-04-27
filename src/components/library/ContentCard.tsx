'use client';

import React from 'react';
import Image from 'next/image';
import { Card, CardContent, CardFooter, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
    FileVideo, FileText, Layout, Star,
    Download, Copy, MoreHorizontal, Eye,
    Tag as TagIcon, Clock
} from 'lucide-react';
import { format } from 'date-fns';

interface ContentItem {
    id: string;
    title: string;
    content_type: 'video' | 'document' | 'quiz' | 'assignment';
    tags: string[];
    average_rating: number;
    usage_count: number;
    created_at: string;
    created_by_name: string;
    thumbnail_url?: string;
}

export function ContentLibraryCard({ item }: { item: ContentItem }) {
    const IconMap = {
        video: <FileVideo className="w-5 h-5 text-purple-500" />,
        document: <FileText className="w-5 h-5 text-primary" />,
        quiz: <Layout className="w-5 h-5 text-primary" />,
        assignment: <FileText className="w-5 h-5 text-teal-500" />
    };

    return (
        <Card className="group overflow-hidden border-none shadow-lg hover:shadow-2xl transition-all duration-500 rounded-3xl bg-card dark:bg-slate-900">
            {/* Thumbnail / Placeholder */}
            <div className="relative aspect-video bg-muted dark:bg-slate-800 flex items-center justify-center overflow-hidden">
                {item.thumbnail_url ? (
                    <Image
                        src={item.thumbnail_url}
                        alt={item.title}
                        fill
                        unoptimized
                        sizes="(max-width: 768px) 100vw, 33vw"
                        className="object-cover group-hover:scale-110 transition-transform duration-700"
                    />
                ) : (
                    <div className="p-8 rounded-full bg-slate-200 dark:bg-slate-700 group-hover:rotate-12 transition-transform duration-500">
                        {IconMap[item.content_type]}
                    </div>
                )}

                {/* Overlay Badges */}
                <div className="absolute top-4 left-4 flex gap-2">
                    <Badge className="bg-white/90 dark:bg-slate-900/90 text-foreground dark:text-white backdrop-blur uppercase text-[9px] font-black px-3 py-1 rounded-full border-none">
                        {item.content_type}
                    </Badge>
                </div>

                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-center justify-center gap-3">
                    <Button size="icon" variant="secondary" className="rounded-full w-10 h-10 hover:scale-110 transition-transform">
                        <Eye className="w-4 h-4" />
                    </Button>
                    <Button size="icon" variant="secondary" className="rounded-full w-10 h-10 hover:scale-110 transition-transform">
                        <Copy className="w-4 h-4" />
                    </Button>
                </div>
            </div>

            <CardContent className="p-6 space-y-4">
                <div className="space-y-1">
                    <div className="flex justify-between items-start gap-4">
                        <h4 className="font-bold text-foreground dark:text-slate-100 line-clamp-1 leading-tight">{item.title}</h4>
                        <div className="flex items-center gap-1 shrink-0">
                            <Star className="w-3 h-3 text-yellow-500 fill-yellow-500" />
                            <span className="text-xs font-bold text-muted-foreground">{item.average_rating || 'N/A'}</span>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <Avatar className="w-5 h-5">
                            <AvatarFallback className="text-[8px]">{item.created_by_name?.substring(0, 2)}</AvatarFallback>
                        </Avatar>
                        <span className="text-[10px] text-muted-foreground/70 font-bold uppercase tracking-wider">{item.created_by_name}</span>
                    </div>
                </div>

                <div className="flex flex-wrap gap-1">
                    {item.tags.slice(0, 3).map(tag => (
                        <span key={tag} className="text-[9px] font-bold text-muted-foreground bg-muted dark:bg-slate-800 px-2 py-0.5 rounded uppercase">#{tag}</span>
                    ))}
                </div>
            </CardContent>

            <CardFooter className="px-6 py-4 bg-background/50 dark:bg-slate-950/50 border-t border-slate-100 dark:border-slate-800 flex justify-between items-center">
                <div className="flex items-center gap-3 text-muted-foreground/70">
                    <div className="flex items-center gap-1">
                        <Download className="w-3 h-3" />
                        <span className="text-[10px] font-bold">{item.usage_count}</span>
                    </div>
                    <div className="flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        <span className="text-[10px] font-bold">{format(new Date(item.created_at), 'MMM yyyy')}</span>
                    </div>
                </div>
                <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full">
                    <MoreHorizontal className="w-4 h-4 text-muted-foreground/70" />
                </Button>
            </CardFooter>
        </Card>
    );
}
