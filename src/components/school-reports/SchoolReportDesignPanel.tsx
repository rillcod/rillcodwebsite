'use client';

import {
  ACCENT_PRESETS,
  DEFAULT_SCHOOL_REPORT_DESIGN,
  SECTION_META,
  type SchoolReportDesignSettings,
  type SchoolReportDensity,
  type SchoolReportHeaderStyle,
  type SchoolReportPreviewDevice,
} from '@/lib/school-reports/design';

type Props = {
  design: SchoolReportDesignSettings;
  onChange: (next: SchoolReportDesignSettings) => void;
  disabled?: boolean;
  onPreviewDeviceChange?: (device: SchoolReportPreviewDevice) => void;
};

export function SchoolReportDesignPanel({ design, onChange, disabled, onPreviewDeviceChange }: Props) {
  function patch(partial: Partial<SchoolReportDesignSettings>) {
    onChange({ ...design, ...partial });
  }

  function toggleSection(key: (typeof SECTION_META)[number]['key']) {
    onChange({
      ...design,
      sections: { ...design.sections, [key]: !design.sections[key] },
    });
  }

  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-primary/20 bg-primary/5 p-5">
        <h3 className="font-black">Layout & preview</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Changes apply to the live preview and exported PDF. Autosaves with your wording.
        </p>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <label className="space-y-1">
            <span className="text-xs font-black uppercase text-muted-foreground">Density</span>
            <select
              disabled={disabled}
              value={design.density}
              onChange={(e) => patch({ density: e.target.value as SchoolReportDensity })}
              className="w-full rounded-xl border border-border bg-background p-2.5 text-sm"
            >
              <option value="compact">Compact</option>
              <option value="comfortable">Comfortable</option>
              <option value="spacious">Spacious</option>
            </select>
          </label>
          <label className="space-y-1">
            <span className="text-xs font-black uppercase text-muted-foreground">Header style</span>
            <select
              disabled={disabled}
              value={design.headerStyle}
              onChange={(e) => patch({ headerStyle: e.target.value as SchoolReportHeaderStyle })}
              className="w-full rounded-xl border border-border bg-background p-2.5 text-sm"
            >
              <option value="classic">Classic (accent bar)</option>
              <option value="minimal">Minimal</option>
            </select>
          </label>
        </div>
        <label className="mt-4 flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            disabled={disabled}
            checked={design.showLogo}
            onChange={(e) => patch({ showLogo: e.target.checked })}
            className="rounded border-border"
          />
          <span className="font-bold">Show Rillcod letterhead on preview & PDF</span>
        </label>
      </section>

      <section className="rounded-2xl border border-border bg-card p-5">
        <h3 className="font-black">Preview device</h3>
        <p className="mt-1 text-sm text-muted-foreground">See how the school book reads on phone, tablet, or desktop.</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {(
            [
              ['mobile', 'Phone'],
              ['tablet', 'Tablet'],
              ['desktop', 'Desktop'],
            ] as const
          ).map(([device, label]) => (
            <button
              key={device}
              type="button"
              disabled={disabled}
              onClick={() => {
                patch({ previewDevice: device });
                onPreviewDeviceChange?.(device);
              }}
              className={`rounded-xl px-4 py-2 text-xs font-black transition ${
                design.previewDevice === device
                  ? 'bg-primary text-white shadow-sm'
                  : 'border border-border bg-background text-muted-foreground hover:text-foreground'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </section>

      <section className="rounded-2xl border border-border bg-card p-5">
        <h3 className="font-black">Accent colour</h3>
        <p className="mt-1 text-sm text-muted-foreground">Used on headings, borders, and highlights in the PDF.</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {ACCENT_PRESETS.map((preset) => (
            <button
              key={preset.value}
              type="button"
              disabled={disabled}
              title={preset.label}
              onClick={() => patch({ accentColor: preset.value })}
              className={`h-9 w-9 rounded-full ring-2 ring-offset-2 transition ${
                design.accentColor === preset.value ? 'ring-primary' : 'ring-transparent'
              }`}
              style={{ background: preset.value }}
            />
          ))}
          <label className="flex items-center gap-2 rounded-xl border border-border px-3 py-1.5 text-xs font-bold">
            Custom
            <input
              type="color"
              disabled={disabled}
              value={design.accentColor}
              onChange={(e) => patch({ accentColor: e.target.value })}
              className="h-7 w-10 cursor-pointer rounded border-0 bg-transparent"
            />
          </label>
        </div>
      </section>

      <section className="rounded-2xl border border-border bg-card p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-black">PDF sections</h3>
          <button
            type="button"
            disabled={disabled}
            onClick={() => onChange({ ...design, sections: { ...DEFAULT_SCHOOL_REPORT_DESIGN.sections } })}
            className="text-xs font-black text-primary underline-offset-2 hover:underline"
          >
            Reset all on
          </button>
        </div>
        <ul className="mt-3 space-y-2">
          {SECTION_META.map((row) => (
            <li key={row.key} className="flex gap-3 rounded-xl border border-border/70 px-3 py-2.5">
              <input
                type="checkbox"
                disabled={disabled}
                checked={design.sections[row.key] !== false}
                onChange={() => toggleSection(row.key)}
                className="mt-0.5 rounded border-border"
              />
              <div>
                <p className="text-sm font-bold">{row.label}</p>
                <p className="text-xs text-muted-foreground">{row.hint}</p>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section className="rounded-2xl border border-border bg-card p-5">
        <h3 className="font-black">Review date note</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Optional line under the community message — e.g. suggested meeting date with school leadership.
        </p>
        <textarea
          disabled={disabled}
          value={design.reviewDateNote}
          onChange={(e) => patch({ reviewDateNote: e.target.value })}
          rows={2}
          placeholder="Suggested joint review: first week of next term…"
          className="mt-3 w-full rounded-xl border border-border bg-background p-3 text-sm"
        />
      </section>
    </div>
  );
}
