export function SchoolReportKpi({
  label,
  value,
  note,
  color,
}: {
  label: string;
  value: string | number;
  note: string;
  color: string;
}) {
  return (
    <div className="rounded-2xl border border-border bg-card p-5">
      <div className="h-1 w-14 rounded-full" style={{ background: color }} />
      <p className="mt-4 text-xs font-black uppercase tracking-widest text-muted-foreground">{label}</p>
      <p className="mt-1 text-3xl font-black text-foreground">{value}</p>
      <p className="mt-1 text-xs text-muted-foreground">{note}</p>
    </div>
  );
}
