'use client';

import { Milestone } from '@/lib/badges';

interface MilestoneTrackerProps {
  milestones: Milestone[];
}

export default function MilestoneTracker({ milestones }: MilestoneTrackerProps) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      {milestones.map((milestone) => (
        <div key={milestone.id} className="bg-white rounded-lg p-4 shadow-sm border border-gray-200">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h3 className="font-semibold text-gray-900">{milestone.name}</h3>
              <p className="text-xs text-gray-500">{milestone.description}</p>
            </div>
            <span className="text-2xl">{milestone.icon}</span>
          </div>

          <div className="mb-2 flex justify-between items-center">
            <span className="text-sm font-medium text-gray-700">
              {milestone.current} / {milestone.target}
            </span>
            <span className="text-sm text-gray-500">
              {Math.round(milestone.progress)}%
            </span>
          </div>

          <div className="w-full bg-gray-200 rounded-full h-2">
            <div
              className="bg-gradient-to-r from-blue-500 to-purple-500 h-2 rounded-full transition-all duration-300"
              style={{ width: `${milestone.progress}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}
