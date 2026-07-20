import { describe, expect, it } from 'vitest';
import { attendanceBands, average, inCurriculumRange, percentage, scoreBands } from './calculations';

describe('school report calculations', () => {
  it('handles empty and normal aggregates safely', () => {
    expect(average([])).toBe(0);
    expect(average([60, 80, 90])).toBe(76.7);
    expect(percentage(3, 4)).toBe(75);
    expect(percentage(0, 0)).toBe(0);
  });

  it('includes only the manually selected curriculum range', () => {
    expect(inCurriculumRange(1, 3, 1, 2, 2, 4)).toBe(true);
    expect(inCurriculumRange(2, 4, 1, 2, 2, 4)).toBe(true);
    expect(inCurriculumRange(2, 5, 1, 2, 2, 4)).toBe(false);
  });

  it('creates honest score and attendance bands', () => {
    expect(scoreBands([90, 74, 40]).map((band) => band.count)).toEqual([1, 1, 1]);
    expect(attendanceBands([95, 70, 50]).map((band) => band.count)).toEqual([1, 1, 1]);
  });
});
