'use client';

import { SkillProgress } from '@/services/analytics.service';

interface SkillBreakdownChartProps {
  data: SkillProgress[];
}

export default function SkillBreakdownChart({ data }: SkillBreakdownChartProps) {
  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
      <h3 className="text-lg font-semibold text-gray-900 mb-4">Skill Breakdown</h3>

      <div className="space-y-4">
        {data.length > 0 ? (
          data.map((skill) => (
            <div key={skill.skill}>
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm font-medium text-gray-700">{skill.skill}</p>
                <p className="text-sm text-gray-500">
                  {skill.lessonsCompleted} / {skill.lessonsTotal}
                </p>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div
                  className="bg-gradient-to-r from-blue-500 to-purple-500 h-2 rounded-full transition-all duration-300"
                  style={{ width: `${skill.progress}%` }}
                />
              </div>
              <p className="text-xs text-gray-500 mt-1">{Math.round(skill.progress)}% complete</p>
            </div>
          ))
        ) : (
          <p className="text-sm text-gray-500 text-center py-8">No skill data available yet</p>
        )}
      </div>
    </div>
  );
}
