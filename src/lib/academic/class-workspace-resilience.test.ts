import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(join(process.cwd(), path), 'utf8');

const classPage = read('src/app/dashboard/classes/[id]/page.tsx');
const teachingWorkspace = read('src/components/classes/ClassTeachingWorkspace.tsx');
const teachingRoute = read('src/app/api/classes/[id]/teaching-workspace/route.ts');
const studentsRoute = read('src/app/api/classes/[id]/students/route.ts');

describe('class workspace resilience and focus', () => {
  it('keeps teaching independent from roster and assessment reads', () => {
    expect(classPage).toContain("const needsStudentRecords = activeOperation !== 'teaching'");
    expect(classPage).toContain("program_id && activeOperation === 'assessment'");
    expect(classPage).toContain("activeOperation === 'roster'");
    expect(classPage).toContain("?light=1");
    expect(classPage).toContain('Open to load students');
    expect(classPage).toContain('Open to load class work');
  });

  it('does not duplicate the teaching next action in a page-level alert strip', () => {
    expect(classPage).not.toContain('classPriorities');
    expect(classPage).not.toContain('aria-label="Class priorities"');
    expect(teachingWorkspace).toContain('Next teacher action');
    expect(teachingWorkspace).toContain('Class plan source');
    expect(classPage).toContain('ready to review');
  });

  it('never leaves a class plan spinning indefinitely or silently empties failed content', () => {
    expect(teachingWorkspace).toContain('fetchActionJson');
    expect(teachingWorkspace).toContain('30_000');
    expect(teachingWorkspace).toContain('Retry class plan');
    expect(teachingRoute).toContain('incomplete class-plan response');
    expect(teachingRoute).toContain('no teaching content has been changed');
    const assessmentRead = teachingRoute.slice(
      teachingRoute.indexOf('.from("cbt_exams")'),
      teachingRoute.indexOf('.from("cbt_exams")') + 700,
    );
    expect(assessmentRead).not.toContain('.order("session_number"');
  });

  it('uses one roster read for withdrawal guards and status enrichment', () => {
    expect(studentsRoute.match(/\.from\('class_term_rosters'\)/g)).toHaveLength(1);
    expect(studentsRoute).toContain('const [directResult, rosterResult, sectionResult] = await Promise.all');
    expect(studentsRoute).toContain('rosterSettingsPromise');
    expect(studentsRoute).toContain('liveCountPromise');
  });
});
