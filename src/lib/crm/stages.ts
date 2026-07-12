/**
 * Single source of truth for CRM contact-pipeline stages.
 * Opportunity (deal) stages stay separate — see CRM UI OPP_STAGES.
 */

export const CRM_PIPELINE_STAGES = ['prospect', 'active', 'at_risk', 'won', 'churned'] as const;
export type CrmPipelineStage = (typeof CRM_PIPELINE_STAGES)[number];

export const CRM_PIPELINE_STAGE_META: {
  value: CrmPipelineStage;
  label: string;
  color: string;
  dot: string;
}[] = [
  { value: 'prospect', label: 'Prospect', color: 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20',   dot: 'bg-blue-500' },
  { value: 'active',   label: 'Active',   color: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20', dot: 'bg-emerald-500' },
  { value: 'at_risk',  label: 'At Risk',  color: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20',   dot: 'bg-amber-500' },
  { value: 'won',      label: 'Won',      color: 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20', dot: 'bg-indigo-500' },
  { value: 'churned',  label: 'Churned',  color: 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20',     dot: 'bg-rose-500' },
];

/** Map legacy lead stages + aliases into the CRM UI vocabulary. */
export function normalizeCrmStage(stage: string | null | undefined): CrmPipelineStage {
  const s = (stage || 'prospect').toLowerCase();
  if (s === 'enquiry' || s === 'lead') return 'prospect';
  if (s === 'contacted' || s === 'trial') return 'active';
  if (s === 'enrolled') return 'won';
  if ((CRM_PIPELINE_STAGES as readonly string[]).includes(s)) return s as CrmPipelineStage;
  return 'prospect';
}

/** Rank for demotion guards (higher = further along). */
export function crmStageRank(stage: string | null | undefined): number {
  return CRM_PIPELINE_STAGES.indexOf(normalizeCrmStage(stage));
}

/**
 * Map CRM list role / access kind → crm_* contact_type column.
 * One mapping used by UI and APIs.
 */
export function crmContactTypeFromRole(
  roleOrKind: string | null | undefined,
): 'portal_user' | 'form_lead' | 'external' | 'parent' {
  const r = (roleOrKind || '').toLowerCase();
  if (r === 'external' || r === 'whatsapp') return 'external';
  if (r === 'lead' || r === 'book' || r === 'form_lead') return 'form_lead';
  if (r === 'parent') return 'parent';
  return 'portal_user';
}
