'use client';

interface AnalyticsCardProps {
  label: string;
  value: number;
  total: number;
  icon: string;
  color: 'blue' | 'green' | 'purple' | 'orange';
  isPercentage?: boolean;
  isDays?: boolean;
}

const colorClasses = {
  blue: 'bg-blue-50 text-blue-600 border-blue-200',
  green: 'bg-green-50 text-green-600 border-green-200',
  purple: 'bg-purple-50 text-purple-600 border-purple-200',
  orange: 'bg-orange-50 text-orange-600 border-orange-200'
};

const progressColors = {
  blue: 'bg-blue-500',
  green: 'bg-green-500',
  purple: 'bg-purple-500',
  orange: 'bg-orange-500'
};

export default function AnalyticsCard({
  label,
  value,
  total,
  icon,
  color,
  isPercentage,
  isDays
}: AnalyticsCardProps) {
  const progress = (value / total) * 100;

  return (
    <div className={`rounded-lg border-2 p-4 ${colorClasses[color]}`}>
      <div className="flex items-start justify-between mb-3">
        <div>
          <p className="text-sm font-medium opacity-70">{label}</p>
          <p className="text-2xl font-bold mt-1">
            {value}{isPercentage ? '%' : isDays ? 'd' : ''}
          </p>
          {!isPercentage && !isDays && (
            <p className="text-xs opacity-60 mt-1">of {total}</p>
          )}
        </div>
        <span className="text-3xl">{icon}</span>
      </div>

      {!isPercentage && !isDays && (
        <div className="w-full bg-white rounded-full h-2 mt-2">
          <div
            className={`${progressColors[color]} h-2 rounded-full transition-all duration-300`}
            style={{ width: `${Math.min(progress, 100)}%` }}
          />
        </div>
      )}
    </div>
  );
}
