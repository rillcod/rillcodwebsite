export type PaymentAccountOwnerType = 'rillcod' | 'school';
export type PaymentAccountType = 'savings' | 'current';

export type PaymentAccountInputResult =
  | { ok: true; value: Record<string, unknown> }
  | { ok: false; error: string };

const TEXT_LIMITS: Record<string, number> = {
  label: 80,
  bank_name: 120,
  account_name: 160,
  payment_note: 500,
};

/** Canonical create/update normalizer for payment receiving accounts. */
export function parsePaymentAccountInput(
  input: unknown,
  options: { partial?: boolean } = {},
): PaymentAccountInputResult {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return { ok: false, error: 'Payment account details must be an object' };
  }
  const body = input as Record<string, unknown>;
  const partial = options.partial === true;
  const value: Record<string, unknown> = {};

  for (const [field, max] of Object.entries(TEXT_LIMITS)) {
    if (body[field] === undefined) continue;
    if (body[field] === null && field === 'payment_note') {
      value[field] = null;
      continue;
    }
    const normalized = String(body[field]).trim();
    if (!normalized && field !== 'payment_note') {
      return { ok: false, error: `${field.replaceAll('_', ' ')} is required` };
    }
    if (normalized.length > max) {
      return { ok: false, error: `${field.replaceAll('_', ' ')} is too long` };
    }
    value[field] = normalized || null;
  }

  if (body.account_number !== undefined) {
    const accountNumber = String(body.account_number).replace(/[\s-]/g, '');
    if (!/^\d{6,20}$/.test(accountNumber)) {
      return { ok: false, error: 'Account number must contain 6 to 20 digits' };
    }
    value.account_number = accountNumber;
  }

  if (body.account_type !== undefined) {
    const accountType = String(body.account_type).toLowerCase();
    if (!['savings', 'current'].includes(accountType)) {
      return { ok: false, error: 'Account type must be savings or current' };
    }
    value.account_type = accountType as PaymentAccountType;
  }

  if (body.is_active !== undefined) {
    if (typeof body.is_active !== 'boolean') {
      return { ok: false, error: 'is_active must be true or false' };
    }
    value.is_active = body.is_active;
  }

  if (!partial) {
    for (const required of ['label', 'bank_name', 'account_number', 'account_name']) {
      if (!value[required]) return { ok: false, error: `${required.replaceAll('_', ' ')} is required` };
    }
    value.account_type ??= 'savings';
    value.is_active ??= true;
  }

  return { ok: true, value };
}
