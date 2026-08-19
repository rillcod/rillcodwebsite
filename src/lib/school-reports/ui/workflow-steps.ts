export const SETUP_WORKFLOW_STEPS = [
  { id: 1, key: 'scope', label: 'School and term', description: 'School, term, and report title' },
  { id: 2, key: 'taught', label: 'What we taught', description: 'Tick topics — they pull through into the draft' },
  { id: 3, key: 'preflight', label: 'Data check', description: 'Source health and readiness checks' },
  { id: 4, key: 'finance', label: 'Finance link', description: 'Matching invoice and near-miss diagnostics' },
  { id: 5, key: 'generate', label: 'Create draft', description: 'Open the shared report book with your ticks' },
] as const;

export const EDITOR_WORKFLOW_STEPS = [
  { id: 6, key: 'review', label: 'Review sections', description: 'Edit narrative, data, and design' },
  { id: 7, key: 'analytics', label: 'Analytics', description: 'Charts, roster, and source freshness' },
  { id: 8, key: 'preview', label: 'Preview', description: 'Live book and PDF layout' },
  { id: 9, key: 'publish', label: 'Publish', description: 'Issue immutable revision to school' },
] as const;

export type SetupWorkflowStep = (typeof SETUP_WORKFLOW_STEPS)[number]['id'];
export type EditorWorkflowStep = (typeof EDITOR_WORKFLOW_STEPS)[number]['key'];
