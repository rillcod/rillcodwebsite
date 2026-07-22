/** Browser helper — always hits DELETE /api/portal-users/[id] (full auth + DB cascade on server). */

export type ClientWipeResult =
  | { ok: true }
  | { ok: false; cancelled?: boolean; error?: string };

const WIPE_PROMPT = (name: string) =>
  `Permanently wipe ${name} from the entire system?\n\n`
  + 'This removes:\n'
  + '• Supabase auth login\n'
  + '• Portal account & student registry\n'
  + '• ID cards, progress reports, submissions\n'
  + '• Class / parent links and owned records\n\n'
  + 'This cannot be undone.';

export async function permanentWipePortalUserClient(
  userId: string,
  displayName: string,
  confirmDestroy = false,
): Promise<ClientWipeResult> {
  if (!userId || userId.startsWith('manual-') || userId.startsWith('students-')) {
    return { ok: false, error: 'Only portal-linked students can be permanently wiped.' };
  }
  if (!confirmDestroy && !confirm(WIPE_PROMPT(displayName))) {
    return { ok: false, cancelled: true };
  }

  const res = await fetch(`/api/portal-users/${userId}`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ confirmDestroy }),
  });

  if (res.status === 409) {
    const j = await res.json().catch(() => ({}));
    if (confirm(`⚠ ${j.error ?? 'This account has paid cards or published reports.'}\n\nForce-wipe ${displayName} anyway? Everything will be destroyed permanently.`)) {
      return permanentWipePortalUserClient(userId, displayName, true);
    }
    return { ok: false, cancelled: true };
  }

  const j = await res.json().catch(() => ({}));
  if (!res.ok) return { ok: false, error: j.error || 'Wipe failed' };
  return { ok: true };
}

export async function bulkPermanentWipeStudentsClient(
  ids: string[],
  confirmDestroy = false,
): Promise<{ deleted: string[]; blocked: Array<{ id: string; reason?: string }>; needsConfirmation: Array<{ id: string; name: string }> }> {
  const res = await fetch('/api/portal-users/bulk-delete', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ids, confirmDestroy }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || 'Bulk wipe failed');
  return {
    deleted: json.deleted ?? [],
    blocked: json.blocked ?? [],
    needsConfirmation: json.needsConfirmation ?? [],
  };
}
