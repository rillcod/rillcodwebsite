import { Server as SocketIOServer } from 'socket.io';

let io: SocketIOServer | null = null;

export const setIO = (newIO: SocketIOServer) => {
    io = newIO;
};

export const getIO = (): SocketIOServer | null => {
    return io;
};

export const emitToUser = (userId: string, event: string, data: any) => {
    if (io) {
        io.to(`user:${userId}`).emit(event, data);
    } else {
        console.warn('Attempted to emit to user but IO is not initialized');
    }
};

export const emitToSchool = (schoolId: string, event: string, data: any) => {
    if (io) {
        io.to(`school:${schoolId}`).emit(event, data);
    }
};
