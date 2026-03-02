'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/contexts/auth-context';

export interface UserPresence {
    userId: string;
    userName: string;
    status: 'online' | 'away' | 'offline';
    lastSeen: string;
}

export const usePresence = () => {
    const { user, profile } = useAuth();
    const [onlineUsers, setOnlineUsers] = useState<Record<string, UserPresence>>({});
    const supabase = createClient();

    useEffect(() => {
        if (!user) return;

        const channel = supabase.channel('online-users', {
            config: {
                presence: {
                    key: user.id,
                },
            },
        });

        channel
            .on('presence', { event: 'sync' }, () => {
                const state = channel.presenceState();
                const transformed: Record<string, UserPresence> = {};

                Object.keys(state).forEach((key) => {
                    const presence = state[key][0] as any;
                    transformed[key] = {
                        userId: key,
                        userName: presence.userName || 'Anonymous',
                        status: 'online',
                        lastSeen: new Date().toISOString(),
                    };
                });

                setOnlineUsers(transformed);
            })
            .on('presence', { event: 'join' }, ({ key, newPresences }) => {
                console.log('User joined:', key, newPresences);
            })
            .on('presence', { event: 'leave' }, ({ key, leftPresences }) => {
                console.log('User left:', key, leftPresences);
            })
            .subscribe(async (status) => {
                if (status === 'SUBSCRIBED') {
                    await channel.track({
                        userName: profile?.full_name || user.email?.split('@')[0] || 'User',
                        online_at: new Date().toISOString(),
                    });
                }
            });

        return () => {
            channel.unsubscribe();
        };
    }, [user, profile]);

    return onlineUsers;
};
