type SupabaseError = { message: string; code?: string | null };

export type SupabaseResult<T = unknown> = {
  data?: T;
  error?: SupabaseError | null;
};

/**
 * Supabase query builders resolve with `{ error }`; they normally do not throw.
 * Administrative repair loops use this guard so their existing `try/catch`
 * blocks can report a failed write instead of falsely counting it as repaired.
 */
export async function requireSupabaseResult<T>(
  operation: PromiseLike<SupabaseResult<T>>,
  context: string,
): Promise<T | undefined> {
  const result = await operation;
  if (result.error) {
    const code = result.error.code ? ` [${result.error.code}]` : '';
    throw new Error(`${context}${code}: ${result.error.message}`);
  }
  return result.data;
}

export async function requireSupabaseWrite(
  operation: PromiseLike<SupabaseResult>,
  context: string,
): Promise<void> {
  await requireSupabaseResult(operation, context);
}
