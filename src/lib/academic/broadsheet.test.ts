import { describe, expect, it } from 'vitest';
import {
  buildBroadsheet,
  sortByName,
  sortByPosition,
  outstandingRows,
  type BroadsheetSource,
} from './broadsheet';

/**
 * Position is the part of a school report people argue about, so the ranking rules
 * are pinned here rather than left to whatever the grid happens to render.
 */

/** Metrics in the shape host-marks stores them on the progress report. */
const marks = (first: number | null, second: number | null, exam: number | null) => ({
  score_authority: 'host_school',
  ...(first === null ? {} : { first_test_earned: first, first_test_max: 20 }),
  ...(second === null ? {} : { second_test_earned: second, second_test_max: 20 }),
  ...(exam === null ? {} : { examination_earned: exam, examination_max: 60 }),
});

const source = (id: string, name: string, m: unknown): BroadsheetSource => ({
  studentId: id, studentName: name, metrics: m,
});

describe('class broadsheet', () => {
  const full = [
    source('s1', 'Ada Obi', marks(18, 17, 52)),      // 87
    source('s2', 'Chidi Eze', marks(14, 15, 44)),    // 73
    source('s3', 'Ngozi Ali', marks(16, 18, 49)),    // 83
    source('s4', 'Tolu Ade', marks(15, 13, 47)),     // 75
  ];

  it('totals each learner across the three papers', () => {
    const { rows } = buildBroadsheet(full);
    expect(rows.find((r) => r.studentId === 's1')!.total!.earned).toBe(87);
    expect(rows.find((r) => r.studentId === 's1')!.total!.max).toBe(100);
    expect(rows.find((r) => r.studentId === 's2')!.total!.percent).toBe(73);
  });

  it('ranks best first', () => {
    const { rows } = buildBroadsheet(full);
    const byId = Object.fromEntries(rows.map((r) => [r.studentId, r.position]));
    expect(byId).toEqual({ s1: 1, s3: 2, s4: 3, s2: 4 });
  });

  it('gives equal totals the same position and skips the next', () => {
    const { rows } = buildBroadsheet([
      source('a', 'A', marks(18, 17, 52)), // 87
      source('b', 'B', marks(17, 18, 52)), // 87
      source('c', 'C', marks(14, 15, 44)), // 73
    ]);
    const byId = Object.fromEntries(rows.map((r) => [r.studentId, r.position]));
    expect(byId.a).toBe(1);
    expect(byId.b).toBe(1);
    // Two learners hold first, so the next is third — not second.
    expect(byId.c).toBe(3);
  });

  /**
   * A part-total read as a final mark is how a learner who simply has not been
   * marked yet ends up looking like a failure, and ranked last for it.
   */
  it('does not total, grade or rank a learner whose papers are incomplete', () => {
    const { rows } = buildBroadsheet([
      source('s1', 'Ada Obi', marks(18, 17, 52)),
      source('s2', 'Musa Bello', marks(18, 17, null)),
      source('s3', 'Nobody Marked', marks(null, null, null)),
    ]);
    const musa = rows.find((r) => r.studentId === 's2')!;
    expect(musa.total).toBeNull();
    expect(musa.grade).toBeNull();
    expect(musa.position).toBeNull();
    expect(musa.complete).toBe(false);
    expect(musa.missing).toEqual(['examination']);

    const none = rows.find((r) => r.studentId === 's3')!;
    expect(none.missing).toEqual(['first_test', 'second_test', 'examination']);
  });

  it('grades from the shared WAEC authority, not a second scale', () => {
    const { rows } = buildBroadsheet([source('s1', 'Ada Obi', marks(18, 17, 52))]);
    expect(rows[0].grade).toMatch(/^[A-F][1-9]$/);
  });

  it('summarises only the learners actually marked', () => {
    const summary = buildBroadsheet([
      source('s1', 'Ada', marks(18, 17, 52)),   // 87
      source('s2', 'Chidi', marks(14, 15, 44)), // 73
      source('s3', 'Unmarked', marks(null, null, null)),
    ]);
    expect(summary.studentCount).toBe(3);
    expect(summary.completeCount).toBe(2);
    expect(summary.averagePercent).toBe(80);
    expect(summary.highestPercent).toBe(87);
    expect(summary.lowestPercent).toBe(73);
  });

  it('reports no average rather than zero when nothing is marked', () => {
    const summary = buildBroadsheet([source('s1', 'Ada', marks(null, null, null))]);
    expect(summary.averagePercent).toBeNull();
    expect(summary.highestPercent).toBeNull();
    expect(summary.completeCount).toBe(0);
  });

  it('survives an empty class', () => {
    const summary = buildBroadsheet([]);
    expect(summary.rows).toEqual([]);
    expect(summary.studentCount).toBe(0);
    expect(summary.averagePercent).toBeNull();
  });
});

describe('broadsheet ordering', () => {
  const { rows } = buildBroadsheet([
    source('s1', 'Zainab Musa', marks(18, 17, 52)), // 87, 1st
    source('s2', 'Ada Obi', marks(14, 15, 44)),     // 73, 2nd
    source('s3', 'Musa Bello', marks(10, null, null)),
  ]);

  it('reads as a register when sorted by name', () => {
    expect(sortByName(rows).map((r) => r.studentName)).toEqual(['Ada Obi', 'Musa Bello', 'Zainab Musa']);
  });

  it('keeps unmarked learners at the end rather than ranking them last', () => {
    const ordered = sortByPosition(rows);
    expect(ordered.map((r) => r.studentId)).toEqual(['s1', 's2', 's3']);
    expect(ordered[2].position).toBeNull();
  });

  it('lists who still needs marking', () => {
    expect(outstandingRows(rows).map((r) => r.studentName)).toEqual(['Musa Bello']);
  });
});
