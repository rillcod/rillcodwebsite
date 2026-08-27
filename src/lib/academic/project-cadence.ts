/**
 * Two capstones a term, each built up to rather than dropped in.
 *
 * The generator has been producing one project per week. For an eight-week
 * term that is eight separate builds, none of which knows the others exist, and
 * a learner finishes the term with eight half-things instead of two finished
 * ones. It is also eight AI calls a class a term for work nobody asked for.
 *
 * The Academy's model is two capstones a term that build on each other. The
 * weeks between are not projectless — they are the run-up: the skills taught in
 * weeks 1 to 4 are what the mid-term capstone is made of, and the second
 * capstone extends the first rather than starting over.
 *
 * Scope follows the level, because "a project" means different things at six
 * and at seventeen. A Basic 1 capstone is half an hour with a partner. An SS 3
 * capstone runs for three weeks. Same cadence, very different build.
 */

export type LevelBand = 'basic' | 'jss' | 'ss';

export type CapstoneSlot = {
  /** Which week of the term the capstone is handed in. */
  week: number;
  /** 1 for the mid-term capstone, 2 for the end-of-term one. */
  index: 1 | 2;
  /** The weeks whose teaching this capstone is assembled from. */
  buildsOn: number[];
  /** True when this one extends the first rather than starting fresh. */
  extendsPrevious: boolean;
};

/**
 * Where the capstones land in a term of any length.
 *
 * Halfway and at the end. A term shorter than four weeks gets one capstone, at
 * the end — two in three weeks is not a build-up, it is the weekly cadence with
 * fewer weeks.
 */
export function capstoneSlots(totalWeeks: number): CapstoneSlot[] {
  const weeks = Math.max(0, Math.floor(totalWeeks));
  if (weeks <= 0) return [];

  if (weeks < 4) {
    return [
      {
        week: weeks,
        index: 1,
        buildsOn: range(1, weeks - 1),
        extendsPrevious: false,
      },
    ];
  }

  const mid = Math.floor(weeks / 2);
  return [
    { week: mid, index: 1, buildsOn: range(1, mid - 1), extendsPrevious: false },
    { week: weeks, index: 2, buildsOn: range(mid + 1, weeks - 1), extendsPrevious: true },
  ];
}

function range(from: number, to: number): number[] {
  const out: number[] = [];
  for (let n = from; n <= to; n += 1) out.push(n);
  return out;
}

/** The capstone handed in on this week, if this week is one. */
export function capstoneForWeek(week: number, totalWeeks: number): CapstoneSlot | null {
  return capstoneSlots(totalWeeks).find((slot) => slot.week === week) ?? null;
}

/**
 * Whether this meeting should receive a project row.
 *
 * A named class meeting (Prepare this week) always gets the package project.
 * An unattended bulk pass still writes only capstone hand-ins, so a term sweep
 * cannot mint eight unrelated builds.
 */
export function shouldWriteProjectForMeeting(input: {
  week: number;
  totalWeeks: number;
  targetedWeeks?: number[] | null;
}): boolean {
  if (Array.isArray(input.targetedWeeks) && input.targetedWeeks.length > 0) {
    return true;
  }
  return capstoneForWeek(input.week, input.totalWeeks) != null;
}

/**
 * Read the level from a class or plan name.
 *
 * Names are the only place the level reliably appears — "Gabus Basic · Young
 * Innov · Basic 5", "Key to Success · Teen Dev · SS 1-3". There is no level
 * column to read, and inventing one would be a migration to store what the name
 * already says. Unknown falls to basic, the gentlest scope, so a mis-read gives
 * a learner too little rather than a three-week build they cannot finish.
 */
export function levelBandFrom(name: string | null | undefined): LevelBand {
  const text = (name ?? '').toLowerCase();
  if (/\bss\b|senior|sss/.test(text)) return 'ss';
  if (/\bjss\b|junior|teen/.test(text)) return 'jss';
  return 'basic';
}

export type CapstoneScope = {
  band: LevelBand;
  /** How long the learner has, in teaching weeks. */
  spanWeeks: number;
  /** Minutes of class time, where it is a single sitting. */
  minutes: number | null;
  /** How they work. */
  grouping: 'pairs' | 'small groups' | 'individual';
  /** One line for the prompt, in the Academy's terms. */
  shape: string;
};

/**
 * What a capstone is, at each level.
 *
 * The second capstone of a term is larger than the first at every level: it has
 * the whole term behind it, not half of one.
 */
export function capstoneScope(band: LevelBand, index: 1 | 2): CapstoneScope {
  if (band === 'basic') {
    return {
      band,
      spanWeeks: 1,
      minutes: index === 1 ? 30 : 45,
      grouping: 'pairs',
      shape:
        index === 1
          ? 'One sitting of about 30 minutes, working in pairs. Something that runs and can be shown to the class the same day.'
          : 'One longer sitting of about 45 minutes, in pairs, extending what they built at mid-term rather than starting again.',
    };
  }

  if (band === 'jss') {
    return {
      band,
      spanWeeks: index === 1 ? 1 : 2,
      minutes: index === 1 ? 60 : null,
      grouping: 'small groups',
      shape:
        index === 1
          ? 'A single lesson of about an hour in small groups, finished and demonstrated within the week.'
          : 'A two-week build in small groups that adds real features to the mid-term project and is presented at the end of term.',
    };
  }

  return {
    band,
    spanWeeks: index === 1 ? 2 : 3,
    minutes: null,
    grouping: 'individual',
    shape:
      index === 1
        ? 'A two-week individual build with a working demonstration and a short written explanation of the design decisions.'
        : 'A three-week individual capstone that extends the mid-term build into something presentable — working software, a demonstration, and a written account of what was changed and why.',
  };
}
