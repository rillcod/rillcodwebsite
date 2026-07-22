import { describe, expect, it } from 'vitest';
import { compareLearnersForRoster } from './aggregate';

describe('school report learner roster order', () => {
  it('sorts by academic grade, class, then learner name', () => {
    const learners = [
      { name: 'Mike', className: 'Senior', gradeLabel: 'SS 2', classLabel: 'Blue' },
      { name: 'Zara', className: 'Primary', gradeLabel: 'Basic 1', classLabel: 'Gold' },
      { name: 'Osa', className: 'Primary', gradeLabel: 'Basic 1', classLabel: 'Gold' },
      { name: 'Ada', className: 'Junior', gradeLabel: 'JSS 1', classLabel: 'A' },
      { name: 'Ben', className: 'Primary', gradeLabel: 'Basic 2', classLabel: 'Gold' },
    ];
    expect([...learners].sort(compareLearnersForRoster).map((learner) => learner.name)).toEqual([
      'Osa', 'Zara', 'Ben', 'Ada', 'Mike',
    ]);
  });
});
