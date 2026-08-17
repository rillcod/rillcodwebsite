/**
 * The authored marketing content of a proposal, and the maths behind its one
 * tailored claim.
 *
 * These are the sections the old four-page deck carried and the data-driven
 * template had lost: the disciplines we teach, how a rollout actually goes, why
 * a school should move now, and what we have to show for the work so far. They
 * are authored constants rather than generated text for the same reason
 * AUTHORED_NARRATIVE is — a proposal must read identically for every prospect
 * unless somebody deliberately changed it.
 *
 * `schoolUpside` is the exception and the point: it is the only figure on the
 * page derived from the recipient's own roll, which is what makes the document
 * a quote for them rather than a brochure.
 */

/** Where to drop classroom photography, and what the gallery will render. */
export const PARTNERSHIP_PHOTO_DIR = 'public/images/EVENTS/';

/**
 * Photographs of the programme running, shown as a proof strip on the last page.
 *
 * These six are the house selection, chosen for real rooms, real work on the
 * screens and students in uniform. The gallery renders nothing when the list is
 * empty, so a proposal can never go out with a broken image box where the
 * evidence should be. The studio can override the choice per proposal; these are
 * what prints when nobody does. Files live in `public/images/EVENTS/`.
 */
export const PARTNERSHIP_PHOTOS: readonly string[] = [
  '/images/EVENTS/WhatsApp Image 2026-08-14 at 7.30.02 PM.jpeg',
  '/images/EVENTS/WhatsApp Image 2026-08-14 at 7.30.02 PM (1).jpeg',
  '/images/EVENTS/WhatsApp Image 2026-08-14 at 7.30.03 PM (1).jpeg',
  '/images/EVENTS/WhatsApp Image 2026-08-14 at 7.30.00 PM (1).jpeg',
  '/images/EVENTS/WhatsApp Image 2026-08-14 at 7.29.59 PM (1).jpeg',
  '/images/EVENTS/WhatsApp Image 2026-08-14 at 7.29.57 PM.jpeg',
];

/**
 * The seventh frame, for the money page only: a class running, code on the board.
 *
 * The other six already prove the programme on the close. This one sits next
 * to the figures so a proprietor sees what a parent would be paying for —
 * a facilitator teaching coding and AI, not a robotics kit on a desk.
 * Not one of the gallery six.
 */
export const REASON_TO_PAY_PHOTO =
  '/images/EVENTS/WhatsApp Image 2026-08-14 at 7.30.03 PM.jpeg';

export type Discipline = { name: string; body: string };

/** What a student actually learns, in the words a parent will repeat. */
export const DISCIPLINES: readonly Discipline[] = [
  { name: 'Artificial Intelligence', body: 'They train a model on pictures they took themselves — then show a parent what it recognised. That is the conversation at the next open day.' },
  { name: 'Coding', body: 'Scratch in primary; Python and JavaScript by secondary. Every session they write something that runs, and they can open it on the spot.' },
  { name: 'Web & App Development', body: 'A site or an app a parent can hold on their phone. The prospectus claim, made visible.' },
  { name: 'Data Science & Analysis', body: 'They take numbers from their own school, question them, and present a finding that holds up.' },
  { name: 'UI/UX & Digital Design', body: 'Designing something someone else can use — then watching whether they actually can.' },
  { name: 'Making it real', body: 'The model they trained, moving something they can hold. The moment a parent stops asking whether this is still computer studies.' },
] as const;

export type RolloutPhase = { phase: string; when: string; body: string };

/**
 * How a rollout actually runs.
 *
 * The single biggest objection from a head teacher is not price, it is
 * disruption. Naming the weeks answers it before it is asked.
 */
export const ROLLOUT_PHASES: readonly RolloutPhase[] = [
  {
    phase: 'Your parents see it',
    when: 'Week 1',
    body: 'A live session for your students, with leadership and the PTA in the room. They leave asking when it starts. You have not signed anything yet.',
  },
  {
    phase: 'It is on the timetable',
    when: 'Week 2',
    body: 'Kits in, slot agreed, your staff introduced. We fit your calendar — including examination weeks. Your teachers do not take this on.',
  },
  {
    phase: 'Parents bring a neighbour',
    when: 'Every term after',
    body: 'Weekly sessions, a termly showcase families can attend, a written report per child, and a review with your leadership once a year.',
  },
] as const;

export const WHY_NOW: readonly string[] = [
  'AI has stopped being a specialism and become general literacy — the way spreadsheets did.',
  'Parents are actively comparing schools on tech offerings, and asking questions competitor schools are already answering.',
  'The schools that move first hold the reputation locally; the ones that follow are simply matching an expectation.',
  // Not "accredited": no body accredits this curriculum, and the claim was
  // removed from the outreach copy for the same reason.
  'Every term spent deciding is a cohort of students graduating without a portfolio to show.',
] as const;

/**
 * What Rillcod guarantees the school: Zero CapEx, full delivery, zero operational burden.
 */
/**
 * What we commit to that is not said anywhere else in the document.
 *
 * This list used to have four entries and three of them were already made,
 * better, on earlier pages: "zero equipment cost" restated the benefits page's
 * "No capital outlay, and no idle laboratory" and then the scope-of-supply
 * table restated it a third time; "Dedicated Certified Instructors" restated
 * "Specialists teach it"; "Automated Parent Portals" restated "Evidence your
 * admissions team can show". A proprietor reading the same promise three times
 * in three registers does not conclude it is three promises — they conclude
 * the document is padded.
 *
 * What survives is the part that was buried inside those repetitions and said
 * nowhere else: that there is a named person accountable for the programme, and
 * that the timetable work is planned around the national examination calendar.
 * Those are commitments a head teacher can hold us to, which is what makes them
 * worth printing.
 *
 * A third — that we replace and insure hardware that is dropped, worn out or
 * stolen — was written and then removed. It reads well and it is an open-ended
 * liability against every kit in every partner school. A promise printed in a
 * contract is one somebody will eventually present back; this list carries only
 * the ones we mean to honour.
 */
export const ZERO_CAPEX_PROMISE = [
  {
    title: 'A named person accountable for it',
    body: 'Facilitators are vetted and reference-checked before they enter a classroom, and one named programme coordinator owns your school. You escalate to a person, not an inbox.',
  },
  {
    title: 'Planned around your examinations',
    body: 'Sessions are timetabled around your existing calendar and around the national examination periods, so nothing we run competes with WAEC, NECO or your internal examination weeks.',
  },
] as const;

/**
 * Traditional ICT vs. Modern STEM & Robotics Ecosystem.
 */
export const TRADITIONAL_VS_RILLCOD = [
  /*
    Claim the strength, not the whole field.

    This read "AI neural nets, physical robotics" and promised "working robots"
    as a standard outcome. Coding and applied AI are what we teach every week
    and can evidence; the robotics side is real but young, and a proprietor who
    signs expecting a robotics laboratory and meets a coding programme with
    hardware in it will feel sold to — which costs the renewal and the referral,
    both worth more than the signature.

    "Neural nets" went for the same reason: what a JSS learner actually does is
    train and test a model on their own data, which is a truer sentence and a
    more impressive one to a parent who understands it.
  */
  {
    area: 'Curriculum Focus',
    traditional: 'Basic typing, MS Word, and passive theory.',
    rillcod: 'Hands-on coding, applied AI, and hardware projects that make the code real.',
  },
  {
    area: 'Student Outcomes',
    traditional: 'Written exams with no tangible portfolio.',
    rillcod: 'Live websites, working apps and trained AI models, demonstrated at a termly expo.',
  },
  {
    area: 'Parent Perception',
    traditional: 'Taken for granted, and rarely mentioned.',
    rillcod: 'Something a parent asks about at an open day, and repeats to another parent.',
  },
  {
    area: 'School Revenue',
    traditional: 'Pure operational cost centre.',
    // No percentage here. The share is negotiated per school and lives in
    // partnership_terms; a hardcoded 30% told every school with a different
    // deal something untrue, on the page that argues we are worth it.
    rillcod: 'A revenue-sharing line rather than a cost line, settled every term.',
  },
] as const;

/**
 * What the programme has produced, as published on rillcod.com.
 *
 * Keep this in step with the site: it is the same claim in two places, and a
 * prospect who checks should find them agreeing.
 */
/**
 * What our learners have done, with the learner left in the sentence.
 *
 * These read as a list of prizes: "First place, 2024 National Youth Coding
 * Challenge." A trophy with nobody holding it. The student had been edited out
 * of every line, and the student is the entire point — a head teacher is not
 * buying a prize, they are buying the possibility that one of theirs does this.
 *
 * Same three facts, nothing added that we cannot stand behind. What changed is
 * who is doing the verb, and how hard the verb works: "won" rather than "took
 * first place at", "built" and "took" rather than "that won". Short verbs with
 * a student in front of them are what a confident teacher sounds like.
 */
export const FIELD_PROOF: readonly string[] = [
  'Our students won the 2024 National Youth Coding Challenge — from an ordinary classroom, not a laboratory.',
  'Our students built a solar-powered irrigation controller. It took the regional hardware prize.',
  'Our learners presented their own environmental research at the inter-school exhibition.',
] as const;

/*
  There is no separate lede above this list.

  The point a proprietor needs — that none of it required a laboratory they do
  not have — was worth a sentence but not a paragraph: page two had 21px of
  clearance, and a paragraph costs fifty. It now qualifies the first achievement
  from inside it, which is a better place for it anyway. A caveat attached to
  the evidence is stronger than one announced before it.
*/

export type StudentCaseStudy = { title: string; ageGroup: string; outcome: string };

export const STUDENT_CASE_STUDIES: readonly StudentCaseStudy[] = [
  {
    title: 'Voice-told stories and a first trained model',
    ageGroup: 'Basic 4 - Basic 6',
    outcome: 'Learners write Scratch programmes that respond to speech, then train a small classifier on pictures they took themselves.',
  },
  {
    title: 'Python that reads a classroom’s own data',
    ageGroup: 'JSS 1 - JSS 3',
    outcome: 'Students write Python to chart real numbers from the school, and put a finding on a page a parent can open.',
  },
  {
    title: 'A school app the community can actually use',
    ageGroup: 'SS 1 - SS 3',
    outcome: 'Senior students build, style and ship a web or mobile product — attendance, notes, or a showcase of the year’s work.',
  },
] as const;

export type UpsideRow = {
  label: string;
  students: number;
  gross: number;
  schoolShare: number;
  /** The agreed rate for this row, where the row has one of its own. */
  rate?: number | null;
};

export type SchoolUpside = {
  rows: UpsideRow[];
  /** Present for a section breakdown: the rows added up. */
  total?: UpsideRow | null;
  /**
   * How the rows should be read.
   *   sections — each section at its own agreed rate, then added
   *   package  — one agreed price for the school
   *   uptake   — one rate, shown at three levels of take-up
   *   menu     — one row per standard option, because none has been picked
   */
  mode: 'sections' | 'package' | 'uptake' | 'illustrative' | 'menu';
  feePerStudent: number;
  sharePercent: number;
  cycle: string;
};

/**
 * What the programme is worth to the school, worked from its own roll.
 *
 * Three uptake levels rather than one, because a single confident number is the
 * one a head teacher disbelieves. The arithmetic is deliberately shown so they
 * can redo it with their own assumption.
 *
 * Returns null when there is nothing honest to compute — no fee, no share, and
 * no menu of options to compare. A missing roll is not a refusal: the page then
 * shows common school sizes, or each option at a round headcount of 200.
 */
export function schoolUpside(input: {
  roll: number;
  feePerStudent: number;
  sharePercent: number;
  cycle?: string;
  /**
   * A single agreed price for the whole school. When set, uptake scenarios are
   * not shown: a fixed package does not change with how many students enrol, so
   * three rows of "what if fewer join" would be three copies of one number.
   */
  fixedPackage?: number | null;
  /**
   * Sections priced separately — primary at one rate, secondary at another.
   *
   * Shown as they are agreed and then added, never blended into an average
   * per-head figure. A school that agreed ₦15,000 for primary and ₦25,000 for
   * secondary should read those two numbers in its own proposal, not a third
   * one it has never seen that happens to sit between them.
   */
  sections?: ReadonlyArray<{ label: string; count: number; rate: number }> | null;
  /**
   * The whole menu, when no option has been picked.
   *
   * Without this the money page silently priced Option A (the first catalogue
   * row) and called it the school's return — the same drift as a quote that
   * prints SS 3 on an Option A that stops at SS 2.
   */
  menuOffers?: ReadonlyArray<{ code: string; priceFrom: number }> | null;
}): SchoolUpside | null {
  const roll = Math.floor(Number(input.roll) || 0);
  const fee = Number(input.feePerStudent) || 0;
  const share = Number(input.sharePercent) || 0;
  const pkg = Number(input.fixedPackage) || 0;
  const cycle = input.cycle || 'term';

  const sections = (input.sections ?? []).filter(
    (s) => Number(s.count) > 0 && Number(s.rate) > 0,
  );
  if (sections.length && share > 0) {
    // The share is taken on each section and the results added. That is the
    // same total as taking it on the sum, and it is the version a school can
    // check line by line.
    const rows: UpsideRow[] = sections.map((s) => {
      const gross = Math.round(Number(s.count) * Number(s.rate));
      return {
        label: s.label || `${s.count} students`,
        students: Math.round(Number(s.count)),
        rate: Number(s.rate),
        gross,
        schoolShare: Math.round((gross * share) / 100),
      };
    });
    return {
      rows,
      total: {
        label: 'Total',
        students: rows.reduce((n, r) => n + r.students, 0),
        rate: null,
        gross: rows.reduce((n, r) => n + r.gross, 0),
        schoolShare: rows.reduce((n, r) => n + r.schoolShare, 0),
      },
      mode: 'sections',
      feePerStudent: 0,
      sharePercent: share,
      cycle,
    };
  }

  if (pkg > 0 && share > 0) {
    return {
      rows: [
        {
          label: 'Agreed package',
          students: roll,
          rate: null,
          gross: pkg,
          schoolShare: Math.round((pkg * share) / 100),
        },
      ],
      total: null,
      mode: 'package',
      feePerStudent: 0,
      sharePercent: share,
      cycle: input.cycle || 'term',
    };
  }

  const menu = (input.menuOffers ?? []).filter((o) => Number(o.priceFrom) > 0);
  if (menu.length && share > 0) {
    const students = roll > 0 ? roll : 200;
    return {
      rows: menu.map((o) => {
        const rate = Number(o.priceFrom);
        const gross = students * rate;
        return {
          label: `Option ${o.code}`,
          students,
          rate,
          gross,
          schoolShare: Math.round((gross * share) / 100),
        };
      }),
      total: null,
      mode: 'menu',
      feePerStudent: 0,
      sharePercent: share,
      cycle,
    };
  }

  /**
   * No roll on file — which is most of them.
   *
   * Nineteen of twenty-nine schools have no `student_count`, and returning null
   * here emptied the money page down to a single obligations table: the one page
   * a head teacher rereads, blank, on the proposal meant to persuade them. Three
   * common school sizes are shown instead, labelled as illustrative, with the
   * arithmetic visible so they can find their own number in it.
   */
  if (roll <= 0 && fee > 0 && share > 0) {
    return {
      rows: [100, 200, 300].map((students) => {
        const gross = students * fee;
        return {
          label: `A school of ${students}`,
          students,
          rate: fee,
          gross,
          schoolShare: Math.round((gross * share) / 100),
        };
      }),
      total: null,
      mode: 'illustrative',
      feePerStudent: fee,
      sharePercent: share,
      cycle,
    };
  }

  if (roll <= 0 || fee <= 0 || share <= 0) return null;

  const scenarios: Array<{ label: string; rate: number }> = [
    { label: 'Cautious start', rate: 0.4 },
    { label: 'Typical uptake', rate: 0.7 },
    { label: 'Whole school', rate: 1 },
  ];

  const rows = scenarios.map(({ label, rate }) => {
    const students = Math.max(1, Math.round(roll * rate));
    const gross = students * fee;
    return {
      label,
      students,
      rate: fee,
      gross,
      schoolShare: Math.round((gross * share) / 100),
    };
  });

  // No total here: these are three versions of the same term, not three things
  // that happen and add up.
  return { rows, total: null, mode: 'uptake', feePerStudent: fee, sharePercent: share, cycle };
}
