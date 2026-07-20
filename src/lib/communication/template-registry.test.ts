import { describe, expect, it } from 'vitest';
import { extractTemplateVariables, normalizeTemplateKey, renderCommunicationTemplate } from './template-registry';

describe('communication template registry', () => {
  it('normalizes stable template keys', () => {
    expect(normalizeTemplateKey(' Finance Balance Reminder ')).toBe('finance_balance_reminder');
  });

  it('extracts unique variables from subject and body', () => {
    expect(extractTemplateVariables('Case {{reference}}', 'Hello {{name}} - {{reference}}')).toEqual(['name', 'reference']);
  });

  it('renders a complete tested template', () => {
    expect(renderCommunicationTemplate({
      subject: 'Case {{reference}}',
      body: 'Hello {{name}}',
      requiredVariables: ['name', 'reference'],
      data: { name: 'Ada', reference: 'CASE-1234' },
    })).toMatchObject({ subject: 'Case CASE-1234', body: 'Hello Ada' });
  });

  it('fails a template test when required data is missing', () => {
    expect(() => renderCommunicationTemplate({
      subject: 'Case {{reference}}',
      body: 'Hello {{name}}',
      requiredVariables: ['name', 'reference'],
      data: { name: 'Ada' },
    })).toThrow('Missing template variables: reference');
  });
});
