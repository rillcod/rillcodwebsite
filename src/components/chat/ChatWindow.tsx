'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useSocket } from '@/hooks/use-socket';
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Send, Smile, Paperclip, MoreHorizontal, Circle } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { format } from 'date-fns';

interface Message {
    id: string;
    sender_id: string;
    recipient_id: string;
    content: string;
    created_at: string;
    portal_users?: { full_name: string };
    sender_name?: string;
}

interface ChatProps {
    recipientId: string;
    recipientName: string;
    initialMessages?: Message[];
}

export function ChatWindow({ recipientId, recipientName, initialMessages = [] }: ChatProps) {
    const socket = useSocket();
    const [messages, setMessages] = useState<Message[]>(initialMessages);
    const [inputText, setInputText] = useState('');
    const [isTyping, setIsTyping] = useState(false);
    const [otherUserTyping, setOtherUserTyping] = useState(false);
    const scrollRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!socket) return;

        // Listen for new messages
        socket.on('message:new', (msg: Message) => {
            setMessages(prev => [...prev, msg]);
            setOtherUserTyping(false);
        });

        // Listen for typing indicators
        socket.on('message:typing', (data: { userId: string, isTyping: boolean }) => {
            if (data.userId === recipientId) {
                setOtherUserTyping(data.isTyping);
            }
        });

        return () => {
            socket.off('message:new');
            socket.off('message:typing');
        };
    }, [socket, recipientId]);

    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollIntoView({ behavior: 'smooth' });
        }
    }, [messages]);

    const handleSend = async () => {
        if (!inputText.trim() || !socket) return;

        // Optimistic update would be better in production
        socket.emit('message:send', {
            recipientId,
            content: inputText,
        });

        setInputText('');
        handleTyping(false);
    };

    const handleTyping = (typing: boolean) => {
        if (!socket) return;
        setIsTyping(typing);
        socket.emit('message:typing', {
            recipientId,
            isTyping: typing
        });
    };

    return (
        <Card className="flex flex-col h-[600px] w-full max-w-md shadow-2xl rounded-2xl overflow-hidden border-none animate-in slide-in-from-bottom-5 duration-300">
            <CardHeader className="bg-gradient-to-r from-teal-600 to-primary text-white p-4 flex flex-row items-center justify-between">
                <div className="flex items-center gap-3">
                    <div className="relative">
                        <Avatar className="w-10 h-10 border-2 border-border">
                            <AvatarFallback className="bg-white/10 text-white">
                                {recipientName.substring(0, 2).toUpperCase()}
                            </AvatarFallback>
                        </Avatar>
                        <div className="absolute bottom-0 right-0 w-3 h-3 bg-green-500 border-2 border-primary rounded-full" title="Online" />
                    </div>
                    <div>
                        <CardTitle className="text-sm font-bold">{recipientName}</CardTitle>
                        <p className="text-[10px] text-white/70 font-medium">
                            {otherUserTyping ? 'typing...' : 'Active now'}
                        </p>
                    </div>
                </div>
                <Button variant="ghost" size="icon" className="text-white hover:bg-white/10 rounded-full">
                    <MoreHorizontal className="w-5 h-5" />
                </Button>
            </CardHeader>

            <CardContent className="flex-1 p-0 bg-background dark:bg-slate-950 relative overflow-hidden">
                <ScrollArea className="h-full p-4">
                    <div className="space-y-4">
                        {messages.map((msg, i) => (
                            <div
                                key={msg.id || i}
                                className={`flex flex-col ${msg.recipient_id === recipientId ? 'items-end' : 'items-start'}`}
                            >
                                <div className={`max-w-[80%] px-4 py-2 rounded-2xl text-sm ${msg.recipient_id === recipientId
                                        ? 'bg-teal-600 text-white rounded-tr-none'
                                        : 'bg-card dark:bg-slate-800 text-foreground dark:text-slate-200 rounded-tl-none border border-slate-100 dark:border-slate-700 shadow-sm'
                                    }`}>
                                    {msg.content}
                                </div>
                                <span className="text-[10px] text-muted-foreground/70 mt-1 uppercase font-bold tracking-tighter">
                                    {format(new Date(msg.created_at || Date.now()), 'p')}
                                </span>
                            </div>
                        ))}
                        <div ref={scrollRef} />
                    </div>
                </ScrollArea>
            </CardContent>

            <CardFooter className="p-4 bg-card dark:bg-slate-900 border-t border-slate-100 dark:border-slate-800">
                <div className="flex w-full items-center gap-2 bg-background dark:bg-slate-800 p-1.5 rounded-full border border-border dark:border-slate-700">
                    <Button variant="ghost" size="icon" className="text-muted-foreground/70 hover:text-teal-500 hover:bg-transparent rounded-full px-2">
                        <Smile className="w-5 h-5" />
                    </Button>
                    <Input
                        value={inputText}
                        onChange={(e) => {
                            setInputText(e.target.value);
                            if (!isTyping) handleTyping(true);
                            if (e.target.value === '') handleTyping(false);
                        }}
                        onKeyPress={(e) => e.key === 'Enter' && handleSend()}
                        placeholder="Type a message..."
                        className="border-none bg-transparent focus-visible:ring-0 px-1 placeholder:text-muted-foreground/70"
                    />
                    <Button variant="ghost" size="icon" className="text-muted-foreground/70 hover:text-teal-500 hover:bg-transparent rounded-full px-2">
                        <Paperclip className="w-5 h-5" />
                    </Button>
                    <Button
                        onClick={handleSend}
                        disabled={!inputText.trim()}
                        className="w-10 h-10 rounded-full bg-teal-600 hover:bg-teal-700 text-white shadow-md shadow-teal-500/20 shrink-0"
                    >
                        <Send className="w-4 h-4 ml-0.5" />
                    </Button>
                </div>
            </CardFooter>
        </Card>
    );
}
