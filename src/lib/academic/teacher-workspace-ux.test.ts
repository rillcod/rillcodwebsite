import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(join(process.cwd(), path), 'utf8');
const classPage = read('src/app/dashboard/classes/[id]/page.tsx');
const academicOffice = read('src/app/dashboard/academic/page.tsx');
const flashcards = read('src/app/dashboard/flashcards/page.tsx');
const teachingTools = read('src/components/pipeline/PipelineStepper.tsx');
const teachingWorkspace = read('src/components/classes/ClassTeachingWorkspace.tsx');
const laneChrome = read('src/components/academic/LaneChrome.tsx');
const academicGuide = read('src/app/dashboard/academic/guide/page.tsx');

describe('central teacher workspace UX', () => {
  // Records used to hide behind a collapsed panel that told teachers to "keep this closed
  // for daily teaching" — a second, competing navigation with its own five tabs. They now
  // follow the work mode: the mode is chosen first, and the strip shows only that mode's
  // records. Teaching still comes before them on the page.
  it('scopes class records to the chosen work mode instead of a second tab bar', () => {
    expect(classPage.indexOf('<ClassTeachingWorkspace')).toBeGreaterThan(-1);
    expect(classPage).not.toContain('Keep this closed for daily teaching.');
    expect(classPage).toContain('const recordTabs = [');
    expect(classPage).toContain("modes: ['assessment']");
    expect(classPage.indexOf('<ClassTeachingWorkspace'))
      .toBeLessThan(classPage.indexOf('Records for the current work mode'));
  });

  // The identity strip must stay light: the counts belong to the work mode that owns them,
  // otherwise the header pushes the actual work below the fold again.
  it('keeps class metrics on the work modes rather than in the page header', () => {
    expect(classPage).not.toContain("hint: `${cls.max_students ?? '∞'} capacity`");
    expect(classPage).toContain('attentionLabel');
  });

  it('treats flashcards as a teaching tool instead of a separate numbered pipeline', () => {
    expect(flashcards).not.toContain('<PipelineStepper');
    expect(flashcards).toContain('Back to Classes');
    expect(teachingTools).toContain('Teaching preparation tools');
    expect(teachingTools).not.toContain('Step {step.number}');
  });

  it('does not put Academic Office tabs on the class teaching page', () => {
    expect(teachingWorkspace).not.toContain('<PipelineStepper');
    expect(laneChrome).toContain('canSeeAssetLaneChrome');
    expect(academicGuide).toContain('<AcademicGuideCtas');
    expect(academicGuide).not.toContain('Roll out / make official');
    expect(teachingTools).toContain("profile?.role === 'teacher'");
  });

  it('keeps one class-first journey and hides secondary records and diagnostics by default', () => {
    expect(teachingWorkspace).toContain('Class records and results');
    expect(teachingWorkspace).toContain('<details className="rounded-xl');
    expect(teachingWorkspace).toContain('Teaching sessions');
    expect(teachingWorkspace).toContain('Content for this teaching session');
    expect(teachingWorkspace).toContain('Prepare · review · share here');
    expect(teachingWorkspace).toContain('Next teacher action');
    expect(teachingWorkspace).not.toContain('One connected workflow');
    expect(teachingWorkspace).toContain('Review & share');
    expect(teachingWorkspace).toContain('Open class materials');
    expect(teachingWorkspace).toContain('View full teaching order');
    expect(teachingWorkspace).toContain('Retry missing content');
    expect(teachingWorkspace).not.toContain('Prepare all missing packages');
    expect(teachingWorkspace).not.toContain('Weekly Teaching Packages');
    expect(academicOffice).toContain('Detailed progress');
    expect(academicOffice).toContain('More academic tools');
    expect(academicOffice).not.toContain('showWorkflowDetails');
    expect(academicOffice).not.toContain('label: "Assigned"');
    expect(academicOffice).not.toContain('Auto-fill</span>');
  });

  it('does not send teachers into the curriculum writer from class records', () => {
    expect(teachingWorkspace).toContain('buildCoverageHref');
    expect(teachingWorkspace).not.toContain('buildCurriculumHref');
    expect(teachingWorkspace).toContain('label: "Coverage"');
  });

  it('does not send teachers into CRM from the old directory URL', () => {
    const directory = read('src/app/dashboard/directory/page.tsx');
    expect(directory).toContain("/dashboard/students");
    expect(directory).toContain("/dashboard/records");
    expect(directory).not.toContain("redirect('/dashboard/crm')");
  });

  it('sends teachers to the gradebook, not the operator grading queue', () => {
    const home = read('src/components/dashboard/TeacherDashboard.tsx');
    const dash = read('src/app/dashboard/page.tsx');
    expect(home).not.toContain('/dashboard/grading');
    expect(home).toContain('href="/dashboard/grades"');
    expect(dash).toContain("name: 'Mark work', href: '/dashboard/grades'");
    expect(classPage).not.toContain('/dashboard/grading');
    expect(classPage).toContain('/dashboard/grades?class_id=');
  });

  // The office is an overview, not another dashboard made of dashboards: one
  // next move and compact work-area links stay visible; detailed stages,
  // queues and exceptions share one secondary disclosure.
  it('keeps diagnostics behind one secondary academic-tools disclosure', () => {
    const nextAction = academicOffice.indexOf('<NextActionCard');
    const tools = academicOffice.indexOf('id="supporting-tools"');
    const exceptions = academicOffice.lastIndexOf('<AcademicExceptionsWorkspace');
    expect(nextAction).toBeGreaterThan(-1);
    expect(academicOffice).toContain("What to teach");
    expect(tools).toBeGreaterThan(-1);
    expect(exceptions).toBeGreaterThan(-1);
    expect(nextAction).toBeLessThan(tools);
    expect(tools).toBeLessThan(exceptions);
    expect(academicOffice).not.toContain('showPipeline');
  });
});
