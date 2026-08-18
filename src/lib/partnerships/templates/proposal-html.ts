/**
 * The partnership proposal, rendered from stored data.
 *
 * Replaces the HTML that lived inside build_proposal_with_cover_and_curriculum.py,
 * where the school name, the price and the twelve-year ladder were all string
 * literals — which is why the same ladder could not be shown anywhere else in
 * the platform, and why seventeen MoU PDFs on a Desktop each encode their price
 * in the filename.
 *
 * Everything here comes from three sources and none of it is typed twice:
 *   school      → the schools row
 *   curriculum  → the published progression edition
 *   offers      → PARTNERSHIP_OFFERS, or the school's agreed terms once signed
 *
 * Print-ready A4. Rendered in an iframe for preview and printed to PDF through
 * the same browser path the school invoice already uses, so there is no headless
 * Edge and no Desktop.
 */
import { brandAssets, brandContact } from '@/config/brand';
import { SIGNATURE_SLOT_END, SIGNATURE_SLOT_START, escapeHtml as esc } from '../signing';
import { assetUrl } from './asset-url';
import type { CurriculumProgression, ProgressionLevel } from '../curriculum';
import { levelsForQuote, splitByStage, gradeRange, type CurriculumStage } from '../curriculum';
import {
  PARTNERSHIP_OFFERS,
  offerPriceLabel,
  resolveOffer,
  type PartnershipOffer,
} from '../offers';
import { AUTHORED_NARRATIVE, type ProposalNarrative } from '../proposal-narrative';
import { approx, type ProofPoints } from '../proof-points';
import {
  DISCIPLINES,
  FIELD_PROOF,
  ROLLOUT_PHASES,
  WHY_NOW,
  ZERO_CAPEX_PROMISE,
  TRADITIONAL_VS_RILLCOD,
  REASON_TO_PAY_PHOTO,
  type SchoolUpside,
} from '../proposal-sections';
import { describeTerms, type PartnershipTerms } from '../terms';
// The same five answers the public portal gives, so the sheet a board reads
// offline cannot say something different from the link a head teacher opened.
import { PROPRIETOR_FAQS } from '../faqs';
import { defaultStudioConfig, type ProposalStudioConfig } from '../studio-config';

export type ProposalInput = {
  school: { name: string; address?: string | null; city?: string | null; state?: string | null };
  curriculum: CurriculumProgression | null;
  /** Omitted for a cold proposal; present once a rate has been agreed. */
  agreedTerms?: PartnershipTerms | null;
  offers?: readonly PartnershipOffer[];
  /** Reference shown on the cover, e.g. RC-PROP-0007. */
  reference: string;
  dateLabel: string;
  /**
   * Deliberately absent. The masthead and the footer both name the company, so
   * a third "Prepared by Rillcod Technologies" only orphaned a fifth item onto
   * its own row and broke the meta line.
   */
  /**
   * The persuasive copy. Defaults to the authored house pitch, so a caller that
   * knows nothing about narratives still renders a complete proposal.
   */
  narrative?: ProposalNarrative;
  /**
   * Trim the curriculum to the years an offer actually covers, so a quote for
   * "Basic 1 through SS 2" does not print a year it is not selling.
   */
  scopeToOffer?: string | null;
  /**
   * Why this option, in one sentence, printed under the recommendation.
   *
   * Absent when a person picked the option themselves — the document then says
   * what it is showing rather than claiming a reasoning nobody performed.
   */
  recommendationReason?: string | null;
  /**
   * Quote the primary half, the secondary half, or all twelve years. A primary
   * school has no use for the SS years, and reading them says we did not look.
   */
  stage?: CurriculumStage | null;
  /**
   * How long the quoted fees stand, e.g. "12 November 2026".
   *
   * A price with no expiry is a price forever: a school that returns eighteen
   * months later is holding a quote nobody meant to still honour, and the fees
   * here are the ones the MoU and then the invoice inherit.
   */
  validUntilLabel?: string | null;
  /**
   * Our own footprint, counted at issue time. Omitted rather than faked: the
   * band only prints when the numbers came back.
   */
  proof?: ProofPoints | null;
  /** What the programme is worth to this school, from its own roll. */
  upside?: SchoolUpside | null;
  /**
   * Six digits a reader can type at /p when the link is lost.
   *
   * Printed on the document because that is where somebody looks when the
   * email has gone. Never the reference: that is sequential and public.
   */
  accessCode?: string | null;
  /**
   * A QR of the private link, so a printed page is a tap rather than typing.
   * Null when the document has not been issued yet and has no link.
   */
  accessQrDataUrl?: string | null;
  /** Preview: draw the scan card at full size, with no code behind it yet. */
  accessPending?: boolean;
  /** Classroom photography. Empty renders no gallery rather than empty frames. */
  photos?: readonly string[];
  /**
   * What the studio decided this school should see, and in whose words.
   * Absent means the complete document, which is what every caller that
   * predates the studio expects.
   */
  studio?: ProposalStudioConfig | null;
};

const TERM_NAMES = ['', '1st Term', '2nd Term', '3rd Term'];

function yearCard(level: ProgressionLevel): string {
  const terms = level.terms
    .map(
      (t) => `
        <div class="term">
          <div class="term-name">${esc(TERM_NAMES[t.term] || `Term ${t.term}`)}</div>
          <div class="term-focus">${esc(t.focus)}</div>
        </div>`,
    )
    .join('');

  const foot = [
    level.capstone ? `<div><span class="foot-lbl">Capstone</span> ${esc(level.capstone)}</div>` : '',
    level.portfolio ? `<div><span class="foot-lbl">Portfolio</span> ${esc(level.portfolio)}</div>` : '',
  ]
    .filter(Boolean)
    .join('');

  return `
    <article class="year">
      <header class="year-head">
        <span class="year-title">Year ${level.year_number} — ${esc(level.theme)}</span>
        <span class="year-grade">${esc(level.grade)}</span>
      </header>
      <div class="terms">${terms}</div>
      ${foot ? `<footer class="year-foot">${foot}</footer>` : ''}
    </article>`;
}

/**
 * Roughly how tall a year card prints, in pixels at A4 width.
 *
 * The cards sit two to a row inside a 184mm column, so each is about 340px wide
 * and each of its three term columns about 95px — which at 10pt holds roughly
 * thirteen characters before it wraps. The capstone and portfolio lines run the
 * width of the card, so about forty.
 *
 * An estimate is enough, and it is the only measurement available: this runs in
 * a template on a server, with no browser to ask. It only has to be right about
 * which cards are tall, because that is what decides how many share a sheet.
 */
function yearCardHeight(level: ProgressionLevel): number {
  const lines = (text: string, perLine: number) =>
    Math.max(1, Math.ceil((text || '').trim().length / perLine));

  // Two lines of theme are reserved in every header, so it is a floor not a sum.
  const head = Math.max(50, 20 + lines(`Year ${level.year_number} — ${level.theme ?? ''}`, 34) * 17);
  const term = Math.max(...(level.terms ?? []).map((t) => lines(String(t.focus ?? ''), 13)), 1);
  const terms = 22 + 18 + term * 17;
  const foot =
    16 +
    (level.capstone ? lines(String(level.capstone), 40) * 17 : 0) +
    (level.portfolio ? lines(String(level.portfolio), 40) * 17 : 0);
  return head + terms + foot;
}

/**
 * How many year-cards share a sheet, decided by what is written on them.
 *
 * This was a fixed six, chosen against a curriculum whose rows were short. Rows
 * are typed by a person: a theme reaches a phrase, a capstone reaches a
 * sentence, and six of those run 100mm past A4 — which used to be clipped away
 * and now would spill onto a second sheet mid-grid. Neither is a document you
 * would send.
 *
 * So the sheet is filled rather than counted. Cards are laid two to a row, rows
 * are added while the room lasts, and the count falls out of the content: six
 * short years, four long ones. Chunks are evened out afterwards, because five
 * years on one sheet and one on the next reads as a mistake.
 */
function chunkLevels(levels: ProgressionLevel[], size?: number): ProgressionLevel[][] {
  if (!levels.length) return [];
  if (size) {
    const fixed: ProgressionLevel[][] = [];
    for (let i = 0; i < levels.length; i += size) fixed.push(levels.slice(i, i + size));
    return fixed;
  }

  // A4 less its margins and the running head, less the heading block that only
  // the first sheet of a pathway carries.
  const ROOM_FIRST = 800;
  const ROOM_REST = 960;
  const ROW_GAP = 10;

  const rows: Array<{ levels: ProgressionLevel[]; height: number }> = [];
  for (let i = 0; i < levels.length; i += 2) {
    const pair = levels.slice(i, i + 2);
    rows.push({ levels: pair, height: Math.max(...pair.map(yearCardHeight)) });
  }

  const sheets: ProgressionLevel[][] = [];
  let current: ProgressionLevel[] = [];
  let used = 0;
  for (const row of rows) {
    const room = sheets.length === 0 ? ROOM_FIRST : ROOM_REST;
    const next = used + row.height + (current.length ? ROW_GAP : 0);
    if (current.length && next > room) {
      sheets.push(current);
      current = [...row.levels];
      used = row.height;
      continue;
    }
    current.push(...row.levels);
    used = next;
  }
  if (current.length) sheets.push(current);

  // A trailing sheet of one or two years is not rebalanced — six years split
  // four-and-two either way round. It is laid out differently instead: two cards
  // take the full width of the sheet rather than sitting in one half of a grid
  // built for six. See `years-stack`, which the stylesheet already carried.
  return sheets;
}

/**
 * The sentence that sells the ladder before the years begin.
 *
 * A page of six year-cards is a catalogue. One line that names where a child
 * starts and what they walk out holding is the story a proprietor retells.
 */
function pathwayHook(levels: ProgressionLevel[]): string {
  const first = levels[0];
  const last = levels[levels.length - 1];
  if (!first) return '';
  if (!last || first === last) {
    return `${first.grade} is a year of ${first.theme} — they leave with ${first.capstone || 'a build a parent can see'}.`;
  }
  return `From ${first.grade} to ${last.grade}: they begin with ${first.theme}, and they finish having shipped ${last.capstone || last.theme} — each year a thing they keep, not a grade on a sheet.`;
}

/**
 * One option, as a card.
 *
 * This was a four-column table. At readable body type the "best for" column
 * collapsed to roughly one word per line and the whole thing became a puzzle —
 * four columns simply do not fit across A4 once the type is large enough to
 * read comfortably. A card gives each option the full width and puts the price
 * where the eye lands first.
 */
/**
 * Scope of supply, as prose rather than markup.
 *
 * Written once because it prints in two shapes — a two-column table when it has
 * the width, two stacked lists when it is sharing a row with the chart — and
 * the words must be the same in both.
 */
const SUPPLY_US =
  'Trained facilitators for every session · full curriculum and lesson materials · devices, micro-controllers and hardware kits · the learning platform, logins and reporting · termly progress reports for parents';
const SUPPLY_THEM =
  'A classroom or lab for the session · a slot on the timetable · student registration and parent communication · a staff contact for scheduling';

function offerCard(offer: PartnershipOffer, highlighted: boolean): string {
  return `
    <article class="offer${highlighted ? ' offer-picked' : ''}">
      <!--
        Two rows, not one.

        The code, the tag and the price used to share a line with the offer's
        name, and "Timetable Integration — 2 classes a week" is too long to sit
        beside a badge: it wrapped after its first word, leaving the price
        stranded halfway up a broken phrase. The particulars get the top line
        and the name gets its own.
      -->
      <header class="offer-top">
        <div class="offer-tags">
          <span class="offer-code">Option ${esc(offer.code)}</span>
          ${highlighted ? '<span class="tag">Recommended for your school</span>' : ''}
        </div>
        <div class="offer-price">${esc(offerPriceLabel(offer))}</div>
      </header>
      <div class="offer-name">${esc(offer.name)}</div>
      <div class="offer-meta">${esc(offer.scope)} &nbsp;·&nbsp; ${esc(offer.cadence)}</div>
      <p class="offer-best">${esc(offer.bestFor)}</p>
    </article>`;
}

/**
 * An option we are not recommending, on one line.
 *
 * A proposal that gives three options equal weight has made no recommendation,
 * and a head teacher reading it has to do the work of choosing between them
 * unaided. Once a school has been quoted a particular shape, the other two stop
 * being choices and become context: proof that the price was picked from a
 * standard menu rather than invented for them. That is worth keeping, and it is
 * worth keeping small.
 */
function offerLine(offer: PartnershipOffer): string {
  return `
    <li class="offer-alt">
      <span class="offer-alt-code">Option ${esc(offer.code)}</span>
      <span class="offer-alt-name">${esc(offer.name)}</span>
      <span class="offer-alt-meta">${esc(offer.cadence)}</span>
      <span class="offer-alt-price">${esc(offerPriceLabel(offer))}</span>
    </li>`;
}

export function buildPartnershipProposalHTML(input: ProposalInput): string {
  // Every section asks this before drawing itself. Defaulting to the complete
  // document means a caller that knows nothing about the studio still gets a
  // whole proposal.
  const studio = input.studio ?? defaultStudioConfig(input.photos ?? []);
  const on = (key: keyof typeof studio.sections) => studio.sections[key] !== false;

  const offers = input.offers ?? PARTNERSHIP_OFFERS;
  /*
    The one option this proposal is recommending, if it is recommending one.

    Resolved once, and shared by everything that draws it — the chart, the card
    and the alternates list. It used to be re-derived at each of those, from a
    different field each time: the fee matched on `code` and the highlight
    matched on `scope`, so a proposal quoted for Option B1 priced B1 correctly
    and emphasised nothing at all.
  */
  const quotedOffer = resolveOffer(input.scopeToOffer);
  /*
    One writer. The narrative is the pitch — house copy, or the composer’s
    approved generation. Studio copy used to overlay these three fields, which
    is how a proposal went out with a copilot headline and a different opening.
  */
  const narrative = input.narrative ?? AUTHORED_NARRATIVE;
  const curriculum = input.curriculum;

  /**
   * Does the overview need two sheets?
   *
   * "Who you would be partnering with" and "Why this, and why now" used to share
   * one page. Both are now full arguments — company, mission, vision and proof on
   * one side; the opening and four reasons on the other — and together they run
   * roughly 400px past what A4 holds. The print rule pins a page to 297mm and
   * hides the overflow, so that is not a page that scrolls: it is a page that
   * silently loses the last reason.
   *
   * Split only when both are actually printing. With either switched off in the
   * studio, a second sheet would come out blank.
   */
  const splitOverview = on('intro') && on('pitch');

  // Years come off the offer row and the stage pick, in one place. Option A's
  // "Basic 1 through SS 2" lives on PARTNERSHIP_OFFERS, not in this file, so a
  // template rewrite cannot put SS 3 back on a quote that does not sell it.
  const scopedLevels = curriculum
    ? levelsForQuote(curriculum.levels, {
        stage: input.stage,
        offerScope: quotedOffer?.scope ?? null,
      })
    : [];
  const { primary, secondary } = splitByStage(scopedLevels);

  const location = [input.school.city, input.school.state].filter(Boolean).join(', ');
  const years = scopedLevels.length;
  // The range is read off the years actually being sold. Printing a fixed
  // "Basic 1 to SS 3" under a scoped count contradicts the quote on its own
  // cover — Option A stops at SS 2 and said so two lines below.
  const rangeLabel = gradeRange(scopedLevels);

  const pathwayPages = (
    title: string,
    levels: ProgressionLevel[],
    heading: string,
    muted: string,
  ): string => {
    if (!on('curriculum') || !levels.length) return '';
    const hook = pathwayHook(levels);
    return chunkLevels(levels)
      .map((group, i) => {
        const range = gradeRange(group);
        return `<div class="page page-pathway">
  <div class="pagehead"><span><b>${esc(title)}</b>${range ? ` · ${esc(range)}` : ''}</span><span>${esc(curriculum?.title ?? '')}</span></div>
  ${
    i === 0
      ? `<section>
    <div class="rule"></div>
    <h2>${esc(heading)}</h2>
    ${
      /*
        The hook, or the description — never both.

        They were stacked, and they say the same thing twice: the hook names
        where a child starts and what they finish holding, then the line under it
        described the same ladder in other words. Two sentences introducing a
        page of cards is one more than the page needs, and it is the room the
        cards wanted.
      */
      hook ? `<p class="hook">${esc(hook)}</p>` : `<p class="muted">${esc(muted)}</p>`
    }
  </section>`
      : ''
  }
  <div class="years ${group.length > 2 ? 'years-compact' : 'years-stack'}">${group.map(yearCard).join('')}</div>
</div>`;
      })
      .join('\n');
  };

  // Once terms are agreed the proposal states the deal instead of the menu —
  // the same sentence the MoU prints, from the same record, so a school cannot
  // be shown two different numbers for one agreement.
  /**
   * The close and the place to sign.
   *
   * Built once and placed unconditionally. This used to live inside the
   * secondary-years page, so a proposal whose curriculum failed to load — which
   * `getPublishedProgression` returns as null on purpose — printed no closing
   * and, worse, no signature block at all.
   */
  const closingBlock = `
  <section>
    <div class="rule"></div>
    <h2>Next step</h2>
    <p class="quote">${esc(narrative.closing)}</p>
    ${
    /*
      Same panel, same correction as the MoU's execution page: the QR is
      rendered locally from the share token instead of fetched from
      api.qrserver.com, and the code printed underneath is the six digits that
      open the document rather than the reference, which the public route
      refuses. See the note in mou-html.ts.
    */
    input.accessCode || input.accessPending
      ? `<div class="end-scan">
      ${input.accessQrDataUrl
        ? `<img class="end-scan-qr" src="${esc(input.accessQrDataUrl)}" alt="Scan to reply to this proposal online" />`
        : '<div class="end-scan-qr end-scan-qr-pending"></div>'
      }
      <div>
        <div class="end-scan-lead">Scan to reply</div>
        <!--
          What the link actually does, which is read and reply — not accept.

          This said "Accept or ask a question from your phone", and the portal
          has no accept for a quote: a proposal is an offer, and the public
          route refuses to sign one on purpose ("This is a proposal, not an
          agreement"). So the card advertised a button that does not exist, on
          the page a proprietor reads last, and a school that scanned expecting
          to accept found a phone number instead. Accepting happens by
          telling us — then the MoU is what gets signed.
        -->
        <b class="end-scan-title">Read it and reply from your phone</b>
        <div class="end-scan-sub">
          ${input.accessCode
        ? `Opens this proposal online. No camera? Go to <b>${esc(brandContact.web)}/p</b>
          and type <span class="end-scan-code">${esc(input.accessCode)}</span>`
        : 'Scan code and access code are assigned when this is issued.'
      }
        </div>
        <!--
          The address lives in this card now, not in a second one beside it.

          "Speak to us" and "Scan to reply" were two blocks stacked on the same
          page saying the same thing — here is how to reach us — in two
          different designs. One asks the reader to choose between them, which
          is one decision more than a closing page should ask for. Merged, the
          card answers it once: scan, type the code, or call. It also gives the
          page back the height a second card was spending on its own padding.

          The studio's "Speak to us" switch controls this half of the card and
          not the scan panel around it: turning the contact block off is a
          decision about printing our address, and it must not take the reader's
          way of replying with it.
        -->
        ${on('contact')
        ? `<div class="end-scan-contact">
          ${esc(brandContact.address)}<br>
          <b>${esc(brandContact.phone)}</b> &nbsp;·&nbsp; ${esc(brandContact.email)}
        </div>`
        : ''
      }
      </div>
    </div>`
      : ''
    }
    <!--
      A place to sign, on both sides.

      Our half carried a signature, a name, a role and a date. Theirs carried
      one line of caption and nothing else — no rule to sign on, and no room
      above it to sign in. A page that asks for a signature and
      leaves nowhere to put one reads as unfinished, and it is the last page a
      proprietor sees.

      Both halves are the same shape now, the way the MoU's execution page
      does it: who is signing, the space, the rule, then the caption. The
      spacer matches the height our signature image occupies, so the two rules
      print level — and it sits inside the slot, so signing replaces it.
    -->
    <div class="sign">
      <div class="sign-box">
        <div class="sign-who">For ${esc(brandContact.contractingParty)}</div>
        <img class="sign-ink" src="${esc(assetUrl(brandContact.signatureImage))}" alt="Signature" />
        <div class="sign-rule"></div>
        <div class="sign-name">${esc(brandContact.signatory)}</div>
        <div class="sign-meta">${esc(brandContact.signatoryRole)} &middot; ${esc(input.dateLabel)}</div>
      </div>
      <div class="sign-box">
        <div class="sign-who">For ${esc(input.school.name)}</div>
        ${SIGNATURE_SLOT_START}
        <div class="sign-space"></div>
        <div class="sign-rule"></div>
        <div class="sign-name">Name &amp; signature</div>
        <div class="sign-meta">Date</div>
        ${SIGNATURE_SLOT_END}
      </div>
    </div>
  </section>`;

  const photos = on('photos') ? (studio.photos ?? []).filter(Boolean) : [];

  /**
   * A strip of photographs, from a slice of the chosen set.
   *
   * All six used to print together on the closing page. That left the reasons
   * ending halfway down one sheet and the signature block floating halfway down
   * another — the "plain at the bottom" that makes a proposal look unfinished.
   * Three after the claims and three above the signature fills both, and puts
   * evidence in front of the reader twice: once where we assert, once where they
   * sign.
   */
  const galleryStrip = (from: number, heading: string, large = false): string => {
    const slice = photos.slice(from, from + 3);
    if (!slice.length) return '';
    return `
  <section>
    <div class="rule"></div>
    <h2>${esc(heading)}</h2>
    <div class="gallery${large ? ' gallery-lg' : ''}">${slice
        .map((src) => `<img src="${esc(assetUrl(src))}" alt="Rillcod STEM Session" loading="lazy" onerror="this.style.opacity='0.4';this.style.background='#f1f5f9';" />`)
        .join('')}</div>
  </section>`;
  };

  /**
   * The track record.
   *
   * Prints beside the company introduction when the overview has two sheets —
   * "who you would be partnering with" is exactly the question this answers, and
   * that page has the room. On the single-sheet layout it stays where it was,
   * before the close.
   */
  const fieldProofSection = `  <section>
    <div class="rule"></div>
    <h2>What our students have already done</h2>
    <ul class="ticks">
      ${FIELD_PROOF.map((f) => `<li>${esc(f)}</li>`).join('')}
    </ul>
  </section>`;

  /** Everything, for the layout that still prints one strip. */
  const gallery = photos.length
    ? `
  <section>
    <div class="rule"></div>
    <h2>The programme running</h2>
    <div class="gallery">${photos
      .slice(0, 6)
      .map((src) => `<img src="${esc(assetUrl(src))}" alt="Rillcod STEM Session" loading="lazy" onerror="this.style.opacity='0.4';this.style.background='#f1f5f9';" />`)
      .join('')}</div>
  </section>`
    : '';

  /**
   * How many schools already said yes.
   *
   * Counted at issue, never typed, and omitted entirely when the counts did not
   * come back — an empty band costs a paragraph, a wrong one costs the meeting.
   */
  const proofBand = (dark: boolean): string => {
    const p = input.proof;
    if (!p || !on('proofBand')) return '';
    const tiles = [
      { n: approx(p.partnerSchools), l: 'Schools partnered', c: 'c1' },
      { n: approx(p.students), l: 'Learners building', c: 'c2' },
      ...(years > 0 ? [{ n: String(years), l: years === 1 ? 'Year quoted' : 'Years quoted', c: 'c3' }] : []),
    ];
    return `<div class="proof${dark ? ' proof-dark' : ''}">${tiles
      .map(
        (t) =>
          `<div class="proof-tile ${t.c}"><span class="proof-n">${esc(t.n)}</span><span class="proof-l">${esc(t.l)}</span></div>`,
      )
      .join('')}</div>`;
  };

  /**
   * Four stops on the ladder, read off the years being sold.
   *
   * A head teacher does not read twelve year-cards to decide; they want to know
   * where a child starts and what they walk out holding. The detail pages are
   * still there for whoever wants them.
   */
  const journey = (): string => {
    if (scopedLevels.length < 2 || !on('journey')) return '';
    const picks = [0, Math.floor(years / 3), Math.floor((years * 2) / 3), years - 1]
      .filter((v, i, arr) => arr.indexOf(v) === i)
      .map((i) => scopedLevels[i])
      .filter(Boolean);
    return `<div class="journey">${picks
      .map(
        (l) => `<div class="leg">
          <div class="leg-grade">${esc(l.grade)}</div>
          <div class="leg-what">${esc(l.capstone || l.theme)}</div>
        </div>`,
      )
      .join('')}</div>`;
  };

  const money = (n: number) => `₦${Math.round(n).toLocaleString('en-NG')}`;

  /**
   * The school's share, drawn.
   *
   * Deliberately one hue for all three bars. Shading them darker-as-they-grow
   * would encode bar length twice and say nothing the length has not already
   * said. There is no hover in a printed document, so every bar carries its own
   * value at the tip and the table underneath is the accessible view.
   *
   * Inline SVG with no script and no external file, so it survives being stored,
   * reopened years later and printed.
   */
  /*
    The shape of the three scenarios. Not the numbers — those are beside it.

    Printing the figure after each bar is what put "₦3,15(" and "420 stu" past
    the edge of a 300-unit canvas, clipped mid-digit: the largest and most
    important number on the money page, cut in half. Widening the canvas would
    only shrink the type.

    The right fix is that the labels should not be there at all. The table to
    the right of this carries every one of these figures exactly, and repeating
    them inside the picture is the same duplication that stacking the two
    created. The chart says which is bigger and by how much; the table says
    what they are.

    Narrow, because it now sits beside the table rather than above it.

    Both showed the same three scenarios — the picture stacked on top of the
    numbers, which is the same information read twice and half the sheet's width
    left unused either side. Side by side they are one statement: the shape of
    the thing on the left, the exact figures on the right.

    A 640-unit viewBox rendered into half a sheet scales its own type down by
    more than half, so the labels come out at about 5pt. This build is drawn for
    the width it will actually occupy.
  */
  const upsideChart = (u: SchoolUpside): string => {
    const W = 300;
    const LABEL_W = 96;
    const BAR_X = LABEL_W + 8;
    // The bars now run to the edge, because nothing is printed after them.
    const BAR_MAX = W - BAR_X - 4;
    const ROW_H = 42;
    const BAR_H = 18;
    const R = 4;
    const top = 8;
    const max = Math.max(...u.rows.map((r) => r.schoolShare)) || 1;

    const bars = u.rows
      .map((row, i) => {
        const y = top + i * ROW_H;
        const w = Math.max(2, Math.round((row.schoolShare / max) * BAR_MAX));
        // Square where it meets the baseline, rounded at the data end.
        const r = Math.min(R, w);
        const path =
          `M${BAR_X} ${y} H${BAR_X + w - r} A${r} ${r} 0 0 1 ${BAR_X + w} ${y + r} ` +
          `V${y + BAR_H - r} A${r} ${r} 0 0 1 ${BAR_X + w - r} ${y + BAR_H} H${BAR_X} Z`;
        return `
        <text class="ch-lbl" x="${LABEL_W}" y="${y + BAR_H / 2 + 4}" text-anchor="end">${esc(row.label)}</text>
        <path d="${path}" fill="#2563eb"></path>`;
      })
      .join('');

    const H = top + u.rows.length * ROW_H;
    return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img"
      aria-label="${u.mode === 'menu'
        ? `The school's ${u.sharePercent}% share per ${esc(u.cycle)} under each standard option`
        : `The school's ${u.sharePercent}% share per ${esc(u.cycle)} at three levels of uptake`}">
      <line x1="${BAR_X}" y1="${top - 4}" x2="${BAR_X}" y2="${H - ROW_H + BAR_H + 4}" stroke="#c9d0dc" stroke-width="1"></line>
      ${bars}
    </svg>`;
  };

  /**
   * The only figure on the page computed from the recipient's own numbers.
   *
   * Three uptake levels, with the arithmetic left visible, because a single
   * confident projection is the one a head teacher stops believing. This is
   * what makes the document a quote for them rather than a brochure.
   */
  /** How a fee divides. Sits with the fees, because that is the question it answers. */
  const splitBlock = (): string => {
    const u = input.upside;
    if (!u || !on('split')) return '';
    return `
  <section>
    <div class="rule"></div>
    <h2>How programme fees would be shared</h2>
    <div class="splitkey">
      <span><i class="sw sw-school"></i>${esc(input.school.name)}</span>
      <span><i class="sw sw-rc"></i>${esc(brandContact.displayName)}</span>
    </div>
    <div class="split">
      <div class="seg seg-school" style="flex:${u.sharePercent}">${u.sharePercent}% to your school</div>
      <div class="seg seg-rc" style="flex:${100 - u.sharePercent}">${100 - u.sharePercent}%</div>
    </div>
    <p class="muted">Our share covers the facilitators, the devices and hardware kits, the learning platform and the termly reporting. The school's proposed share follows enrolment each ${esc(u.cycle)}.</p>
  </section>`;
  };

  const upsideBlock = (): string => {
    const u = input.upside;
    if (!u || !on('upside')) return '';

    // Each shape gets the sentence that describes its own arithmetic. A section
    // breakdown says the share is taken on each section and added, because that
    // is the sum a bursar will do by hand to check it.
    const namedRate = quotedOffer
      ? `Option ${esc(quotedOffer.code)} at ${money(u.feePerStudent)} per student`
      : `${money(u.feePerStudent)} per student`;
    const stated = input.agreedTerms ? 'agreed' : 'proposed';
    const lead =
      u.mode === 'menu'
        ? `Illustrated for ${u.rows[0]?.students ?? 0} students per ${esc(u.cycle)}, with ${u.sharePercent}% of programme fees proposed for the school.`
        : u.mode === 'illustrative'
          ? `Enrolment is not yet on file, so this page illustrates ${namedRate} at three common school sizes. The rate and the ${u.sharePercent}% share stay as proposed.`
          : u.mode === 'sections'
            ? `Each section at its ${stated} rate, then added, so the school's ${u.sharePercent}% follows both.`
            : u.mode === 'package'
              ? `The ${stated} package for the school, and the school's ${u.sharePercent}% of it, per ${esc(u.cycle)}.`
              : `Prepared from the school's roll. Under ${quotedOffer ? `Option ${esc(quotedOffer.code)} at ${money(u.feePerStudent)}` : money(u.feePerStudent)} per student per ${esc(u.cycle)}, the school's proposed ${u.sharePercent}% is shown at three levels of uptake.`;

    const firstCol =
      u.mode === 'sections' ? 'Section'
        : u.mode === 'package' ? 'Agreed'
          : u.mode === 'illustrative' ? 'School size'
            : u.mode === 'menu' ? 'Option'
              : 'Scenario';
    /*
      Students always print. The naira without the headcount is a figure a
      bursar cannot check — and the menu used to hide quantity because the
      same roll sat in the lead. A lead is not a table.
    */
    const showRate = u.mode === 'sections';
    const secondHead = 'Students';
    const secondCell = (r: (typeof u.rows)[number]) => {
      const qty = r.students > 0 ? String(r.students) : '—';
      if (u.mode === 'menu' && r.rate) {
        return `${qty}<span class="qty-sub"> @ ${esc(money(r.rate))} each</span>`;
      }
      return qty;
    };

    const bodyRow = (r: (typeof u.rows)[number], highlight: boolean) => `
        <tr${highlight ? ' class="picked"' : ''}>
          <td><strong>${esc(r.label)}</strong></td>
          <td>${secondCell(r)}</td>
          ${showRate ? `<td>${r.rate ? esc(money(r.rate)) : '—'}</td>` : ''}
          <td>${esc(money(r.gross))}</td>
          <td class="num"><strong>${esc(money(r.schoolShare))}</strong></td>
        </tr>`;

    return `
  <section>
    <div class="rule"></div>
    <h2>What this would return to ${esc(input.school.name)}</h2>
    <p class="muted">${lead}</p>

    <div class="upside-row">
    <div class="upside-col">${/*
      The chart and the table beside it are one statement, not two.

      Both list the same three scenarios; the table also carries the programme
      fee each one implies, so it is the more complete of the two. The picture
      is the more scannable, and while the sheet had room for both that was a
      fair trade.

      It stops being fair once the settlement answers need the same sheet: this
      page ran 115px past the bottom, and on a page that clips rather than
      spills the withdrawal clause would simply have vanished. A whole extra
      sheet for four sentences would push the proposal past ten pages, which is
      the length a head teacher will actually read to the end of. So the
      duplicate goes, and the section that answers a real objection stays.
    */ ''}${upsideChart(u)}</div>
    <div class="upside-col">
    <table class="compact">
      <thead>
        <tr>
          <th>${firstCol}</th>
          <th>${secondHead}</th>
          ${showRate ? '<th>Rate each</th>' : ''}
          <th>Programme fees</th>
          <th>Your ${u.sharePercent}% share</th>
        </tr>
      </thead>
      <tbody>
        ${u.rows.map((r, i) => bodyRow(r, (u.mode === 'uptake' || u.mode === 'package') && !u.total && i === u.rows.length - 1)).join('')}
        ${u.total ? bodyRow(u.total, true) : ''}
      </tbody>
    </table>
    </div>
    </div>
    <p class="muted" style="margin-top:2.5mm">Figures are per ${esc(u.cycle)}.</p>
  </section>`;
  };

  /**
   * Scope of supply — what each side actually puts in.
   *
   * It belongs with the fees, because it answers the question the price raises:
   * what am I buying. Keeping it here in both layouts is what forces the chart
   * and this table to size themselves to the room left over — see `tight` in
   * offersChart. The alternative was letting it fall back to the returns page
   * whenever the full menu prints, which meant the same document put the same
   * section in two different places depending on how it was quoted.
   */
  const supplyTable = (): string => {
    if (!on('sideBySide')) return '';
    return `<table class="compact">
      <thead><tr><th>${esc(brandContact.displayName)} provides</th><th>Your school provides</th></tr></thead>
      <tbody>
        <tr>
          <td>${SUPPLY_US}</td>
          <td>${SUPPLY_THEM}</td>
        </tr>
      </tbody>
    </table>`;
  };

  /**
   * The chart and the scope of supply, laid out for the room that is left.
   *
   * With a recommendation the menu is one card and two lines, which frees about
   * a third of the sheet — so the chart takes the full width at full size and
   * the scope table sits under it, stacked and legible.
   *
   * With the full menu, three cards take that room back. The same two blocks
   * stacked run 160px past the bottom of an A4 sheet, and A4 does not spill: it
   * clips, silently. So they share one row instead, the chart narrows to suit
   * its column, and the page keeps both.
   *
   * Same content either way. What changes is only how much room it is given.
   */
  /*
    Always the wide build now.

    The narrow one exists for a chart sharing a row with something else. Nothing
    shares a row with it any more — the scope table crosses to the returns page
    when this one is full — and a 300-unit viewBox rendered at full page width
    scales up by more than twice, which put this sheet 52px past the bottom.
  */
  /*
    Once a rate is agreed, stop selling the menu.

    A chart comparing three options against each other is for a school still
    choosing between them. Printing it to a school that has already agreed a
    price is at best noise and at worst an invitation to reopen a settled
    negotiation — and it is the single biggest block on the sheet, which is the
    room the agreed terms and the scope of supply then need.

    The options stay, as three quiet lines under "Standard options for
    reference", so the agreed rate is still visibly one of a standard set
    rather than a number invented for this school.
  */
  const figures = (): string => (input.agreedTerms ? '' : offersChart());

  /**
   * Scope of supply, on whichever of the two sheets has the room for it.
   *
   * It belongs beside the fees, because it answers the question the price
   * raises: what am I actually buying. But "belongs beside" is a preference and
   * A4 is a constraint, and which sheet has the room moves.
   *
   * With a recommendation the menu is one card and two lines, the commercials
   * page keeps about a third of a sheet spare, and the table sits under the
   * fees where it reads best. With the full menu, three cards take that room
   * back — the commercials page drops to twenty pixels of clearance while the
   * returns page carries two hundred and thirty spare — so the table crosses
   * over. It reads perfectly well after the money: reciprocity is a natural
   * thing to state once somebody has seen what they earn.
   *
   * Called from both sheets. Prints on exactly one.
   */
  /**
   * The seventh photograph, with the sentence that belongs next to it.
   *
   * One composed band, not a picture dumped beside two clauses. The six on
   * the close already prove the programme; this frame sits with the figures
   * so the sheet argues for the fee rather than for a payout.
   */
  const reasonToPayBlock = (): string => {
    if (!on('upside') && !on('split')) return '';
    return `  <section>
    <div class="rule"></div>
    <h2>What a parent would be paying for</h2>
    <article class="value">
      <figure class="value-photo">
        <img src="${esc(assetUrl(REASON_TO_PAY_PHOTO))}" alt="A Rillcod facilitator teaching coding and AI to a full class" />
      </figure>
      <div class="value-copy">
        <span class="value-kicker">What the fee actually buys</span>
        <p>A specialist in the room, every child on a machine, and a build they take home at the end of term. That is what a parent is paying for — and what they tell the next parent.</p>
        <p class="value-note">Your share follows who enrols. How it is released would be written into the agreement before anything is signed.</p>
      </div>
    </article>
  </section>`;
  };

  /**
   * What is not charged — the question a price raises and this document never answered.
   *
   * A head teacher reading a fee is not next wondering about pedagogy. They are
   * wondering whether this is the whole cost or the first instalment of it, and
   * they are wondering because they have been caught before: a headline rate,
   * then a joining fee, an equipment deposit, a licence per teacher, a
   * subscription for the platform.
   *
   * The document already answered it, in pieces, on three different pages —
   * "no capital outlay" here, "our share covers the devices and the platform"
   * there. Said once, plainly, next to the number, it is the strongest
   * paragraph on the page.
   *
   * The deposit is the one line that is not a promise but a fact, so it comes
   * from the terms record rather than from this file. A school with a deposit
   * agreed reads its own figure; a school without one reads that there is none.
   */
  const noExtrasBlock = (): string => {
    // Same room test as the scope table: this only exists on a fees page that a
    // recommendation has compressed, which is every proposal actually issued.
    if (!quotedOffer) return '';
    const deposit = Number(input.agreedTerms?.deposit_amount) || 0;
    const items = [
      ['No registration or joining fee', 'Nothing is payable to start, and nothing on renewal.'],
      ['No charge for devices or kits', 'Including replacement in normal use. They arrive with the facilitator and leave with them.'],
      ['No licence per teacher or classroom', 'The fee is per enrolled learner and nothing else scales with it.'],
      ['No separate platform charge', 'Logins, the learning platform and the termly reports are inside the fee.'],
      [
        deposit > 0 ? 'Deposit' : 'No deposit',
        deposit > 0
          ? `A deposit of ${money(deposit)} applies, as recorded in your agreed terms.`
          : 'Nothing is held on account before teaching begins.',
      ],
    ];
    return `  <section>
    <div class="rule"></div>
    <h2>Nothing else is proposed beyond this fee</h2>
    <div class="settle">
      ${items
        .map(
          ([label, body]) => `<div class="settle-item">
        <b class="settle-label">${esc(label)}</b>
        <p class="settle-body">${esc(body)}</p>
      </div>`,
        )
        .join('')}
    </div>
  </section>`;
  };

  const supplySection = (onCommercialsPage: boolean): string => {
    const table = supplyTable();
    if (!table) return '';
    // The returns page only takes it when it is not already carrying the
    // settlement answers; otherwise it stays with the fees, tight or not.
    /*
      It goes with the fees, or it does not go at all.

      The returns page now always explains how the money reaches the school, so
      it no longer has room to also carry this. The fees page only has room when
      a recommendation has compressed the menu to one card and two lines — which
      is every proposal the system issues, since it recommends one when nobody
      picks. On the full menu there is room on neither sheet, and this is the
      block to lose: the MoU sets out obligations in full, and a proposal that
      clips its own last row is worse than one that says less.
    */
    if (!quotedOffer || !onCommercialsPage) return '';
    return `  <section>
    <div class="rule"></div>
    <h2>What each side brings</h2>
    ${table}
  </section>`;
  };

  /**
   * The options, compared on what a parent pays over a full year.
   *
   * Per-term figures are what we quote, but a school decides in sessions — and
   * three prices in three different sentences are hard to weigh against each
   * other. One hue, because these are three values of one measure, and every bar
   * carries its own figure since a printed page has no hover.
   *
   * Two builds of the same picture, and the page picks between them by how much
   * room it has left. Wide, it labels each bar "Option B2" in full and repeats
   * the unit under every figure. Narrow — sharing a row with the scope table —
   * it drops to the bare code and states the unit once in the caption, because
   * the alternative at half width is 6px type nobody can read.
   */
  const offersChart = (): string => {
    if (!on('offersChart')) return '';
    const W = 640, LABEL_W = 150, BAR_X = LABEL_W + 10, BAR_MAX = 320;
    const ROW_H = 56, BAR_H = 24, top = 10, R = 4;
    // Three terms to a session. Both ends of the range are carried, because an
    // option priced ₦25,000–₦30,000 a term was charted as a firm ₦75,000 a year:
    // the chart quietly dropped the top of the range while the card beside it
    // printed both numbers, so the two disagreed on the same page — on price.
    const rows = offers.map((o) => ({
      code: o.code,
      from: o.priceFrom * 3,
      to: Math.max(o.priceFrom, o.priceTo) * 3,
      label: 'Option ' + o.code,
    }));
    const max = Math.max(...rows.map((r) => r.to)) || 1;
    const anyRange = rows.some((r) => r.to > r.from);
    const barPath = (x: number, y: number, w: number) => {
      const rr = Math.min(R, w);
      return 'M' + x + ' ' + y + ' H' + (x + w - rr) +
        ' A' + rr + ' ' + rr + ' 0 0 1 ' + (x + w) + ' ' + (y + rr) +
        ' V' + (y + BAR_H - rr) + ' A' + rr + ' ' + rr + ' 0 0 1 ' + (x + w - rr) + ' ' + (y + BAR_H) +
        ' H' + x + ' Z';
    };
    const bars = rows.map((r, i) => {
      const y = top + i * ROW_H;
      const wTo = Math.max(2, Math.round((r.to / max) * BAR_MAX));
      const wFrom = Math.max(2, Math.round((r.from / max) * BAR_MAX));
      const ranged = r.to > r.from;
      /*
        The recommended option keeps the hue; the rest step back to grey.

        Not a second colour — the same measure is still being charted, so this
        is emphasis, not a new dimension. Without it the picture contradicted
        the cards beside it: one option was named as the recommendation and the
        chart still drew three of them identically.
      */
      const isQuoted = !quotedOffer || r.code === quotedOffer.code;
      const solid = isQuoted ? '#2563eb' : '#cbd5e1';
      const faint = isQuoted ? '#93c5fd' : '#e2e8f0';
      // One hue, two steps of it: the solid length is the fee every school pays,
      // the lighter continuation is how far it can go. Same measure, so the same
      // colour — a second hue would read as a second thing being measured.
      const upper = ranged
        ? '<path d="' + barPath(BAR_X, y, wTo) + '" fill="' + faint + '"></path>'
        : '';
      const value = ranged ? money(r.from) + '–' + money(r.to) : money(r.from);
      const sub = '<text class="ch-sub" x="' + (BAR_X + wTo + 8) + '" y="' + (y + BAR_H / 2 + 18) + '">per student, per year</text>';
      return '<text class="ch-lbl' + (isQuoted ? ' ch-lbl-on' : '') + '" x="' + LABEL_W + '" y="' + (y + BAR_H / 2 + 4) + '" text-anchor="end">' + esc(r.label) + '</text>' +
        upper +
        '<path d="' + barPath(BAR_X, y, wFrom) + '" fill="' + solid + '"></path>' +
        '<text class="ch-val" x="' + (BAR_X + wTo + 8) + '" y="' + (y + BAR_H / 2 + 4) + '">' + esc(value) + '</text>' +
        sub;
    }).join('');
    const H = top + rows.length * ROW_H;
    const svg = '<svg class="chart" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Yearly cost per student for each option, including the range where a fee is not fixed">' +
      '<line x1="' + BAR_X + '" y1="' + (top - 4) + '" x2="' + BAR_X + '" y2="' + (H - ROW_H + BAR_H + 4) + '" stroke="#cbd5e1" stroke-width="1"></line>' +
      bars + '</svg>';
    // Two shades of one hue need saying out loud on a printed page, where nobody
    // can hover to find out what the lighter part of a bar means.
    return anyRange
      ? svg +
      '<p class="chart-note"><span class="key key-from"></span>the fee every school pays' +
      '&nbsp;&nbsp;<span class="key key-to"></span>as far as it goes where the fee is a range</p>'
      : svg;
  };

  /**
   * The five questions, answered in the document rather than only on the web.
   *
   * They were answered on the portal and nowhere else, so a proposal forwarded
   * to a board, printed for a meeting or read on a phone with no signal was
   * silent on the things it is most often asked about. The artefact that
   * survives the conversation is the document, not the page.
   *
   * It also happens to fill the room the duplicated case studies used to take,
   * which is the right way round: the space was freed by removing something
   * said three times, and filled with something not said at all.
   */
  const faqBlock = (): string => !on('caseStudies') ? '' : `
  <section>
    <div class="rule"></div>
    <h2>Questions we are usually asked</h2>
    <div class="faqs">
      ${PROPRIETOR_FAQS.map((f) => `
        <div class="faq">
          <b class="faq-q">${esc(f.q)}</b>
          <p class="faq-a">${esc(f.a)}</p>
        </div>
      `).join('')}
    </div>
  </section>`;

  const zeroCapexBlock = (): string => !on('zeroCapex') ? '' : `
  <section>
    <div class="rule"></div>
    <h2>What we commit to in writing</h2>
    <div class="guarantee-grid">
      ${ZERO_CAPEX_PROMISE.map((g) => `
        <div class="guarantee-card">
          <div class="guarantee-icon">&#10003;</div>
          <div>
            <b>${esc(g.title)}</b>
            <p>${esc(g.body)}</p>
          </div>
        </div>
      `).join('')}
    </div>
  </section>`;

  const transformationTableBlock = (): string => !on('comparison') ? '' : `
  <section>
    <div class="rule"></div>
    <h2>What changes, against what you run today</h2>
    <table class="comp-table">
      <thead>
        <tr>
          <th style="width:25%;">Focus Area</th>
          <th style="width:37%;">Traditional Computer Studies</th>
          <th style="width:38%; background:#1e3a8a; color:#fff;">With ${esc(brandContact.displayName)}</th>
        </tr>
      </thead>
      <tbody>
        ${TRADITIONAL_VS_RILLCOD.map((t) => `
          <tr>
            <td><strong>${esc(t.area)}</strong></td>
            <td style="color:#64748b;">${esc(t.traditional)}</td>
            <td style="color:#0f172a; font-weight:600; background:#f8fafc;">${esc(t.rillcod)}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  </section>`;

  /**
   * What the child hands back, counted from the ladder being sold.
   *
   * Every level carries a portfolio target — "3 Scratch Games + 1 AI Story" —
   * so the evidence a parent ends up holding is already in the curriculum and
   * does not need asserting separately. Scoping the quote changes this block
   * with it, because it is the same list of years.
   */
  const portfolioBlock = (): string => {
    if (!on('portfolio')) return '';
    const withPortfolio = scopedLevels.filter((l) => (l.portfolio ?? "").trim());
    if (withPortfolio.length < 2) return '';
    const first = withPortfolio[0];
    const last = withPortfolio[withPortfolio.length - 1];
    return `
  <section>
    <div class="rule"></div>
    <h2>What a parent gets to hold</h2>
    <p class="muted">Not a report saying it went well — the work itself, kept and added to every year.</p>
    <div class="parent">
      <div>
        <div class="parent-when">${esc(first.grade)} — the first year</div>
        <div class="parent-what">${esc(first.portfolio)}</div>
        <div class="parent-body">Finished work in the first twelve months, so a parent sees the point of it before they are asked to keep paying for it.</div>
      </div>
      <div>
        <div class="parent-when">Every term after</div>
        <div class="parent-what">${withPortfolio.length} years of capstone builds</div>
        <div class="parent-body">Each year closes on something that works — a robot, a game, an app — and a written progress report in the format your school already reports in.</div>
      </div>
      <div>
        <div class="parent-when">${esc(last.grade)} — leaving</div>
        <div class="parent-what">${esc(last.portfolio)}</div>
        <div class="parent-body">A portfolio of shipped work, which is what a university admissions officer or a first employer actually asks to see.</div>
      </div>
    </div>
  </section>`;
  };

  /**
   * One A4 sheet, or nothing at all.
   *
   * Every page below is a fixed 297mm box with a running head, holding sections
   * the studio is allowed to switch off. Printing the box unconditionally is how
   * switching off both halves of a page produced a blank sheet — head, rule,
   * page number, no content — in the middle of a document a head teacher is
   * reading. A page with nothing on it is worse than a shorter proposal.
   *
   * The head is built here rather than repeated at each call, because it was
   * repeated at each call: the same span, the same separator and the same page
   * counter written out eight times, which is eight chances for one of them to
   * name a different reference. The label is house copy written in this file —
   * the school name and the reference beside it are the untrusted halves, and
   * those are escaped.
   */
  const sheet = (label: string, body: string, cls = 'page'): string => {
    if (!body.trim()) return '';
    return `<div class="${cls}">
  <div class="pagehead"><span><b>${label}</b> · ${esc(input.school.name)}</span><span>${esc(input.reference)}<span class="pno"></span></span></div>

${body}
</div>`;
  };

  /**
   * The opening argument, and the four reasons under it.
   *
   * Built here because it prints on one of two sheets depending on how much room
   * the overview needed, and a block that can appear in two places has to exist
   * in one — written out at both, the two copies drift, and a proposal ends up
   * arguing slightly differently depending on a layout decision.
   */
  const pitchSection = !on('pitch')
    ? ''
    : `  <section>
    <div class="rule"></div>
    <h2>Why this, and why now</h2>
    <p>${esc(narrative.opening)}</p>
    <div class="why">
      ${narrative.benefits
      .map((b) => `<div><b>${esc(b.title)}</b>${esc(b.body)}</div>`)
      .join('\n      ')}
    </div>
  </section>`;

  /**
   * The fees, and the shapes they come in.
   *
   * Two studio switches meet in this one section, and both used to be read only
   * halfway. "Option comparison chart" was honoured; "The standard options" was
   * not — the cards printed whatever the studio said, so a desk that turned the
   * menu off still sent a menu. Now the cards answer to their own switch, the
   * chart to its, and with both off the section does not print at all rather
   * than printing a heading over an empty rule.
   *
   * The validity sentence belongs to whichever of them printed: it dates the
   * fees, and the fees are what either build is showing.
   */
  const feesSection = (): string => {
    if (!on('offers') && !on('offersChart')) return '';
    const menu = !on('offers')
      ? ''
      : input.agreedTerms
        ? /*
            A settled deal does not need three cards arguing for themselves. The
            menu drops to its quiet form, which keeps the evidence that the agreed
            rate came off a standard list without reopening the choice.
          */
          `<div class="offer-alts"><ul>${offers.map(offerLine).join('')}</ul></div>`
        : quotedOffer
          ? /*
              One option in full, the others on one line each.

              Three cards of equal weight is a menu, and a menu is what you send a
              school you know nothing about. Once the shape has been chosen for a
              particular roll and a particular timetable, printing all three at the
              same size buries the recommendation inside it — the reader has to work
              out which one is theirs, and some of them will pick the cheapest
              instead of the right one.
            */
            `<div class="offers">${offerCard(quotedOffer, true)}</div>
    ${offers.length > 1
              ? `<div class="offer-alts">
      <div class="offer-alts-head">Also available on the standard menu</div>
      <ul>${offers.filter((o) => o.code !== quotedOffer.code).map(offerLine).join('')}</ul>
    </div>`
              : ''}`
          : `<div class="offers offers-full">${offers.map((o) => offerCard(o, false)).join('')}</div>`;

    return `  <section>
    <div class="rule"></div>
    <h2>${input.agreedTerms
      ? 'Standard options for reference'
      : quotedOffer
        ? `What we recommend for ${esc(input.school.name)}`
        : 'Three proposed shapes for the programme'}</h2>
    <p class="muted">${input.agreedTerms
      ? 'Your agreed rate above is one of the standard options. They are listed here so you can see where it sits.'
      : quotedOffer
        ? /*
            The reason, when the system actually has one.

            This line used to claim the option had been "picked for the size of
            your roll" no matter how it was chosen — a reasoning the document
            asserted and nothing had performed. Now it prints the reason
            `recommendOffer` gave, naming the roll it read, and falls back to a
            plain statement when the choice came from a person instead. A head
            teacher can then argue with the argument, not just the price.
          */
          esc(input.recommendationReason || 'The other standard options are listed beneath, for context.')
        : 'What a parent would pay over a full session under each option.'}</p>
    ${figures()}

    ${menu}
    <p class="muted" style="margin-top:2mm">Fees are per student per term. The programme runs on the school calendar, and billing follows the same terms your school already invoices on.${input.validUntilLabel
      ? ` These fees stand until ${esc(input.validUntilLabel)}; after that we will re-quote before anything is signed.`
      : ''
    }</p>
  </section>`;
  };

  const agreed = input.agreedTerms
    ? `<section class="agreed">
         <h2>Agreed terms</h2>
         <p class="agreed-line">${esc(describeTerms(input.agreedTerms))}</p>
         <p class="muted">These terms supersede the standard options below and are the terms carried into the Memorandum of Understanding.</p>
       </section>`
    : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Coding &amp; Robotics Partnership Proposal — ${esc(input.school.name)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Plus+Jakarta+Sans:wght@500;600;700;800&display=swap" rel="stylesheet">
<style>
  @page { size: A4 portrait; margin: 0; }
  * { box-sizing: border-box; }
  
  html { background: #0f172a; }
  body {
    margin: 0; padding: 24px 0; background: #0f172a; color: #1e293b;
    font: 11.4pt/1.55 "Inter", system-ui, -apple-system, sans-serif;
    -webkit-print-color-adjust: exact; print-color-adjust: exact;
    display: flex; flex-direction: column; align-items: center; gap: 24px;
  }
  
  .page {
    width: 210mm; min-height: 297mm; padding: 14mm 13mm;
    background: #ffffff; color: #1e293b;
    box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.5), 0 8px 10px -6px rgba(0, 0, 0, 0.4);
    border-radius: 2px; position: relative; box-sizing: border-box;
    overflow: hidden; flex-shrink: 0;
  }

  @media print {
    html, body { background: #ffffff !important; padding: 0 !important; gap: 0 !important; display: block !important; }
    /*
      A sheet is at least A4, never exactly A4.

      It was pinned to 297mm with the overflow hidden, which does not mean "keep
      it to a page" — it means "delete whatever does not fit". A curriculum row
      typed a little longer than the sample, or a school with a long name, and
      the last card on the sheet simply was not printed. Nothing recorded it.

      Given a minimum instead, a page that runs long carries on to a second
      sheet. Sections already refuse to split down the middle, so the break lands
      between blocks. An occasional extra sheet is a cost worth paying; a
      sentence that stops halfway is not.
    */
    .page {
      width: 210mm !important; min-height: 297mm !important; height: auto !important;
      overflow: visible !important;
      padding: 14mm 13mm !important; box-shadow: none !important; border-radius: 0 !important;
      page-break-after: always; break-after: page;
    }
    .page:last-child { page-break-after: auto; break-after: auto; }
  }

  h1, h2, h3, .brand, .proof-n, .cover-for { font-family: "Plus Jakarta Sans", "Inter", sans-serif; }

  /* Cover — Modern Executive Presentation */
  .cover { display: flex; flex-direction: column; min-height: 262mm; }
  .cover-top {
    background: #060B1E;
    /* Navy into the logo's blue into the logo's red. The previous midpoint sat
       at #1E1B4B, which is indigo — blending brand blue to brand red through
       the shortest path produces a purple this company does not own. Routing it
       through the blue keeps every stop a colour that is actually ours. */
    background: linear-gradient(118deg, #070C1F 0%, #123069 46%, #6E1018 100%);
    color: #fff; margin: -14mm -13mm 0; padding: 6mm 14mm 6mm;
    border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  }
  .stripe { display: flex; height: 3mm; margin: 0 -13mm; }
  .s1 { background: #991b1b; flex: 5; }
  .s2 { background: #dc2626; flex: 3; }
  .s3 { background: #2563eb; flex: 2; }

  /* ── The closing card (Last page) ─────────────────────────────────── */
  .end-scan {
    display: flex; align-items: center; gap: 4.5mm; break-inside: avoid;
    margin-top: 3.5mm; padding: 3mm 5mm 3mm 4mm;
    background: linear-gradient(118deg, #070C1F 0%, #123069 100%);
    border-left: 3.5mm solid #dc2626; border-radius: 0 3mm 3mm 0;
    box-shadow: 0 4px 14px rgba(15, 23, 42, .25);
  }
  /* 22mm, not 32mm. The cover can afford a 58mm mark because it has a whole
     band to itself; this one shares its page with the closing argument, the
     contact card and both signature blocks. At 32mm the page ran 43px past the
     sheet — and a page clips rather than spills, so the overflow was the
     signature block quietly disappearing off a document meant to be signed. */
  .end-scan-qr {
    width: 30mm; height: 30mm; display: block; flex: none;
    background: #fff; padding: 2mm; border-radius: 2.2mm;
    box-shadow: 0 3px 10px rgba(0,0,0,0.3);
  }
  .end-scan-qr-pending { background: rgba(255,255,255,.12); border: 2px dashed rgba(255,255,255,.45); }
  .end-scan-txt { flex: 1; min-width: 0; }
  .end-scan-lead {
    font-size: 10pt; font-weight: 800; letter-spacing: .2em; text-transform: uppercase;
    color: #fca5a5;
  }
  .end-scan-title { display: block; font-size: 11.5pt; color: #fff; margin-top: .8mm; font-weight: 800; letter-spacing: -.15px; }
  .end-scan-sub { font-size: 10pt; color: #cbd5e1; margin-top: 1.4mm; line-height: 1.45; }
  .end-scan-sub b { color: #fff; font-weight: 700; }
  .end-scan-contact {
    margin-top: 2.2mm; padding-top: 2mm; border-top: 1px solid rgba(255,255,255,.16);
    font-size: 10pt; color: #cbd5e1; line-height: 1.5;
  }
  .end-scan-contact b { color: #fff; font-weight: 700; }
  .end-scan-code {
    font-family: ui-monospace, 'DM Mono', Menlo, monospace; letter-spacing: .14em;
    font-size: 10pt; color: #fca5a5; font-weight: 700; background: rgba(255,255,255,0.12);
    padding: 0.5mm 2.2mm; border-radius: 1.2mm;
  }
  .end-scan-contact {
    margin-top: 2.2mm; padding-top: 2mm; border-top: 1px solid rgba(255,255,255,0.14);
    font-size: 10pt; color: #cbd5e1;
  }
  .end-scan-contact b { color: #fff; }

  /* ── Masthead: Brand left, Extra-Large QR right ───────────────────── */
  .masthead { display: flex; align-items: center; justify-content: space-between; gap: 12mm; }
  .masthead-l { flex: 1; min-width: 0; }
  .brand-row { display: flex; align-items: center; gap: 5mm; }

  /* Brand Mark — prominently sized, crisp on white tile */
  .brand-mark {
    width: 26mm; height: 26mm; object-fit: contain; flex: none;
    background: #fff; border-radius: 3.5mm; padding: 2.5mm;
    box-shadow: 0 4px 12px rgba(0,0,0,0.35);
  }
  .brand { font-size: 24pt; font-weight: 800; letter-spacing: -.5px; color: #fff; line-height: 1.05; white-space: nowrap; }
  .brand-tag { color: #fca5a5; font-size: 10pt; letter-spacing: .08em; text-transform: uppercase; margin-top: 1.4mm; font-weight: 600; white-space: nowrap; }

  /* Cover Scan Block — Extra-Large, High-Contrast & Commanding */
  .cover-scan { flex: none; text-align: center; }
  .cover-scan-qr {
    width: 58mm; height: 58mm; display: block;
    background: #fff; padding: 2.8mm; border-radius: 3.5mm;
    box-shadow: 0 6px 20px rgba(0,0,0,.4);
  }
  .cover-scan-qr-pending { background: rgba(255,255,255,.12); border: 2.5px dashed rgba(255,255,255,.55); }
  /* Instruction and code on one line. Stacked, they spent two lines of the band
     on a single thought and pushed the caption away from the code it refers to;
     side by side they read as one sentence and the band closes up. */
  .cover-scan-cap {
    margin-top: 2.4mm; font-size: 10pt; font-weight: 800; color: #fff;
    letter-spacing: .02em; white-space: nowrap;
  }
  .cover-scan-code {
    font-size: 10pt; font-weight: 700; color: #fca5a5;
    font-family: ui-monospace, 'DM Mono', Menlo, monospace; letter-spacing: .1em;
    background: rgba(255,255,255,0.12); padding: 0.5mm 2mm; border-radius: 1.2mm;
    display: inline-block;
  }
  .cover-scan-code-pending { color: #cbd5e1; font-family: inherit; letter-spacing: .02em; font-weight: 600; background: none; }
  /* Cover Mid Section */
  .cover-mid { flex: 1; display: flex; flex-direction: column; justify-content: flex-start; padding: 10mm 0 3mm; }
  .cover-kicker {
    display: inline-block; align-self: flex-start; background: #991b1b; color: #fff;
    font-size: 21pt; letter-spacing: .13em; text-transform: uppercase; font-weight: 800;
    padding: 3.4mm 8mm; border-radius: 2.4mm; box-shadow: 0 3px 8px rgba(153, 27, 27, 0.32);
    line-height: 1.1;
  }
  h1 { font-size: 34pt; line-height: 1.12; margin: 7mm 0 13mm; color: #0f172a; letter-spacing: -.7px; max-width: 155mm; font-weight: 800; }
  .cover-for-card {
    background: #f8fafc; border-left: 4.5mm solid #2563eb; padding: 4.5mm 6mm; margin-bottom: 0; border-radius: 0 2.5mm 2.5mm 0;
    box-shadow: 0 1px 4px rgba(0,0,0,0.06);
  }
  .cover-for { font-size: 18pt; font-weight: 800; color: #0f172a; }
  .cover-loc { color: #64748b; margin-top: 1mm; font-size: 10pt; font-weight: 600; }
  .cover-meta { display: flex; flex-wrap: wrap; gap: 8mm 12mm; margin-top: auto; padding-top: 6mm; font-size: 10pt; color: #64748b; }
  .cover-meta b { display: block; color: #0f172a; font-size: 10.4pt; font-weight: 700; }

  /* Cover Footer — Clean, balanced corporate credentials without repetitive branding */
  /* A footer, not a second masthead.

     These four classes had no rules at all — the stylesheet still described an
     older grid the markup had stopped using — so the band rendered at browser
     defaults and took far more of the sheet than an address needs. Written out
     properly and set small, it gives the cover back roughly 15mm of white. */
  .cover-foot {
    background: #0f172a; color: #fff; margin: 0 -13mm -14mm; padding: 4.5mm 14mm 5mm;
    border-top: 3px solid #991b1b;
  }
  .cover-foot-lines { font-size: 10pt; color: #cbd5e1; line-height: 1.5; }
  .cover-foot-reg {
    font-size: 10pt; color: #94a3b8; margin-top: 1.8mm; letter-spacing: .03em;
    padding-top: 1.8mm; border-top: 1px solid rgba(255,255,255,.12);
  }
  .cover-foot-grid {
    display: flex; justify-content: space-between; align-items: center; gap: 6mm;
  }
  .cover-foot-org {
    font-size: 10pt; font-weight: 700; color: #fff; letter-spacing: .01em;
  }
  .cover-foot-addr {
    font-size: 10pt; color: #94a3b8; margin-top: 0.8mm; line-height: 1.4;
  }
  .cover-foot-contact {
    text-align: right; font-size: 10pt; color: #cbd5e1; line-height: 1.5;
  }
  .cover-foot-confidential {
    font-size: 10pt; color: #94a3b8; text-transform: uppercase; letter-spacing: .08em; margin-top: 0.8mm; font-weight: 600;
  }

  /* Proof Band */
  /* The counts are supporting evidence, not the headline. At 28pt they were the
     largest thing on the cover after the title and pulled the eye away from both
     the offer and the scan block; the room they give back is what lets the QR be
     large enough to scan from across a desk. */
  /* One line each, and small.

     These are supporting evidence — the caption under a photograph, not the
     photograph. At 28pt they were the largest thing on the cover after the
     title, and their labels wrapped onto a second line, which pushed the whole
     band down and squeezed the scan mark that has to be seen from across a
     desk. No-wrap keeps each tile to one line whatever the count reads. */
  .proof { display: flex; gap: 3mm; margin: 6mm 0 0; }
  .proof-tile {
    flex: 1; background: #f8fafc; padding: 2.2mm 3mm 2mm; text-align: center;
    border-top: 2.5px solid #991b1b; border-radius: 1.2mm;
    box-shadow: 0 1px 3px rgba(0,0,0,0.05);
  }
  .proof-tile.c1, .proof-tile.c2, .proof-tile.c3 { border-top-color: #dc2626; }
  .proof-n { display: block; font-size: 14pt; font-weight: 800; color: #0f172a; letter-spacing: -.3px; line-height: 1; white-space: nowrap; }
  .proof-l {
    display: block; font-size: 10pt; color: #64748b; margin-top: 1mm;
    text-transform: uppercase; letter-spacing: .05em; font-weight: 600; white-space: nowrap;
  }
  .proof-dark .proof-tile { background: rgba(255,255,255,.09); backdrop-filter: blur(8px); border-top-color: #f87171; }
  .proof-dark .proof-n { color: #fff; }
  .proof-dark .proof-l { color: #cbd5e1; }

  /* Journey Pathway */
  /* The ladder, drawn as one. Four boxes side by side say "four things"; a line
     with four stops on it says "this goes somewhere", which is the whole claim. */
  .journey { display: grid; grid-template-columns: repeat(4, 1fr); gap: 0; position: relative; margin-top: 2mm; }
  .journey::before {
    content: ""; position: absolute; left: 6%; right: 6%; top: 2.4mm;
    height: 1.5px; background: #e2e8f0;
  }
  .leg { position: relative; padding: 0 3mm; text-align: center; }
  .leg::before {
    content: ""; position: absolute; left: 50%; top: 0;
    width: 5mm; height: 5mm; margin-left: -2.5mm;
    background: #991b1b; border: 2.5px solid #fff; border-radius: 50%;
  }
  .leg-grade {
    display: block; margin-top: 7mm; font-size: 10pt; text-transform: uppercase;
    letter-spacing: .09em; color: #991b1b; font-weight: 800;
  }
  .leg-what { font-size: 10pt; color: #334155; margin-top: 1.5mm; line-height: 1.4; font-weight: 500; }

  .quote {
    border-left: 3.5px solid #991b1b; padding: 1.2mm 0 1.2mm 5mm; margin: 4mm 0;
    font-size: 12pt; line-height: 1.4; color: #0f172a; font-weight: 600; font-family: "Plus Jakarta Sans", sans-serif;
  }

  /* Disciplines & Rollout */
  /* The disciplines read as a list of what is taught, marked by a small square
     rather than wrapped in a panel each. */
  .disc { display: grid; grid-template-columns: 1fr 1fr; gap: 5mm 9mm; }
  .disc div { break-inside: avoid; padding-left: 5mm; position: relative; }
  .disc div::before {
    content: ""; position: absolute; left: 0; top: 1.6mm;
    width: 2.4mm; height: 2.4mm; background: #2563eb; border-radius: .5mm;
  }
  .disc b { display: block; color: #0f172a; margin-bottom: .8mm; font-size: 11pt; font-weight: 700; }

  /* What the family keeps, drawn from the portfolio targets in the ladder. */
  .parent { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6mm; }
  .parent > div { border-top: 2.5px solid #2563eb; padding-top: 3mm; break-inside: avoid; }
  .parent-when {
    font-size: 10pt; text-transform: uppercase; letter-spacing: .08em;
    color: #2563eb; font-weight: 800;
  }
  .parent-what {
    font-size: 11.4pt; font-weight: 700; color: #0f172a;
    margin: 1.2mm 0 1.8mm; letter-spacing: -.2px; line-height: 1.25;
  }
  .parent-body { font-size: 10pt; color: #334155; line-height: 1.45; }

  .phases { display: grid; grid-template-columns: repeat(3, 1fr); gap: 3.5mm; }
  .phase { border: 1px solid #e2e8f0; border-top: 3.5px solid #2563eb; padding: 4mm 4.5mm; border-radius: 1.5mm; background: #fff; break-inside: avoid; }
  .phase-when { font-size: 10pt; text-transform: uppercase; letter-spacing: .08em; color: #2563eb; font-weight: 800; }
  .phase-name { font-size: 10.2pt; font-weight: 700; color: #0f172a; margin: 1mm 0 1.8mm; }
  .phase-body { font-size: 10pt; color: #475569; line-height: 1.45; }

  .ticks { margin: 0; padding: 0; list-style: none; }
  .ticks li {
    position: relative; padding-left: 6.5mm; margin-bottom: 1.6mm; font-size: 10pt; color: #334155;
  }
  .ticks li:before {
    content: ""; position: absolute; left: 0; top: 1.6mm;
    width: 2.8mm; height: 2.8mm; background: #2563eb; border-radius: 50%;
  }

  /* Trimmed to make room on the closing page for the scan card beneath it.
     This block is an address, read once; the card under it is the action. */
  .contact {
    display: flex; gap: 6mm; align-items: flex-start;
    background: #0f172a; color: #fff; padding: 3.2mm 5.5mm; margin: 4mm 0 0; font-size: 10pt; line-height: 1.45; border-radius: 2mm;
  }
  .contact-l {
    font-size: 10pt; text-transform: uppercase; letter-spacing: .12em;
    color: #60a5fa; font-weight: 800; white-space: nowrap; padding-top: .6mm;
  }
  .contact b { font-size: 10.8pt; color: #fff; }

  /* Chart */
  .chart { width: 100%; height: auto; display: block; margin: 4mm 0 5mm; }
  /* The scope-of-supply table shares a sheet with the fees, so it gives back
     what it can: tighter rows, and prose one step down from body size. */
  table.compact { font-size: 10pt; margin-bottom: 0; }
  table.compact td { padding: 1.4mm 3mm; line-height: 1.35; }
  table.compact th { padding: 1.8mm 3mm; }
  .ch-lbl { font: 600 14px "Inter", sans-serif; fill: #94a3b8; }
  /* The recommended row reads at full strength; the rest are context. */
  .ch-lbl-on { font-weight: 800; fill: #1e293b; }
  .ch-val { font: 700 15px "Plus Jakarta Sans", sans-serif; fill: #0f172a; }
  .ch-sub { font: 400 14px "Inter", sans-serif; fill: #64748b; }
  /* What the two shades of the one bar mean. Printed, because there is no hover
     on paper and the lighter segment is otherwise unexplained. */
  .chart-note {
    font-size: 10pt; color: #64748b; margin: 1mm 0 3mm; display: flex;
    align-items: center; gap: 1.5mm; flex-wrap: wrap;
  }
  .key { display: inline-block; width: 3.2mm; height: 2.2mm; border-radius: .6mm; }
  .key-from { background: #2563eb; }
  .key-to { background: #93c5fd; }

  /* Two rows of three on the closing page, which also carries the reasons, the
     field proof, the contact block and both signature boxes. At 23mm the strip
     pushed that page past the sheet — and the sheet clips rather than spills, so
     what would have been lost is the signature line. 20mm keeps all six
     photographs and keeps the page whole. */
  .gallery { display: grid; grid-template-columns: repeat(3, 1fr); gap: 2.5mm; }
  .gallery img {
    width: 100%; height: 20mm; object-fit: cover; display: block;
    border: 1px solid #e2e8f0; border-radius: 1.5mm; break-inside: avoid;
  }
  /* The strip that follows the four reasons has a page to itself and gets the
     room: a 20mm band of thumbnails proves nothing at arm's length. The one
     above the signature stays small, because that page is nearly full. */
  .gallery-lg img { height: 45mm; }

  /* A heading is type, not a container. Filling every heading and every item
     with the same grey box turns a pitch into a form — seventeen identical
     panels on one page, none of them leading. The accent is a short rule under
     the words; the separation is air. */
  h2 {
    font-size: 17.5pt; color: #0f172a; margin: 0 0 5mm; letter-spacing: -.45px;
    font-weight: 800; line-height: 1.15; position: relative; padding-bottom: 3mm;
  }
  h2::after {
    content: ""; position: absolute; left: 0; bottom: 0;
    width: 18mm; height: 2.5px; background: #991b1b; border-radius: 2px;
  }
  p { margin: 0 0 3mm; }
  .muted { color: #64748b; font-size: 10.2pt; }
  .hook {
    font-size: 11.4pt; color: #0f172a; line-height: 1.42; margin: 0 0 2.2mm;
    font-weight: 600;
  }
  .qty-sub { display: block; font-size: 10pt; color: #64748b; font-weight: 500; margin-top: 0.3mm; }

  /* 6.4mm. The return page carries three blocks and a long school name reaches
     into the heading of one of them, which left it 12px from the sheet edge.
     The gaps give the room back, not the content. */
  section { margin-bottom: 6.4mm; break-inside: avoid-page; }
  .rule { display: none; }

  /*
    The money sheet used to pack three blocks at the top and leave a field of
    white under the photograph — more empty than any other page. It is a flex
    column the height of A4, so the split, the figures and the session share
    the leftover air evenly and the last band reaches the bottom padding.
  */
  .page-money {
    display: flex; flex-direction: column; justify-content: space-between;
    min-height: 297mm; height: auto;
  }
  /*
    The same distribution for the sheet that says what the fee covers.

    Two blocks — the scope of supply and the five things nobody is charged for —
    do not fill A4 on their own, and a page that stops two-thirds down reads as
    an accident. Spread, they hold the sheet.
  */
  /*
    And for the fee sheet, which changes height with the deal.

    A cold quote fills it — the chart, the recommended card, the alternates. Once
    a rate is agreed the chart comes out and the menu drops to three quiet lines,
    which is right, and leaves the sheet a third empty. Distributing the air
    means one rule serves both states instead of the page looking finished in one
    and abandoned in the other.
  */
  .page-fees,
  .page-covers {
    display: flex; flex-direction: column;
    min-height: 297mm; height: auto;
  }
  .page-fees > .pagehead,
  .page-covers > .pagehead { flex: none; margin-bottom: 3mm; }
  /*
    Sections share the leftover height rather than the page pushing them apart.

    Spacing the page out from the ends put every gap in two places — a hole under
    the running head and another mid-sheet — which reads as content that has come
    loose. Giving each section an equal share of the spare room and centring what
    is inside it spreads the same air evenly, and the sheet looks set rather than
    padded.
  */
  .page-fees > section,
  .page-covers > section {
    flex: 1; margin-bottom: 0;
    display: flex; flex-direction: column; justify-content: center;
  }
  .page-covers > .pagehead { flex: none; margin-bottom: 3mm; }
  .page-covers > section { margin-bottom: 0; display: flex; flex-direction: column; justify-content: center; }
  /* Air spent on legibility rather than left at the foot: the rows and the five
     promises take the room this sheet has going spare. */
  .page-covers table.compact td { padding: 3.4mm 3mm; }
  .page-covers table.compact th { padding: 3mm 3mm; }
  .page-covers .settle { gap: 6mm 8mm; }
  .page-covers .settle-body { line-height: 1.55; }

  /*
    Three sections on one sheet, at a size they can be read at.

    A page is clipped, not spilled, so 32mm past A4 meant the last rollout card
    printed with its body cut off. The type is the one thing that may not give,
    so the room comes out of the gaps — which are still generous at 10pt, and
    are the part of the page a reader does not look at.
  */
  .page-programme > section { margin-bottom: 4mm; }
  .page-programme h2 { margin-bottom: 2.6mm; }
  .page-programme .disc { gap: 3.4mm 8mm; }
  .page-programme .disc b { margin-bottom: .5mm; }
  .page-programme .hook { margin-bottom: 1.6mm; }
  .page-programme .phase { padding: 3.2mm 3.6mm; }
  .page-programme .phase-name { margin: .8mm 0 1.2mm; }

  .page-programme > section { margin-bottom: 3mm; }
  .page-programme h2 { margin-bottom: 2mm; padding-bottom: 2.2mm; }
  .page-programme p { margin-bottom: 2mm; }
  .page-programme .journey { margin-top: 1mm; }
  .page-programme .leg-grade { margin-top: 5.5mm; }

  /* The overview sheet was 2mm past A4 — the last line of the portfolio block.
     One heading's worth of gap covers it. */
  .page-overview > section { margin-bottom: 5mm; }
  .page-overview h2 { margin-bottom: 4mm; }

  /*
    The closing sheet, which must never be the one that clips.

    It carries the last argument, the photographs and both signature boxes — and
    a signature box with its rule cut off is a page a school cannot sign. The
    photographs give up 3mm of height for it, which nobody reads as smaller.
  */
  .page-close > section { margin-bottom: 4.6mm; }
  .page-close h2 { margin-bottom: 3.4mm; }
  .page-close .gallery-lg img { height: 41mm; }
  .page-close .ticks li { margin-bottom: 1.2mm; }

  /* Same again for the sheet that argues against the alternative. */
  .page-case > section { margin-bottom: 4.4mm; }
  .page-case h2 { margin-bottom: 2.6mm; }
  .page-case .comp-table td { padding: 1.5mm 3mm; }
  .page-case .comp-table th { padding: 2mm 3mm; }
  .page-case .guarantee-grid { gap: 2.4mm 6mm; margin: 1.5mm 0; }
  .page-case .faqs { gap: 2.6mm 7mm; }
  .page-money > .pagehead { flex: none; margin-bottom: 3mm; }
  .page-money > section {
    flex: 1 1 0; min-height: 0; margin-bottom: 0;
    display: flex; flex-direction: column; justify-content: center;
    padding: 3.5mm 0;
  }
  .page-money > section + section { border-top: 1px solid #f1f5f9; }
  .page-money > section:first-of-type { padding-top: 1.5mm; }
  .page-money > section:last-of-type { padding-bottom: 0; }
  .page-money h2 { margin-bottom: 3.5mm; }
  .page-money .split { margin: 4mm 0 3mm; }
  .page-money .split .seg { padding: 4.2mm 4.5mm; font-size: 10.4pt; }
  .page-money .upside-row {
    flex: 1; align-items: stretch; margin: 2.5mm 0 0; gap: 8mm;
  }
  .page-money .upside-col { display: flex; flex-direction: column; justify-content: center; }
  .page-money .upside-col .chart { width: 100%; height: 100%; min-height: 38mm; }
  .page-money .upside-col table.compact th { padding: 2.4mm 2.4mm; }
  .page-money .upside-col table.compact td { padding: 2.6mm 2.4mm; }
  .page-money .value {
    flex: 1; min-height: 52mm; grid-template-rows: 1fr;
  }
  .page-money .value-photo { height: auto; min-height: 0; }
  .page-money .value-photo img { width: 100%; height: 100%; min-height: 0; object-fit: cover; }

  .split { display: flex; gap: 2px; margin: 3.5mm 0 2.5mm; border-radius: 1mm; overflow: hidden; }
  .split .seg {
    padding: 2.8mm 3.5mm; color: #fff; font-size: 10pt; font-weight: 700; white-space: nowrap;
  }
  .seg-school { background: #2563eb; }
  .seg-rc { background: #dc2626; }
  .splitkey { display: flex; gap: 7mm; font-size: 10pt; color: #64748b; font-weight: 500; }
  .splitkey span { display: flex; align-items: center; gap: 2mm; }
  .sw { width: 3.2mm; height: 3.2mm; display: inline-block; border-radius: .8mm; }
  .sw-school { background: #2563eb; } .sw-rc { background: #dc2626; }

  /* Four reasons, set as columns of type with a hairline above each. No fill,
     no border box — the rule and the space do the separating. */
  .why { display: grid; grid-template-columns: 1fr 1fr; gap: 6mm 9mm; }
  .why div { border-top: 1px solid #e2e8f0; padding-top: 3mm; break-inside: avoid; }
  .why b {
    display: block; margin-bottom: 1.4mm; color: #0f172a; font-weight: 700;
    font-size: 11.6pt; letter-spacing: -.15px;
  }

  /* Guarantee Grid */
  .guarantee-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 3mm 6mm; margin: 2mm 0; }
  .guarantee-card {
    display: flex; gap: 3.5mm; align-items: flex-start;
    padding: 3mm 4mm; border: 1px solid #e2e8f0; border-radius: 2mm; background: #fff; break-inside: avoid;
  }
  .guarantee-icon {
    width: 6mm; height: 6mm; border-radius: 50%; background: #dcfce7; color: #16a34a;
    display: flex; align-items: center; justify-content: center; font-weight: 900; font-size: 10pt; shrink: 0;
  }
  .guarantee-card b { display: block; font-size: 10.2pt; color: #0f172a; margin-bottom: 1mm; font-weight: 700; }
  .guarantee-card p { font-size: 10pt; color: #475569; margin: 0; line-height: 1.4; }

  /* Comparison Table */
  /* This page carries three sections and lands within a few millimetres of the
     sheet, so the table gives back the margin rather than the content. */
  .comp-table { width: 100%; border-collapse: collapse; margin: 2mm 0 2.5mm; font-size: 10pt; }
  .comp-table th { padding: 2.5mm 3mm; font-size: 10pt; text-transform: uppercase; letter-spacing: .06em; }
  .comp-table td { padding: 2mm 3mm; border: 1px solid #e2e8f0; vertical-align: middle; line-height: 1.4; }

  table { width: 100%; border-collapse: collapse; font-size: 10.4pt; margin-bottom: 2mm; }
  th { text-align: left; background: #0f172a; color: #fff; padding: 2.2mm 3mm; font-size: 10pt; letter-spacing: .06em; text-transform: uppercase; font-weight: 700; }
  td { padding: 1.6mm 3mm; border-bottom: 1px solid #e2e8f0; vertical-align: top; line-height: 1.4; }
  /* Options as cards. Modern, and the only way three fee options fit across A4
     once the body type is large enough to read without leaning in. */
  .offers { display: flex; flex-direction: column; gap: 3.5mm; }
  .offer {
    border: 1px solid #e2e8f0; border-left: 4px solid #cbd5e1;
    border-radius: 2mm; padding: 4mm 5mm; break-inside: avoid; background: #fff;
  }
  .offer-picked { border-left-color: #991b1b; background: #fdf6f6; }
  .offer-top {
    display: flex; justify-content: space-between; align-items: baseline;
    gap: 5mm; margin-bottom: 1mm;
  }
  .offer-tags { display: flex; align-items: baseline; gap: 2.5mm; min-width: 0; }
  .offer-code {
    font-size: 10pt; font-weight: 800; text-transform: uppercase; letter-spacing: .09em;
    color: #991b1b;
  }
  .offer-name {
    font-size: 13pt; font-weight: 800; color: #0f172a; letter-spacing: -.3px;
    line-height: 1.2; margin-bottom: 1.5mm;
  }
  .offer-price {
    font-size: 12pt; font-weight: 800; color: #991b1b; white-space: nowrap; text-align: right;
  }
  .offer-meta { font-size: 10pt; color: #64748b; font-weight: 600; margin-bottom: 2mm; }
  .offer-best { font-size: 10.2pt; color: #334155; margin: 0; line-height: 1.45; }
  /*
    The rest of the menu, once a recommendation has been made.

    Deliberately quiet and deliberately present. Quiet, because a second full
    card competes with the option we are actually proposing. Present, because a
    single price with nothing around it looks invented — these two lines are the
    evidence that it came off a standard menu.
  */
  /*
    Two columns, because these are short answers and A4 is wide.

    Five questions stacked in a single column use half the sheet's width and
    twice its height — which is what put this page 35px past the bottom, where
    the last answer would simply have been cut off. Side by side they fit with
    room over.
  */
  .faqs {
    display: grid; grid-template-columns: 1fr 1fr; gap: 2.6mm 7mm; margin-top: 1mm;
  }
  .faq { break-inside: avoid; }
  .faq-q { display: block; font-size: 10pt; font-weight: 800; color: #0f172a; }
  .faq-a { margin: .6mm 0 0; font-size: 10pt; line-height: 1.42; color: #475569; }

  /* The settlement answers: a label a proprietor scans for, then the sentence. */
  /*
    The shape and the figures, side by side.

    Aligned to the start rather than stretched: the chart and the table are
    different heights, and stretching the shorter one leaves it floating in the
    middle of a tall box.
  */
  .upside-row { display: flex; align-items: flex-start; gap: 6mm; margin: 3mm 0 1mm; }
  .upside-col { flex: 1; min-width: 0; }
  .upside-col .chart { margin: 0; }
  .upside-col table.compact { font-size: 10pt; }
  .upside-col table.compact th { padding: 1.6mm 2mm; font-size: 10pt; }
  .upside-col table.compact td { padding: 1.6mm 2mm; }
  /* Figures must not wrap. A wrapped ₦ cell makes the table taller than the
     chart it sits beside, and the settlement block below is what then clips. */
  .upside-col table.compact th:nth-child(n+2),
  .upside-col table.compact td:nth-child(n+2) { white-space: nowrap; }

  /* The settlement answers: a label a proprietor scans for, then the sentence. */
  .settle { display: grid; grid-template-columns: 1fr 1fr; gap: 3mm 7mm; margin-top: 1mm; }
  .settle-row { border-left: 3px solid #e2e8f0; padding-left: 4mm; }
  .settle-item { border-left: 3px solid #e2e8f0; padding-left: 4mm; }
  .settle-label {
    display: block; font-size: 10.4pt; font-weight: 800; color: #0f172a; margin-bottom: .8mm;
  }
  .settle-body { margin: 0; font-size: 10pt; line-height: 1.45; color: #475569; }

  /*
    One band: the session on the left, the reason on the right.

    Not a thumbnail with a caption under it, and not two clauses where a
    picture should be. The photograph fills its half; the copy is centred
    against it, with the red edge that the rest of the document uses to
    mark a claim. Height is capped so split, figures and this still land
    on one A4 that clips rather than spills.
  */
  .value {
    display: grid; grid-template-columns: 1.2fr 1fr; align-items: stretch;
    border: 1px solid #e2e8f0; border-radius: 2.5mm; overflow: hidden;
    background: #fff;
  }
  .value-photo { margin: 0; height: 44mm; overflow: hidden; background: #0f172a; }
  .value-photo img {
    width: 100%; height: 44mm; object-fit: cover; display: block;
  }
  .value-copy {
    padding: 4.2mm 5mm 4.5mm; display: flex; flex-direction: column; justify-content: center;
    background: #f8fafc; border-left: 3.5px solid #991b1b;
  }
  .value-kicker {
    font-size: 10pt; font-weight: 800; letter-spacing: .14em; text-transform: uppercase;
    color: #991b1b; margin-bottom: 2mm;
  }
  .value-copy p { font-size: 10pt; color: #334155; line-height: 1.42; margin: 0; }
  .value-note {
    font-size: 10pt; color: #64748b; margin: 2.4mm 0 0; padding-top: 2.2mm;
    border-top: 1px solid #e2e8f0; line-height: 1.4;
  }

  .offer-alts { margin-top: 4mm; }
  .offer-alts-head {
    font-size: 10pt; font-weight: 800; letter-spacing: .1em; text-transform: uppercase;
    color: #94a3b8; margin-bottom: 1.6mm;
  }
  .offer-alts ul { list-style: none; margin: 0; padding: 0; }
  .offer-alt {
    display: flex; align-items: baseline; gap: 3mm;
    padding: 1.8mm 0; border-top: 1px solid #e2e8f0; font-size: 10pt; color: #64748b;
  }
  .offer-alt-code { font-weight: 800; color: #475569; white-space: nowrap; }
  .offer-alt-name { font-weight: 700; color: #334155; }
  .offer-alt-meta { flex: 1; min-width: 0; }
  .offer-alt-price { white-space: nowrap; font-weight: 700; color: #475569; }

  .opt { white-space: nowrap; }
  tr.picked td { background: #fff5f5; }
  tr.picked .opt strong { color: #991b1b; }
  .tag {
    display: inline-block; margin-left: 2.5mm; background: #991b1b; color: #fff;
    font-size: 10pt; letter-spacing: .07em; text-transform: uppercase; font-weight: 700;
    padding: .6mm 1.8mm; border-radius: 1mm; vertical-align: middle;
  }
  .opt-name { font-size: 10pt; color: #64748b; font-weight: 500; }
  .num { white-space: nowrap; color: #991b1b; font-weight: 700; }
  .best { color: #334155; font-size: 10pt; line-height: 1.35; }

  .agreed { background: #fff5f5; border: 1px solid #fecaca; padding: 4.5mm 5.5mm; border-radius: 2mm; margin-bottom: 6mm; }
  .agreed-line { font-size: 11.8pt; font-weight: 700; color: #991b1b; margin-bottom: 2mm; }

  .years { display: grid; grid-template-columns: 1fr 1fr; gap: 3.8mm; }
  /* Six years on one A4: two columns, compact terms in a row. Fat stacked
     cards at three-to-a-sheet were how Basic 5 and 6 vanished; these are
     short enough that the sixth footer still lands on the page. */
  .years-compact { gap: 2.6mm; }
  .years-compact .year-head { min-height: 10.2mm; padding: 1.8mm 2.6mm; }
  .years-compact .year-title { font-size: 10pt; }
  .years-compact .year-grade { font-size: 10pt; padding: .5mm 1.6mm; }
  .years-compact .terms { flex-direction: row; align-items: stretch; gap: 0; padding: 2mm 2.6mm; }
  .years-compact .term { flex: 1; min-width: 0; padding-right: 2.2mm; margin-right: 2.2mm; border-right: 1px solid #e2e8f0; }
  .years-compact .term:last-child { border-right: 0; padding-right: 0; margin-right: 0; }
  .years-compact .term-name { font-size: 10pt; }
  .years-compact .term-focus { font-size: 10pt; line-height: 1.28; }
  .years-compact .year-foot { flex-direction: row; flex-wrap: wrap; gap: 1.2mm 6mm; padding: 1.6mm 2.6mm; font-size: 10pt; }
  .years-stack { grid-template-columns: 1fr; gap: 4.2mm; }
  .years-stack .terms { flex-direction: row; align-items: stretch; gap: 0; }
  .years-stack .term { flex: 1; min-width: 0; padding-right: 3.2mm; margin-right: 3.2mm; border-right: 1px solid #e2e8f0; }
  .years-stack .term:last-child { border-right: 0; padding-right: 0; margin-right: 0; }
  .years-stack .year-foot { flex-direction: row; flex-wrap: wrap; gap: 2mm 8mm; }
  .year { border: 1px solid #e2e8f0; border-radius: 2mm; overflow: hidden; break-inside: avoid; background: #fff; box-shadow: 0 1px 2px rgba(0,0,0,0.03); }

  /*
    A pathway sheet fills itself.

    Six year-cards at a size they can be read at left 50mm of white below the
    last row — the "plain at the bottom" that makes a document look like it ran
    out rather than finished. The grid takes the sheet's leftover height and the
    rows share it, so the cards breathe instead of the page trailing off.

    Only when the sheet is actually carrying a full set. A quote scoped to two
    or three years must not stretch three cards over a whole side of A4, so the
    stretch is conditional on a fifth card being there to share it.
  */
  .page-pathway { display: flex; flex-direction: column; min-height: 297mm; height: auto; }
  .page-pathway > section { flex: none; }
  /*
    A trailing sheet of one or two years spreads rather than stretches.

    Stacked full-width, a card is already the right shape; pulling two of them to
    half a metre of A4 each would give a header, three short columns and a field
    of white inside the border. Spacing them evenly down the sheet uses the same
    room without distorting the card.
  */
  .page-pathway .years-stack { flex: 1; align-content: space-evenly; }

  .page-pathway .years:has(> .year:nth-child(3)) { flex: 1; grid-auto-rows: 1fr; }
  .page-pathway .years:has(> .year:nth-child(3)) .year { display: flex; flex-direction: column; }
  .page-pathway .years:has(> .year:nth-child(3)) .terms { flex: 1; }
  /* The three terms sit in a row, so the height the card gained is theirs to
     use: each column centres in it rather than leaving a band of white under
     three lines of text. */
  .page-pathway .years:has(> .year:nth-child(5)) .term {
    display: flex; flex-direction: column; justify-content: center;
  }
  /* Reserve two lines of title in every header, so a long theme like "Scratch
     Expertise + Machine Learning" does not sit taller than its neighbour and
     leave the grid looking ragged. Short titles centre in the same height. */
  .year-head {
    display: flex; justify-content: space-between; align-items: center; gap: 2.5mm;
    background: #0f172a; color: #fff; padding: 2.5mm 3.5mm; min-height: 13.4mm;
  }
  .year-title { font-size: 10pt; font-weight: 700; line-height: 1.25; }
  .year-grade { font-size: 10pt; background: #991b1b; padding: .8mm 2.2mm; border-radius: 1mm; font-weight: 700; white-space: nowrap; }
  .terms { padding: 2.8mm 3.5mm; display: flex; flex-direction: column; gap: 2mm; }
  .term-name { font-size: 10pt; text-transform: uppercase; letter-spacing: .07em; color: #991b1b; font-weight: 700; }
  .term-focus { font-size: 10pt; color: #334155; }
  .year-foot { border-top: 1px solid #f1f5f9; background: #f8fafc; padding: 2.4mm 3.5mm; font-size: 10pt; color: #475569; display: flex; flex-direction: column; gap: 1mm; }
  .foot-lbl { color: #991b1b; font-weight: 700; text-transform: uppercase; font-size: 10pt; letter-spacing: .06em; margin-right: 1mm; }

  .sign { display: grid; grid-template-columns: 1fr 1fr; gap: 12mm; margin-top: 8mm; break-inside: avoid; }
  .sign-box { font-size: 10pt; color: #334155; }
  /* min-height so a long school name wrapping to two lines does not drop that
     party's rule below the other's. */
  .sign-who {
    font-size: 10pt; text-transform: uppercase; letter-spacing: .08em; color: #991b1b;
    font-weight: 700; min-height: 8.5mm; line-height: 1.35;
  }
  .sign-ink { display: block; height: 14mm; width: auto; max-width: 52mm; margin: 0 0 -1mm; mix-blend-mode: multiply; }
  /* Exactly what .sign-ink occupies, so the counterparty's rule lands level. */
  .sign-space { height: 13mm; }
  .sign-rule { border-top: 1.5px solid #0f172a; }
  .sign-name { font-weight: 700; color: #0f172a; margin-top: 2mm; font-size: 10pt; }
  .sign-meta { font-size: 10pt; color: #64748b; margin-top: .4mm; }
  /* The cover is a cover, not page one. It carries no number, and the sheet
     after it is 1 — which is how a proposal is read and how a reader refers to
     it on the phone. Counted, so switching a section off in the studio
     renumbers the rest instead of leaving a gap. */
  body { counter-reset: sheet 0; }
  .page:not(.cover) { counter-increment: sheet; }
  .pno::before { content: ' · Page ' counter(sheet); }

  .pagehead { display: flex; justify-content: space-between; border-bottom: 2.5px solid #991b1b; padding-bottom: 2.8mm; margin-bottom: 6mm; font-size: 10pt; color: #64748b; }
  .pagehead b { color: #0f172a; font-weight: 700; }
</style>
</head>
<body>

<!-- Cover -->
<div class="page cover">
  <div class="cover-top">
    <div class="masthead">
      <!--
        Two columns: who is writing and what they have done on the left, how to
        open it on the right. The proof band used to run the full width beneath
        the wordmark, which left the scan mark alone in a tall empty column and
        stopped it growing. Paired against the evidence it has something to be
        the same size as.
      -->
      <div class="masthead-l">
        <div class="brand-row">
          <img class="brand-mark" src="${esc(assetUrl(brandAssets.logo))}" alt="${esc(brandContact.displayName)}" onerror="this.onerror=null;this.src='${brandAssets.logoCloudinary}';" />
          <div>
            <div class="brand">${esc(brandContact.displayName)}</div>
            <div class="brand-tag">${esc(brandContact.tagline)}</div>
          </div>
        </div>
        ${proofBand(true)}
      </div>
      ${
    /*
      The scan block, top right of the cover.

      It sat mid-page under the document meta, where it had to fight the
      headline for attention and cost the cover 34mm of the height its title
      wanted. The masthead had that space standing empty to the right of the
      logo — and top-right of a cover is where an eye lands after the
      wordmark. It is also a dark band, which is what a QR wants behind its
      white plate.

      Caption underneath is deliberately four words. A QR that needs a
      sentence to explain it has already failed.
    */
    input.accessCode || input.accessPending
      ? `<div class="cover-scan">
        ${input.accessQrDataUrl
        ? `<img class="cover-scan-qr" src="${esc(input.accessQrDataUrl)}" alt="Scan to read this proposal online">`
        : '<div class="cover-scan-qr cover-scan-qr-pending"></div>'
      }
        <div class="cover-scan-cap">
          Scan to read online ${input.accessCode
        ? `&nbsp;·&nbsp; <span class="cover-scan-code">${esc(input.accessCode)}</span>`
        : '&nbsp;·&nbsp; <span class="cover-scan-code cover-scan-code-pending">code on issue</span>'
      }
        </div>
      </div>`
      : ''
    }
    </div>
  </div>
  <div class="stripe"><span class="s1"></span><span class="s2"></span><span class="s3"></span></div>

  <div class="cover-mid">
    <div class="cover-kicker">Partnership Proposal</div>
    <!-- Escaped like every other narrative field. This one was raw, and it is the
         one a person types into the studio or a model writes — an ampersand in a
         school's chosen headline printed as markup, and anything sharper printed
         as markup too. -->
    <h1>${esc(narrative.headline)}</h1>
    <div class="cover-for-card">
      <div class="cover-for">Prepared for ${esc(input.school.name)}</div>
      ${location ? `<div class="cover-loc">${esc(location)}</div>` : ''}
    </div>

    <div class="cover-meta">
      <div><b>${esc(input.dateLabel)}</b>Date</div>
      <div><b>${esc(input.reference)}</b>Reference</div>
      ${years ? `<div><b>${years} school year${years === 1 ? '' : 's'}</b>${esc(rangeLabel)}</div>` : ''}
      ${quotedOffer ? `<div><b>Option ${esc(quotedOffer.code)}</b>${esc(quotedOffer.name)}</div>` : ''}
      ${input.validUntilLabel ? `<div><b>${esc(input.validUntilLabel)}</b>Fees valid until</div>` : ''}
    </div>
  </div>

  <!--
    The company is named once on this page, at the top, in the masthead.

    The footer repeated it as a heading in its own right, so a reader met
    "Rillcod Technologies" twice within one sheet — once beside the logo and
    again 200mm below it. The address and the registered entity still belong
    here; the second wordmark does not, and removing it is what lets the band
    shrink and the white above it open up.
  -->
  <div class="cover-foot">
    <div class="cover-foot-lines">
      ${esc(brandContact.address)}<br>
      ${esc(brandContact.phone)} &nbsp;·&nbsp; ${esc(brandContact.email)} &nbsp;·&nbsp; ${esc(brandContact.web)}
    </div>
    <div class="cover-foot-reg">${esc(brandContact.registeredName)} &nbsp;·&nbsp; ${esc(brandContact.rcNumber)} &nbsp;·&nbsp; trading as ${esc(brandContact.displayName)}</div>
  </div>
</div>

<!-- Who we are, and why this. Two full arguments now, so they take a sheet each
     when both are printing — and share one when the studio has switched either
     off, because a page that exists to hold a section nobody selected prints as
     a blank sheet in the middle of a proposal. -->
${sheet(
      'Partnership Proposal',
      `${on('intro') ? `  <section>
    <div class="rule"></div>
    <h2>Who you would be partnering with</h2>
    <!--
      The hook first, the company second.

      This opened on a registered name, an RC number and a postal address —
      three facts already printed on the cover footer, and the least interesting
      sentence available to start with. Everything after it then arrived as one
      paragraph carrying five separate ideas, so nothing in it landed.

      A proposal is read by somebody deciding whether to keep reading. The first
      sentence has to be about their world, not our paperwork: nearly every
      school already teaches computers, and very few teach a child to build
      anything with one. That is a gap a head teacher recognises in their own
      timetable, and it is the whole argument in two lines.

      The legal identity is not lost — it is on the cover footer, on the running
      head of every sheet, and in full on the MoU that follows. It does not need
      to be the opening line of the pitch as well.
    -->
    <p>Nearly every school already teaches computers. Very few teach a child to build anything with one — the lesson is still the parts of a machine and the names of the menus, and a learner leaves able to operate software somebody else made. Closing that gap is the whole of what we do.</p>
    <p>${esc(brandContact.displayName)} has taught young people to build with technology for over ten years, and we deliver it as a school’s own technology department — our facilitators, our curriculum, our kits and our platform, running on your site and inside your timetable. We are a young team teaching a young subject, and we hold the work to one test: a learner should see what is possible, learn the process, and leave with progress they can show anywhere in the world.${input.proof
        ? ` ${approx(input.proof.partnerSchools)} schools across Edo State run it today, for ${approx(input.proof.students)} students.`
        : ''
      }</p>
    <!--
      Mission and vision are written as one argument, not two slogans: the
      mission is what changes inside the classroom, the vision is how far what
      it produces travels. Read together they run learner \u2192 standard \u2192 world.

      "Africa's technology leadership" used to sit here and landed nowhere. It
      named a continent but not the child, so the ambition had nothing under it
      \u2014 and it capped the goal at a region when the goal is global. The reach is
      now stated as the standard the learner is measured against, which is the
      thing that actually makes talent portable.
    -->
    <div class="why">
      <!-- No span named: a quote can be scoped to a single year, and the page
           beside this one prints the real count from the curriculum being sold. -->
      <div><b>Our mission \u2014 how technology is taught</b>To replace memorisation with project-driven computational thinking, so a learner builds creativity, analytical reasoning and real engineering capability \u2014 and finishes every term with something that works.</div>
      <div><b>Our vision \u2014 built here, hired anywhere</b>To hold every learner to the standard the global technology industry hires against, so the talent it recruits is built in classrooms like yours \u2014 talent West Africa exports rather than imports.</div>
    </div>
    <!-- Says nothing about how many years. A quote can be scoped to one, and the
         page beside this one already prints the real count from the curriculum
         being sold; a hardcoded "twelve-year" here would contradict it. -->
  </section>` : ''}
${splitOverview ? `${on('fieldProof') ? fieldProofSection : ''}
  ${portfolioBlock()}` : `${pitchSection}
  ${portfolioBlock()}`}`,
      'page page-overview',
    )}

${
      // The pitch takes a sheet of its own only when the overview needed two. On
      // the single-sheet layout it printed above, under the introduction.
      splitOverview
        ? sheet(
          'Partnership Proposal',
          `${pitchSection}
${
          // Four claims, then photographs of them being true. Only when the overview
          // took two sheets: that page has the room for a strip, and on the
          // single-sheet layout there is none.
          galleryStrip(0, 'The programme running', true)
          }`,
        )
        : ''
    }

<!-- What is taught, and how it lands in the school. Its own sheet: these are
     the two questions a head teacher asks after "why", and cramming them under
     the pitch is what pushed that page past the sheet. -->
${sheet(
      'The programme',
      `  ${journey()
      ? `<section>
    <div class="rule"></div>
    <h2>What a child walks out with</h2>
    <p class="hook">${esc(
      scopedLevels.length >= 2
        ? `From ${scopedLevels[0].grade} to ${scopedLevels[scopedLevels.length - 1].grade}, the work gets harder on purpose. They start by making something run on a screen. They finish having shipped ${scopedLevels[scopedLevels.length - 1].capstone || 'a product a parent can hold'}.`
        : 'Every year ends in something built and kept, not a grade on a sheet.',
    )}</p>
    ${journey()}
  </section>`
      : ''
    }


${on('disciplines') ? `  <section>
    <div class="rule"></div>
    <h2>What a parent can see</h2>
    <p class="muted">The conversation at an open day: their child trained a model, wrote a programme, and can open it on the spot.</p>
    <div class="disc">
      ${DISCIPLINES.map(
      (d) => `<div><b>${esc(d.name)}</b>${esc(d.body)}</div>`,
    ).join('')}
    </div>
  </section>` : ''}

${on('rollout') ? `  <section>
    <div class="rule"></div>
    <h2>They see it before you sign</h2>
    <p class="muted">The first week is for your parents. After that it is simply on the timetable — and it is your teachers who do not have to run it.</p>
    <div class="phases">
      ${ROLLOUT_PHASES.map(
      (p) => `<div class="phase">
        <div class="phase-when">${esc(p.when)}</div>
        <div class="phase-name">${esc(p.phase)}</div>
        <div class="phase-body">${esc(p.body)}</div>
      </div>`,
    ).join('')}
    </div>
  </section>` : ''}`,
      'page page-programme',
    )}

<!--
  Commercials, across two sheets.

  All four blocks — the agreed line, the menu, the scope of supply and what is
  not charged for — used to be pinned to one sheet, and at a readable 10pt they
  run 66mm past A4. A page does not spill: it clips. So the last block printed as
  a heading and two of five promises, cut mid-sentence, on the page a proprietor
  reads hardest.

  Nothing is dropped and nothing is reordered. The fee argument keeps a sheet of
  its own — the recommendation, the chart, the card, the alternates and the
  validity date, which belong together. What the fee buys, and what it does not,
  follows on the next. The second sheet distributes its own air the way the money
  sheet does, so it reads as a designed page rather than a short one.
-->
${sheet(
      'Partnership Proposal',
      `  ${agreed}

${feesSection()}`,
      'page page-fees',
    )}

${sheet(
      'What the fee covers',
      `  ${supplySection(true)}
${noExtrasBlock()}`,
      'page page-covers',
    )}

<!-- The money page. Its own sheet, because a head teacher reads this one twice. -->
${sheet(
      "The school's share",
      `  ${splitBlock()}

  ${upsideBlock()}

${reasonToPayBlock()}

${supplySection(false)}
`,
      'page page-money',
    )}


${pathwayPages(
  'Primary Pathway',
  primary,
  'What a primary child learns, year by year',
  'Scratch that moves because they told it to. By the last primary year, a small model and a page a parent can open.',
)}

${pathwayPages(
  'Secondary Pathway',
  secondary,
  'What a secondary student learns, year by year',
  secondary[secondary.length - 1]?.grade === 'SS 3'
    ? 'Python first. Then a product. By SS 3 they have shipped a mobile AI build and can speak to how it was made.'
    : 'Python first. Then a product a parent can open on their phone. The years in between are how they get there.',
)}

<!--
  The case for changing, on its own sheet.

  This page used to carry three blocks. Two of them were saying, in a louder
  voice, what earlier pages had already said properly:

  The zero-CapEx guarantee repeated "No capital outlay, and no idle laboratory"
  from the benefits page and then repeated it a third time as the scope-of-supply
  table — the same promise, three times, in three registers. Its certified
  instructors line repeated "Specialists teach it", and its parent-portal line
  repeated "Evidence your admissions team can show".

  The case studies repeated the capstones page 3 already lists from the
  curriculum, and one of them — the solar irrigation build — was already on
  page 1 as a competition result. A proprietor reading the same project three
  times does not conclude there are three projects.

  What survives is the comparison, because nothing else in the document does
  that job: it is the only place the proposal argues against the alternative
  rather than for itself. On its own it no longer fills a sheet, so it moves up
  to the close and the document loses a page it did not need.
-->


<!-- The comparison, the guarantee and the questions. The page is emitted by the
     sheet helper, so switching all three off drops the sheet instead of printing
     a running head over nothing — which is what the hand-written condition here
     used to do the moment the questions were the only one left on. -->
${sheet(
      'The case for changing',
      `  ${transformationTableBlock()}
  ${zeroCapexBlock()}
  ${faqBlock()}`,
      'page page-case',
    )}

<!-- How it starts, and the place to say yes. Always the last page, and always
     emitted: the close carries the signature block, so this sheet must never
     depend on a section the studio can switch off. -->
<div class="page page-close">
  <div class="pagehead"><span><b>Getting started</b> · ${esc(input.school.name)}</span><span>${esc(input.reference)}<span class="pno"></span></span></div>

${on('whyNow') ? `  <section>
    <div class="rule"></div>
    <h2>Why now</h2>
    <ul class="ticks">
      ${WHY_NOW.map((w) => `<li>${esc(w)}</li>`).join('')}
    </ul>
  </section>` : ''}

${on('fieldProof') && !splitOverview ? fieldProofSection : ''}

  ${splitOverview ? galleryStrip(3, 'Inside a partner school', true) : gallery}

  ${closingBlock}
</div>

</body>
</html>`;
}
