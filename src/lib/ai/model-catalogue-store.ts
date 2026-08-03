import { createClient } from "@supabase/supabase-js";

/**
 * Last-known-good free model list, kept in app_settings.
 *
 * The in-code fallback exists for one moment: OpenRouter's catalogue is
 * unreachable and nothing is cached. A constant is the worst possible thing to
 * use there, because it is exactly the list that rots — all nine free ids in
 * this repo had been retired before anyone noticed.
 *
 * So the drift job writes the live list here each day, and the fallback reads
 * it. The safety net then repairs itself and the constant is only ever reached
 * on a first run against an empty database.
 */
const SETTING_KEY = "ai_free_models";

function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

export type StoredFreeModels = { ids: string[]; updatedAt: string | null };

/** Never throws: a fallback that can fail is not a fallback. */
export async function readStoredFreeModels(): Promise<StoredFreeModels | null> {
  try {
    const db = adminClient();
    if (!db) return null;
    const { data } = await db
      .from("app_settings")
      .select("value")
      .eq("key", SETTING_KEY)
      .maybeSingle();
    if (!data?.value) return null;

    const parsed = JSON.parse(String(data.value));
    const ids: unknown = parsed?.ids;
    if (!Array.isArray(ids) || !ids.length) return null;

    return {
      ids: ids.filter((id): id is string => typeof id === "string"),
      updatedAt: typeof parsed?.updatedAt === "string" ? parsed.updatedAt : null,
    };
  } catch {
    return null;
  }
}

/** Never throws: failing to record the list must not fail the job that found it. */
export async function writeStoredFreeModels(ids: string[]): Promise<boolean> {
  if (!ids.length) return false;
  try {
    const db = adminClient();
    if (!db) return false;
    const { error } = await db.from("app_settings").upsert(
      {
        key: SETTING_KEY,
        value: JSON.stringify({ ids, updatedAt: new Date().toISOString() }),
      },
      { onConflict: "key" }
    );
    return !error;
  } catch {
    return false;
  }
}
