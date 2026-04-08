import { Server as NetServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { setIO } from './socket-io';
import { updatePresence } from './presence';
import { chatService } from '@/services/chat.service';

export const config = {
    api: {
        bodyParser: false,
    },
};

export const initSocket = (res: any) => {
    if (!res.socket.server.io) {
        console.log('Initializing Socket.io server...');
        const allowedOrigin =
            process.env.NEXT_PUBLIC_SITE_URL ||
            process.env.NEXT_PUBLIC_APP_URL ||
            'http://localhost:3000';
        const admin = createSupabaseClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.SUPABASE_SERVICE_ROLE_KEY!
        );
        const anon = createSupabaseClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
        );
        const io = new SocketIOServer(res.socket.server as NetServer, {
            path: '/api/socket',
            addTrailingSlash: false,
            cors: {
                origin: allowedOrigin,
                methods: ['GET', 'POST'],
            },
        });

        io.on('connection', (socket) => {
            console.log('Client connected:', socket.id);

            socket.on('authenticate', async (token) => {
                try {
                    if (!token || typeof token !== 'string') {
                        socket.emit('authenticated', { success: false, error: 'Missing token' });
                        socket.disconnect();
                        return;
                    }

                    // Derive identity only from validated JWT
                    const { data: authData, error: authError } = await anon.auth.getUser(token);
                    const userId = authData?.user?.id;
                    if (authError || !userId) {
                        socket.emit('authenticated', { success: false, error: 'Invalid token' });
                        socket.disconnect();
                        return;
                    }

                    socket.join(`user:${userId}`);
                    const { data: profile } = await admin
                        .from('portal_users')
                        .select('school_id')
                        .eq('id', userId)
                        .maybeSingle();
                    if (profile?.school_id) {
                        socket.join(`school:${profile.school_id}`);
                    }
                    socket.emit('authenticated', { success: true, userId });
                    console.log(`Socket ${socket.id} authenticated as user ${userId}`);
                } catch (err) {
                    console.error('Socket authentication failed:', err);
                    socket.disconnect();
                }
            });

            socket.on('presence:online', (data) => {
                const { userId, schoolId } = data;
                updatePresence(userId, 'online', schoolId);
            });

            socket.on('message:send', async (data) => {
                const { recipientId, content, subject } = data;
                const userId = Array.from(socket.rooms).find(r => r.startsWith('user:'))?.split(':')[1];
                if (userId) {
                    await chatService.sendMessage(userId, recipientId, content, subject);
                }
            });

            socket.on('message:typing', (data) => {
                const { recipientId, isTyping } = data;
                const userId = Array.from(socket.rooms).find(r => r.startsWith('user:'))?.split(':')[1];
                if (userId) {
                    chatService.sendTypingIndicator(userId, recipientId, isTyping);
                }
            });

            socket.on('disconnect', () => {
                const userId = Array.from(socket.rooms).find(r => r.startsWith('user:'))?.split(':')[1];
                if (userId) {
                    updatePresence(userId, 'offline');
                }
                console.log('Client disconnected:', socket.id);
            });
        });

        res.socket.server.io = io;
        setIO(io);
    }
    return res.socket.server.io;
};
