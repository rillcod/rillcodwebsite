import { describe, expect, it } from 'vitest';
import { coursesVisibleForReportPicker } from './builder-course-picker';

const catalog = [
  { id: 'scratch', program_id: 'young' },
  { id: 'python', program_id: 'teen' },
  { id: 'web', program_id: 'teen' },
];

describe('report writer course picker', () => {
  it('shows every course when the programme has not loaded yet', () => {
    expect(coursesVisibleForReportPicker(catalog, '', '')).toEqual(catalog);
  });

  it('keeps the already-chosen course visible after a programme mismatch', () => {
    expect(coursesVisibleForReportPicker(catalog, 'teen', 'scratch').map((row) => row.id))
      .toEqual(['scratch', 'python', 'web']);
  });

  it('filters to the programme once it is known and nothing else is selected', () => {
    expect(coursesVisibleForReportPicker(catalog, 'teen', '').map((row) => row.id))
      .toEqual(['python', 'web']);
  });
});
