'use client';

import { CRM_PIPELINE_STAGE_META, type CrmPipelineStage } from '@/lib/crm/stages';

type StageCounts = Partial<Record<CrmPipelineStage | 'all', number>>;

type Props = {
  value: CrmPipelineStage | 'all';
  onChange: (stage: CrmPipelineStage | 'all') => void;
  counts?: StageCounts;
  totalCount?: number;
  className?: string;
};

export function CrmStageFilter({ value, onChange, counts, totalCount, className = '' }: Props) {
  const stages: (CrmPipelineStage | 'all')[] = ['all', ...CRM_PIPELINE_STAGE_META.map(s => s.value)];

  return (
    <div className={`flex gap-1 flex-wrap max-h-24 overflow-y-auto sm:max-h-none ${className}`}>
      {stages.map(s => {
        const meta = CRM_PIPELINE_STAGE_META.find(p => p.value === s);
        const count =
          s === 'all'
            ? (totalCount ?? counts?.all ?? 0)
            : (counts?.[s] ?? 0);
        const active = value === s;
        return (
          <button
            key={s}
            type="button"
            onClick={() => onChange(s)}
            className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border transition-colors ${
              active
                ? (meta?.color || 'bg-muted text-foreground border-border')
                : 'bg-transparent text-muted-foreground border-border hover:border-muted-foreground/60'
            }`}
          >
            {s === 'all' ? 'All' : meta?.label} {count}
          </button>
        );
      })}
    </div>
  );
}
