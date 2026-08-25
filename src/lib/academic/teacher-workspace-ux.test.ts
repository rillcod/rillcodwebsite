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
    expect(teachingWorkspace).toContain('Weekly teaching plan');
    expect(teachingWorkspace).not.toContain('Weekly Teaching Packages');
    expect(academicOffice).toContain('Detailed progress');
    expect(academicOffice).toContain('showWorkflowDetails');
    expect(academicOffice).not.toContain('Auto-fill</span>');
  });

  it('does not send teachers into CRM from the old directory URL', () => {
    const directory = read('src/app/dashboard/directory/page.tsx');
    expect(directory).toContain("/dashboard/students");
    expect(directory).toContain("/dashboard/records");
    expect(directory).not.toContain("redirect('/dashboard/crm')");
  });

  // The order of the page is the point: what to do next, then the curriculum
  // lanes that carry the work, then optional tools, and only then the admin-only
  // exceptions. Anchored on ids rather than visible copy — the headings were
  // rewritten once already and took this guard down with them without any of
  // the ordering it protects actually changing.
  it('keeps exceptions after the main academic direction and tools', () => {
    const nextAction = academicOffice.indexOf('<NextActionCard');
    const curriculum = academicOffice.indexOf('id="curriculum-lanes"');
    const tools = academicOffice.indexOf('id="supporting-tools"');
    const exceptions = academicOffice.lastIndexOf('<AcademicExceptionsWorkspace');
    expect(nextAction).toBeGreaterThan(-1);
    expect(curriculum).toBeGreaterThan(-1);
    expect(academicOffice).toContain("What to teach");
    expect(tools).toBeGreaterThan(-1);
    expect(exceptions).toBeGreaterThan(-1);
    expect(nextAction).toBeLessThan(curriculum);
    expect(curriculum).toBeLessThan(tools);
    expect(tools).toBeLessThan(exceptions);
  });
});
