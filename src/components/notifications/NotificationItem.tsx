'use client';

import { Notification } from '@/services/notifications.enhanced';

interface NotificationItemProps {
  notification: Notification;
  onMarkRead?: () => void;
}

const typeIcons: Record<string, string> = {
  badge: '🏆',
  grade: '📊',
  assignment: '✍️',
  message: '💬',
  achievement: '⭐',
  milestone: '🎯'
};

const typeColors: Record<string, string> = {
  badge: 'bg-yellow-50 border-yellow-200',
  grade: 'bg-blue-50 border-blue-200',
  assignment: 'bg-purple-50 border-purple-200',
  message: 'bg-green-50 border-green-200',
  achievement: 'bg-pink-50 border-pink-200',
  milestone: 'bg-orange-50 border-orange-200'
};

export default function NotificationItem({
  notification,
  onMarkRead
}: NotificationItemProps) {
  const timeAgo = getTimeAgo(notification.createdAt);
  const icon = typeIcons[notification.type] || '🔔';
  const bgColor = typeColors[notification.type] || 'bg-gray-50 border-gray-200';

  return (
    <div
      onClick={onMarkRead}
      className={`p-4 rounded-lg border-2 cursor-pointer transition-all ${bgColor} ${
        !notification.read ? 'font-medium' : ''
      }`}
    >
      <div className="flex items-start gap-3">
        <span className="text-xl mt-1">{icon}</span>

        <div className="flex-1">
          <h3 className="font-semibold text-gray-900">{notification.title}</h3>
          <p className="text-sm text-gray-600 mt-1">{notification.message}</p>
          <p className="text-xs text-gray-500 mt-2">{timeAgo}</p>
        </div>

        {!notification.read && (
          <div className="w-2 h-2 rounded-full bg-blue-600 mt-1 flex-shrink-0" />
        )}
      </div>

      {notification.actionUrl && (
        <a
          href={notification.actionUrl}
          className="inline-block mt-3 px-3 py-1 bg-blue-600 text-white text-xs font-medium rounded hover:bg-blue-700 transition-colors"
        >
          View
        </a>
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
