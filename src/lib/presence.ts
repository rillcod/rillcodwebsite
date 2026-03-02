import { getIO } from './socket-io';

interface UserStatus {
    userId: string;
    status: 'online' | 'away' | 'offline';
    lastSeen: number;
}

const presenceMap = new Map<string, UserStatus>();

export const updatePresence = (userId: string, status: 'online' | 'away' | 'offline', schoolId?: string) => {
    const io = getIO();
    presenceMap.set(userId, {
        userId,
        status,
        lastSeen: Date.now()
    });

    if (io && schoolId) {
        io.to(`school:${schoolId}`).emit('presence:update', {
            userId,
            status,
            lastSeen: Date.now()
        });
    }
};

export const getOnlineUsers = (schoolId: string) => {
    // In a distributed system, this would be backed by Redis.
    // For now, filtering the in-memory map.
    return Array.from(presenceMap.values()).filter(u => u.status !== 'offline');
};

// Periodic cleanup of stale users (e.g., missed disconnect)
setInterval(() => {
    const now = Date.now();
    presenceMap.forEach((user, userId) => {
        if (user.status === 'online' && now - user.lastSeen > 5 * 60 * 1000) {
            updatePresence(userId, 'away');
        }
    });
}, 60000);
