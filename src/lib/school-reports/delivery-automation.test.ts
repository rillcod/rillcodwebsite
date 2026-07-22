import { describe, expect, it } from 'vitest';
import { selectAllCatalogTopicKeys, selectTopicKeysFromTracking } from './delivery-automation';
import type { DeliveryTopicOption } from './delivery-declaration';

const catalog: DeliveryTopicOption[] = [
  { key: 'cur1::1::1', curriculumId: 'cur1', programme: 'STEM', course: 'Scratch', termNumber: 1, weekNumber: 1, topic: 'Intro' },
  { key: 'cur1::1::2', curriculumId: 'cur1', programme: 'STEM', course: 'Scratch', termNumber: 1, weekNumber: 2, topic: 'Loops' },
  { key: 'cur2::1::3', curriculumId: 'cur2', programme: 'STEM', course: 'Python', termNumber: 1, weekNumber: 3, topic: 'Variables' },
];

describe('delivery-automation', () => {
  it('selects all catalog topic keys as fallback', () => {
    expect(selectAllCatalogTopicKeys(catalog)).toEqual(['cur1::1::1', 'cur1::1::2', 'cur2::1::3']);
  });

  it('maps tracked weeks to catalog keys', async () => {
    const admin = {
      from: () => ({
        select: () => ({
          eq: () => ({
            in: async () => ({
              data: [
                { curriculum_id: 'cur1', term_number: 1, week_number: 1, status: 'completed' },
                { curriculum_id: 'cur1', term_number: 1, week_number: 2, status: 'in_progress' },
                { curriculum_id: 'cur2', term_number: 1, week_number: 99, status: 'completed' },
              ],
            }),
          }),
        }),
      }),
    };

    const keys = await selectTopicKeysFromTracking(admin as any, 'school-1', catalog, {
      startTerm: 1,
      startWeek: 1,
      endTerm: 1,
      endWeek: 14,
    });

    expect(keys).toEqual(['cur1::1::1', 'cur1::1::2']);
  });
});
