type Template = 'standard' | 'modern' | 'printable';
type Style = 'industrial' | 'executive' | 'futuristic';

export function ReportAppearanceControls({ template, style, onTemplateChange, onStyleChange }: {
  template: Template;
  style: Style;
  onTemplateChange: (value: Template) => void;
  onStyleChange: (value: Style) => void;
}) {
  return (
    <details className="w-full rounded-lg border border-border bg-card sm:w-auto">
      <summary className="min-h-11 cursor-pointer px-3 py-3 text-sm font-medium text-foreground">Report appearance</summary>
      <div className="flex flex-wrap gap-3 border-t border-border p-3">
        <label className="flex flex-1 flex-col gap-1 text-sm text-muted-foreground">
          Layout
          <select value={template} onChange={e => onTemplateChange(e.target.value as Template)} className="min-h-11 rounded-md border border-border bg-background px-3 text-foreground">
            <option value="standard">Standard</option>
            <option value="modern">Modern</option>
            <option value="printable">Print-friendly</option>
          </select>
        </label>
        {template === 'modern' && (
          <label className="flex flex-1 flex-col gap-1 text-sm text-muted-foreground">
            Style
            <select value={style} onChange={e => onStyleChange(e.target.value as Style)} className="min-h-11 rounded-md border border-border bg-background px-3 text-foreground">
              <option value="industrial">Black and white</option>
              <option value="executive">Gold</option>
              <option value="futuristic">Blue</option>
            </select>
          </label>
        )}
      </div>
    </details>
  );
}
