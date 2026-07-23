/**
 * Shared CRM UI tokens — role badges, avatars, formatting.
 */

import { CRM_PIPELINE_STAGE_META, type CrmPipelineStage } from '@/lib/crm/stages';

export const CRM_ROLE_CFG: Record<string, { cls: string; label: string; avatar: string }> = {
  student:  { cls: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20', label: 'Student',  avatar: 'bg-emerald-600' },
  parent:   { cls: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20',       label: 'Parent',   avatar: 'bg-amber-500' },
  teacher:  { cls: 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20',          label: 'Teacher',  avatar: 'bg-blue-600' },
  school:   { cls: 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-500/20',    label: 'School',   avatar: 'bg-indigo-700' },
  external: { cls: 'bg-muted text-muted-foreground border-border',                                    label: 'External', avatar: 'bg-muted-foreground/40' },
  lead:     { cls: 'bg-violet-500/10 text-violet-600 dark:text-violet-400 border-violet-500/20',    label: 'Lead',     avatar: 'bg-violet-600' },
};

export const CRM_SOURCE_CFG: Record<string, { cls: string; label: string }> = {
  consent_form:        { cls: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',     label: 'Consent Form' },
  form_capture:        { cls: 'bg-sky-500/10 text-sky-600 dark:text-sky-400',           label: 'Form Capture' },
  dropped_payment:     { cls: 'bg-rose-500/10 text-rose-600 dark:text-rose-400',        label: 'Dropped Payer' },
  portal_registration: { cls: 'bg-blue-500/10 text-blue-600 dark:text-blue-400',        label: 'Registration' },
  mobile_application:  { cls: 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400',  label: 'Mobile App' },
  portal:              { cls: 'bg-blue-500/10 text-blue-600 dark:text-blue-400',        label: 'Portal' },
  whatsapp:            { cls: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400', label: 'WhatsApp' },
  manual:              { cls: 'bg-muted text-muted-foreground',                         label: 'Manual' },
  manual_crm:          { cls: 'bg-violet-500/10 text-violet-600 dark:text-violet-400',  label: 'CRM Manual' },
  contact_book:        { cls: 'bg-primary/10 text-primary',                            label: 'Directory' },
};

export const CRM_STAT_CHIPS = [
  { key: 'total', label: 'Total', color: 'text-foreground' },
  { key: 'parents', label: 'Parents', color: 'text-emerald-600 dark:text-emerald-400' },
  { key: 'students', label: 'Students', color: 'text-sky-600 dark:text-sky-400' },
  { key: 'active', label: 'Contacted', color: 'text-violet-600 dark:text-violet-400' },
  { key: 'prospect', label: 'Prospect', color: 'text-blue-600 dark:text-blue-400' },
  { key: 'at_risk', label: 'At Risk', color: 'text-amber-600 dark:text-amber-400' },
  { key: 'overdueTasks', label: 'Overdue Tasks', color: 'text-muted-foreground', alertKey: 'overdueTasks' as const },
] as const;

export type CrmStats = {
  total: number;
  parents: number;
  students: number;
  active: number;
  prospect: number;
  at_risk: number;
  won: number;
  churned: number;
  overdueTasks: number;
  pipelineValue: number;
};

export function crmStageMeta(stage?: string | null) {
  return CRM_PIPELINE_STAGE_META.find(p => p.value === stage) ?? CRM_PIPELINE_STAGE_META[0];
}

export function crmInitials(name: string | null | undefined) {
  if (!name) return '?';
  return name.split(' ').slice(0, 2).map(n => n[0]).join('').toUpperCase();
}

export function crmAvatarColor(role: string) {
  return CRM_ROLE_CFG[role]?.avatar ?? 'bg-muted-foreground/40';
}

export function crmFmtDate(iso: string | null | undefined) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function computeCrmStageCounts<T extends { pipeline_stage?: string | null; role?: string }>(
  list: T[],
): Pick<CrmStats, 'total' | 'parents' | 'students' | 'active' | 'prospect' | 'at_risk' | 'won' | 'churned'> {
  const stageCounts: Record<string, number> = {};
  let parentCount = 0;
  let studentCount = 0;
  list.forEach(c => {
    const s = c.pipeline_stage || 'prospect';
    stageCounts[s] = (stageCounts[s] || 0) + 1;
    if (c.role === 'parent') parentCount++;
    if (c.role === 'student') studentCount++;
  });
  return {
    total: list.length,
    parents: parentCount,
    students: studentCount,
    active: stageCounts['active'] || 0,
    prospect: stageCounts['prospect'] || 0,
    at_risk: stageCounts['at_risk'] || 0,
    won: stageCounts['won'] || 0,
    churned: stageCounts['churned'] || 0,
  };
}

export function contactMatchesStage(
  pipelineStage: string | null | undefined,
  filter: CrmPipelineStage | 'all',
): boolean {
  if (filter === 'all') return true;
  const normalized = pipelineStage || 'prospect';
  return normalized === filter || (!pipelineStage && filter === 'prospect');
}
