import { createHmac, timingSafeEqual } from 'node:crypto';
import type { UserRole } from '@/types/auth.types';

export const DASHBOARD_GATE_COOKIE = 'rillcod-dashboard-gate';
export const DASHBOARD_GATE_TTL_SECONDS = 60;

export type DashboardGateSnapshot = {
  userId: string;
  role: UserRole;
  active: boolean;
  expiresAt: number;
};

const ROLES = new Set<UserRole>(['admin', 'teacher', 'student', 'school', 'parent']);

export function isDashboardGateRole(value: unknown): value is UserRole {
  return typeof value === 'string' && ROLES.has(value as UserRole);
}

function signingSecret(): string | null {
  return process.env.DASHBOARD_GATE_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || null;
}

function signature(payload: string, secret: string): Buffer {
  return createHmac('sha256', secret).update(payload).digest();
}

/**
 * Creates a compact, server-signed routing hint. This is only an optimistic
 * dashboard gate; Route Handlers and RLS remain the authorization authority.
 */
export function createDashboardGateToken(
  snapshot: Omit<DashboardGateSnapshot, 'expiresAt'>,
  nowMs = Date.now(),
  secret = signingSecret(),
): string | null {
  if (!secret) return null;
  const payload = Buffer.from(JSON.stringify({
    v: 1,
    u: snapshot.userId,
    r: snapshot.role,
    a: snapshot.active,
    e: Math.floor(nowMs / 1000) + DASHBOARD_GATE_TTL_SECONDS,
  })).toString('base64url');
  return `${payload}.${signature(payload, secret).toString('base64url')}`;
}

export function verifyDashboardGateToken(
  token: string | undefined,
  expectedUserId: string,
  nowMs = Date.now(),
  secret = signingSecret(),
): DashboardGateSnapshot | null {
  if (!token || !secret) return null;
  const [payload, suppliedSignature, extra] = token.split('.');
  if (!payload || !suppliedSignature || extra) return null;

  const supplied = Buffer.from(suppliedSignature, 'base64url');
  const expected = signature(payload, secret);
  if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) return null;

  try {
    const parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as {
      v?: unknown;
      u?: unknown;
      r?: unknown;
      a?: unknown;
      e?: unknown;
    };
    if (
      parsed.v !== 1 ||
      parsed.u !== expectedUserId ||
      !isDashboardGateRole(parsed.r) ||
      typeof parsed.a !== 'boolean' ||
      typeof parsed.e !== 'number' ||
      !Number.isSafeInteger(parsed.e) ||
      parsed.e <= Math.floor(nowMs / 1000)
    ) return null;

    return {
      userId: parsed.u,
      role: parsed.r,
      active: parsed.a,
      expiresAt: parsed.e,
    };
  } catch {
    return null;
  }
}
