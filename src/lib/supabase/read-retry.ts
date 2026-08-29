import {
  isTransientSchemaProbeError,
  type SchemaProbeError,
} from "@/lib/supabase/schema-probe";

export type SupabaseReadResult<T> = {
  data: T | null;
  error: SchemaProbeError | null;
  attempts: number;
};

type RetryOptions = {
  maxAttempts?: number;
  wait?: (milliseconds: number) => Promise<void>;
  onRetry?: (error: SchemaProbeError, attempt: number) => void;
};

function caughtReadError(error: unknown): SchemaProbeError {
  return {
    message: error instanceof Error ? error.message : String(error),
  };
}

/**
 * Replay an idempotent Supabase read only when the failure is a temporary
 * gateway/transport problem. Database contract errors (missing columns,
 * invalid relationships, permissions) are returned immediately so callers
 * cannot silently turn a real product fault into an empty screen.
 */
export async function readSupabaseWithTransientRetry<T>(
  read: () => PromiseLike<{
    data: T | null;
    error: SchemaProbeError | null;
  }>,
  options: RetryOptions = {},
): Promise<SupabaseReadResult<T>> {
  const maxAttempts = Math.max(1, options.maxAttempts ?? 2);
  const wait =
    options.wait ??
    ((milliseconds: number) =>
      new Promise<void>((resolve) => setTimeout(resolve, milliseconds)));

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    let result: {
      data: T | null;
      error: SchemaProbeError | null;
    };
    try {
      result = await read();
    } catch (error) {
      result = { data: null, error: caughtReadError(error) };
    }

    if (!result.error) return { ...result, attempts: attempt };
    const transient = isTransientSchemaProbeError(result.error);
    if (!transient || attempt === maxAttempts) {
      return { ...result, attempts: attempt };
    }

    options.onRetry?.(result.error, attempt);
    await wait(150 * 2 ** (attempt - 1));
  }

  return { data: null, error: { message: "Read did not complete" }, attempts: maxAttempts };
}
