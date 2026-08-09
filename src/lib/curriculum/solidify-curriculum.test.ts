import { describe, expect, it } from 'vitest';
import { acceptSolidified, solidifyCurriculumQuality } from './quality-repair';
import { runAcademicQualityEngine } from '@/lib/qa/academicQualityEngine';

/** A week shaped the way the readiness engine reads one. */
function week(n: number, extra: Record<string, unknown> = {}) {
  return { week: n, topic: `Real topic ${n}`, subtopics: ['a', 'b'], ...extra };
}

const SOLID = {
  overview: 'A term of foundational computing.',
  terms: [{
    year: 1,
    term: 1,
    weeks: [
      week(1, { lesson_plan: { activities: ['Build a sprite'] }, assessment_plan: { check: 'Demo it' } }),
      week(2, { lesson_plan: { activities: ['Draw a flowchart'] }, assessment_plan: { check: 'Peer review' } }),
    ],
  }],
};

/** The live shape: publishable, but every week short of an activity and a check. */
const THIN = {
  overview: 'A term of foundational computing.',
  terms: [{ year: 1, term: 1, weeks: [week(1), week(2)] }],
};

const CONTEXT = {
  sourceMetadata: { name: 'Rillcod Academic Framework', framework: 'Approved Standard' },
  academicSession: '2026/2027',
  audienceLabel: 'Basic 1',
};

const generateReturning = (value: unknown) =>
  async () => ({ text: JSON.stringify(value), model: 'test-model' });

describe('what the readiness engine can now repair', () => {
  it('sees the gaps that qualityGate is blind to', () => {
    // qualityGate has no activity or assessment check at all, so a curriculum can
    // pass the publication gate while every week lacks both.
    const report = runAcademicQualityEngine(THIN, CONTEXT);
    expect(report.readiness).toBe('ready');
    const codes = report.improvements.map((i) => i.code);
    expect(codes).toContain('activity_missing');
    expect(codes).toContain('assessment_missing');
  });

  it('does nothing when the curriculum is already solid', async () => {
    const outcome = await solidifyCurriculumQuality(SOLID, generateReturning(SOLID), CONTEXT);
    expect(outcome.status).toBe('not_needed');
  });

  it('accepts a repair that fills activities and checks', async () => {
    const outcome = await solidifyCurriculumQuality(THIN, generateReturning(SOLID), CONTEXT);
    expect(outcome.status).toBe('repaired');
    expect(outcome.after!.improvements.length).toBeLessThan(outcome.before.improvements.length);
  });
});

describe('acceptSolidified guards', () => {
  it('refuses a candidate that reworded an existing topic', () => {
    // The wording is the Academic Office's. Filling a blank is help; rewriting
    // what they authored is the model overwriting them, invisibly in a big diff.
    const reworded = JSON.parse(JSON.stringify(SOLID));
    reworded.terms[0].weeks[0].topic = 'A blander topic';
    expect(acceptSolidified(THIN, reworded, CONTEXT)).toEqual({
      ok: false,
      reason: 'The repair reworded an existing topic at 1:1:1.',
    });
  });

  it('refuses a candidate that dropped a week', () => {
    const shorter = { ...SOLID, terms: [{ year: 1, term: 1, weeks: [SOLID.terms[0].weeks[0]] }] };
    expect(acceptSolidified(THIN, shorter, CONTEXT).ok).toBe(false);
  });

  it('refuses a candidate that changed nothing', () => {
    // acceptRepair would wave this through: qualityGate reports zero errors here,
    // and its "did it improve?" test only applies when errors existed.
    expect(acceptSolidified(THIN, THIN, CONTEXT)).toEqual({
      ok: false,
      reason: 'The repair did not reduce the number of findings.',
    });
  });

  it('refuses a candidate that introduced a must-fix fault', () => {
    const broken = JSON.parse(JSON.stringify(SOLID));
    broken.terms[0].weeks.push({ week: 2, topic: 'Duplicate position', subtopics: ['x'] });
    expect(acceptSolidified(THIN, broken, CONTEXT).ok).toBe(false);
  });

  it('keeps the original when the model returns something that is not a curriculum', async () => {
    const outcome = await solidifyCurriculumQuality(THIN, generateReturning('not an object'), CONTEXT);
    expect(outcome.status).toBe('rejected');
    expect(outcome.content).toBe(THIN);
  });

  it('keeps the original when the AI is unavailable', async () => {
    const outcome = await solidifyCurriculumQuality(THIN, async () => null, CONTEXT);
    expect(outcome.status).toBe('unavailable');
    expect(outcome.content).toBe(THIN);
  });

  it('never asks the model to invent the academic standard', async () => {
    // source_name/framework findings describe what the publish form supplies.
    // Handing them to a model invites it to fabricate an approved standard.
    let prompt = '';
    await solidifyCurriculumQuality(THIN, async (_system, user) => {
      prompt = user;
      return { text: JSON.stringify(SOLID), model: 'test-model' };
    }, {});
    expect(prompt).not.toContain('framework');
    expect(prompt).not.toContain('academic source');
  });
});
