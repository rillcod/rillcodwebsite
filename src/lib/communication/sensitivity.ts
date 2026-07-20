export type CommunicationSensitivity = 'standard' | 'complaint' | 'privacy' | 'safeguarding' | 'fraud';

const RULES: Array<{ sensitivity: CommunicationSensitivity; pattern: RegExp }> = [
  { sensitivity: 'safeguarding', pattern: /\b(abuse|abused|unsafe|molest|sexual|harass|threat|hurt my child|hit my child|child safety|self[- ]?harm|suicide)\b/i },
  { sensitivity: 'privacy', pattern: /\b(data breach|privacy|personal data|delete my data|leaked data|account hacked|stolen password|unauthori[sz]ed access)\b/i },
  { sensitivity: 'fraud', pattern: /\b(fraud|scam|stolen card|chargeback|fake payment|identity theft|impersonat)\b/i },
  { sensitivity: 'complaint', pattern: /\b(complain|complaint|refund|unhappy|terrible|poor service|disappointed)\b/i },
];

export function classifyCommunicationSensitivity(subject: string, body: string): CommunicationSensitivity {
  const text = `${subject}\n${body}`;
  return RULES.find((rule) => rule.pattern.test(text))?.sensitivity || 'standard';
}

export function requiresRestrictedHumanHandling(sensitivity: CommunicationSensitivity): boolean {
  return sensitivity !== 'standard';
}
