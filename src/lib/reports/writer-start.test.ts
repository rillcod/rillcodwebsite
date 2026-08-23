import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  canPersistWriterSession,
  coursesForProgramme,
  parseWriterSession,
  serializeWriterSession,
  writerSessionStorageKey,
} from './writer-start';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const builder = readFileSync(join(ROOT, 'app/dashboard/reports/builder/page.tsx'), 'utf8');

const courses = [
  { id: 'scratch-id', title: 'Creative Coding with Scratch', program_id: 'yi-id' },
  { id: 'python-id', title: 'Python for Beginners', program_id: 'td-id' },
  { id: 'web-id', title: 'HTML & CSS', program_id: 'td-id' },
];

describe('writer session persist/restore', () => {
  it('keys storage per teacher', () => {
    expect(writerSessionStorageKey('teacher-a')).toBe('rillcod_report_session_teacher-a');
  });

  it('refuses to persist until restore has applied for the same teacher', () => {
    expect(canPersistWriterSession(null, 'teacher-a')).toBe(false);
    expect(canPersistWriterSession('teacher-a', 'teacher-b')).toBe(false);
    expect(canPersistWriterSession('teacher-a', 'teacher-a')).toBe(true);
  });

  it('round-trips programme with the rest of the start seat', () => {
    const raw = serializeWriterSession({
      class_id: 'class-1',
      course_id: 'python-id',
      _programId: 'td-id',
      _sessionDone: true,
      _step: 'pick',
    });
    const parsed = parseWriterSession(raw);
    expect(parsed.ok).toBe(true);
    expect(parsed.snapshot?._programId).toBe('td-id');
    expect(parsed.config.course_id).toBe('python-id');
    expect(parsed.config).not.toHaveProperty('_programId');
  });

  it('surfaces a recoverable warning when storage is corrupt', () => {
    const parsed = parseWriterSession('{not json');
    expect(parsed.ok).toBe(false);
    expect(parsed.warning).toMatch(/could not be restored/);
  });
});

describe('programme then course', () => {
  it('keeps the course list empty until a programme is chosen', () => {
    expect(coursesForProgramme(courses, '')).toEqual([]);
    expect(coursesForProgramme(courses, 'td-id').map((row) => row.id)).toEqual(['python-id', 'web-id']);
  });
});

describe('Write keeps the existing start path', () => {
  it('reuses class-course resolution and does not invent a second curriculum loader', () => {
    expect(builder).toContain('canPersistWriterSession');
    expect(builder).toContain('coursesForProgramme');
    expect(builder).toContain('resolveLinkedCourseForClass');
    expect(builder).toContain("fetch(`/api/curricula?course_id=${courseId}`)");
    expect(builder).not.toContain('official-status?course_id=');
    expect(builder).not.toContain('resolveWriterStartSelection');
    expect(builder).not.toContain('writerStartMissing');
    expect(builder).not.toContain('writerProgrammes');
  });
});
