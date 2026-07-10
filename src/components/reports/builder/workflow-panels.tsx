import type { ReactNode } from 'react';

export function BuilderField({ label, children }: { label: string; children: ReactNode }) {
  return <div><label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">{label}</label>{children}</div>;
}

export function BuilderSection({ title, icon, children }: { title: string; icon: string; children: ReactNode }) {
  return <section className="overflow-hidden rounded-xl border border-border bg-card shadow-sm"><header className="flex items-center gap-2 border-b border-border bg-muted/20 px-4 py-3 sm:px-5"><span aria-hidden>{icon}</span><h3 className="text-xs font-bold uppercase tracking-widest text-muted-foreground">{title}</h3></header><div className="space-y-4 p-4 sm:p-5">{children}</div></section>;
}

export const SessionSetupPanel = BuilderSection;
export const StudentPickerPanel = BuilderSection;
export const EvidenceEditorPanel = BuilderSection;
export const NarrativeEditorPanel = BuilderSection;
export const ReportPreviewPanel = BuilderSection;

export function EvidenceStatusBanner({ loading, assignments, sessions }: { loading: boolean; assignments: number; sessions: number }) {
  if (loading) return <div className="rounded-xl border border-primary/20 bg-primary/5 p-3 text-sm text-primary">Loading assessment evidence… Publishing remains locked until evidence is ready.</div>;
  const missing: string[] = [];
  if (assignments === 0) missing.push('assignments');
  if (sessions === 0) missing.push('attendance sessions');
  if (!missing.length) return <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-3 text-sm text-emerald-400">Evidence loaded for this class and reporting period.</div>;
  return <div role="alert" className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-sm leading-relaxed text-amber-300">No {missing.join(' or ')} were found for this reporting period. Automatic values remain zero; enter verified scores manually before publishing.</div>;
}

export function PublishControls({ children }: { children: ReactNode }) {
  return <div className="sticky bottom-0 z-40 mt-6 border-t border-border bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl">{children}</div>;
}