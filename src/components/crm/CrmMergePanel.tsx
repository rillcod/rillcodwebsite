'use client';

import { XMarkIcon } from '@/lib/icons';
import { GitMerge, Loader2, Merge } from 'lucide-react';

export type CrmMergeRow = {
  id: string;
  full_name: string | null;
  email?: string | null;
  phone?: string | null;
  role: string;
};

type Props = {
  rows: CrmMergeRow[];
  loading?: boolean;
  mergeTarget: string;
  mergeSource: string;
  onMergeTargetChange: (id: string) => void;
  onMergeSourceChange: (id: string) => void;
  onMerge: () => void;
  merging?: boolean;
  message?: string;
  onClose?: () => void;
  variant?: 'inline' | 'panel';
};

export function CrmMergePanel({
  rows,
  loading,
  mergeTarget,
  mergeSource,
  onMergeTargetChange,
  onMergeSourceChange,
  onMerge,
  merging,
  message,
  onClose,
  variant = 'panel',
}: Props) {
  const success = message?.includes('success') || message?.includes('completed');
  const shell =
    variant === 'panel'
      ? 'bg-amber-500/5 border border-amber-500/20 rounded-2xl p-4 space-y-3'
      : 'grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1 border-t border-border';

  return (
    <div className={shell}>
      {variant === 'panel' && (
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-black text-amber-600 dark:text-amber-400">Merge Duplicate Contacts</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              The source record is deleted. All its data is merged into the target.
            </p>
          </div>
          {onClose && (
            <button type="button" onClick={onClose} className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted">
              <XMarkIcon className="w-4 h-4" />
            </button>
          )}
        </div>
      )}

      <div className={variant === 'panel' ? 'grid grid-cols-1 sm:grid-cols-3 gap-3' : 'contents'}>
        <div>
          <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground block mb-1">
            Keep (target)
          </label>
          <select
            value={mergeTarget}
            onChange={e => onMergeTargetChange(e.target.value)}
            disabled={loading}
            className="w-full text-sm bg-background border border-border rounded-lg px-2 py-2 focus:outline-none focus:border-primary"
          >
            <option value="">Select contact to keep…</option>
            {rows.map(r => (
              <option key={`t-${r.id}`} value={r.id}>
                {r.full_name || r.email || r.phone} ({r.role})
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground block mb-1">
            Remove (duplicate)
          </label>
          <select
            value={mergeSource}
            onChange={e => onMergeSourceChange(e.target.value)}
            disabled={loading}
            className="w-full text-sm bg-background border border-border rounded-lg px-2 py-2 focus:outline-none focus:border-primary"
          >
            <option value="">Select duplicate…</option>
            {rows.filter(r => r.id !== mergeTarget).map(r => (
              <option key={`s-${r.id}`} value={r.id}>
                {r.full_name || r.email || r.phone} ({r.role})
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col justify-end">
          <button
            type="button"
            onClick={onMerge}
            disabled={merging || !mergeTarget || !mergeSource}
            className="flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 disabled:opacity-40 text-black font-black text-sm"
          >
            {merging ? <Loader2 className="w-4 h-4 animate-spin" /> : variant === 'panel' ? <Merge className="w-4 h-4" /> : <GitMerge size={14} />}
            {merging ? 'Merging…' : 'Merge now'}
          </button>
        </div>
      </div>

      {message && (
        <p
          className={`text-xs font-semibold px-2 py-1.5 rounded-lg ${
            success ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' : 'bg-rose-500/10 text-rose-600 dark:text-rose-400'
          }`}
        >
          {message}
        </p>
      )}
    </div>
  );
}
