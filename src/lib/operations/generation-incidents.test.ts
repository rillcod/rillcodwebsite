import { describe, expect, it } from 'vitest';
import { nextGenerationIncidentMetadata } from './generation-incidents';

describe('generation incident state', () => {
  it('keeps failures for other content types while clearing a repaired type', () => {
    const metadata = {
      owner: 'curriculum',
      last_generation_errors: {
        lessons: [{ week: 1 }],
        assignments: [{ week: 2 }],
        generated_at: 'old',
      },
    };
    expect(nextGenerationIncidentMetadata(metadata, 'lessons', [], 'new')).toEqual({
      owner: 'curriculum',
      last_generation_errors: {
        assignments: [{ week: 2 }],
        generated_at: 'new',
      },
    });
  });

  it('removes the incident container when the final failure is repaired', () => {
    expect(nextGenerationIncidentMetadata({ last_generation_errors: { projects: [{ week: 3 }] } }, 'projects', []))
      .toEqual({});
  });
});
