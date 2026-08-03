'use client';

import { WEEKDAY_LABELS, describePattern } from '@/lib/live-sessions/recurrence';

export interface RecurrenceForm {
  enabled: boolean;
  /** 0 = Sunday … 6 = Saturday. */
  weekdays: number[];
  /** Regular school programmes bound to a term; special programmes carry their own dates. */
  boundary: 'term' | 'custom';
  term_id: string;
  starts_on: string;
  ends_on: string;
  notify_parents: boolean;
}

export interface TermOption {
  id: string;
  term_label: string;
  academic_year: string;
  start_date: string | null;
  end_date: string | null;
}

export function blankRecurrence(startDate: string): RecurrenceForm {
  return {
    enabled: false,
    weekdays: [],
    boundary: 'term',
    term_id: '',
    starts_on: startDate,
    ends_on: '',
    notify_parents: false,
  };
}

/**
 * The "Repeat" block of the schedule modal.
 *
 * Time and duration deliberately come from the single-session fields above rather than being
 * duplicated here — a series is the same class repeated, and two sources for "when" is how
 * they drift apart.
 */
export default function RecurrenceFields({
  value, onChange, terms, startTime, durationMinutes, fieldCls, labelCls,
}: {
  value: RecurrenceForm;
  onChange: (next: RecurrenceForm) => void;
  terms: TermOption[];
  startTime: string;
  durationMinutes: number;
  fieldCls: string;
  labelCls: string;
}) {
  const set = <K extends keyof RecurrenceForm>(k: K, v: RecurrenceForm[K]) => onChange({ ...value, [k]: v });

  const toggleDay = (d: number) => {
    const next = value.weekdays.includes(d)
      ? value.weekdays.filter((x) => x !== d)
      : [...value.weekdays, d].sort((a, b) => a - b);
    set('weekdays', next);
  };

  const selectedTerm = terms.find((t) => t.id === value.term_id);
  const summary = value.weekdays.length
    ? describePattern({ weekdays: value.weekdays, start_time: startTime })
    : null;

  return (
    <div className="border border-white/10 bg-white/[0.02] p-5 space-y-5">
      <label className="flex items-start gap-3 cursor-pointer">
        <input
          type="checkbox"
          checked={value.enabled}
          onChange={(e) => set('enabled', e.target.checked)}
          className="mt-0.5 w-4 h-4 accent-emerald-500 shrink-0"
        />
        <span>
          <span className="block text-[10px] font-black text-foreground uppercase tracking-widest">
            Repeat this class
          </span>
          <span className="block text-[10px] text-muted-foreground mt-1">
            Create the whole timetable once — the app keeps the calendar filled and reminds everyone.
          </span>
        </span>
      </label>

      {value.enabled && (
        <div className="space-y-5 pt-1">
          <div>
            <label className={labelCls}>Repeat on <span className="text-primary">*</span></label>
            <div className="flex flex-wrap gap-1.5">
              {WEEKDAY_LABELS.map((label, day) => {
                const on = value.weekdays.includes(day);
                return (
                  <button
                    key={day}
                    type="button"
                    onClick={() => toggleDay(day)}
                    aria-pressed={on}
                    className={`w-11 h-11 text-[10px] font-black uppercase tracking-wider border transition-all ${
                      on
                        ? 'bg-emerald-600 border-emerald-500 text-white'
                        : 'bg-white/[0.03] border-white/10 text-muted-foreground hover:border-white/30'
                    }`}
                  >
                    {label.slice(0, 2)}
                  </button>
                );
              })}
            </div>
            <div className="flex flex-wrap gap-3 mt-2.5">
              <button type="button" onClick={() => set('weekdays', [1, 2, 3, 4, 5])}
                className="text-[9px] font-black uppercase tracking-widest text-primary hover:underline">
                Weekdays
              </button>
              <button type="button" onClick={() => set('weekdays', [0, 1, 2, 3, 4, 5, 6])}
                className="text-[9px] font-black uppercase tracking-widest text-primary hover:underline">
                Every day
              </button>
              {value.weekdays.length > 0 && (
                <button type="button" onClick={() => set('weekdays', [])}
                  className="text-[9px] font-black uppercase tracking-widest text-muted-foreground hover:underline">
                  Clear
                </button>
              )}
            </div>
            {summary && (
              <p className="mt-3 text-[10px] font-bold text-emerald-600 dark:text-emerald-400">
                {summary} · {durationMinutes} min each
              </p>
            )}
          </div>

          <div>
            <label className={labelCls}>Runs until <span className="text-primary">*</span></label>
            <div className="flex flex-wrap gap-2 mb-3">
              {([
                ['term', 'End of academic term'],
                ['custom', 'Custom dates (special programme)'],
              ] as const).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => set('boundary', key)}
                  className={`px-3 py-2 text-[9px] font-black uppercase tracking-widest border transition-all ${
                    value.boundary === key
                      ? 'bg-primary/15 border-primary/50 text-primary'
                      : 'bg-white/[0.03] border-white/10 text-muted-foreground hover:border-white/30'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            {value.boundary === 'term' ? (
              <>
                <select
                  value={value.term_id}
                  onChange={(e) => set('term_id', e.target.value)}
                  className={`${fieldCls} appearance-none`}
                >
                  <option value="" className="bg-[#0a0a0a]">Select a term…</option>
                  {terms.map((t) => (
                    <option key={t.id} value={t.id} className="bg-[#0a0a0a]">
                      {t.academic_year} · {t.term_label}
                      {t.end_date ? ` (ends ${t.end_date})` : ''}
                    </option>
                  ))}
                </select>
                {selectedTerm?.end_date && (
                  <p className="mt-2 text-[10px] text-muted-foreground">
                    Classes will be created up to {selectedTerm.end_date}. A new term needs a new series.
                  </p>
                )}
              </>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className={labelCls}>First class</label>
                  <input type="date" value={value.starts_on} onChange={(e) => set('starts_on', e.target.value)}
                    className={`${fieldCls} [color-scheme:dark]`} />
                </div>
                <div>
                  <label className={labelCls}>Last class <span className="text-primary">*</span></label>
                  <input type="date" value={value.ends_on} onChange={(e) => set('ends_on', e.target.value)}
                    className={`${fieldCls} [color-scheme:dark]`} />
                </div>
              </div>
            )}
          </div>

          <label className="flex items-start gap-3 cursor-pointer border-t border-white/5 pt-4">
            <input
              type="checkbox"
              checked={value.notify_parents}
              onChange={(e) => set('notify_parents', e.target.checked)}
              className="mt-0.5 w-4 h-4 accent-emerald-500 shrink-0"
            />
            <span>
              <span className="block text-[10px] font-black text-foreground uppercase tracking-widest">
                Also remind linked parents
              </span>
              <span className="block text-[10px] text-muted-foreground mt-1">
                Parents linked to a student in this class get the 15-minute reminder too.
                They can mute it in their own notification settings.
              </span>
            </span>
          </label>
        </div>
      )}
    </div>
  );
}
