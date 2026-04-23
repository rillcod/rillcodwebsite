/**
 * Map calendar week index 1-108 (3y × 3t × 12w) to a spine week_index, rotated per class
 * so (school, class) gets a unique ordering over the same canonical topics.
 * Lane 11 only has 40 template weeks — modulo 40.
 */
export function sourceWeekIndexForCalendar(
  calendarIndex1to108: number,
  pathOffset0to107: number,
  laneIndex: number,
): number {
  const mod = laneIndex === 11 ? 40 : 108;
  return ((calendarIndex1to108 - 1 + pathOffset0to107) % mod) + 1;
}

export function calendarIndex(
  yearNumber: number,
  termNumber: number,
  weekInTerm: number,
): number {
  return (yearNumber - 1) * 36 + (termNumber - 1) * 12 + weekInTerm;
}
