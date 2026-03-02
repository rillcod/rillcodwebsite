import { createClient } from '@/lib/supabase/server';
import { AppError, NotFoundError } from '@/lib/errors';
import { notificationsService } from './notifications.service';
import { templatesService } from './templates.service';
import { queueService } from './queue.service';

export class DiscussionService {
    async createTopic(courseId: string, authorId: string, title: string, content: string, attachments: string[] = []) {
        const supabase = await createClient();

        const { data: topic, error } = await supabase
            .from('discussion_topics')
            .insert([{
                course_id: courseId,
                created_by: authorId,
                title,
                content: this.sanitizeHtml(content),
                created_at: new Date().toISOString()
            }])
            .select()
            .single();

        if (error) throw new AppError(error.message, 500);

        // Award points for creating a topic
        const { gamificationService } = await import('./gamification.service');
        await gamificationService.awardPoints(authorId, 'discussion_post', topic.id, 'Created a discussion topic');

        if (attachments.length > 0) {
            await this.addAttachments('topic', topic.id, attachments);
        }

        // Parse mentions
        await this.handleMentions(content, topic.id, 'topic');

        // Notify course participants (Simplified)
        this.notifyCourseParticipants(courseId, topic);

        return topic;
    }

    async createReply(topicId: string, authorId: string, content: string, parentReplyId?: string, attachments: string[] = []) {
        const supabase = await createClient();

        // Check if topic is locked
        const { data: topic } = await supabase.from('discussion_topics').select('is_locked').eq('id', topicId).single();
        if (topic?.is_locked) throw new AppError('This discussion is locked', 403);

        const { data: reply, error } = await supabase
            .from('discussion_replies')
            .insert([{
                topic_id: topicId,
                created_by: authorId,
                content: this.sanitizeHtml(content),
                parent_reply_id: parentReplyId,
                created_at: new Date().toISOString()
            }])
            .select()
            .single();

        if (error) throw new AppError(error.message, 500);

        // Award points for replying
        const { gamificationService } = await import('./gamification.service');
        await gamificationService.awardPoints(authorId, 'discussion_post', reply.id, 'Replied to a discussion topic');

        if (attachments.length > 0) {
            await this.addAttachments('reply', reply.id, attachments);
        }

        // Parse mentions
        await this.handleMentions(content, topicId, 'reply', reply.id);

        // Notify original topic author or parent reply author
        this.notifyOnReply(topicId, reply, parentReplyId);

        return reply;
    }

    async updateTopic(topicId: string, userId: string, title?: string, content?: string) {
        const supabase = await createClient();
        const updates: any = {};
        if (title) updates.title = title;
        if (content) updates.content = this.sanitizeHtml(content);
        updates.updated_at = new Date().toISOString();

        const { error } = await supabase.from('discussion_topics').update(updates).eq('id', topicId);
        if (error) throw new AppError(error.message, 500);
        return true;
    }

    async deleteTopic(topicId: string) {
        const supabase = await createClient();
        const { error } = await supabase.from('discussion_topics').delete().eq('id', topicId);
        if (error) throw new AppError(error.message, 500);
        return true;
    }

    async updateReply(replyId: string, content: string) {
        const supabase = await createClient();
        const { error } = await supabase.from('discussion_replies').update({
            content: this.sanitizeHtml(content),
            updated_at: new Date().toISOString()
        }).eq('id', replyId);
        if (error) throw new AppError(error.message, 500);
        return true;
    }

    async deleteReply(replyId: string) {
        const supabase = await createClient();
        const { error } = await supabase.from('discussion_replies').delete().eq('id', replyId);
        if (error) throw new AppError(error.message, 500);
        return true;
    }

    async moderateTopic(topicId: string, action: 'pin' | 'lock' | 'unpin' | 'unlock' | 'resolve') {
        const supabase = await createClient();
        const updates: any = {};

        if (action === 'pin') updates.is_pinned = true;
        if (action === 'unpin') updates.is_pinned = false;
        if (action === 'lock') updates.is_locked = true;
        if (action === 'unlock') updates.is_locked = false;
        if (action === 'resolve') {
            updates.is_resolved = true;
            // Reward author with reputation?
            const { data: topic } = await supabase.from('discussion_topics').select('created_by').eq('id', topicId).single();
            if (topic) await this.updateReputation(topic.created_by, 10);
        }

        const { error } = await supabase.from('discussion_topics').update(updates).eq('id', topicId);
        if (error) throw new AppError(error.message, 500);
    }

    async flagContent(userId: string, type: 'topic' | 'reply', id: string, reason: string) {
        const supabase = await createClient();
        const { error } = await supabase.from('flagged_content').insert([{
            reporter_id: userId,
            content_type: type,
            content_id: id,
            reason
        }]);
        if (error) throw new AppError(error.message, 500);
        return true;
    }

    async subscribe(userId: string, topicId: string) {
        const supabase = await createClient();
        await supabase.from('topic_subscriptions').upsert([{ user_id: userId, topic_id: topicId }]);
        return true;
    }

    async unsubscribe(userId: string, topicId: string) {
        const supabase = await createClient();
        await supabase.from('topic_subscriptions').delete().match({ user_id: userId, topic_id: topicId });
        return true;
    }

    async updateReputation(userId: string, points: number) {
        const supabase = await createClient();
        const { data } = await supabase.from('portal_users').select('reputation_score').eq('id', userId).single();
        const current = data?.reputation_score || 0;
        await supabase.from('portal_users').update({ reputation_score: current + points }).eq('id', userId);
    }

    async searchDiscussions(courseId: string, query: string) {
        const supabase = await createClient();

        // Full-text search across topics
        const { data: topics } = await supabase
            .from('discussion_topics')
            .select('*')
            .eq('course_id', courseId)
            .textSearch('title_content_search', query);

        return topics || [];
    }

    private sanitizeHtml(html: string) {
        // Simple sanitization for now
        return html.replace(/<script\b[^>]*>([\s\S]*?)<\/script>/gim, "");
    }

    private async addAttachments(type: 'topic' | 'reply', id: string, fileIds: string[]) {
        const supabase = await createClient();
        const records = fileIds.map(fileId => ({
            topic_id: type === 'topic' ? id : null,
            reply_id: type === 'reply' ? id : null,
            file_id: fileId
        }));

        await supabase.from('discussion_attachments').insert(records);
    }

    private async handleMentions(content: string, topicId: string, type: 'topic' | 'reply', replyId?: string) {
        const mentions = content.match(/@(\w+)/g);
        if (!mentions) return;

        const usernames = mentions.map(m => m.substring(1));
        const supabase = await createClient();

        const { data: users } = await supabase
            .from('portal_users')
            .select('id, email, full_name')
            .in('username', usernames);

        if (users) {
            for (const user of users) {
                await notificationsService.logNotification(
                    user.id,
                    'You were mentioned',
                    `Someone mentioned you in a discussion.`,
                    'mention'
                );
            }
        }
    }

    async upvote(type: 'topic' | 'reply', id: string) {
        const supabase = await createClient();
        const table = type === 'topic' ? 'discussion_topics' : 'discussion_replies';

        const { data } = await supabase.from(table).select('upvotes, created_by').eq('id', id).single();
        const currentUpvotes = data?.upvotes || 0;

        await supabase.from(table).update({ upvotes: currentUpvotes + 1 }).eq('id', id);

        // Reward author with reputation when upvoted
        if (data?.created_by) {
            await this.updateReputation(data.created_by, 2);
        }

        return true;
    }

    private async notifyCourseParticipants(courseId: string, topic: any) {
        const supabase = await createClient();
        const { data: enrollments } = await supabase
            .from('student_enrollments')
            .select('student_id, portal_users(email, first_name)')
            .eq('program_id', (await supabase.from('courses').select('program_id').eq('id', courseId).single()).data?.program_id)
            .eq('status', 'active');

        if (enrollments) {
            for (const enrollment of enrollments) {
                if (enrollment.student_id === topic.created_by) continue;
                const user = enrollment.portal_users as any;
                if (user?.email) {
                    await queueService.queueNotification(enrollment.student_id, 'email', {
                        to: user.email,
                        subject: `New Discussion: ${topic.title}`,
                        html: `<p>A new topic has been started in your course: <b>${topic.title}</b></p>`
                    });
                }
            }
        }
    }

    private async notifyOnReply(topicId: string, reply: any, parentReplyId?: string) {
        const supabase = await createClient();

        // 1. Notify topic subscribers
        const { data: subs } = await supabase.from('topic_subscriptions').select('user_id').eq('topic_id', topicId);
        if (subs) {
            for (const sub of subs) {
                if (sub.user_id === reply.created_by) continue;
                await notificationsService.logNotification(
                    sub.user_id,
                    'New reply to subscribed topic',
                    'A topic you are following has a new reply.',
                    'info'
                );
            }
        }

        // 2. Existing logic for direct reply notification
        let recipientId: string | null = null;
        if (parentReplyId) {
            const { data } = await supabase.from('discussion_replies').select('created_by').eq('id', parentReplyId).single();
            recipientId = data?.created_by || null;
        } else {
            const { data } = await supabase.from('discussion_topics').select('created_by').eq('id', topicId).single();
            recipientId = data?.created_by || null;
        }

        if (recipientId && recipientId !== reply.created_by) {
            const { data: user } = await supabase.from('portal_users').select('email').eq('id', recipientId).single();
            if (user?.email) {
                await queueService.queueNotification(recipientId, 'email', {
                    to: user.email,
                    subject: 'New reply to your discussion',
                    html: `<p>Someone replied to your post: "${reply.content.substring(0, 50)}..."</p>`
                });
            }
        }
    }
}

export const discussionService = new DiscussionService();
