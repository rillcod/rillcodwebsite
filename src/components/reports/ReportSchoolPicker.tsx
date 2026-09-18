'use client';

import { useId, useMemo, useRef, useState } from 'react';

export type ReportSchoolOption = { id: string; name: string };
export function filterReportSchools(schools: ReportSchoolOption[], query: string) {
  const words = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  return schools.filter(s => words.every(word => s.name.toLocaleLowerCase().includes(word)))
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));
}

export function ReportSchoolPicker({ schools, value, selectedName, onChange }: {
  schools: ReportSchoolOption[];
  value?: string;
  selectedName?: string;
  onChange: (school: ReportSchoolOption) => void;
}) {
  const [query, setQuery] = useState('');
  const ref = useRef<HTMLDetailsElement>(null);
  const searchId = useId();
  const options = useMemo(() => filterReportSchools(schools, query), [schools, query]);
  const selected = schools.find(s => s.id === value);
  return (
    <details ref={ref} className="rounded-xl border border-border bg-background">
      <summary className="min-h-12 cursor-pointer break-words px-3 py-3 text-base font-medium text-foreground">
        {selected?.name || selectedName || 'Choose a school'}
      </summary>
      <div className="space-y-2 border-t border-border p-3">
        <label htmlFor={searchId} className="block text-sm text-muted-foreground">Find a school</label>
        <input id={searchId} type="search" value={query} onChange={e => setQuery(e.target.value)} placeholder="Type the school name" className="min-h-11 w-full rounded-lg border border-border bg-card px-3 text-base text-foreground" />
        <div className="max-h-60 space-y-1 overflow-y-auto" aria-label="Schools">
          {options.map(school => (
            <button key={school.id} type="button" aria-pressed={school.id === value}
              onClick={() => { onChange(school); setQuery(''); if (ref.current) { ref.current.open = false; ref.current.querySelector('summary')?.focus(); } }}
              className={`min-h-11 w-full rounded-lg px-3 py-2 text-left text-sm ${school.id === value ? 'bg-primary text-primary-foreground' : 'text-foreground hover:bg-muted focus-visible:bg-muted'}`}>
              {school.name}{school.id === value ? ' ✓' : ''}
            </button>
          ))}
          {options.length === 0 && <p role="status" className="py-3 text-sm text-muted-foreground">{schools.length ? 'No matching schools. Try another name.' : 'No schools available for your account.'}</p>}
        </div>
      </div>
    </details>
  );
}
