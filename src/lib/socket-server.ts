import { Server as NetServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import { createClient } from '@/lib/supabase/server';
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
        const io = new SocketIOServer(res.socket.server as NetServer, {
            path: '/api/socket',
            addTrailingSlash: false,
            cors: {
                origin: '*',
                methods: ['GET', 'POST'],
            },
        });

        io.on('connection', (socket) => {
            console.log('Client connected:', socket.id);

            socket.on('authenticate', async (token) => {
                try {
                    // Validate token and associate socket with user
                    // In a real app, you'd use supabase.auth.getUser(token)
                    // For now, we'll assume a 'user-id' room joining pattern
                    const userId = socket.handshake.query.userId as string;
                    const schoolId = socket.handshake.query.schoolId as string;

                    if (userId) {
                        socket.join(`user:${userId}`);
                        if (schoolId) {
                            socket.join(`school:${schoolId}`);
                        }
                        socket.emit('authenticated', { success: true });
                        console.log(`Socket ${socket.id} authenticated as user ${userId}`);
                    }
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
