export type TemplateData = Record<string, string | number | boolean | null | undefined>;

export function normalizeTemplateKey(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
}

export function extractTemplateVariables(subject: string | null | undefined, body: string): string[] {
  const names = new Set<string>();
  const combined = `${subject || ''}\n${body}`;
  for (const match of combined.matchAll(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g)) names.add(match[1]);
  return [...names].sort();
}

function stringify(value: TemplateData[string]): string {
  return value === null || value === undefined ? '' : String(value);
}

export function renderCommunicationTemplate(input: {
  subject?: string | null;
  body: string;
  requiredVariables?: string[];
  data: TemplateData;
}) {
  if (!input.body.trim()) throw new Error('Template body is required.');
  const referenced = extractTemplateVariables(input.subject, input.body);
  const required = Array.from(new Set([...(input.requiredVariables ?? []), ...referenced]));
  const missing = required.filter((name) => input.data[name] === undefined || input.data[name] === null || input.data[name] === '');
  if (missing.length) throw new Error(`Missing template variables: ${missing.join(', ')}`);
  const replace = (_match: string, name: string) => stringify(input.data[name]);
  const subject = (input.subject || '').replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, replace);
  const body = input.body.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, replace);
  if (/\{\{[^}]+\}\}/.test(`${subject}\n${body}`)) throw new Error('Template contains unresolved variables.');
  return { subject, body, variables: referenced };
}

export function buildTemplateTestData(variables: string[]): TemplateData {
  return Object.fromEntries(variables.map((name) => [name, `Example ${name.replace(/_/g, ' ')}`]));
}

export async function resolveApprovedTemplate(db: any, key: string, data: TemplateData) {
  const { data: template, error } = await db.from('communication_templates')
    .select('required_variables,current_version:communication_template_versions!communication_templates_current_version_id_fkey(subject,body,test_status)')
    .eq('template_key', key)
    .eq('status', 'approved')
    .maybeSingle();
  if (error || !template) return null;
  const version = Array.isArray(template.current_version) ? template.current_version[0] : template.current_version;
  if (!version || version.test_status !== 'passed') return null;
  return renderCommunicationTemplate({
    subject: version.subject,
    body: version.body,
    requiredVariables: Array.isArray(template.required_variables) ? template.required_variables : [],
    data,
  });
}
