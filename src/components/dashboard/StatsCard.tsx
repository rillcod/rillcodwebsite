import React from 'react';
import { LucideIcon, TrendingUp, TrendingDown } from 'lucide-react';

interface StatsCardProps {
  title: string;
  value: string | number;
  icon: LucideIcon;
  change?: number;
  changeType?: 'increase' | 'decrease';
  color?: 'blue' | 'green' | 'purple' | 'orange' | 'red';
  subtitle?: string;
}

const StatsCard: React.FC<StatsCardProps> = ({
  title,
  value,
  icon: Icon,
  change,
  changeType,
  color = 'blue',
  subtitle
}) => {
  const colorClasses = {
    blue: 'bg-primary/10 text-primary',
    green: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
    purple: 'bg-primary/10 text-primary',
    orange: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
    red: 'bg-brand-red-600/10 text-brand-red-600'
  };

  const changeColorClasses = {
    increase: 'text-green-600 dark:text-green-400',
    decrease: 'text-red-600 dark:text-red-400'
  };

  return (
    <div className="bg-card/90 backdrop-blur-2xl rounded-2xl sm:rounded-3xl shadow-xl border border-border/80 p-5 sm:p-6 hover:shadow-2xl transition-all">
      <div className="flex items-center justify-between">
        <div className="flex-1">
          <p className="text-sm font-medium text-muted-foreground mb-1">{title}</p>
          <p className="text-2xl font-bold text-foreground mb-1">{value}</p>
          {subtitle && (
            <p className="text-xs text-muted-foreground">{subtitle}</p>
          )}
          
          {change !== undefined && (
            <div className="flex items-center mt-2">
              {changeType === 'increase' ? (
                <TrendingUp className={`w-4 h-4 mr-1 ${changeColorClasses.increase}`} />
              ) : (
                <TrendingDown className={`w-4 h-4 mr-1 ${changeColorClasses.decrease}`} />
              )}
              <span className={`text-sm font-medium ${changeColorClasses[changeType || 'increase']}`}>
                {change > 0 ? '+' : ''}{change}%
              </span>
              <span className="text-sm text-muted-foreground ml-1">from last month</span>
            </div>
          )}
        </div>
        
        <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${colorClasses[color]}`}>
          <Icon className="w-6 h-6" />
        </div>
      </div>
    </div>
  );
};

export default StatsCard; 