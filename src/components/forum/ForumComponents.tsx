'use client';

import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardFooter } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { MessageCircle, ThumbsUp, Flag, Pin, Lock, CheckCircle2, MoreVertical, Reply as ReplyIcon } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

const formatContent = (content: string) => {
    // Regex for mentions like @username
    return content.replace(/@(\w+)/g, '<span class="text-teal-600 font-bold hover:underline cursor-pointer">@$1</span>');
};

interface TopicProps {
    topic: {
        id: string;
        title: string;
        content: string;
        is_pinned: boolean;
        is_locked: boolean;
        is_resolved: boolean;
        upvotes: number;
        reply_count: number;
        created_at: string;
        author_name: string;
    };
}

export function DiscussionTopic({ topic }: TopicProps) {
    return (
        <Card className={`group border-none shadow-md hover:shadow-xl transition-all duration-300 rounded-2xl overflow-hidden ${topic.is_pinned ? 'ring-2 ring-teal-500/20' : ''}`}>
            <CardHeader className="bg-white dark:bg-slate-900 border-b border-slate-50 dark:border-slate-800 p-6">
                <div className="flex justify-between items-start">
                    <div className="flex items-center gap-3">
                        <Avatar className="w-10 h-10 ring-2 ring-slate-100 dark:ring-slate-800">
                            <AvatarFallback>{topic.author_name.substring(0, 2)}</AvatarFallback>
                        </Avatar>
                        <div>
                            <p className="text-sm font-bold text-slate-800 dark:text-slate-100">{topic.author_name}</p>
                            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">
                                {formatDistanceToNow(new Date(topic.created_at))} ago
                            </p>
                        </div>
                    </div>
                    <div className="flex gap-2">
                        {topic.is_pinned && <Badge className="bg-teal-50 text-teal-600 border-teal-100 hover:bg-teal-50 gap-1 rounded-full"><Pin className="w-3 h-3" /> Pinned</Badge>}
                        {topic.is_locked && <Badge variant="secondary" className="gap-1 rounded-full"><Lock className="w-3 h-3" /> Locked</Badge>}
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-400 rounded-full">
                            <MoreVertical className="w-4 h-4" />
                        </Button>
                    </div>
                </div>
                <h3 className="text-xl font-bold text-slate-900 dark:text-white mt-4 leading-tight group-hover:text-teal-600 transition-colors">
                    {topic.title}
                </h3>
            </CardHeader>

            <CardContent className="p-6 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 text-sm leading-relaxed">
                <div className="line-clamp-3 prose dark:prose-invert" dangerouslySetInnerHTML={{ __html: formatContent(topic.content) }} />
            </CardContent>

            <CardFooter className="bg-slate-50/50 dark:bg-slate-950/50 p-4 flex justify-between items-center border-t border-slate-100 dark:border-slate-800">
                <div className="flex gap-4">
                    <Button variant="ghost" size="sm" className="gap-2 text-slate-500 hover:text-teal-600 hover:bg-teal-50/50 rounded-full h-8 px-4">
                        <ThumbsUp className="w-4 h-4" />
                        <span className="font-bold">{topic.upvotes}</span>
                    </Button>
                    <Button variant="ghost" size="sm" className="gap-2 text-slate-500 hover:text-blue-600 hover:bg-blue-50/50 rounded-full h-8 px-4">
                        <MessageCircle className="w-4 h-4" />
                        <span className="font-bold">{topic.reply_count}</span>
                    </Button>
                </div>
                {topic.is_resolved && (
                    <div className="flex items-center gap-1.5 text-green-600 bg-green-50 px-3 py-1 rounded-full border border-green-100">
                        <CheckCircle2 className="w-4 h-4" />
                        <span className="text-[10px] font-black uppercase tracking-widest">Resolved</span>
                    </div>
                )}
            </CardFooter>
        </Card>
    );
}

export function DiscussionReply({ reply, isAccepted = false }: { reply: any, isAccepted?: boolean }) {
    return (
        <div className={`relative pl-4 ml-2 border-l-2 transition-colors ${isAccepted ? 'border-green-500/30' : 'border-slate-100 dark:border-slate-800'}`}>
            <Card className={`border-none ${isAccepted ? 'bg-green-50/30 ring-1 ring-green-500/20' : 'bg-white dark:bg-slate-900'} shadow-sm`}>
                <CardContent className="p-4 space-y-3">
                    <div className="flex justify-between items-start">
                        <div className="flex items-center gap-2">
                            <Avatar className="w-6 h-6">
                                <AvatarFallback className="text-[10px]">{reply.author_name.substring(0, 2)}</AvatarFallback>
                            </Avatar>
                            <span className="text-xs font-bold text-slate-700 dark:text-slate-200">{reply.author_name}</span>
                            <span className="text-[10px] text-slate-400 font-bold uppercase">{formatDistanceToNow(new Date(reply.created_at))} ago</span>
                        </div>
                        {isAccepted && <Badge className="bg-green-500 text-white text-[8px] font-black uppercase px-2 h-4">Accepted Answer</Badge>}
                    </div>
                    <div className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed prose dark:prose-invert" dangerouslySetInnerHTML={{ __html: formatContent(reply.content) }} />

                    <div className="flex gap-4 pt-2">
                        <button className="text-[10px] font-black text-slate-400 hover:text-teal-600 flex items-center gap-1 uppercase tracking-widest">
                            <ThumbsUp className="w-3 h-3" /> {reply.upvotes}
                        </button>
                        <button className="text-[10px] font-black text-slate-400 hover:text-blue-600 flex items-center gap-1 uppercase tracking-widest">
                            <ReplyIcon className="w-3 h-3" /> Reply
                        </button>
                        <button className="text-[10px] font-black text-slate-400 hover:text-red-500 flex items-center gap-1 uppercase tracking-widest ml-auto">
                            <Flag className="w-3 h-3" /> Report
                        </button>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
