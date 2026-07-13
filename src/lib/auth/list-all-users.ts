/**
 * Supabase Auth Admin listUsers is paginated (max 1000/page).
 * Callers that only fetch page 1 false-flag real users as "missing from auth".
 */

export type ListedAuthUser = {
  id: string;
  email?: string | null;
  user_metadata?: Record<string, unknown> | null;
};

type AuthAdmin = {
  auth: {
    admin: {
      listUsers: (params?: { page?: number; perPage?: number }) => Promise<{
        data: { users: ListedAuthUser[] };
        error: { message: string } | null;
      }>;
    };
  };
};

export async function listAllAuthUsers<T extends ListedAuthUser = ListedAuthUser>(
  admin: AuthAdmin,
  opts?: { perPage?: number; maxPages?: number },
): Promise<T[]> {
  const perPage = opts?.perPage ?? 1000;
  const maxPages = opts?.maxPages ?? 50;
  const all: T[] = [];

  for (let page = 1; page <= maxPages; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
    if (error) throw new Error(error.message);
    const users = (data?.users ?? []) as T[];
    all.push(...users);
    if (users.length < perPage) break;
  }

  return all;
}

export async function findAuthUserIdByEmail(
  admin: AuthAdmin,
  email: string,
  opts?: { perPage?: number; maxPages?: number },
): Promise<string | null> {
  const target = email.trim().toLowerCase();
  if (!target) return null;
  const perPage = opts?.perPage ?? 1000;
  const maxPages = opts?.maxPages ?? 50;

  for (let page = 1; page <= maxPages; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
    if (error) throw new Error(error.message);
    const users = data?.users ?? [];
    const hit = users.find((u) => (u.email ?? '').trim().toLowerCase() === target);
    if (hit) return hit.id;
    if (users.length < perPage) break;
  }
  return null;
}
