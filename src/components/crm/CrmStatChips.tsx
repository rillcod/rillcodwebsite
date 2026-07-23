'use client';

import { CRM_STAT_CHIPS, type CrmStats } from '@/lib/crm/ui';

type Props = {
  stats: CrmStats;
  className?: string;
};

export function CrmStatChips({ stats, className = '' }: Props) {
  return (
    <div className={`flex items-center gap-2 overflow-x-auto scrollbar-none snap-x snap-mandatory ${className}`}>
      {CRM_STAT_CHIPS.map(s => {
        const value = stats[s.key as keyof CrmStats] as number;
        const alertKey = 'alertKey' in s ? s.alertKey : undefined;
        const color =
          alertKey && stats[alertKey] > 0
            ? 'text-rose-600 dark:text-rose-400'
            : s.color;
        return (
          <div
            key={s.key}
            className="shrink-0 snap-start px-3 py-1 rounded-lg bg-background border border-border text-center min-w-[64px]"
          >
            <div className={`text-sm font-black ${color}`}>{value}</div>
            <div className="text-[9px] text-muted-foreground uppercase tracking-wide">{s.label}</div>
          </div>
        );
      })}
    </div>
  );
}
