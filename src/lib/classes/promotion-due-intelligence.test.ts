import { describe, expect, it } from 'vitest';
import {
  activeSessionTrackIds,
  classEligibleForSessionTrack,
  isBasic5Or6SectionBand,
  isJssExitSectionBand,
  mergeTrackDue,
  resolveSessionTrack,
  SESSION_BULK_SMART_DEFAULTS,
  SESSION_PROMOTION_TRACKS,
  studentDueForSessionTrack,
} from '@/lib/classes/promotion-due-intelligence';
import { parseBandLabel } from '@/lib/classes/naming';
import { YOUNG_PROGRAMME } from '@/lib/classes/programme-transition';

describe('promotion due intelligence', () => {
  it('Basic 4-6 class is not eligible for young_to_teen (Hilltop Basic 4 scenario)', () => {
    expect(
      classEligibleForSessionTrack('young_to_teen', {
        qa_grade_band: 'Basic 4-6',
        program_name: YOUNG_PROGRAMME,
        name: 'Hilltop · Young Innovators · Basic 4-6',
      }),
    ).toBe(false);
  });

  it('Basic 6 class is eligible for young_to_teen', () => {
    expect(
      classEligibleForSessionTrack('young_to_teen', {
        qa_grade_key: 'Basic 6',
        program_name: YOUNG_PROGRAMME,
      }),
    ).toBe(true);
  });

  it('only Basic 6 learners are due for young_to_teen, not Basic 4 or 5', () => {
    expect(studentDueForSessionTrack('young_to_teen', { grade: 'Basic 6' }, 'Basic 5-6')).toBe(true);
    expect(studentDueForSessionTrack('young_to_teen', { grade: 'Basic 4' }, 'Basic 4-6')).toBe(false);
    expect(studentDueForSessionTrack('young_to_teen', { grade: 'Basic 5' }, 'Basic 5-6')).toBe(false);
  });

  it('uses the school policy when Young exits at Basic 5', () => {
    const policy = { young_to_teen_exit_grade: 'Basic 5' as const };
    expect(studentDueForSessionTrack('young_to_teen', { grade: 'Basic 5' }, null, policy)).toBe(true);
    expect(studentDueForSessionTrack('young_to_teen', { grade: 'Basic 6' }, null, policy)).toBe(false);
    expect(studentDueForSessionTrack('basic5_to_6', { grade: 'Basic 5' }, null, policy)).toBe(false);
    expect(activeSessionTrackIds(policy)).not.toContain('basic5_to_6');
    expect(resolveSessionTrack('young_to_teen', policy).short_label).toBe('Basic 5 → JSS 1');
  });

  it('JSS 3 learners due for jss_to_ss even if class name says SS 2', () => {
    expect(
      classEligibleForSessionTrack('jss_to_ss', {
        qa_grade_band: 'JSS 1-3',
        program_name: 'Teen Developers',
        name: 'School · Teen Dev · SS 2',
      }),
    ).toBe(true);
    expect(studentDueForSessionTrack('jss_to_ss', { grade: 'JSS 3' }, 'JSS 1-3')).toBe(true);
    expect(studentDueForSessionTrack('jss_to_ss', { grade: 'JSS 2' }, 'JSS 1-3')).toBe(false);
  });

  it('isJssExitSectionBand covers JSS 1-3 and JSS 3', () => {
    expect(isJssExitSectionBand(parseBandLabel('JSS 1-3'))).toBe(true);
    expect(isJssExitSectionBand(parseBandLabel('JSS 3'))).toBe(true);
    expect(isJssExitSectionBand(parseBandLabel('JSS 1-2'))).toBe(false);
  });

  it('isBasic5Or6SectionBand rejects Basic 4-6', () => {
    expect(isBasic5Or6SectionBand(parseBandLabel('Basic 5-6'))).toBe(true);
    expect(isBasic5Or6SectionBand(parseBandLabel('Basic 4-6'))).toBe(false);
  });

  it('keeps schools configurable while counting only due learners', () => {
    const snap = mergeTrackDue([
      {
        school_id: 's1',
        school_name: 'Hilltop',
        young_to_teen_exit_grade: 'Basic 6',
        tracks: [],
      },
      {
        school_id: 's2',
        school_name: 'Other',
        young_to_teen_exit_grade: 'Basic 6',
        tracks: [{
          track_id: 'young_to_teen',
          short_label: 'Basic 6 → JSS 1',
          due_count: 2,
          class_count: 1,
        }],
      },
    ]);
    expect(snap.show_menu).toBe(true);
    expect(snap.total_due).toBe(2);
    expect(snap.schools).toHaveLength(2);
  });

  it('session bulk defaults to placement-only (no within-level curriculum jump)', () => {
    expect(SESSION_BULK_SMART_DEFAULTS.advance_curriculum).toBe('never');
    expect(SESSION_PROMOTION_TRACKS.young_to_teen.kind).toBe('category_change');
    expect(SESSION_PROMOTION_TRACKS.jss_to_ss.kind).toBe('teen_grade_step');
    expect(SESSION_PROMOTION_TRACKS.jss_to_ss.placement_only).toBe(true);
  });
});
