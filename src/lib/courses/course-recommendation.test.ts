import { describe, expect, it } from 'vitest';
import { gradeFitFor, recommendCourse, type CourseSignals } from './course-recommendation';

const course = (id: string, title: string, extra: Partial<CourseSignals> = {}): CourseSignals => ({
  id,
  title,
  programId: 'young-innovators',
  ...extra,
});

describe('recommendCourse', () => {
  it('takes the only course a programme offers', () => {
    const out = recommendCourse({ courses: [course('a', 'Scratch Foundations', { hasPublishedRelease: true })] });
    expect(out.recommended?.id).toBe('a');
    expect(out.confidence).toBe('certain');
  });

  it('takes the single adopted edition when a programme has several courses', () => {
    const out = recommendCourse({
      courses: [
        course('scratch', 'Scratch Foundations', { adopted: true, hasPublishedRelease: true }),
        course('robotics', 'Robotics Basics', { hasPublishedRelease: true }),
        course('intro', 'Introduction to Computers', { hasPublishedRelease: true }),
      ],
    });
    expect(out.recommended?.id).toBe('scratch');
    expect(out.confidence).toBe('certain');
    expect(out.reason).toContain('only edition this school has adopted');
  });

  it('refuses to guess between two adopted editions with nothing to separate them', () => {
    const out = recommendCourse({
      courses: [
        course('scratch', 'Scratch Foundations', { adopted: true }),
        course('robotics', 'Robotics Basics', { adopted: true }),
      ],
    });
    expect(out.recommended).toBeNull();
    expect(out.confidence).toBe('ambiguous');
    expect(out.reason).toContain('adopted 2 editions');
  });

  it('separates two adopted editions by the grade band the class is for', () => {
    const out = recommendCourse({
      grade: 'Basic 2',
      courses: [
        course('lower', 'Scratch Foundations', { adopted: true, gradeLevels: ['Basic 1-3'] }),
        course('upper', 'Scratch Studio', { adopted: true, gradeLevels: ['Basic 4-6'] }),
      ],
    });
    // "Basic 4-6" is tagged for another band, so this is not a real choice between two editions.
    expect(out.recommended?.id).toBe('lower');
    expect(out.confidence).toBe('certain');
  });

  it('separates two untagged adopted editions by what the band is already taught', () => {
    const out = recommendCourse({
      grade: 'Basic 2',
      courses: [
        course('scratch', 'Scratch Foundations', { adopted: true, bandClassCount: 2 }),
        course('robotics', 'Robotics Basics', { adopted: true }),
      ],
    });
    expect(out.recommended?.id).toBe('scratch');
    expect(out.confidence).toBe('likely');
  });

  // The behaviour the user hit: the engine was being pointed at courses with no curriculum.
  it('sinks courses with no curriculum below everything that has one', () => {
    const out = recommendCourse({
      courses: [
        course('empty', 'Untitled Course', {}),
        course('real', 'Scratch Foundations', { hasPublishedRelease: true }),
      ],
    });
    expect(out.options[0].id).toBe('real');
    expect(out.options[1].status).toBe('none');
    expect(out.withoutCurriculum.map((c) => c.id)).toEqual(['empty']);
    expect(out.recommended?.id).toBe('real');
  });

  it('never auto-applies a course that has no curriculum to build from', () => {
    const out = recommendCourse({
      courses: [course('a', 'Course A'), course('b', 'Course B')],
    });
    expect(out.recommended).toBeNull();
    expect(out.reason).toContain('No course in this programme has a curriculum yet');
  });

  it('flags the only course in a programme even when it has no curriculum', () => {
    const out = recommendCourse({ courses: [course('solo', 'Course Solo')] });
    expect(out.recommended?.id).toBe('solo');
    expect(out.recommended?.teachable).toBe(false);
    expect(out.reason).toContain('no curriculum yet');
  });

  it('lets sibling classes at the same school break a tie', () => {
    const out = recommendCourse({
      grade: 'JSS 1',
      courses: [
        course('python', 'Python Foundations', { hasPublishedRelease: true, bandClassCount: 3 }),
        course('web', 'Web Foundations', { hasPublishedRelease: true }),
      ],
    });
    expect(out.recommended?.id).toBe('python');
    expect(out.confidence).toBe('likely');
  });

  it('keeps a course already set on the class', () => {
    const out = recommendCourse({
      currentCourseId: 'robotics',
      courses: [
        course('scratch', 'Scratch Foundations', { adopted: true }),
        course('robotics', 'Robotics Basics', {}),
      ],
    });
    expect(out.recommended?.id).toBe('robotics');
    expect(out.reason).toBe('Already set for this class.');
  });

  it('excludes a grade-mismatched course from the decision', () => {
    const out = recommendCourse({
      grade: 'Basic 2',
      courses: [
        course('teen', 'Python Foundations', { adopted: true, gradeLevels: ['JSS 1-3'] }),
        course('kids', 'Scratch Foundations', { hasPublishedRelease: true, gradeLevels: ['Basic 1-3'] }),
      ],
    });
    expect(out.recommended?.id).toBe('kids');
    expect(out.options.find((o) => o.id === 'teen')?.gradeFit).toBe('mismatch');
  });

  it('reports an empty programme rather than inventing a course', () => {
    const out = recommendCourse({ courses: [] });
    expect(out.recommended).toBeNull();
    expect(out.confidence).toBe('none');
  });
});

describe('gradeFitFor', () => {
  it('treats an untagged course as unknown, not a mismatch', () => {
    expect(gradeFitFor(course('a', 'A'), 'Basic 2')).toBe('unknown');
  });

  it('matches a single grade inside a tagged band', () => {
    expect(gradeFitFor(course('a', 'A', { gradeLevels: ['Basic 1-3'] }), 'Basic 2')).toBe('match');
  });

  it('matches overlapping bands', () => {
    expect(gradeFitFor(course('a', 'A', { gradeLevels: ['Basic 1-3'] }), 'Basic 1-3')).toBe('match');
  });

  it('accepts a bare level tag', () => {
    expect(gradeFitFor(course('a', 'A', { gradeLevels: ['JSS'] }), 'JSS 2')).toBe('match');
  });

  it('rejects a different level', () => {
    expect(gradeFitFor(course('a', 'A', { gradeLevels: ['JSS 1-3'] }), 'Basic 2')).toBe('mismatch');
  });

  it('is unknown when the class has no grade yet', () => {
    expect(gradeFitFor(course('a', 'A', { gradeLevels: ['Basic 1-3'] }), null)).toBe('unknown');
  });
});
