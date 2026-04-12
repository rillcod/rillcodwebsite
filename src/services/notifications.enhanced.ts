import { createClient } from '@/lib/supabase/server';

export interface Notification {
  id: string;
  userId: string;
  type: 'badge' | 'grade' | 'assignment' | 'message' | 'achievement' | 'milestone';
  title: string;
  message: string;
  icon: string;
  read: boolean;
  actionUrl?: string;
  createdAt: string;
  data?: Record<string, any>;
}

export interface ActivityItem {
  id: string;
  type: 'lesson_completed' | 'assignment_submitted' | 'project_created' | 'badge_earned' | 'comment' | 'milestone';
  userId: string;
  userName: string;
  userAvatar?: string;
  title: string;
  description: string;
  timestamp: string;
  relatedId?: string;
}

export class NotificationService {
  async getNotifications(userId: string, limit: number = 20, offset: number = 0): Promise<Notification[]> {
    const supabase = await createClient();

    const { data } = await supabase
      .from('notifications')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    return data || [];
  }

  async getUnreadNotificationCount(userId: string): Promise<number> {
    const supabase = await createClient();

    const { count } = await supabase
      .from('notifications')
      .select('id', { count: 'exact' })
      .eq('user_id', userId)
      .eq('read', false);

    return count || 0;
  }

  async markAsRead(notificationId: string): Promise<void> {
    const supabase = await createClient();

    await supabase
      .from('notifications')
      .update({ read: true })
      .eq('id', notificationId);
  }

  async markAllAsRead(userId: string): Promise<void> {
    const supabase = await createClient();

    await supabase
      .from('notifications')
      .update({ read: true })
      .eq('user_id', userId);
  }

  async deleteNotification(notificationId: string): Promise<void> {
    const supabase = await createClient();

    await supabase
      .from('notifications')
      .delete()
      .eq('id', notificationId);
  }

  async createNotification(notification: Omit<Notification, 'id'>): Promise<Notification> {
    const supabase = await createClient();

    const { data } = await supabase
      .from('notifications')
      .insert([notification])
      .select()
      .single();

    return data;
  }

  async getActivityFeed(userId?: string, schoolId?: string, limit: number = 50): Promise<ActivityItem[]> {
    const supabase = await createClient();

    let query = supabase
      .from('activity_logs')
      .select(
        'id, event_type, user_id, portal_users(full_name, profile_image_url), created_at, metadata'
      )
      .order('created_at', { ascending: false })
      .limit(limit);

    if (userId) {
      query = query.eq('user_id', userId);
    }

    if (schoolId) {
      query = query.eq('school_id', schoolId);
    }

    const { data } = await query;

    return (data || []).map((item: any) => ({
      id: item.id,
      type: this.mapEventType(item.event_type),
      userId: item.user_id,
      userName: item.portal_users?.full_name || 'Student',
      userAvatar: item.portal_users?.profile_image_url,
      title: this.getActivityTitle(item.event_type),
      description: this.getActivityDescription(item.metadata),
      timestamp: item.created_at,
      relatedId: item.metadata?.resourceId
    }));
  }

  private mapEventType(eventType: string): ActivityItem['type'] {
    const mapping: Record<string, ActivityItem['type']> = {
      'lesson_completed': 'lesson_completed',
      'assignment_submitted': 'assignment_submitted',
      'project_created': 'project_created',
      'badge_earned': 'badge_earned',
      'comment_added': 'comment',
      'milestone_reached': 'milestone'
    };
    return mapping[eventType] || 'comment';
  }

  private getActivityTitle(eventType: string): string {
    const titles: Record<string, string> = {
      'lesson_completed': 'Completed a Lesson',
      'assignment_submitted': 'Submitted an Assignment',
      'project_created': 'Created a Project',
      'badge_earned': 'Earned a Badge',
      'comment_added': 'Added a Comment',
      'milestone_reached': 'Reached a Milestone'
    };
    return titles[eventType] || 'Activity';
  }

  private getActivityDescription(metadata: Record<string, any>): string {
    if (!metadata) return '';
    return metadata.title || metadata.description || '';
  }

  async getNotificationPreferences(userId: string): Promise<Record<string, boolean>> {
    const supabase = await createClient();

    const { data } = await supabase
      .from('user_preferences')
      .select('notification_settings')
      .eq('user_id', userId)
      .single();

    return data?.notification_settings || {
      badge_earned: true,
      assignment_graded: true,
      course_update: true,
      message_received: true,
      milestone_reached: true
    };
  }

  async updateNotificationPreferences(userId: string, preferences: Record<string, boolean>): Promise<void> {
    const supabase = await createClient();

    await supabase
      .from('user_preferences')
      .update({ notification_settings: preferences })
      .eq('user_id', userId);
  }
}

export const notificationService = new NotificationService();
