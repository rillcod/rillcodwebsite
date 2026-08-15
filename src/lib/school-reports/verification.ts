import { createHash } from 'node:crypto';

/**
 * Two codes, two jobs.
 *
 * `schoolReportVerificationCode` is the key: twenty hex characters that the
 * public verify endpoint matches on, unguessable and unique. It is what proves a
 * printed report is genuine.
 *
 * `formatHumanReportReference` is the reference: short enough to read down a
 * telephone, file in a bursary, or quote in an email. It is not a key and must
 * never be used as one — the four hex characters at the end are there to
 * separate two reports for the same school in the same term, not to resist
 * anybody. Verification always goes through the long code.
 */

export function schoolReportVerificationCode(reportId: string): string {
  return `SR-${createHash('sha256').update(`school-report:${reportId}`).digest('hex').slice(0, 20).toUpperCase()}`;
}

export function schoolReportVerificationUrl(reportId: string): string {
  return `https://www.rillcod.com/verify/school-report/${schoolReportVerificationCode(reportId)}`;
}

/**
 * Pull the term number out of whatever the term is called.
 *
 * Labels arrive as "First Term", "Term 2", "3rd Term" and similar, because they
 * are typed by people. Anything unrecognisable falls back to 1 rather than
 * printing "TNaN" on a document.
 */
export function termNumberFromLabel(label: string | null | undefined): number {
  const text = String(label ?? '').toLowerCase();
  // Not `\b([1-3])\b`: there is no word boundary between the digit and the
  // letters in "3rd", because both are word characters — so an ordinal never
  // matched and "3rd Term" came back as term one. Bounded by "not another
  // digit" instead, which also keeps a year like 2026 from being read as a term.
  const digit = /(?<!\d)([1-3])(?!\d)/.exec(text);
  if (digit) return Number(digit[1]);
  if (/\bfirst\b/.test(text)) return 1;
  if (/\bsecond\b/.test(text)) return 2;
  if (/\bthird\b/.test(text)) return 3;
  return 1;
}

/**
 * Human-readable telephone and filing reference, e.g. RC-REP-2026-T1-8F32.
 *
 * The year and term default only so an old caller cannot crash; every caller
 * that has a report should pass the report's own, or the reference says
 * something untrue about which term it covers.
 */
export function formatHumanReportReference(reportId: string, year = '2026', termNum = 1): string {
  const hash = createHash('sha256').update(`school-report:${reportId}`).digest('hex').slice(0, 4).toUpperCase();
  // "2026/2027" is the shape an academic year arrives in; the opening year names it.
  const cleanYear = String(year ?? '').replace(/[^0-9]/g, '').slice(0, 4) || '2026';
  const cleanTerm = Number.isFinite(termNum) && termNum >= 1 && termNum <= 3 ? termNum : 1;
  return `RC-REP-${cleanYear}-T${cleanTerm}-${hash}`;
}
