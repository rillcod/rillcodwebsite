import type { Json } from '@/types/supabase';

/**
 * Boundary helper for writing into Supabase `jsonb` columns.
 * Prefer this over scattering `as Json` / `Record<string, unknown>` at call sites.
 */
export function toJson(value: unknown): Json {
  return value as Json;
}

/** Merge known CRM contact metadata fields into a Json-safe object. */
export function mergeContactMetadata(
  existing: unknown,
  patch: { tags?: unknown; notes?: unknown },
): Json {
  const base =
    existing && typeof existing === 'object' && !Array.isArray(existing)
      ? { ...(existing as Record<string, Json | undefined>) }
      : {};

  if (patch.tags !== undefined) {
    base.tags = (
      Array.isArray(patch.tags)
        ? patch.tags
        : String(patch.tags)
            .split(',')
            .map((t) => t.trim())
            .filter(Boolean)
    ) as Json;
  }
  if (patch.notes !== undefined) {
    base.notes = patch.notes as Json;
  }

  return toJson(base);
}
