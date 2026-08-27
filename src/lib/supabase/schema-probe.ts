export type SchemaProbeError = {
  code?: string | null;
  message?: string | null;
};

const TRANSIENT_SCHEMA_PROBE_PATTERN =
  /\b50[234]\b|bad gateway|service unavailable|gateway timeout|cloudflare|fetch failed|network error|connection (?:reset|closed|terminated)|socket hang up/i;

/** Retry transport/gateway failures; a real PostgREST schema refusal is final. */
export function isTransientSchemaProbeError(
  error: SchemaProbeError | null | undefined,
): boolean {
  if (!error) return false;
  return TRANSIENT_SCHEMA_PROBE_PATTERN.test(
    `${error.code ?? ''} ${error.message ?? ''}`,
  );
}

export async function runSchemaProbeWithRetry<TError extends SchemaProbeError>(
  run: () => Promise<TError | null>,
  options: {
    maxAttempts?: number;
    wait?: (milliseconds: number) => Promise<void>;
  } = {},
): Promise<{ error: TError | null; attempts: number; transient: boolean }> {
  const maxAttempts = Math.max(1, options.maxAttempts ?? 3);
  const wait = options.wait ?? ((milliseconds: number) =>
    new Promise<void>((resolve) => setTimeout(resolve, milliseconds)));

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const error = await run();
    if (!error) return { error: null, attempts: attempt, transient: false };

    const transient = isTransientSchemaProbeError(error);
    if (!transient || attempt === maxAttempts) {
      return { error, attempts: attempt, transient };
    }
    await wait(150 * 2 ** (attempt - 1));
  }

  return { error: null, attempts: maxAttempts, transient: false };
}
