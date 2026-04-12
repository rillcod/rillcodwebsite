'use client';

import { Recommendation } from '@/services/recommendations.service';

interface RecommendationCardProps {
  recommendation: Recommendation;
  onClick?: () => void;
}

const difficultyColors = {
  beginner: 'bg-green-100 text-green-800',
  intermediate: 'bg-yellow-100 text-yellow-800',
  advanced: 'bg-red-100 text-red-800'
};

export default function RecommendationCard({
  recommendation,
  onClick
}: RecommendationCardProps) {
  return (
    <div
      onClick={onClick}
      className="bg-white rounded-lg border border-gray-200 p-4 hover:shadow-md transition-shadow cursor-pointer"
    >
      <div className="flex items-start justify-between mb-2">
        <h3 className="font-semibold text-gray-900 flex-1">{recommendation.title}</h3>
        <span className="text-lg">
          {recommendation.type === 'lesson' ? '📚' : recommendation.type === 'challenge' ? '⚡' : '🎯'}
        </span>
      </div>

      <p className="text-sm text-gray-600 mb-3">{recommendation.description}</p>

      <div className="flex items-center justify-between mb-3">
        <span className={`text-xs px-2 py-1 rounded ${difficultyColors[recommendation.difficulty]}`}>
          {recommendation.difficulty}
        </span>
        <span className="text-xs text-gray-500">{recommendation.estimatedTime} min</span>
      </div>

      <p className="text-xs text-blue-600 font-medium mb-2">{recommendation.reason}</p>

      <div className="flex items-center gap-2">
        <div className="flex-1 bg-gray-200 rounded-full h-2">
          <div
            className="bg-blue-500 h-2 rounded-full"
            style={{ width: `${recommendation.matchScore}%` }}
          />
        </div>
        <span className="text-xs font-semibold text-gray-700">{recommendation.matchScore}%</span>
      </div>
    </div>
  );
}
