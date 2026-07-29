import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(join(process.cwd(), path), 'utf8');
const classPage = read('src/app/dashboard/classes/[id]/page.tsx');
const academicOffice = read('src/app/dashboard/academic/page.tsx');
const flashcards = read('src/app/dashboard/flashcards/page.tsx');
const teachingTools = read('src/components/pipeline/PipelineStepper.tsx');

describe('central teacher workspace UX', () => {
  it('keeps daily teaching visible and advanced records collapsed', () => {
    expect(classPage.indexOf('<ClassTeachingWorkspace')).toBeGreaterThan(-1);
    expect(classPage).toContain('<details className="group rounded-2xl');
    expect(classPage).toContain('Keep this closed for daily teaching.');
    expect(classPage.indexOf('<ClassTeachingWorkspace')).toBeLessThan(classPage.indexOf('<details className="group'));
  });

  it('treats flashcards as a teaching tool instead of a separate numbered pipeline', () => {
    expect(flashcards).not.toContain('<PipelineStepper');
    expect(flashcards).toContain('Back to Classes');
    expect(teachingTools).toContain('Teaching preparation tools');
    expect(teachingTools).not.toContain('Step {step.number}');
  });

  it('keeps exceptions after the main academic direction and tools', () => {
    const nextAction = academicOffice.indexOf('<NextActionCard');
    const curriculum = academicOffice.indexOf('Curriculum certification');
    const tools = academicOffice.indexOf('id="supporting-tools"');
    const exceptions = academicOffice.lastIndexOf('<AcademicExceptionsWorkspace');
    expect(nextAction).toBeGreaterThan(-1);
    expect(nextAction).toBeLessThan(curriculum);
    expect(curriculum).toBeLessThan(tools);
    expect(tools).toBeLessThan(exceptions);
  });
});