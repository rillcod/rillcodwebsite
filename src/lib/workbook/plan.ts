/**
 * What a workbook is made of, and what it costs to print.
 *
 * The book predates this application: schools used to be handed a printed
 * activity book, and the argument for bringing it back is that a child who
 * takes something home has something to show a parent, which is the whole
 * admissions case the proposal makes.
 *
 * Two facts shape every decision here, and they come from the printer:
 *
 *   a colour page costs about ₦80, and a one-colour page about ₦40.
 *
 * Mono being exactly half means the lever is not how many pages there are, it
 * is which pages are in colour. That happens to line up with how a workbook is
 * actually used: a child *writes on* most of it and *looks at* a few pages of
 * it. So colour goes to the pages nobody writes on — the cover, the concept
 * spreads, the gallery of things they will build — and everything worked in is
 * one colour, where pencil reads better anyway.
 *
 * The consequence worth stating out loud: a mono page must be *designed* in
 * greyscale, not designed in colour and printed grey. A page that needs a red
 * arrow to make sense is a page that fails at ₦40. `assertMonoSafe` in
 * `greyscale.ts` enforces that rather than trusting it.
 */
import type { ProgressionLevel } from '@/lib/partnerships/curriculum';

/** What the printer charges, per page, in naira. */
export const PRINT_COST = {
  colour: 80,
  mono: 40,
  /**
   * Binding and trim per copy. Not yet quoted, so it is named and carried
   * rather than folded silently into a page rate — a costing that hides its own
   * assumption is how a book gets priced below what it costs to make.
   */
  bindingEstimate: 400,
} as const;

export type PageInk = 'colour' | 'mono';

export type WorkbookPageKind =
  | 'cover-front'
  | 'cover-inside-front'
  | 'cover-inside-back'
  | 'cover-back'
  | 'journey'
  | 'concept'
  | 'gallery'
  | 'term-opener'
  | 'session'
  | 'capstone'
  | 'portfolio'
  | 'glossary';

export type WorkbookPage = {
  kind: WorkbookPageKind;
  ink: PageInk;
  /** Which term this page belongs to, where that means anything. */
  term?: number;
  /** Teaching week within the term, for session pages. */
  session?: number;
  title: string;
};

export type WorkbookPlan = {
  grade: string;
  theme: string;
  yearNumber: number;
  /** Sessions a week the school bought. The book is as long as the teaching is. */
  sessionsPerWeek: 1 | 2;
  pages: WorkbookPage[];
  cost: WorkbookCost;
};

export type WorkbookCost = {
  colourPages: number;
  monoPages: number;
  colourCost: number;
  monoCost: number;
  bindingCost: number;
  /** What one copy costs to put in a child's hands. */
  perCopy: number;
};

/**
 * How many teaching weeks a term actually has.
 *
 * Nigerian terms run twelve to fourteen weeks; the last is usually revision and
 * examinations. Twelve is the number that survives a term with a mid-term break
 * and a public holiday in it, and a workbook with pages nobody reaches is worse
 * than one that runs out — the empty pages are the evidence a parent sees.
 */
export const TEACHING_WEEKS_PER_TERM = 12;
export const TERMS_PER_SESSION = 3;

/**
 * The pages that are in colour, and nothing else is.
 *
 * Eight, deliberately: it is one printer's signature, so it is bound in as a
 * block rather than scattered, which is both cheaper and the reason the colour
 * pages sit together in the middle of the finished book.
 */
export const COLOUR_SIGNATURE_PAGES = 8;

function coverPages(grade: string): WorkbookPage[] {
  return [
    { kind: 'cover-front', ink: 'colour', title: `${grade} Workbook` },
    { kind: 'cover-inside-front', ink: 'colour', title: 'How this book works' },
    { kind: 'cover-inside-back', ink: 'colour', title: 'My portfolio' },
    { kind: 'cover-back', ink: 'colour', title: 'What I built this year' },
  ];
}

/** The eight pages a child looks at rather than writes on. */
function colourSignature(level: ProgressionLevel): WorkbookPage[] {
  const pages: WorkbookPage[] = [
    { kind: 'journey', ink: 'colour', title: `Your year: ${level.theme}` },
    { kind: 'concept', ink: 'colour', title: 'What is a computer?' },
    { kind: 'concept', ink: 'colour', title: 'What is artificial intelligence?' },
    { kind: 'concept', ink: 'colour', title: 'Inside the machine' },
  ];
  for (const term of level.terms.slice(0, TERMS_PER_SESSION)) {
    pages.push({
      kind: 'gallery',
      ink: 'colour',
      term: term.term,
      title: `Term ${term.term}: what you will build`,
    });
  }
  // The capstone earns the last colour page: it is the thing the whole year
  // points at, and the one a parent is shown at the end of it.
  pages.push({
    kind: 'gallery',
    ink: 'colour',
    title: level.capstone ? `Your big build: ${level.capstone}` : 'Your big build',
  });
  return pages.slice(0, COLOUR_SIGNATURE_PAGES);
}

/**
 * The interior: one page per teaching session, plus what frames them.
 *
 * Length follows the cadence the school actually bought. One class a week over
 * three twelve-week terms is thirty-six sessions; two classes a week is
 * seventy-two, and a book sized for one would run out in February.
 */
function interiorPages(level: ProgressionLevel, sessionsPerWeek: 1 | 2): WorkbookPage[] {
  const pages: WorkbookPage[] = [];
  const terms = level.terms.slice(0, TERMS_PER_SESSION);

  for (const term of terms) {
    pages.push({
      kind: 'term-opener',
      ink: 'mono',
      term: term.term,
      title: `Term ${term.term}`,
    });

    const sessions = TEACHING_WEEKS_PER_TERM * sessionsPerWeek;
    for (let s = 1; s <= sessions; s += 1) {
      pages.push({
        kind: 'session',
        ink: 'mono',
        term: term.term,
        session: s,
        title: `Week ${Math.ceil(s / sessionsPerWeek)}${sessionsPerWeek === 2 ? ` · Class ${((s - 1) % 2) + 1}` : ''}`,
      });
    }

    pages.push({
      kind: 'capstone',
      ink: 'mono',
      term: term.term,
      title: `Term ${term.term} build`,
    });
  }

  pages.push({ kind: 'glossary', ink: 'mono', title: 'Words I learned' });
  pages.push({ kind: 'portfolio', ink: 'mono', title: 'My portfolio log' });
  return pages;
}

export function costWorkbook(pages: WorkbookPage[]): WorkbookCost {
  const colourPages = pages.filter((p) => p.ink === 'colour').length;
  const monoPages = pages.length - colourPages;
  const colourCost = colourPages * PRINT_COST.colour;
  const monoCost = monoPages * PRINT_COST.mono;
  return {
    colourPages,
    monoPages,
    colourCost,
    monoCost,
    bindingCost: PRINT_COST.bindingEstimate,
    perCopy: colourCost + monoCost + PRINT_COST.bindingEstimate,
  };
}

/**
 * The whole book for one year group, from the published curriculum row.
 *
 * Nothing here is invented: the theme, the three termly focuses, the capstone
 * and the portfolio target all come from `curriculum_progression_levels`. One
 * row is one book, which is why this can be generated at all rather than
 * written twelve times.
 */
export function planWorkbook(level: ProgressionLevel, sessionsPerWeek: 1 | 2 = 1): WorkbookPlan {
  const pages = [
    ...coverPages(level.grade),
    ...colourSignature(level),
    ...interiorPages(level, sessionsPerWeek),
  ];

  return {
    grade: level.grade,
    theme: level.theme,
    yearNumber: level.year_number,
    sessionsPerWeek,
    pages,
    cost: costWorkbook(pages),
  };
}

/** "₦3,240" — the same money formatting the partnership documents use. */
export function money(amount: number): string {
  return `₦${Math.round(amount).toLocaleString('en-NG')}`;
}
