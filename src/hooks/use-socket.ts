'use client';

import { useEffect, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { useAuth } from '@/contexts/auth-context';

export const useSocket = () => {
    const [socket, setSocket] = useState<Socket | null>(null);
    const { user, profile } = useAuth();

    useEffect(() => {
        if (!user) return;

        // Connect to the socket server
        // We use the same host but the custom path we defined
        const socketInstance = io(window.location.origin, {
            path: '/api/socket',
            query: {
                userId: user.id,
                // Using school_id if available on profile, or tenantId from metadata
                schoolId: profile?.school_id || ''
            },
            // Important for Next.js to avoid multiple connections in dev
            reconnectionAttempts: 5,
            reconnectionDelay: 1000,
        });

        socketInstance.on('connect', () => {
            console.log('Connected to WebSocket:', socketInstance.id);
            // Optional: trigger authentication with token
            socketInstance.emit('authenticate', 'api-token');
        });

        socketInstance.on('authenticated', () => {
            console.log('WebSocket authenticated successfully');
            // Set presence to online
            socketInstance.emit('presence:online', {
                userId: user.id,
                schoolId: profile?.school_id
            });
        });

        socketInstance.on('disconnect', (reason) => {
            console.log('Disconnected from WebSocket:', reason);
        });

        setSocket(socketInstance);

        return () => {
            if (socketInstance) {
                socketInstance.disconnect();
            }
        };
    }, [user, profile]);

    return socket;
};
