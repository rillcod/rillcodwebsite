'use client';

import { FIXED_BANDS, SINGLE_GRADES, type BandGranularity } from '@/lib/classes/naming';

/**
 * The ONE control for a class's grade — a single grouped dropdown of automatic bands and
 * single grades. No free text, so class names stay on one convention. Granularity is derived
 * from the choice (a range like "Basic 1-3" → fixed band; "Basic 2" → single grade).
 */
export function GradeBandPicker({ grade, onChange, selectClass }: {
  grade: string;
  onChange: (next: { granularity: BandGranularity; grade: string }) => void;
  selectClass?: string;
}) {
  const sel = selectClass ?? 'w-full px-4 py-2.5 bg-card shadow-sm border border-border rounded-xl text-sm text-foreground focus:outline-none focus:border-primary transition-colors';
  return (
    <select
      value={grade}
      onChange={e => {
        const v = e.target.value;
        onChange({ grade: v, granularity: v.includes('-') ? 'fixed' : 'single' });
      }}
      className={sel}
    >
      <option value="">Select grade / band…</option>
      <optgroup label="Automatic band">
        {FIXED_BANDS.map(b => <option key={b} value={b}>{b}</option>)}
      </optgroup>
      <optgroup label="Single grade">
        {SINGLE_GRADES.map(g => <option key={g} value={g}>{g}</option>)}
      </optgroup>
    </select>
  );
}
