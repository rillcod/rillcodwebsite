'use client';

import { PerformancePoint } from '@/services/analytics.service';

interface PerformanceTrendChartProps {
  data: PerformancePoint[];
}

export default function PerformanceTrendChart({ data }: PerformanceTrendChartProps) {
  const maxValue = Math.max(...data.map(d => Math.max(d.average, d.completionRate)), 100);

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
      <h3 className="text-lg font-semibold text-gray-900 mb-4">Performance Trend</h3>

      <div className="flex items-end gap-4 h-48">
        {data.map((point, index) => {
          const averageHeight = (point.average / maxValue) * 100;
          const completionHeight = (point.completionRate / maxValue) * 100;

          return (
            <div key={index} className="flex-1 flex flex-col items-center">
              <div className="w-full flex gap-1 items-end h-40">
                <div className="flex-1 bg-blue-500 rounded-t opacity-70" style={{ height: `${averageHeight}%` }} />
                <div className="flex-1 bg-green-500 rounded-t" style={{ height: `${completionHeight}%` }} />
              </div>
              <p className="text-xs text-gray-600 mt-2">Week {point.week}</p>
            </div>
          );
        })}
      </div>

      <div className="flex gap-4 mt-4 text-xs">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 bg-blue-500 rounded-full opacity-70" />
          <span className="text-gray-600">Avg Score</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 bg-green-500 rounded-full" />
          <span className="text-gray-600">Assignments Completed</span>
        </div>
      </div>
    </div>
  );
}
