import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(join(process.cwd(), path), 'utf8');

const classPage = read('src/app/dashboard/classes/[id]/page.tsx');
const teachingWorkspace = read('src/components/classes/ClassTeachingWorkspace.tsx');
const teachingRoute = read('src/app/api/classes/[id]/teaching-workspace/route.ts');
const assessmentRoute = read('src/app/api/classes/[id]/assessment-workspace/route.ts');
const assessmentService = read('src/lib/academic/class-assessment-workspace.ts');
const studentsRoute = read('src/app/api/classes/[id]/students/route.ts');

describe('class workspace resilience and focus', () => {
  it('keeps teaching independent from roster and assessment reads', () => {
    expect(classPage).toContain("const needsStudentRecords = activeOperation !== 'teaching'");
    expect(classPage).toContain(`/api/classes/${'${id}'}/assessment-workspace`);
    expect(classPage).toContain("activeOperation === 'roster'");
    expect(classPage).toContain("?light=1");
    expect(classPage).toContain('Open to load students');
    expect(classPage).toContain('Open to load class work');
    expect(classPage).not.toContain("supabase.from('assignments')");
    expect(classPage).not.toContain("supabase.from('cbt_exams')");
  });

  it('keeps the selected work mode in sync with the class URL', () => {
    expect(classPage).toContain('const selectOperation =');
    expect(classPage).toContain("url.searchParams.set('operation', operation)");
    expect(classPage).toContain("window.history.replaceState(null, '', url.toString())");
    expect(classPage).toContain('[requestedOperation, requestedCourseId]');
    expect(classPage).not.toContain('}, [searchParams]);');
  });

  it('keeps tasks, projects and CBT in one assessment record with correct destinations', () => {
    expect(classPage).toContain("label: assessmentCopy?.workLabel ?? 'Assessment work'");
    expect(classPage).not.toContain("{ id: 'cbt'");
    expect(classPage).toContain("a.assignment_type === 'project' ? `/dashboard/projects/${a.id}` : `/dashboard/assignments/${a.id}`");
    expect(classPage).toContain('buildProjectNewHref');
    expect(classPage).not.toContain('> New Assignment');
    expect(classPage).not.toContain('Full Gradebook →');
  });

  it('loads one server-owned class assessment scope with resilient reads', () => {
    expect(assessmentRoute).toContain('loadClassAssessmentWorkspace');
    expect(assessmentService).toContain("actor.role === 'teacher' && klass.teacher_id !== actor.id");
    expect(assessmentService).toContain("actor.role === 'school'");
    expect(assessmentService).toContain('readSupabaseWithTransientRetry');
    expect(assessmentService).toContain(".from('assignment_submissions')");
    expect(assessmentService).toContain(".from('cbt_sessions')");
    expect(assessmentService).toContain('no marks have been changed');
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
    expect(teachingRoute).toContain('readSupabaseWithTransientRetry');
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
