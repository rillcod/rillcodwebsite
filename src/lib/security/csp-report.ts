export type CspObservation = {
  document_path: string | null;
  blocked_origin: string | null;
  violated_directive: string | null;
  effective_directive: string | null;
  disposition: string | null;
  source_path: string | null;
  line_number: number | null;
  column_number: number | null;
  status_code: number | null;
};

function safePath(value: unknown): string | null {
  if (typeof value !== 'string' || !value.trim()) return null;
  const raw = value.trim().slice(0, 2_000);
  if (raw === 'inline' || raw === 'eval' || raw === 'data' || raw === 'blob') return raw;
  try {
    const url = new URL(raw);
    // Never persist query strings, fragments, credentials, or full customer URLs.
    return `${url.origin}${url.pathname}`.slice(0, 1_000);
  } catch {
    return raw.split(/[?#]/, 1)[0]?.slice(0, 1_000) || null;
  }
}

function safeText(value: unknown, max = 200): string | null {
  return typeof value === 'string' && value.trim() ? value.trim().slice(0, max) : null;
}

function safeNumber(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.round(parsed) : null;
}

/** Accept legacy CSP reports and the newer Reporting API envelope. */
export function parseCspObservation(payload: unknown): CspObservation | null {
  const root = payload && typeof payload === 'object' && !Array.isArray(payload)
    ? payload as Record<string, unknown>
    : null;
  if (!root) return null;
  const report = (
    root['csp-report'] && typeof root['csp-report'] === 'object'
      ? root['csp-report']
      : root.body && typeof root.body === 'object'
        ? root.body
        : root
  ) as Record<string, unknown>;
  const violated = safeText(report['violated-directive'] ?? report.violatedDirective);
  const effective = safeText(report['effective-directive'] ?? report.effectiveDirective);
  const blocked = safePath(report['blocked-uri'] ?? report.blockedURL);
  if (!violated && !effective && !blocked) return null;
  return {
    document_path: safePath(report['document-uri'] ?? report.documentURL),
    blocked_origin: blocked,
    violated_directive: violated,
    effective_directive: effective,
    disposition: safeText(report.disposition, 40),
    source_path: safePath(report['source-file'] ?? report.sourceFile),
    line_number: safeNumber(report['line-number'] ?? report.lineNumber),
    column_number: safeNumber(report['column-number'] ?? report.columnNumber),
    status_code: safeNumber(report['status-code'] ?? report.statusCode),
  };
}
