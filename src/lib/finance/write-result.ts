/**
 * Structured write results for finance APIs.
 */
export type FinanceErrorCode =
  | 'unauthorized'
  | 'forbidden'
  | 'validation'
  | 'not_found'
  | 'conflict'
  | 'over_allocation'
  | 'invalid_transition'
  | 'db_error'
  | 'internal';

export type FinanceWriteSuccess<T> = {
  ok: true;
  data: T;
  effects?: string[];
};

export type FinanceWriteFailure = {
  ok: false;
  error: {
    code: FinanceErrorCode;
    message: string;
    details?: unknown;
  };
  partial?: unknown;
};

export type FinanceWriteResult<T> = FinanceWriteSuccess<T> | FinanceWriteFailure;

export function financeOk<T>(data: T, effects?: string[]): FinanceWriteSuccess<T> {
  return effects?.length ? { ok: true, data, effects } : { ok: true, data };
}

export function financeFail(
  code: FinanceErrorCode,
  message: string,
  details?: unknown,
  partial?: unknown,
): FinanceWriteFailure {
  return {
    ok: false,
    error: { code, message, ...(details !== undefined ? { details } : {}) },
    ...(partial !== undefined ? { partial } : {}),
  };
}

export function financeHttpStatus(code: FinanceErrorCode): number {
  switch (code) {
    case 'unauthorized': return 401;
    case 'forbidden': return 403;
    case 'validation': return 400;
    case 'not_found': return 404;
    case 'conflict':
    case 'over_allocation':
    case 'invalid_transition':
      return 409;
    case 'db_error':
    case 'internal':
    default:
      return 500;
  }
}

/** Convert a write result into a NextResponse-shaped payload + status. */
export function financeResultToResponse<T>(result: FinanceWriteResult<T>): {
  body: Record<string, unknown>;
  status: number;
} {
  if (result.ok) {
    return {
      body: { success: true, data: result.data, ...(result.effects ? { effects: result.effects } : {}) },
      status: 200,
    };
  }
  return {
    body: {
      success: false,
      error: result.error.message,
      code: result.error.code,
      ...(result.error.details !== undefined ? { details: result.error.details } : {}),
      ...(result.partial !== undefined ? { partial: result.partial } : {}),
    },
    status: financeHttpStatus(result.error.code),
  };
}

/** Require a Supabase error to be handled — never silently ignore. */
export function assertDbOk(
  error: { message?: string; code?: string } | null | undefined,
  context: string,
): void {
  if (error) {
    throw new Error(`${context}: ${error.message || error.code || 'unknown database error'}`);
  }
}
