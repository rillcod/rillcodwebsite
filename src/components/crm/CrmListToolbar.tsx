'use client';

import { Search, RefreshCw, Download, FileText } from 'lucide-react';
import { CrmStageFilter } from '@/components/crm/CrmStageFilter';
import type { CrmPipelineStage } from '@/lib/crm/stages';

type Props = {
  search: string;
  onSearchChange: (v: string) => void;
  roleFilter: string;
  onRoleFilterChange: (v: string) => void;
  stageFilter: CrmPipelineStage | 'all';
  onStageFilterChange: (v: CrmPipelineStage | 'all') => void;
  stageCounts?: Partial<Record<CrmPipelineStage | 'all', number>>;
  totalCount?: number;
  onRefresh?: () => void;
  onExportCsv?: () => void;
  onPrint?: () => void;
};

export function CrmListToolbar({
  search,
  onSearchChange,
  roleFilter,
  onRoleFilterChange,
  stageFilter,
  onStageFilterChange,
  stageCounts,
  totalCount,
  onRefresh,
  onExportCsv,
  onPrint,
}: Props) {
  return (
    <div className="p-3 space-y-2 border-b border-border">
      <div className="relative">
        <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground/80" />
        <input
          value={search}
          onChange={e => onSearchChange(e.target.value)}
          placeholder="Search contacts…"
          className="w-full pl-8 pr-3 py-2 text-sm bg-background border border-border rounded-lg text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:border-primary transition-colors"
        />
      </div>
      <div className="flex flex-wrap gap-2">
        <select
          value={roleFilter}
          onChange={e => onRoleFilterChange(e.target.value)}
          className="flex-1 min-w-[140px] text-xs bg-background border border-border rounded-lg px-2 py-1.5 text-muted-foreground focus:outline-none focus:border-primary transition-colors"
        >
          <option value="all">Parents &amp; Students</option>
          <option value="parent">Parents only</option>
          <option value="student">Students only</option>
          <option value="lead">Form leads</option>
          <option value="external">External (WhatsApp)</option>
          <option value="everyone">Everyone (all users)</option>
        </select>
        {onRefresh && (
          <button
            type="button"
            onClick={onRefresh}
            title="Refresh"
            className="p-1.5 rounded-lg bg-background border border-border text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          >
            <RefreshCw size={13} />
          </button>
        )}
        {onExportCsv && (
          <button
            type="button"
            onClick={onExportCsv}
            title="Export CSV"
            className="p-1.5 rounded-lg bg-background border border-border text-muted-foreground hover:text-emerald-500 hover:bg-muted transition-colors"
          >
            <Download size={13} />
          </button>
        )}
        {onPrint && (
          <button
            type="button"
            onClick={onPrint}
            title="Print Directory"
            className="p-1.5 rounded-lg bg-background border border-border text-muted-foreground hover:text-primary hover:bg-muted transition-colors"
          >
            <FileText size={13} />
          </button>
        )}
      </div>
      <CrmStageFilter
        value={stageFilter}
        onChange={onStageFilterChange}
        counts={stageCounts}
        totalCount={totalCount}
      />
    </div>
  );
}
