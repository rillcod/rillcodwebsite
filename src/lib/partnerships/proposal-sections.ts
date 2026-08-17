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

export type Discipline = { name: string; body: string };

/** What a student actually learns, in the words the school's parents will use. */
export const DISCIPLINES: readonly Discipline[] = [
  { name: 'Artificial Intelligence & Machine Learning', body: 'From how a model recognises a face to training one of their own.' },
  { name: 'Coding & Robotics', body: 'Scratch and robotics kits in primary; Python, hardware and control systems by secondary.' },
  { name: 'Web & App Development', body: 'HTML, CSS and JavaScript through to a mobile app a student can hand to a parent.' },
  { name: 'UI/UX & Digital Design', body: 'Designing something someone else can use, then testing whether they actually can.' },
  { name: 'Data Science & Analysis', body: 'Reading data, questioning it, and presenting a finding that holds up.' },
  { name: 'Animation & Content Creation', body: 'The creative half of technology, and the one that keeps reluctant students in the room.' },
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
    phase: 'Demonstration',
    when: 'Week 1',
    body: 'A live AI and robotics session for your students, and a short presentation to leadership and the PTA. Nothing is signed before your parents have seen it.',
  },
  {
    phase: 'Preparation & launch',
    when: 'Week 2',
    body: 'Equipment set up, timetable slots agreed, your staff introduced to the curriculum, and student orientation. We tailor the scheme of work to your calendar, not ours.',
  },
  {
    phase: 'Delivery & growth',
    when: 'Every term after',
    body: 'Weekly sessions, termly capstone showcases for parents, progress reports per learner, and an annual curriculum review with your leadership.',
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
export const FIELD_PROOF: readonly string[] = [
  'First place, 2024 National Youth Coding Challenge.',
  'A solar-powered irrigation control system that won the regional hardware innovation prize.',
  'Environmental monitoring research presented at the inter-school science exhibition.',
] as const;

export type StudentCaseStudy = { title: string; ageGroup: string; outcome: string };

export const STUDENT_CASE_STUDIES: readonly StudentCaseStudy[] = [
  {
    title: 'Voice-Controlled Obstacle Avoiding Bot',
    ageGroup: 'Basic 4 - Basic 6',
    outcome: 'Learners assembled chassis, wired ultrasonic distance sensors, and wrote Scratch block code to guide movement.',
  },
  {
    title: 'Smart Solar Irrigation Monitor',
    ageGroup: 'JSS 1 - JSS 3',
    outcome: 'Students programmed microcontrollers with soil moisture sensors to automate greenhouse watering systems.',
  },
  {
    title: 'School Community Attendance & Notes Mobile App',
    ageGroup: 'SS 1 - SS 3',
    outcome: 'Senior students built, styled, and deployed a cross-platform mobile application using JavaScript and modern UI frameworks.',
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
   */
  mode: 'sections' | 'package' | 'uptake' | 'illustrative';
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
 * Returns null when there is nothing honest to compute — no roll, no fee, or no
 * share agreed. A projection built on a guessed headcount is a number we would
 * have to defend later.
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
