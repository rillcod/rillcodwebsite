/** Shared copy + options for special-programme / summer registration (kids + adults/individuals). */

export const SPECIAL_LEARNER_AGE_MIN = 8;
export const SPECIAL_LEARNER_AGE_MAX = 99;

export const SPECIAL_LEARNER_GRADE_OPTIONS = [
  'Basic 1–3',
  'Basic 4–6',
  'JSS1',
  'JSS2',
  'JSS3',
  'SS1',
  'SS2',
  'SS3',
  'University / NYSC',
  'Working professional',
  'Adult / Individual learner',
  'Other',
] as const;

export function defaultSpecialAgesLabel(ageMin = SPECIAL_LEARNER_AGE_MIN, ageMax = SPECIAL_LEARNER_AGE_MAX): string {
  if (ageMax >= 65) return `Ages ${ageMin}+ · Kids, teens & adults`;
  return `Ages ${ageMin} – ${ageMax}`;
}

/** Suggested next programme after a special/summer cohort (for parents + individuals). */
export function suggestNextProgramme(age: number | null | undefined, gradeOrBand?: string | null): {
  programme: string;
  note: string;
} {
  const g = (gradeOrBand || '').toLowerCase();
  const isAdultBand =
    /adult|individual|university|nysc|working|professional|other/.test(g) ||
    (typeof age === 'number' && age >= 18);

  if (isAdultBand) {
    return {
      programme: 'Teen Developers → Web, Data/AI, UI/UX, or Full-Stack (by goal)',
      note: 'Adults and individual learners are welcome. After this cohort, pick a specialist track that matches your goal — Web, Data/AI, Design, Robotics, or Entrepreneurship — or continue with Teen Developers foundations if you are new to code.',
    };
  }

  if (typeof age === 'number' && age <= 10) {
    return {
      programme: 'Young Innovators',
      note: 'Best next step for younger learners: playful coding, Scratch, and digital creativity — then Teen Developers.',
    };
  }

  if (/basic\s*[1-3]|pry|primary/.test(g) || (typeof age === 'number' && age < 11)) {
    return {
      programme: 'Young Innovators',
      note: 'Continue into Young Innovators for term classes, then progress to Teen Developers.',
    };
  }

  return {
    programme: 'Teen Developers',
    note: 'Recommended next step for most teens: Python, web, and projects — then choose Web, AI, Design, or Robotics.',
  };
}

export const AFTER_COHORT_BANNER = {
  heading: 'After this cohort',
  body:
    'Kids, teens, adults, and individual learners are all welcome. When the cohort ends we help you matriculate into the right Rillcod programme — Young Innovators or Teen Developers for school-age learners, and specialist tracks (Web, Data/AI, UI/UX, Full-Stack, and more) for older teens and adults.',
};
