/**
 * The Memorandum of Understanding, rendered from the agreed record.
 *
 * This is the document that ends the Desktop. Seventeen MoU PDFs sit there for
 * one school — `_Final`, `_Master`, `_30k`, `_10k_15k_25k`, `_70_30_Pop150` —
 * with the commercial terms versioned by filename and no way to tell which one
 * was signed. Two of them were written in the same minute.
 *
 * Here the terms come from `partnership_terms` and nowhere else, so the fee in
 * clause 3 is the fee the invoice will charge. Unlike the proposal, terms are
 * required: an MoU is the agreement, and there is nothing to agree without them.
 *
 * Contract, not brochure — so the curriculum appears as a compact schedule
 * rather than the proposal's year cards, and no part of it is AI-written.
 */
import { brandContact } from '@/config/brand';
import { SIGNATURE_SLOT_END, SIGNATURE_SLOT_START, escapeHtml as esc } from '../signing';
import { assetUrl } from './asset-url';
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
  /** Headcount used to illustrate clause 3. Zero hides the worked example. */
  illustrativeStudents?: number;
  /**
   * Which half of the ladder this agreement covers. The schedule must describe
   * the years actually being taught — an agreement that annexes SS years to a
   * primary school commits us to delivering them.
   */
  stage?: CurriculumStage | null;
};

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

  // Clause 3 states the agreed terms in the one sentence every document uses,
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
          ${
            // A school plans in sessions, not terms. The agreement stated only the
            // per-term figure, so the number a proprietor actually budgets against
            // was left for them to work out — on the one page they reread. Shown
            // only where a term is genuinely the billing cycle; multiplying by
            // three under any other cadence would be inventing a number.
            String(terms.billing_cycle || 'term').toLowerCase() === 'term'
              ? `<tr class="sess"><td>Over a full session (three terms)</td><td class="num">${esc(money(example.subtotal * 3, terms.currency))}</td></tr>
                 ${
                   shareOn
                     ? `<tr class="sess"><td>${esc(school.name)} share for the session</td><td class="num strong">${esc(money(example.schoolSettlement * 3, terms.currency))}</td></tr>`
                     : ''
                 }`
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
    /* 1.5 rather than 1.55. The parties page was clipping its own content by
       19px; a contract is read closely, not skimmed, and the tighter leading buys
       back roughly a line per clause across every page. */
    font: 9.8pt/1.5 "Inter", system-ui, -apple-system, sans-serif;
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

  /* The document names itself in type, not in a tinted box. It was the last of
     the boxes, and on a page whose content was clipping by 19px it was costing
     roughly 10mm to say what the masthead above it already implies. Bigger and
     quieter at the same time. */
  .doctitle { text-align: center; margin: 0 0 4mm; }
  .doctitle h1 { font-size: 19pt; margin: 0 0 1.4mm; color: #0f172a; letter-spacing: -.5px; font-weight: 800; }
  .doctitle .sub { font-size: 9.4pt; color: #64748b; font-weight: 500; }
  /* Scan, or type the code, or type the address — in that order of effort. */
  /* ── Scan me ──────────────────────────────────────────────────────────
     The same card the proposal cover carries, sized for a page that has 6mm to
     spare rather than 20mm. It was a pale grey strip that read as a footnote;
     on the page where a school decides whether to sign, the route to signing
     should not look like fine print. Dark, so it carries on white, and the red
     rule ties it to the accent under the title. */
  .online {
    display: flex; align-items: center; gap: 3.5mm;
    font-size: 8pt; color: #cbd5e1; line-height: 1.45;
    margin: -1mm auto 3.5mm; max-width: 128mm;
    background: linear-gradient(118deg, #070C1F 0%, #123069 100%);
    border-left: 2mm solid #dc2626; border-radius: 0 1.5mm 1.5mm 0;
    padding: 2.2mm 4mm 2.2mm 3mm;
  }
  /* White plate: a QR printed straight onto navy will not resolve on a camera. */
  .online-qr {
    width: 14mm; height: 14mm; display: block; flex: none;
    background: #fff; padding: 1mm; border-radius: 1mm;
  }
  .online-txt { text-align: left; }
  .online-lead {
    font-size: 6.8pt; font-weight: 800; letter-spacing: .2em; text-transform: uppercase;
    color: #fca5a5;
  }
  .online-txt b { display: block; color: #fff; font-size: 9pt; letter-spacing: .01em; margin-top: .4mm; }
  .online-txt span b { display: inline; font-size: 8pt; }
  .online-code {
    font-family: ui-monospace, 'DM Mono', Menlo, monospace; letter-spacing: .16em;
    font-size: 8.6pt; color: #fff; font-weight: 700;
  }
  .doctitle .band { width: 22mm; height: 2px; background: #991b1b; margin: 2.4mm auto 0; }

  /* A clause heading is type, not a container.
     Every section used to be a full-width solid navy bar. Three of them stack up
     on the first page alone, and the effect is a document that looks like it was
     built to be resisted — a wall. It also cost about 14mm of vertical space per
     page, which is why the parties page was clipping its own content.
     Same treatment the proposal uses: a short accent rule, then strong type. The
     clause numbers stay, because this is still a contract and both sides need to
     be able to say "clause 3". */
  h2 {
    font-size: 12.4pt; color: #0f172a; margin: 0 0 3mm;
    letter-spacing: -.2px; font-weight: 800; padding-top: 2mm;
    border-top: 2px solid #991b1b; display: table; padding-right: 6mm;
  }
  h2 .cl { color: #991b1b; font-weight: 800; margin-right: 1.6mm; }
  /* A clause that splits across a sheet is a clause somebody can say they never
     saw — and a page clips its overflow, so a section that does not fit is not
     merely awkward, it is content that silently disappears. Nothing splits. */
  /* 3.6mm, not 4.2mm. The parties page carries three clauses and a long school
     name reaches into all of them, so the gaps between clauses are where the
     room comes from rather than the clauses themselves. */
  section { margin-bottom: 3.6mm; break-inside: avoid; page-break-inside: avoid; }
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

  /* Obligations set as two columns of type with a hairline above each, not two
     boxes. Boxing every block is what made this read like a form to be endured
     rather than an agreement to be read — and the borders cost height on a page
     that was already clipping. */
  .duties { display: grid; grid-template-columns: 1fr 1fr; gap: 4.5mm 8mm; }
  .duties > div { border-top: 1px solid #e2e8f0; padding-top: 2.4mm; }
  .duties li { margin-bottom: .8mm; }
  .duties ol { padding-left: 5mm; }
  .duties h3 { margin: 0 0 2mm; font-size: 8.8pt; text-transform: uppercase; letter-spacing: .07em; color: #991b1b; font-weight: 700; }

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
  /* The session view, set apart from the per-term rows above it so nobody reads
     a session total as a term invoice. */
  .fin tr.sess td { border-top: 1.5px solid #0f172a; background: #f8fafc; font-weight: 600; }

  .sign { display: grid; grid-template-columns: 1fr 1fr; gap: 12mm; margin-top: 10mm; break-inside: avoid; }
  /* Both signature blocks start their rule at the same height. A long school name
     wraps this label onto a second line, and with a plain margin that pushed one
     party's line lower than the other's — on the two lines whose whole job is to
     look equal. */
  .sign-box .who {
    font-size: 8.4pt; text-transform: uppercase; letter-spacing: .08em; color: #991b1b;
    font-weight: 700; min-height: 9mm; margin-bottom: 14mm;
  }
  .sig { display: block; height: 15mm; width: auto; max-width: 55mm; margin: 0 0 -2mm; mix-blend-mode: multiply; }
  /* Exactly what .sig occupies (15mm less its -2mm pull), so the counterparty's
     rule lands level with ours instead of 15mm above it. */
  .sig-space { height: 13mm; }
  .sign-box .line { border-top: 1.5px solid #0f172a; padding-top: 2mm; font-size: 8.6pt; color: #334155; }
  .sign-box .nm { font-weight: 700; color: #0f172a; }
  .stamp { margin-top: 7mm; border: 1.5px dashed #cbd5e1; height: 24mm; border-radius: 2mm; display: flex;
    align-items: center; justify-content: center; color: #94a3b8; font-size: 8.2pt; font-weight: 500; background: #fafafa; }
  /* Already executed, so it is a statement rather than an empty box waiting. */
  .stamp-done {
    border: 1px solid #bbf7d0; background: #f0fdf4; color: #15803d;
    border-style: solid; height: auto; padding: 3mm; text-align: center; font-weight: 600;
  }
  /* The execution-page card. Same language as page one, at the size a page with
     20mm to spare can carry — this is the one instruction on the sheet that
     turns a printed contract into a signed one. */
  .sign-scan {
    display: flex; align-items: center; gap: 5mm; break-inside: avoid;
    margin: 4mm 0 6mm; padding: 4mm 6mm 4mm 4.5mm;
    background: linear-gradient(118deg, #070C1F 0%, #123069 100%);
    border-left: 2.5mm solid #dc2626; border-radius: 0 2mm 2mm 0;
    box-shadow: 0 2px 7px rgba(15, 23, 42, .18);
  }
  .sign-scan-qr {
    width: 22mm; height: 22mm; display: block; flex: none;
    background: #fff; padding: 1.5mm; border-radius: 1.2mm;
  }
  .sign-scan-lead {
    font-size: 7.6pt; font-weight: 800; letter-spacing: .2em; text-transform: uppercase;
    color: #fca5a5;
  }
  .sign-scan-title { display: block; font-size: 11.5pt; color: #fff; margin-top: .8mm; font-weight: 800; }
  .sign-scan-sub { font-size: 8.2pt; color: #cbd5e1; margin-top: 1.6mm; line-height: 1.5; }
  .sign-scan-sub b { color: #fff; font-weight: 700; }
  .sign-scan-code {
    font-family: ui-monospace, 'DM Mono', Menlo, monospace; letter-spacing: .16em;
    font-size: 9.4pt; color: #fff; font-weight: 700;
  }
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
    <div class="band"></div>
  </div>
  ${
    // Where to read and sign it, and how to get back in without the email. On
    // page one because that is where somebody looks when the link has gone.
    input.accessCode
      ? `<div class="online">
      ${
        // Scan and it opens. The code beneath is for anybody without a camera to
        // hand, and the address for anybody who would rather type.
        input.accessQrDataUrl
          ? `<img class="online-qr" src="${esc(input.accessQrDataUrl)}" alt="Scan to read and sign this agreement">`
          : ''
      }
      <div class="online-txt">
        <div class="online-lead">Scan me</div>
        <b>Read and sign this agreement on your phone</b>
        <span>No camera? Go to <b>${esc(brandContact.web)}/p</b> and type
        <span class="online-code">${esc(input.accessCode)}</span></span>
      </div>
    </div>`
      : ''
  }

  <section>
    <h2><span class="cl">1.0</span> Parties to the Agreement</h2>
    <div class="parties">
      <div class="party">
        <div class="role">Party A</div>
        <div class="nm">${esc(brandContact.registeredName)}</div>
        <div class="meta">Trading as ${esc(brandContact.displayName)} · ${esc(brandContact.rcNumber)}<br>${esc(brandContact.address)}<br>${esc(brandContact.phone)} · ${esc(brandContact.email)}</div>
      </div>
      <div class="party">
        <div class="role">Party B</div>
        <div class="nm">${esc(school.name)}</div>
        <!-- Both lines, not one. Party A carries four lines of detail and Party B
             carried a street on its own, so the two parties looked unequal on the
             page where the whole point is that they are not. -->
        <div class="meta">${[school.address, location]
          .filter(Boolean)
          .map((line) => esc(line))
          .join('<br>') || 'Address on file'}</div>
      </div>
    </div>
    <p style="margin-top:3mm">This Memorandum records the understanding between the parties named above for the delivery of a structured coding, robotics and artificial intelligence programme to students of ${esc(school.name)}${location ? `, ${esc(location)}` : ''}. It sets out what each party provides, the agreed commercial terms, and the basis on which the partnership may be reviewed or ended.</p>
    <p>The parties intend to establish practical technology education as a standing part of the school's offering — not a one-off enrichment activity — so that students progress year on year and leave with demonstrable work. The partnership positions ${esc(school.name)} as a school preparing its students for technical and entrepreneurial work, and gives parents evidence of that preparation each term.</p>
  </section>

  <section>
    <h2><span class="cl">2.0</span> Commitments of the Parties</h2>
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
        <h3>The School (Party B) provides</h3>
        <ol>
          <li>A suitable classroom or laboratory for each scheduled session.</li>
          <li>A confirmed slot on the school timetable for the agreed cadence.</li>
          <li>Student registration and communication with parents.</li>
          <li>A named staff contact for scheduling and day-to-day coordination.</li>
          <li>Reasonable access to power and internet where available.</li>
          <li>Collection and remittance of programme fees on the terms in clause 3.</li>
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
    <h2><span class="cl">3.0</span> Financial Framework</h2>
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

  <!-- Term and termination sit with the money on purpose. What it costs and how
       to leave are the two questions a proprietor actually has, and they were on
       different sheets while this page ran barely half full. -->
  <section>
    <h2><span class="cl">4.0</span> Term, Review and Termination</h2>
    <ol>
      <li>This Memorandum takes effect from ${esc(input.commencement || 'the commencement of the next academic term')} and continues for ${esc(input.durationLabel || 'one academic session')}, after which it is reviewed by both parties.</li>
      <li>Either party may end this Memorandum by giving one full term's written notice, so that no cohort is interrupted mid-term.</li>
      <li>Fees already invoiced for a term in progress remain payable.</li>
      <li>Equipment supplied by ${esc(brandContact.registeredName)} remains the property of ${esc(brandContact.registeredName)} and is returned on termination.</li>
      <li>Student records and work produced remain accessible to the students and to the school.</li>
    </ol>
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
    <h2><span class="cl">5.0</span> Schedule of Learning — ${esc(curriculum.title)}</h2>
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
    <h2><span class="cl">6.0</span> General</h2>
    <ol>
      <li>Each party is responsible for the conduct and safeguarding compliance of its own personnel on the school's premises.</li>
      <li>Neither party may use the other's name or marks in publicity without prior written consent, which is not unreasonably withheld.</li>
      <li>This Memorandum is governed by the laws of the Federal Republic of Nigeria.</li>
      <li>Disputes are first addressed by good-faith discussion between the signatories below.</li>
    </ol>
  </section>

  <section>
    <h2><span class="cl">7.0</span> Execution</h2>
    <p class="muted">Signed by the duly authorised representatives of the parties on the date first written above.</p>
    
    ${
      /*
        The way in, repeated beside the place they sign — and the same way in as
        page one, which it did not used to be.

        This panel had its own idea of how to get back to the document. It drew
        its QR from api.qrserver.com, so the code only appeared if the reader
        had a working connection and that third party was up, and it handed that
        third party the reference on the way past. Worse, both the QR and the
        line beneath it carried `input.reference`: the QR pointed at
        /p?code=RC-MOU-2026-00007 and the caption offered the same string as the
        "Quick Access Code". The reference is not a credential and the public
        route refuses it, so a school following the instruction printed on its
        own agreement was told the document did not exist.

        It now shows what page one shows: the QR rendered locally from the share
        token, and the six digits that actually open the document. Absent both,
        it prints nothing rather than an invitation that fails.
      */
      /*
        The same card again, on the page where it is actually acted on — and
        this page has the room to let it be the largest thing on it.

        The ask changes here. On page one the invitation is to read; beside the
        signature blocks it is to sign, which is the whole reason a school can
        execute this from a phone in a staff room instead of printing, signing,
        scanning and emailing it back. So the QR is 22mm rather than 14mm, and
        the wording says sign rather than read.
      */
      input.accessCode
        ? `<div class="sign-scan">
      ${
        input.accessQrDataUrl
          ? `<img class="sign-scan-qr" src="${esc(input.accessQrDataUrl)}" alt="Scan to sign this agreement" />`
          : ''
      }
      <div>
        <div class="sign-scan-lead">Scan to sign</div>
        <b class="sign-scan-title">Execute this agreement from your phone</b>
        <div class="sign-scan-sub">
          Takes about a minute. Signed on screen, binding, and a copy is emailed to both parties.<br>
          No camera? Go to <b>${esc(brandContact.web)}/p</b> and type
          <span class="sign-scan-code">${esc(input.accessCode)}</span>
        </div>
      </div>
    </div>`
        : ''
    }

    <div class="sign">
      <!--
        Party A's signature is pre-filled from brandContact, so every MoU that
        lands in their inbox is already signed by us and needs only their name.
        That is the difference between a form and an agreement.
      -->
      <div class="sign-box">
        <div class="who">For ${esc(brandContact.registeredName)} (Party A)</div>
        ${
          brandContact.signatory
            ? `<img class="sig" src="${esc(assetUrl(brandContact.signatureImage))}" alt="">
        <div class="line">
          <div class="nm">${esc(brandContact.signatory)}</div>
          <div class="muted">${esc(brandContact.signatoryRole)} &middot; ${esc(input.dateLabel)}</div>
        </div>
        <div class="stamp stamp-done">Signed and issued under reference ${esc(input.reference)}</div>`
            : `<div class="line">
          <div class="nm">Name &amp; signature</div>
          <div class="muted">Date</div>
        </div>
        <div class="stamp">Official stamp</div>`
        }
      </div>
      <div class="sign-box">
        <div class="who">For ${esc(school.name)} (Party B)</div>
        <!--
          Everything between the markers is the *unsigned* state, and signing
          replaces the lot. It used to sit outside the anchor, so an executed
          MoU printed this blank ruled line and the empty stamp square directly
          above the school's actual signature.
        -->
        ${SIGNATURE_SLOT_START}
        <!-- Party A carries a signature image above its rule and Party B, until
             somebody signs, carries nothing — so the two rules printed about
             15mm apart on a page whose entire point is that the parties are
             equal. This reserves the same height the image occupies. It sits
             inside the slot, so signing replaces it along with the rest. -->
        <div class="sig-space"></div>
        <div class="line">
          <!-- The fallback is escaped with everything else, so it has to be the raw
               character. Written pre-escaped it was escaped twice, and the entity
               printed as visible text on the line the school signs. -->
          <div class="nm">${esc(school.signatoryName || 'Name & signature')}</div>
          <div class="muted">${esc(school.signatoryRole || 'Date')}</div>
        </div>
        <div class="stamp">Official stamp</div>
        ${SIGNATURE_SLOT_END}
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
