'use client';

import { Recommendation } from '@/services/recommendations.service';
import RecommendationCard from './RecommendationCard';

interface RecommendationsPanelProps {
  recommendations: Recommendation[];
  title?: string;
  loading?: boolean;
}

export default function RecommendationsPanel({
  recommendations,
  title = 'Recommended For You',
  loading = false
}: RecommendationsPanelProps) {
  if (loading) {
    return (
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <h2 className="text-xl font-bold text-gray-900 mb-4">{title}</h2>
        <div className="space-y-3">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-32 bg-gray-200 rounded-lg animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
      <h2 className="text-xl font-bold text-gray-900 mb-4">{title}</h2>

      {recommendations.length > 0 ? (
        <div className="space-y-3">
          {recommendations.map(rec => (
            <RecommendationCard
              key={rec.id}
              recommendation={rec}
              onClick={() => {
                // Handle navigation to resource
                window.location.href = `/${rec.type}/${rec.id}`;
              }}
            />
          ))}
        </div>
      ) : (
        <p className="text-gray-500 text-center py-8">
          Complete more lessons to get personalized recommendations
        </p>
      )}
    </div>
  );
}
