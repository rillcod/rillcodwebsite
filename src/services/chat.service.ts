import { createClient } from '@/lib/supabase/server';
import { AppError } from '@/lib/errors';
import { emitToUser } from '@/lib/socket-io';

export class ChatService {
    async sendMessage(senderId: string, recipientId: string, content: string, subject?: string) {
        const supabase = await createClient();

        const { data: message, error } = await supabase
            .from('messages')
            .insert([{
                sender_id: senderId,
                recipient_id: recipientId,
                message: content,
                subject,
                created_at: new Date().toISOString()
            }])
            .select('*, portal_users!sender_id(full_name)')
            .single();

        if (error) throw new AppError(error.message, 500);

        // Push real-time event to recipient
        emitToUser(recipientId, 'message:new', {
            ...message,
            sender_name: (message as any).portal_users?.full_name
        });

        return message;
    }

    async sendTypingIndicator(senderId: string, recipientId: string, isTyping: boolean) {
        emitToUser(recipientId, 'message:typing', {
            userId: senderId,
            isTyping
        });
    }
}

export const chatService = new ChatService();
