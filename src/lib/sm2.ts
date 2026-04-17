// SM-2 Spaced Repetition Algorithm
// quality: 0-5 scale (0=blackout, 5=perfect)

export interface SM2State {
  repetitions: number;
  intervalDays: number;
  easeFactor: number;
}

export interface SM2Result extends SM2State {
  nextReviewAt: string; // ISO string
}

export function sm2(state: SM2State, quality: number): SM2Result {
  const MIN_EASE = 1.3;
  let { repetitions, intervalDays, easeFactor } = state;

  if (quality < 3) {
    // Failed — reset
    repetitions = 0;
    intervalDays = 1;
  } else {
    // Passed
    if (repetitions === 0) {
      intervalDays = 1;
    } else if (repetitions === 1) {
      intervalDays = 6;
    } else {
      intervalDays = Math.max(1, Math.round(intervalDays * easeFactor));
    }
    repetitions += 1;
    // Update ease factor
    easeFactor = Math.max(
      MIN_EASE,
      easeFactor + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02))
    );
  }

  const nextReviewAt = new Date(Date.now() + intervalDays * 24 * 60 * 60 * 1000).toISOString();
  return { repetitions, intervalDays, easeFactor, nextReviewAt };
}
