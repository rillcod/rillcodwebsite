'use client';

import { ActivityItem } from '@/services/notifications.enhanced';

interface ActivityFeedProps {
  activities: ActivityItem[];
}

const activityIcons: Record<string, string> = {
  lesson_completed: '✅',
  assignment_submitted: '📝',
  project_created: '🚀',
  badge_earned: '🏆',
  comment: '💬',
  milestone: '🎯'
};

export default function ActivityFeed({ activities }: ActivityFeedProps) {
  return (
    <div className="bg-white rounded-lg border border-gray-200 p-6">
      <h2 className="text-lg font-semibold text-gray-900 mb-4">Activity Feed</h2>

      {activities.length > 0 ? (
        <div className="space-y-4">
          {activities.map((activity) => (
            <div key={activity.id} className="flex gap-4 pb-4 border-b border-gray-200 last:border-0">
              {/* Avatar */}
              {activity.userAvatar ? (
                <img
                  src={activity.userAvatar}
                  alt={activity.userName}
                  className="w-10 h-10 rounded-full object-cover flex-shrink-0"
                />
              ) : (
                <div className="w-10 h-10 rounded-full bg-gray-200 flex items-center justify-center flex-shrink-0">
                  <span className="text-lg">{activityIcons[activity.type] || '📌'}</span>
                </div>
              )}

              {/* Content */}
              <div className="flex-1 min-w-0">
                <p className="text-sm">
                  <span className="font-semibold text-gray-900">{activity.userName}</span>
                  <span className="text-gray-600"> {activity.title}</span>
                </p>

                {activity.description && (
                  <p className="text-sm text-gray-500 mt-1 truncate">
                    {activity.description}
                  </p>
                )}

                <p className="text-xs text-gray-400 mt-1">
                  {getTimeAgo(activity.timestamp)}
                </p>
              </div>

              {/* Icon */}
              <span className="text-2xl flex-shrink-0">
                {activityIcons[activity.type] || '📌'}
              </span>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-gray-500 text-center py-8">No activity yet</p>
      )}
    </div>
  );
}

function getTimeAgo(timestamp: string): string {
  const now = new Date();
  const date = new Date(timestamp);
  const secondsAgo = Math.floor((now.getTime() - date.getTime()) / 1000);

  if (secondsAgo < 60) return 'Just now';
  if (secondsAgo < 3600) return `${Math.floor(secondsAgo / 60)}m ago`;
  if (secondsAgo < 86400) return `${Math.floor(secondsAgo / 3600)}h ago`;
  if (secondsAgo < 604800) return `${Math.floor(secondsAgo / 86400)}d ago`;
  
  return date.toLocaleDateString();
}
