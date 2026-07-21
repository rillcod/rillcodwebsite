import {
  labelFromTermNumber,
  periodFromStartYear,
  periodStartYear,
  termNumberFromLabel,
  type PositionalTermLabel,
} from '@/lib/reports/academic-period';

/** Canonical academic-period identity shared by school reports, finance, and billing. */
export type AcademicPeriodKey = {
  /** Authoritative relational key — prefer this over label matching. */
  academicTermId: string;
  /** Display label e.g. "2026/2027". */
  periodLabel: string;
  /** Session start calendar year e.g. "2026" — used in finance URL params. */
  startYear: string;
  termNumber: 1 | 2 | 3;
  termLabel: PositionalTermLabel;
};

export function academicPeriodFromTermRow(input: {
  academicTermId: string;
  termNumber: number;
  academicYear?: string | null;
  termLabel?: string | null;
}): AcademicPeriodKey {
  const periodLabel =
    periodFromStartYear(input.academicYear) ||
    periodFromStartYear(String(input.termNumber)) ||
    '';
  const rawNum = Number(input.termNumber);
  const termNumber = (
    rawNum >= 1 && rawNum <= 3 ? rawNum : parseInt(termNumberFromLabel(input.termLabel), 10)
  ) as 1 | 2 | 3;
  const safeNum = termNumber >= 1 && termNumber <= 3 ? termNumber : 1;
  return {
    academicTermId: input.academicTermId,
    periodLabel: periodLabel || periodFromStartYear(input.academicYear) || '',
    startYear: periodStartYear(periodLabel || input.academicYear) || String(input.academicYear || ''),
    termNumber: safeNum,
    termLabel: (input.termLabel && /term/i.test(input.termLabel)
      ? input.termLabel
      : labelFromTermNumber(safeNum)) as PositionalTermLabel,
  };
}

export function academicPeriodFromReportFields(input: {
  academicTermId?: string | null;
  academicYear: string;
  termLabel: string;
  academicTermNumber: number;
}): AcademicPeriodKey {
  return academicPeriodFromTermRow({
    academicTermId: input.academicTermId || '',
    termNumber: input.academicTermNumber,
    academicYear: input.academicYear,
    termLabel: input.termLabel,
  });
}

/** Finance deep-link params derived from the canonical period key. */
export function financeParamsFromAcademicPeriod(period: AcademicPeriodKey): {
  academicYear: string;
  termNumber: string;
  periodLabel: string;
} {
  const periodLabel = period.periodLabel || periodFromStartYear(period.startYear);
  return {
    academicYear: period.startYear || periodStartYear(periodLabel),
    termNumber: String(period.termNumber),
    periodLabel,
  };
}
