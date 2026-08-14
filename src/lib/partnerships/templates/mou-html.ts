/**
 * The Memorandum of Understanding, rendered from the agreed record.
 *
 * This is the document that ends the Desktop. Seventeen MoU PDFs sit there for
 * one school — `_Final`, `_Master`, `_30k`, `_10k_15k_25k`, `_70_30_Pop150` —
 * with the commercial terms versioned by filename and no way to tell which one
 * was signed. Two of them were written in the same minute.
 *
 * Here the terms come from `partnership_terms` and nowhere else, so the fee in
 * clause 8 is the fee the invoice will charge. Unlike the proposal, terms are
 * required: an MoU is the agreement, and there is nothing to agree without them.
 *
 * Contract, not brochure — so the curriculum appears as a compact schedule
 * rather than the proposal's year cards, and no part of it is AI-written.
 */
import { brandContact } from '@/config/brand';
import { SIGNATURE_ANCHOR } from '../signing';
import type { CurriculumProgression, CurriculumStage, ProgressionLevel } from '../curriculum';
import { levelsForStage, splitByStage } from '../curriculum';
import { computeCharge, describeTerms, type PartnershipTerms } from '../terms';

export type MouParty = {
  name: string;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  signatoryName?: string | null;
  signatoryRole?: string | null;
};

export type MouInput = {
  school: MouParty;
  /** Required. An MoU without agreed terms is not an agreement. */
  terms: PartnershipTerms;
  curriculum: CurriculumProgression | null;
  reference: string;
  dateLabel: string;
  /** Academic session or start point, e.g. "First Term, 2026/2027". */
  commencement?: string | null;
  /** How long the agreement runs before review. */
  durationLabel?: string | null;
  /** Headcount used to illustrate clause 8. Zero hides the worked example. */
  illustrativeStudents?: number;
  /**
   * Which half of the ladder this agreement covers. The schedule must describe
   * the years actually being taught — an agreement that annexes SS years to a
   * primary school commits us to delivering them.
   */
  stage?: CurriculumStage | null;
};

const esc = (s: unknown): string =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

const money = (n: number, currency = 'NGN'): string =>
  `${currency === 'NGN' ? '₦' : currency + ' '}${Math.round(n).toLocaleString('en-NG')}`;

function scheduleRows(levels: ProgressionLevel[]): string {
  return levels
    .map(
      (l) => `
      <tr>
        <td class="g">${esc(l.grade)}</td>
        <td>${esc(l.theme)}</td>
        <td class="cap">${esc(l.capstone ?? '—')}</td>
      </tr>`,
    )
    .join('');
}

export function buildPartnershipMouHTML(input: MouInput): string {
  const { school, terms, curriculum } = input;
  const location = [school.city, school.state].filter(Boolean).join(', ');
  const { primary, secondary } = curriculum
    ? splitByStage(levelsForStage(curriculum.levels, input.stage))
    : { primary: [], secondary: [] };

  const shareOn = terms.rillcod_share_percent != null;
  const count = Math.max(0, Math.floor(input.illustrativeStudents ?? 0));
  const example = count > 0 ? computeCharge(terms, count) : null;

  // Clause 8 states the agreed terms in the one sentence every document uses,
  // then works it through at a stated headcount so neither side is doing
  // arithmetic in their head at signing.
  const worked =
    example && example.subtotal > 0
      ? `
      <table class="fin">
        <thead>
          <tr><th>At ${count} enrolled students</th><th>Amount</th></tr>
        </thead>
        <tbody>
          <tr><td>Gross programme revenue per term</td><td class="num">${esc(money(example.subtotal, terms.currency))}</td></tr>
          ${
            shareOn
              ? `<tr><td>${esc(brandContact.registeredName)} operations (${esc(terms.rillcod_share_percent)}%)</td><td class="num strong">${esc(money(example.rillcodRetain, terms.currency))}</td></tr>
                 <tr><td>${esc(school.name)} share (${esc(terms.school_share_percent)}%)</td><td class="num strong">${esc(money(example.schoolSettlement, terms.currency))}</td></tr>`
              : `<tr><td>Payable to ${esc(brandContact.registeredName)}</td><td class="num strong">${esc(money(example.rillcodRetain, terms.currency))}</td></tr>`
          }
          ${
            example.deposit > 0
              ? `<tr><td>Less agreed deposit</td><td class="num">${esc(money(example.deposit, terms.currency))}</td></tr>
                 <tr><td>Balance due</td><td class="num strong">${esc(money(example.balance, terms.currency))}</td></tr>`
              : ''
          }
        </tbody>
      </table>
      <p class="muted">Illustrative at ${count} students. The sum invoiced each term follows actual enrolment on the same terms.</p>`
      : '<p class="muted">Amounts are invoiced each term against actual enrolment on the terms stated above.</p>';

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Memorandum of Understanding — ${esc(brandContact.registeredName)} &amp; ${esc(school.name)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Plus+Jakarta+Sans:wght@600;700;800&display=swap" rel="stylesheet">
<style>
  @page { size: A4 portrait; margin: 0; }
  * { box-sizing: border-box; }
  
  html { background: #0f172a; }
  body {
    margin: 0; padding: 24px 0; background: #0f172a; color: #1e293b;
    font: 9.8pt/1.55 "Inter", system-ui, -apple-system, sans-serif;
    -webkit-print-color-adjust: exact; print-color-adjust: exact;
    display: flex; flex-direction: column; align-items: center; gap: 24px;
  }

  .page {
    width: 210mm; min-height: 297mm; padding: 15mm 14mm;
    background: #ffffff; color: #1e293b;
    box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.5), 0 8px 10px -6px rgba(0, 0, 0, 0.4);
    border-radius: 2px; position: relative; box-sizing: border-box;
    overflow: hidden;
  }

  @media print {
    html, body { background: #ffffff !important; padding: 0 !important; gap: 0 !important; display: block !important; }
    .page {
      width: 210mm !important; height: 297mm !important; min-height: 297mm !important;
      padding: 15mm 14mm !important; box-shadow: none !important; border-radius: 0 !important;
      page-break-after: always; break-after: page; page-break-inside: avoid; break-inside: avoid;
    }
    .page:last-child { page-break-after: auto; break-after: auto; }
  }

  h1, h2, h3, .brand, .party .nm, .doctitle h1 { font-family: "Plus Jakarta Sans", "Inter", sans-serif; }

  .head { display: flex; justify-content: space-between; align-items: flex-end;
    border-bottom: 3px solid #991b1b; padding-bottom: 3mm; margin-bottom: 4.5mm; }
  .head-l .brand { font-size: 16pt; font-weight: 800; color: #0f172a; letter-spacing: -.4px; }
  .head-l .tag { font-size: 8.2pt; text-transform: uppercase; letter-spacing: .1em; color: #991b1b; font-weight: 700; }
  .head-r { text-align: right; font-size: 8.5pt; color: #64748b; }
  .head-r b { display: block; color: #0f172a; font-size: 9.5pt; font-weight: 700; }

  .doctitle { text-align: center; margin: 0 0 4.5mm; background: #f8fafc; padding: 2.8mm 0; border-radius: 2mm; border: 1px solid #e2e8f0; }
  .doctitle h1 { font-size: 15.5pt; margin: 0 0 1.2mm; color: #0f172a; letter-spacing: -.3px; font-weight: 800; }
  .doctitle .sub { font-size: 9.2pt; color: #64748b; font-weight: 500; }

  h2 { font-size: 10.8pt; color: #fff; background: #0f172a; padding: 2mm 3.5mm;
    margin: 0 0 3.5mm; letter-spacing: .02em; font-weight: 700; border-radius: 1mm; }
  /* A clause that splits across a sheet is a clause somebody can say they never
     saw — and a page clips its overflow, so a section that does not fit is not
     merely awkward, it is content that silently disappears. Nothing splits. */
  section { margin-bottom: 4.2mm; break-inside: avoid; page-break-inside: avoid; }
  li, tr, .sign, .sign-box, .party, .terms-line, table {
    break-inside: avoid; page-break-inside: avoid;
  }
  h2 { break-after: avoid; page-break-after: avoid; }

  /* Every sheet names itself and carries somewhere to initial, which is how a
     four-page agreement stays one document once it has been printed. */
  .pagefoot {
    position: absolute; left: 14mm; right: 14mm; bottom: 7mm;
    border-top: 1px solid #e2e8f0; padding-top: 2mm;
    font-size: 7.4pt; color: #94a3b8; letter-spacing: .02em;
    display: flex; justify-content: space-between;
  }

  p { margin: 0 0 2.2mm; }
  .muted { color: #64748b; font-size: 8.8pt; }
  ol { margin: 0 0 2.5mm; padding-left: 5.5mm; }
  li { margin-bottom: 1.1mm; color: #334155; }

  .parties { display: grid; grid-template-columns: 1fr 1fr; gap: 4.5mm; }
  .party { border: 1px solid #e2e8f0; border-top: 3px solid #991b1b; padding: 2.8mm 3.6mm; border-radius: 1.5mm; background: #f8fafc; }
  .party .role { font-size: 7.8pt; text-transform: uppercase; letter-spacing: .09em; color: #991b1b; margin-bottom: 1.2mm; font-weight: 700; }
  .party .nm { font-weight: 700; font-size: 10.6pt; color: #0f172a; }
  .party .meta { font-size: 8.5pt; color: #64748b; margin-top: 1.2mm; line-height: 1.45; }

  .duties { display: grid; grid-template-columns: 1fr 1fr; gap: 4.5mm; }
  .duties > div { border: 1px solid #e2e8f0; padding: 2.6mm 3.4mm; border-radius: 1.5mm; background: #fff; }
  .duties h3 { margin: 0 0 2.5mm; font-size: 8.8pt; text-transform: uppercase; letter-spacing: .07em; color: #991b1b; font-weight: 700; }

  .terms-line { background: #fff5f5; border: 1px solid #fecaca; padding: 3.5mm 4.5mm; margin-bottom: 3.5mm; border-radius: 1.5mm; }
  .terms-line .lbl { font-size: 7.8pt; text-transform: uppercase; letter-spacing: .09em; color: #991b1b; font-weight: 700; }
  .terms-line .val { font-size: 11.8pt; font-weight: 800; color: #991b1b; }

  table { width: 100%; border-collapse: collapse; font-size: 9pt; }
  th { background: #0f172a; color: #fff; text-align: left; padding: 2.2mm 3mm;
    font-size: 8pt; text-transform: uppercase; letter-spacing: .06em; font-weight: 700; }
  td { padding: 2.2mm 3mm; border-bottom: 1px solid #e2e8f0; vertical-align: top; }
  .num { text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; }
  .strong { font-weight: 700; color: #991b1b; }
  .g { white-space: nowrap; font-weight: 700; color: #0f172a; }
  .cap { color: #475569; }
  .fin { margin-bottom: 2.5mm; }

  .sign { display: grid; grid-template-columns: 1fr 1fr; gap: 12mm; margin-top: 10mm; break-inside: avoid; }
  .sign-box .who { font-size: 8.4pt; text-transform: uppercase; letter-spacing: .08em; color: #991b1b; margin-bottom: 14mm; font-weight: 700; }
  .sign-box .line { border-top: 1.5px solid #0f172a; padding-top: 2mm; font-size: 8.6pt; color: #334155; }
  .sign-box .nm { font-weight: 700; color: #0f172a; }
  .stamp { margin-top: 7mm; border: 1.5px dashed #cbd5e1; height: 24mm; border-radius: 2mm; display: flex;
    align-items: center; justify-content: center; color: #94a3b8; font-size: 8.2pt; font-weight: 500; background: #fafafa; }
  .foot { border-top: 1px solid #e2e8f0; margin-top: 7mm; padding-top: 3mm;
    font-size: 8pt; color: #64748b; display: flex; justify-content: space-between; }
</style>
</head>
<body>

<div class="page">
  <div class="head">
    <div class="head-l">
      <div class="brand">${esc(brandContact.displayName)}</div>
      <div class="tag">${esc(brandContact.tagline)}</div>
    </div>
    <div class="head-r"><b>${esc(input.reference)}</b>${esc(input.dateLabel)}</div>
  </div>

  <div class="doctitle">
    <h1>Memorandum of Understanding</h1>
    <div class="sub">Coding, Robotics &amp; Artificial Intelligence Education Partnership</div>
  </div>

  <section>
    <h2>1.0 Parties to the Agreement</h2>
    <div class="parties">
      <div class="party">
        <div class="role">Party A</div>
        <div class="nm">${esc(brandContact.registeredName)}</div>
        <div class="meta">Trading as ${esc(brandContact.displayName)} · ${esc(brandContact.rcNumber)}<br>${esc(brandContact.address)}<br>${esc(brandContact.phone)} · ${esc(brandContact.email)}</div>
      </div>
      <div class="party">
        <div class="role">Party B</div>
        <div class="nm">${esc(school.name)}</div>
        <div class="meta">${esc(school.address || location || 'Address on file')}</div>
      </div>
    </div>
    <p style="margin-top:3mm">This Memorandum records the understanding between the parties named above for the delivery of a structured coding, robotics and artificial intelligence programme to students of ${esc(school.name)}${location ? `, ${esc(location)}` : ''}. It sets out what each party provides, the agreed commercial terms, and the basis on which the partnership may be reviewed or ended.</p>
  </section>

  <section>
    <h2>2.0 Purpose</h2>
    <p>The parties intend to establish practical technology education as a standing part of the school's offering — not a one-off enrichment activity — so that students progress year on year and leave with demonstrable work. The partnership positions ${esc(school.name)} as a school preparing its students for technical and entrepreneurial work, and gives parents evidence of that preparation each term.</p>
  </section>

  <section>
    <h2>3.0 Commitments of the Parties</h2>
    <div class="duties">
      <div>
        <h3>${esc(brandContact.registeredName)} provides</h3>
        <ol>
          <li>Trained facilitators to deliver every scheduled session on the school's premises.</li>
          <li>The full curriculum, lesson materials and termly assessments.</li>
          <li>Robotics kits, devices and consumables required for practical work.</li>
          <li>Learning platform access, student and parent logins, and progress reporting.</li>
          <li>Termly progress reports for the school and for parents.</li>
          <li>Orientation for school staff who wish to observe or co-teach.</li>
        </ol>
      </div>
      <div>
        <h3>${esc(school.name)} provides</h3>
        <ol>
          <li>A suitable classroom or laboratory for each scheduled session.</li>
          <li>A confirmed slot on the school timetable for the agreed cadence.</li>
          <li>Student registration and communication with parents.</li>
          <li>A named staff contact for scheduling and day-to-day coordination.</li>
          <li>Reasonable access to power and internet where available.</li>
          <li>Collection and remittance of programme fees on the terms in clause 4.</li>
        </ol>
      </div>
    </div>
  </section>

  <div class="pagefoot"><span>Page 1 · ${esc(input.reference)}</span><span>Initialled …………… / ……………</span></div>
</div>

<!-- The money on its own sheet. It is the clause both sides reread, and it
     carries the table nobody should have to hunt across a page break for. -->
<div class="page">
  <div class="head">
    <div class="head-l">
      <div class="brand">Memorandum of Understanding</div>
      <div class="tag">${esc(brandContact.displayName)} &amp; ${esc(school.name)}</div>
    </div>
    <div class="head-r"><b>${esc(input.reference)}</b>Page 2</div>
  </div>

  <section>
    <h2>4.0 Financial Framework</h2>
    <div class="terms-line">
      <div class="lbl">Agreed terms</div>
      <div class="val">${esc(describeTerms(terms))}</div>
    </div>
    ${worked}
    <p>Invoices are issued each term against enrolment. ${
      shareOn
        ? `Fees are collected by ${esc(school.name)} and settled with ${esc(brandContact.registeredName)} on the split stated above.`
        : 'Payment falls due within the period stated on each invoice.'
    } Any change to these terms takes effect only when both parties record a superseding agreement in writing.</p>
  </section>

  <div class="pagefoot"><span>Page 2 · ${esc(input.reference)}</span><span>Initialled …………… / ……………</span></div>
</div>

<div class="page">
  <div class="head">
    <div class="head-l">
      <div class="brand">Memorandum of Understanding</div>
      <div class="tag">${esc(brandContact.displayName)} &amp; ${esc(school.name)}</div>
    </div>
    <div class="head-r"><b>${esc(input.reference)}</b>Page 3</div>
  </div>

  ${
    curriculum
      ? `<section>
    <h2>5.0 Schedule of Learning — ${esc(curriculum.title)}</h2>
    <p class="muted">Edition ${esc(curriculum.edition)}. The programme delivered under this Memorandum follows the progression below. Each year carries three termly focuses and a capstone build.</p>
    ${
      primary.length
        ? `<table style="margin-bottom:4mm">
      <thead><tr><th style="width:18%">Year group</th><th style="width:44%">Focus</th><th>Capstone build</th></tr></thead>
      <tbody>${scheduleRows(primary)}</tbody>
    </table>`
        : ''
    }
    ${
      secondary.length
        ? `<table>
      <thead><tr><th style="width:18%">Year group</th><th style="width:44%">Focus</th><th>Capstone build</th></tr></thead>
      <tbody>${scheduleRows(secondary)}</tbody>
    </table>`
        : ''
    }
  </section>`
      : ''
  }

  <div class="pagefoot"><span>Page 3 · ${esc(input.reference)}</span><span>Initialled …………… / ……………</span></div>
</div>

<!-- Closing clauses and execution. Signatures sit on a sheet of their own so a
     signed copy can never be a page that also carried half a schedule. -->
<div class="page">
  <div class="head">
    <div class="head-l">
      <div class="brand">Memorandum of Understanding</div>
      <div class="tag">${esc(brandContact.displayName)} &amp; ${esc(school.name)}</div>
    </div>
    <div class="head-r"><b>${esc(input.reference)}</b>Page 4</div>
  </div>

  <section>
    <h2>6.0 Term, Review and Termination</h2>
    <ol>
      <li>This Memorandum takes effect from ${esc(input.commencement || 'the commencement of the next academic term')} and continues for ${esc(input.durationLabel || 'one academic session')}, after which it is reviewed by both parties.</li>
      <li>Either party may end this Memorandum by giving one full term's written notice, so that no cohort is interrupted mid-term.</li>
      <li>Fees already invoiced for a term in progress remain payable.</li>
      <li>Equipment supplied by ${esc(brandContact.registeredName)} remains the property of ${esc(brandContact.registeredName)} and is returned on termination.</li>
      <li>Student records and work produced remain accessible to the students and to the school.</li>
    </ol>
  </section>

  <section>
    <h2>7.0 General</h2>
    <ol>
      <li>Each party is responsible for the conduct and safeguarding compliance of its own personnel on the school's premises.</li>
      <li>Neither party may use the other's name or marks in publicity without prior written consent, which is not unreasonably withheld.</li>
      <li>This Memorandum is governed by the laws of the Federal Republic of Nigeria.</li>
      <li>Disputes are first addressed by good-faith discussion between the signatories below.</li>
    </ol>
  </section>

  <section>
    <h2>8.0 Execution</h2>
    <p class="muted">Signed by the duly authorised representatives of the parties on the date first written above.</p>
    <div class="sign">
      <div class="sign-box">
        <div class="who">For ${esc(brandContact.registeredName)} (Party A)</div>
        <div class="line">
          <div class="nm">Name &amp; signature</div>
          <div class="muted">Date</div>
        </div>
        <div class="stamp">Official stamp</div>
      </div>
      <div class="sign-box">
        <div class="who">For ${esc(school.name)} (Party B)</div>
        <div class="line">
          <div class="nm">${esc(school.signatoryName || 'Name &amp; signature')}</div>
          <div class="muted">${esc(school.signatoryRole || 'Date')}</div>
        </div>
        <div class="stamp">Official stamp</div>
        ${SIGNATURE_ANCHOR}
      </div>
    </div>
  </section>

  <div class="foot">
    <span>${esc(brandContact.address)}</span>
    <span>${esc(input.reference)}</span>
  </div>
</div>

</body>
</html>`;
}
