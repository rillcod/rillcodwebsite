export const REPORT_COLORS = {
  emerald: '#059669', amber: '#d97706', rose: '#e11d48', slate: '#64748b', blue: '#2563eb', violet: '#7c3aed',
};

export function roundMetric(value: number): number {
  return Number.isFinite(value) ? Math.round(value * 10) / 10 : 0;
}

export function average(values: number[]): number {
  return values.length ? roundMetric(values.reduce((sum, value) => sum + value, 0) / values.length) : 0;
}

export function percentage(part: number, whole: number): number {
  return whole > 0 ? roundMetric((part / whole) * 100) : 0;
}

export function inCurriculumRange(
  term: number,
  week: number,
  startTerm: number,
  startWeek: number,
  endTerm: number,
  endWeek: number,
): boolean {
  const point = term * 100 + week;
  return point >= startTerm * 100 + startWeek && point <= endTerm * 100 + endWeek;
}

export function scoreBands(scores: number[], thresholds = { excellentMin: 75, developingMin: 50 }) {
  return [
    { label: `Excellent ${thresholds.excellentMin}-100%`, count: scores.filter((score) => score >= thresholds.excellentMin).length, color: REPORT_COLORS.emerald },
    { label: `Developing ${thresholds.developingMin}-${thresholds.excellentMin - 1}%`, count: scores.filter((score) => score >= thresholds.developingMin && score < thresholds.excellentMin).length, color: REPORT_COLORS.amber },
    { label: `Needs support below ${thresholds.developingMin}%`, count: scores.filter((score) => score < thresholds.developingMin).length, color: REPORT_COLORS.rose },
  ];
}

export function attendanceBands(rates: number[], thresholds = { strongMin: 80, riskBelow: 60 }) {
  return [
    { label: `Strong ${thresholds.strongMin}-100%`, count: rates.filter((rate) => rate >= thresholds.strongMin).length, color: REPORT_COLORS.blue },
    { label: `Watch ${thresholds.riskBelow}-${thresholds.strongMin - 1}%`, count: rates.filter((rate) => rate >= thresholds.riskBelow && rate < thresholds.strongMin).length, color: REPORT_COLORS.violet },
    { label: `Needs action below ${thresholds.riskBelow}%`, count: rates.filter((rate) => rate < thresholds.riskBelow).length, color: REPORT_COLORS.rose },
  ];
}
