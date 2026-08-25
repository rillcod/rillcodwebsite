import { createClient } from '@/lib/supabase/server';
import { AppError, NotFoundError } from '@/lib/errors';
import { normalizeTemplateKey } from '@/lib/communication/template-registry';

export interface TemplateVariables {
    [key: string]: string | number;
}

export class TemplatesService {
    /**
     * Renders a template by replacing {{variable}} with actual values
     */
    render(content: string, variables: TemplateVariables): string {
        return content.replace(/\{\{\s*(\w+)\s*\}\}/g, (match, key) => {
            return variables[key] !== undefined ? String(variables[key]) : match;
        });
    }

    async getTemplate(name: string, type: 'email' | 'sms') {
        const supabase = await createClient();
        const { data: governed, error: governedError } = await (supabase as any)
            .from('communication_templates')
            .select('name,channel,required_variables,current_version:communication_template_versions!communication_templates_current_version_id_fkey(subject,body,test_status)')
            .eq('template_key', normalizeTemplateKey(name))
            .eq('channel', type)
            .eq('status', 'approved')
            .maybeSingle();

        const current = Array.isArray(governed?.current_version)
            ? governed.current_version[0]
            : governed?.current_version;
        if (!governedError && current?.test_status === 'passed') {
            return {
                name: governed.name,
                type,
                subject: current.subject,
                content: current.body,
                variables: Object.fromEntries(
                    ((governed.required_variables ?? []) as string[]).map((key) => [key, 'string'])
                ),
                source: 'communication_templates' as const,
            };
        }

        // Rollout compatibility only: migration 114 copies active legacy rows.
        // This fallback prevents a deployment race if code reaches production
        // before the database migration has been applied.
        const { data, error } = await supabase
            .from('notification_templates')
            .select('*')
            .eq('name', name)
            .eq('type', type)
            .eq('is_active', true)
            .single();

        if (error || !data) {
            throw new NotFoundError(`Template "${name}" of type ${type} not found`);
        }

        return { ...data, source: 'notification_templates' as const };
    }
}

export const templatesService = new TemplatesService();
