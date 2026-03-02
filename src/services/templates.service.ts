import { createClient } from '@/lib/supabase/server';
import { AppError, NotFoundError } from '@/lib/errors';

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

        return data;
    }

    /**
     * Seed standard templates if they don't exist
     */
    async seedTemplates() {
        const supabase = await createClient();
        const standardTemplates = [
            {
                name: 'Assignment Reminder',
                type: 'email',
                subject: 'Reminder: Assignment {{assignment_name}} is due soon',
                content: '<p>Hi {{user_name}},</p><p>This is a reminder that your assignment <strong>{{assignment_name}}</strong> is due on {{due_date}}.</p><p>Please ensure you submit it on time.</p>',
                variables: { user_name: 'string', assignment_name: 'string', due_date: 'string' }
            },
            {
                name: 'Grade Published',
                type: 'email',
                subject: 'New Grade Published: {{course_name}}',
                content: '<p>Hi {{user_name}},</p><p>A new grade has been published for your work in <strong>{{course_name}}</strong>.</p><p>Grade: {{grade}}</p><p>Comment: {{notes}}</p>',
                variables: { user_name: 'string', course_name: 'string', grade: 'string', notes: 'string' }
            },
            {
                name: 'New Announcement',
                type: 'email',
                subject: 'New Announcement: {{title}}',
                content: '<p>A new announcement has been posted:</p><h3>{{title}}</h3><p>{{content}}</p>',
                variables: { title: 'string', content: 'string' }
            },
            {
                name: 'Announcement SMS',
                type: 'sms',
                content: 'LMS Announcement: {{title}}. Check your portal for details.',
                variables: { title: 'string' }
            }
        ];

        for (const template of standardTemplates) {
            await supabase.from('notification_templates').upsert(template, { onConflict: 'name, type' });
        }
    }
}

export const templatesService = new TemplatesService();
