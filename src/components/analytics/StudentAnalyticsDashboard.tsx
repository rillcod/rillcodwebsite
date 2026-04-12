'use client';

import { StudentAnalytics } from '@/services/analytics.service';
import AnalyticsCard from './AnalyticsCard';
import PerformanceTrendChart from './PerformanceTrendChart';
import SkillBreakdownChart from './SkillBreakdownChart';

interface StudentAnalyticsDashboardProps {
  analytics: StudentAnalytics;
}

export default function StudentAnalyticsDashboard({ analytics }: StudentAnalyticsDashboardProps) {
  return (
    <div className="space-y-6">
      {/* Key Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <AnalyticsCard
          label="Lessons Completed"
          value={analytics.lessonsCompleted}
          total={analytics.lessonsTotal}
          icon="📚"
          color="blue"
        />
        <AnalyticsCard
          label="Assignments Submitted"
          value={analytics.assignmentsSubmitted}
          total={analytics.assignmentsTotal}
          icon="✍️"
          color="green"
        />
        <AnalyticsCard
          label="Average Score"
          value={analytics.averageScore}
          total={100}
          icon="⭐"
          color="purple"
          isPercentage
        />
        <AnalyticsCard
          label="Learning Streak"
          value={analytics.currentStreak}
          total={30}
          icon="🔥"
          color="orange"
          isDays
        />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <PerformanceTrendChart data={analytics.performanceTrend} />
        <SkillBreakdownChart data={analytics.skillBreakdown} />
      </div>

      {/* Summary Stats */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Learning Summary</h3>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          <div>
            <p className="text-sm text-gray-500">Total Time Spent</p>
            <p className="text-2xl font-bold text-gray-900">{analytics.timeSpent.toFixed(1)}h</p>
          </div>
          <div>
            <p className="text-sm text-gray-500">Completion Rate</p>
            <p className="text-2xl font-bold text-gray-900">{analytics.completionRate}%</p>
          </div>
          <div>
            <p className="text-sm text-gray-500">Projects Created</p>
            <p className="text-2xl font-bold text-gray-900">{analytics.projectsCreated}</p>
          </div>
        </div>
      </div>

      {/* Recent Activity */}
      {analytics.recentActivity.length > 0 && (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Recent Activity</h3>
          <div className="space-y-3">
            {analytics.recentActivity.slice(0, 5).map((activity) => (
              <div key={activity.id} className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0">
                <div>
                  <p className="text-sm font-medium text-gray-900">{activity.title}</p>
                  <p className="text-xs text-gray-500">
                    {new Date(activity.completedAt).toLocaleDateString()}
                  </p>
                </div>
                {activity.score && (
                  <span className="text-sm font-semibold text-green-600">{activity.score}%</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
