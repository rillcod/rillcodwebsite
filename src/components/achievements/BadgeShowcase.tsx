'use client';

import { Badge } from '@/lib/badges';
import BadgeCard from './BadgeCard';
import { useState } from 'react';

interface BadgeShowcaseProps {
  badges: Badge[];
  earnedBadgeIds: string[];
  totalBadgesEarned: number;
}

export default function BadgeShowcase({
  badges,
  earnedBadgeIds,
  totalBadgesEarned
}: BadgeShowcaseProps) {
  const [showAllBadges, setShowAllBadges] = useState(false);

  const earnedBadges = badges.filter(b => earnedBadgeIds.includes(b.id));
  const unlockedBadges = showAllBadges ? badges : earnedBadges;

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Achievements</h2>
          <p className="text-sm text-gray-500">
            {totalBadgesEarned} of {badges.length} badges earned
          </p>
        </div>
        <div className="text-center">
          <div className="text-3xl font-bold text-purple-600">{totalBadgesEarned}</div>
          <div className="text-xs text-gray-500">Badges</div>
        </div>
      </div>

      <div className="mb-4 flex justify-between items-center">
        <div className="w-full bg-gray-200 rounded-full h-3">
          <div
            className="bg-gradient-to-r from-yellow-400 to-purple-600 h-3 rounded-full transition-all duration-300"
            style={{ width: `${(totalBadgesEarned / badges.length) * 100}%` }}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 mb-4">
        {unlockedBadges.map((badge) => (
          <BadgeCard
            key={badge.id}
            badge={badge}
            earned={earnedBadgeIds.includes(badge.id)}
            showDetails={false}
          />
        ))}
      </div>

      {!showAllBadges && (
        <button
          onClick={() => setShowAllBadges(true)}
          className="w-full py-2 text-sm font-medium text-blue-600 hover:text-blue-700 border border-blue-600 rounded-lg transition-colors"
        >
          View All Badges ({badges.length})
        </button>
      )}

      {showAllBadges && (
        <button
          onClick={() => setShowAllBadges(false)}
          className="w-full py-2 text-sm font-medium text-gray-600 hover:text-gray-700 border border-gray-300 rounded-lg transition-colors"
        >
          Show Less
        </button>
      )}
    </div>
  );
}
