import { describe, expect, it } from 'vitest';
import { customisePlanWeek, mergePlanWithRelease } from './plan-from-release';

/**
 * The guard for sharing one generated week across many schools.
 *
 * Today a week of content is generated per class: 58 classes over 11 curriculum
 * releases means the same Week 3 is produced four times over, and at 100 schools
 * it would be produced about twenty times. Generating once per curriculum
 * release and letting each class refine it removes that entirely — the work
 * stops scaling with schools and scales with curriculum instead, which is small
 * and stable.
 *
 * That only holds if refinement is genuinely local. The moment one school's edit
 * reaches another school, sharing stops being an optimisation and becomes a
 * data leak between customers. mergePlanWithRelease is the whole of that
 * boundary, so these tests state the property directly rather than testing it
 * incidentally through the merge's happy path.
 */

const w = (n: number, topic: string) => ({ week: n, topic });

const master = {
  terms: [{ term: 1, weeks: [w(1, 'Intro'), w(2, 'Variables'), w(3, 'Loops')] }],
};

describe('a school edits only its own copy', () => {
  it('keeps one school on its edit while another stays on the master', () => {
    const shared = { weeks: [w(1, 'Intro'), w(2, 'Variables'), w(3, 'Loops')] };

    // Two schools, same master, one of them rewrites week 2.
    const schoolA = customisePlanWeek(shared, 2, { topic: 'Variables with market stalls' });
    const schoolB = shared;

    const a = mergePlanWithRelease({ existingPlanData: schoolA, releaseContent: master, termLabel: 'First Term' });
    const b = mergePlanWithRelease({ existingPlanData: schoolB, releaseContent: master, termLabel: 'First Term' });

    expect(a?.weeks[1].topic).toBe('Variables with market stalls');
    expect(b?.weeks[1].topic).toBe('Variables');
  });

  it('does not mutate the shared object the schools were built from', () => {
    // The failure that would leak across schools is an in-place edit of the
    // master: every class holding a reference to it would silently inherit one
    // school's wording.
    const shared = { weeks: [w(1, 'Intro'), w(2, 'Variables')] };
    const before = JSON.stringify(shared);

    customisePlanWeek(shared, 2, { topic: 'Rewritten' });
    mergePlanWithRelease({ existingPlanData: shared, releaseContent: master, termLabel: 'First Term' });

    expect(JSON.stringify(shared)).toBe(before);
  });

  it('leaves the master release untouched when a school customises', () => {
    const masterCopy = JSON.stringify(master);
    const plan = customisePlanWeek({ weeks: [w(1, 'Intro')] }, 1, { topic: 'Local version' });
    mergePlanWithRelease({ existingPlanData: plan, releaseContent: master, termLabel: 'First Term' });
    expect(JSON.stringify(master)).toBe(masterCopy);
  });
});

describe('the master still reaches classes that did not opt out', () => {
  it('updates every untouched week when the curriculum is revised', () => {
    const plan = customisePlanWeek({ weeks: [w(1, 'Intro'), w(2, 'Variables')] }, 1, { topic: 'Our own opener' });

    const revised = {
      terms: [{ term: 1, weeks: [w(1, 'Intro v2'), w(2, 'Variables v2'), w(3, 'Loops v2')] }],
    };

    const merged = mergePlanWithRelease({ existingPlanData: plan, releaseContent: revised, termLabel: 'First Term' });

    // Customised: stays.
    expect(merged?.weeks[0].topic).toBe('Our own opener');
    // Untouched: follows the revision, which is the point of sharing a master.
    expect(merged?.weeks[1].topic).toBe('Variables v2');
    // Added upstream: arrives without anyone re-adopting.
    expect(merged?.weeks[2].topic).toBe('Loops v2');
  });

  it('a fix to the master reaches every class that has not overridden it', () => {
    // The reason to share at all: correcting a typo once corrects it everywhere,
    // instead of four times today and twenty at a hundred schools.
    const classes = [
      { weeks: [w(1, 'Teh Intro')] },
      { weeks: [w(1, 'Teh Intro')] },
      { weeks: [w(1, 'Teh Intro')] },
    ];
    const corrected = { terms: [{ term: 1, weeks: [w(1, 'The Intro')] }] };

    for (const plan of classes) {
      const merged = mergePlanWithRelease({ existingPlanData: plan, releaseContent: corrected, termLabel: 'First Term' });
      expect(merged?.weeks[0].topic).toBe('The Intro');
    }
  });
});

describe('a refinement survives what would otherwise overwrite it', () => {
  it('marks the week and remembers what it replaced', () => {
    const plan = customisePlanWeek({ weeks: [w(1, 'Original')] }, 1, { topic: 'Refined' });
    expect(plan.weeks[0].is_customized).toBe(true);
    expect(plan.weeks[0].original_topic).toBe('Original');
  });

  it('holds through repeated curriculum revisions, not just the first', () => {
    // A refinement that survives one update and is lost on the next is worse
    // than none: the teacher stops trusting their own edits.
    let plan: any = customisePlanWeek({ weeks: [w(1, 'v1')] }, 1, { topic: 'Ours' });

    for (const version of ['v2', 'v3', 'v4']) {
      plan = mergePlanWithRelease({
        existingPlanData: plan,
        releaseContent: { terms: [{ term: 1, weeks: [w(1, version)] }] },
        termLabel: 'First Term',
      });
      expect(plan?.weeks[0].topic).toBe('Ours');
    }
  });

  it('keeps a week the class added beyond the master', () => {
    // A class teaching a tenth week the curriculum does not have must not lose
    // it because the master stops at nine.
    const plan = customisePlanWeek({ weeks: [w(1, 'Intro'), w(10, 'Our extra week')] }, 10, { topic: 'Our extra week' });
    const merged = mergePlanWithRelease({
      existingPlanData: plan,
      releaseContent: { terms: [{ term: 1, weeks: [w(1, 'Intro')] }] },
      termLabel: 'First Term',
    });
    expect(merged?.weeks.map((x: any) => x.week)).toContain(10);
  });
});
