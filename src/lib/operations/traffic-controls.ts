import type { SupabaseClient } from '@supabase/supabase-js';
import { createAdminClient } from '@/lib/supabase/admin';

export const TRAFFIC_CONTROL_SETTING_KEY = 'lms.ops.integrity';

export type TrafficControls = {
  api_mutation_rate_limit_enabled: boolean;
  api_mutation_requests_per_window: number;
  api_mutation_window_seconds: number;
  api_origin_guard_mode: 'off' | 'observe' | 'enforce';
  api_additional_allowed_origins: string;
};

export const DEFAULT_TRAFFIC_CONTROLS: TrafficControls = {
  // This protects bursts of writes. Reads are deliberately not limited here:
  // dashboards poll and a whole school may share one public IP address.
  api_mutation_rate_limit_enabled: true,
  api_mutation_requests_per_window: 180,
  api_mutation_window_seconds: 60,
  // Observe first while the product is still being built. An administrator can
  // enforce after real browser/native traffic has been checked.
  api_origin_guard_mode: 'observe',
  api_additional_allowed_origins: '',
};

function boundedInteger(value: unknown, fallback: number, min: number, max: number): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? Math.min(max, Math.max(min, Math.round(parsed))) : fallback;
}

export function parseTrafficControls(value: unknown): TrafficControls {
  const source = value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
  return {
    api_mutation_rate_limit_enabled:
      typeof source.api_mutation_rate_limit_enabled === 'boolean'
        ? source.api_mutation_rate_limit_enabled
        : DEFAULT_TRAFFIC_CONTROLS.api_mutation_rate_limit_enabled,
    // Generous bounds keep this an abuse brake rather than a workflow lock.
    api_mutation_requests_per_window: boundedInteger(
      source.api_mutation_requests_per_window,
      DEFAULT_TRAFFIC_CONTROLS.api_mutation_requests_per_window,
      30,
      5_000,
    ),
    api_mutation_window_seconds: boundedInteger(
      source.api_mutation_window_seconds,
      DEFAULT_TRAFFIC_CONTROLS.api_mutation_window_seconds,
      10,
      3_600,
    ),
    api_origin_guard_mode: ['off', 'observe', 'enforce'].includes(String(source.api_origin_guard_mode))
      ? source.api_origin_guard_mode as TrafficControls['api_origin_guard_mode']
      : DEFAULT_TRAFFIC_CONTROLS.api_origin_guard_mode,
    api_additional_allowed_origins: String(source.api_additional_allowed_origins ?? '')
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean)
      .slice(0, 20)
      .join(','),
  };
}

export function validateTrafficControls(value: unknown): string | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const source = value as Record<string, unknown>;
  if (
    source.api_mutation_rate_limit_enabled != null
    && typeof source.api_mutation_rate_limit_enabled !== 'boolean'
  ) return 'API write protection must be on or off.';

  const max = Number(source.api_mutation_requests_per_window);
  if (source.api_mutation_requests_per_window != null && (!Number.isInteger(max) || max < 30 || max > 5_000)) {
    return 'API writes per window must be a whole number from 30 to 5,000.';
  }
  const window = Number(source.api_mutation_window_seconds);
  if (source.api_mutation_window_seconds != null && (!Number.isInteger(window) || window < 10 || window > 3_600)) {
    return 'API write window must be a whole number from 10 to 3,600 seconds.';
  }
  if (
    source.api_origin_guard_mode != null
    && !['off', 'observe', 'enforce'].includes(String(source.api_origin_guard_mode))
  ) return 'Request-origin protection mode must be off, observe, or enforce.';
  if (String(source.api_additional_allowed_origins ?? '').length > 2_000) {
    return 'Additional allowed origins must be 2,000 characters or fewer.';
  }
  return null;
}

type AnySupabase = SupabaseClient<any>;
let cached: { value: TrafficControls; expiresAt: number } | null = null;

/**
 * Load the administrator-owned policy with a short process cache. A missing row,
 * migration lag, or temporary database error keeps the generous default; it must
 * never silently lock staff out of normal editing.
 */
export async function loadTrafficControls(db?: AnySupabase): Promise<TrafficControls> {
  if (cached && cached.expiresAt > Date.now()) return cached.value;
  try {
    const client = db ?? (createAdminClient() as AnySupabase);
    const { data, error } = await client
      .from('app_settings')
      .select('value')
      .eq('key', TRAFFIC_CONTROL_SETTING_KEY)
      .maybeSingle();
    if (error) throw error;
    let raw: unknown = {};
    try {
      raw = JSON.parse(String(data?.value || '{}'));
    } catch {
      raw = {};
    }
    const value = parseTrafficControls(raw);
    cached = { value, expiresAt: Date.now() + 60_000 };
    return value;
  } catch (error) {
    console.warn('[traffic-controls] using safe defaults because settings could not be read.', error);
    cached = { value: DEFAULT_TRAFFIC_CONTROLS, expiresAt: Date.now() + 15_000 };
    return DEFAULT_TRAFFIC_CONTROLS;
  }
}

export function clearTrafficControlsCache(): void {
  cached = null;
}

export function isSafeApiMethod(method: string): boolean {
  return ['GET', 'HEAD', 'OPTIONS'].includes(method.toUpperCase());
}

export function mutationRouteFamily(pathname: string): string {
  const segments = pathname.split('/').filter(Boolean);
  return segments[0] === 'api' && segments[1] ? segments[1].toLowerCase() : 'api';
}

type OriginRequest = {
  method: string;
  url: string;
  headers: { get(name: string): string | null };
};

export type OriginDecision = {
  accepted: boolean;
  reason: 'safe_method' | 'same_origin' | 'allowed_native' | 'allowed_configured' | 'non_browser' | 'cross_site';
  origin: string | null;
};

function normalizedOrigin(value: string): string | null {
  const trimmed = value.trim().toLowerCase().replace(/\/$/, '');
  if (trimmed === 'capacitor://localhost' || trimmed === 'ionic://localhost') return trimmed;
  try {
    return new URL(value).origin.toLowerCase();
  } catch {
    return null;
  }
}

/** Pure decision used by the common API boundary and its contract tests. */
export function evaluateMutationOrigin(req: OriginRequest, controls: TrafficControls): OriginDecision {
  if (isSafeApiMethod(req.method)) return { accepted: true, reason: 'safe_method', origin: null };
  const rawOrigin = req.headers.get('origin');
  const origin = rawOrigin ? normalizedOrigin(rawOrigin) : null;
  const fetchSite = String(req.headers.get('sec-fetch-site') || '').toLowerCase();

  // Server-to-server, native and older clients may omit browser provenance.
  // A browser explicitly declaring cross-site is not treated as missing data.
  if (!rawOrigin && fetchSite !== 'cross-site') {
    return { accepted: true, reason: 'non_browser', origin: null };
  }
  if (!origin) return { accepted: false, reason: 'cross_site', origin: rawOrigin };

  const requestOrigin = normalizedOrigin(req.url);
  if (requestOrigin && origin === requestOrigin) {
    return { accepted: true, reason: 'same_origin', origin };
  }
  if (['capacitor://localhost', 'ionic://localhost'].includes(origin)) {
    return { accepted: true, reason: 'allowed_native', origin };
  }
  const configured = controls.api_additional_allowed_origins
    .split(',')
    .map(normalizedOrigin)
    .filter((item): item is string => Boolean(item));
  if (configured.includes(origin)) {
    return { accepted: true, reason: 'allowed_configured', origin };
  }
  return { accepted: false, reason: 'cross_site', origin };
}
