#!/usr/bin/env npx tsx
/**
 * Fail the build when a document page runs past the sheet it is pinned to.
 *
 * Both partnership templates lay out A4 pages at a fixed 297mm with
 * `overflow: hidden`. Content that does not fit is not scrolled — it is
 * destroyed, silently, with no error anywhere. Types cannot see it and neither
 * can the unit tests: a page 400px over budget renders, parses and asserts
 * exactly like one that fits.
 *
 * It has happened five times: the overview page by 413px, the MoU parties page
 * by 19px, and three sections dropped onto full pages by 381px, 336px and 246px.
 * Each was caught only by rendering the document and measuring it by hand.
 *
 * This is that measurement, made permanent. jsdom has no layout engine, so this
 * cannot live in vitest — it needs a real browser. Run it alongside
 * `check:schema` and `check:writes`.
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/** A4 at 96dpi. The height the print rule pins every page to. */
const PAGE_H = 1123;
/**
 * Pages are allowed to come this close and no closer. A document measured at
 * four pixels of clearance is one font substitution away from losing a line.
 */
const MIN_CLEARANCE = Number(process.env.PAGE_FIT_MIN ?? 12);
/** PAGE_FIT_VERBOSE=1 lists every page, which is how you find what to trim. */
const VERBOSE = process.env.PAGE_FIT_VERBOSE === '1';

function findChrome(): string | null {
  const candidates = [
    process.env.CHROME_PATH,
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  ].filter(Boolean) as string[];
  return candidates.find((c) => fs.existsSync(c)) ?? null;
}

/** Measure every `.page` in a document, with its own min-height released. */
function measure(chrome: string, html: string, label: string) {
  const probe = `
<script>
window.addEventListener('load', () => {
  document.querySelectorAll('.page').forEach((p) => { p.style.minHeight = '0'; });
  void document.documentElement.offsetHeight;
  const rows = [...document.querySelectorAll('.page')].map((p, i) => {
    const head = p.querySelector('.pagehead span b, h2, h1');
    return {
      page: i + 1,
      height: Math.round(p.getBoundingClientRect().height),
      label: (head ? head.textContent : '(cover)').trim().slice(0, 34),
    };
  });
  document.title = 'FIT:' + JSON.stringify(rows);
});
</script>`;

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'page-fit-'));
  const file = path.join(dir, `${label}.html`);
  fs.writeFileSync(file, html.replace('</body>', `${probe}</body>`));

  const res = spawnSync(
    chrome,
    [
      '--headless',
      '--disable-gpu',
      '--no-sandbox',
      '--virtual-time-budget=8000',
      '--window-size=900,1200',
      '--dump-dom',
      `file://${file.replace(/\\/g, '/')}`,
    ],
    { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 },
  );

  fs.rmSync(dir, { recursive: true, force: true });

  const match = /FIT:(\[.*?\])/s.exec(res.stdout || '');
  if (!match) throw new Error(`${label}: the browser returned no measurements`);
  return JSON.parse(match[1]) as { page: number; height: number; label: string }[];
}

async function main() {
  const chrome = findChrome();
  if (!chrome) {
    // Not a failure. A machine without Chrome should not block a commit; CI has
    // one, and that is where this needs to hold.
    console.log('[page-fit] no Chrome found — skipping. Set CHROME_PATH to enable.');
    return;
  }

  const { buildPartnershipProposalHTML } = await import('../src/lib/partnerships/templates/proposal-html');
  const { buildPartnershipMouHTML } = await import('../src/lib/partnerships/templates/mou-html');
  const { defaultStudioConfig } = await import('../src/lib/partnerships/studio-config');
  const { PARTNERSHIP_PHOTOS, schoolUpside } = await import('../src/lib/partnerships/proposal-sections');
  const { PARTNERSHIP_OFFERS } = await import('../src/lib/partnerships/offers');
  const { buildFixtureCurriculum } = await import('./fixtures/curriculum-fixture');

  const curriculum = buildFixtureCurriculum();
  // The longest realistic name: a page that fits only for short names does not fit.
  const school = {
    name: "St. Gregory's International Model College & Early Childhood Academy",
    address: '12 Sapele Road',
    city: 'Benin City',
    state: 'Edo',
  };
  const terms = {
    id: 't1', school_id: 's1', billing_model: 'per_student', amount_per_student: 25000,
    fixed_package_price: null, tiers: null, deposit_amount: null,
    rillcod_share_percent: 70, school_share_percent: 30,
    currency: 'NGN', billing_cycle: 'term', status: 'agreed',
  } as any;

  const documents: { label: string; html: string }[] = [];

  // Both upside shapes, because they are different heights on the money page.
  for (const [suffix, roll] of [['no roll', 0], ['with roll', 420]] as const) {
    documents.push({
      label: `proposal (${suffix})`,
      html: buildPartnershipProposalHTML({
        school, curriculum, reference: 'RC-PROP-2026-00042', dateLabel: '15 August 2026',
        proof: { partnerSchools: 29, students: 895, years: curriculum.levels.length },
        upside: schoolUpside({
          roll, feePerStudent: PARTNERSHIP_OFFERS[0].priceFrom, sections: null,
          fixedPackage: null, sharePercent: 30, cycle: 'term',
        }),
        photos: PARTNERSHIP_PHOTOS,
        studio: defaultStudioConfig(),
        accessCode: '849201',
      }),
    });
  }

  documents.push({
    label: 'mou',
    html: buildPartnershipMouHTML({
      school, terms, curriculum,
      reference: 'RC-MOU-2026-00042', dateLabel: '15 August 2026',
      commencement: 'First Term, 2026/2027', durationLabel: 'Three academic sessions',
      illustrativeStudents: 300, accessCode: '849201',
    }),
  });

  let failures = 0;
  for (const doc of documents) {
    const pages = measure(chrome, doc.html, doc.label.replace(/\W+/g, '-'));
    let worst = Infinity;
    for (const p of pages) {
      const clearance = PAGE_H - p.height;
      worst = Math.min(worst, clearance);
      if (VERBOSE) console.log(`    p${String(p.page).padStart(2)} ${String(p.height).padStart(5)}px  spare ${String(clearance).padStart(4)}  ${p.label}`);
      if (clearance < 0) {
        failures++;
        console.log(`  CLIPPED  ${doc.label} p${p.page} — ${-clearance}px past the sheet — ${p.label}`);
      } else if (clearance < MIN_CLEARANCE) {
        failures++;
        console.log(`  TIGHT    ${doc.label} p${p.page} — only ${clearance}px spare — ${p.label}`);
      }
    }
    console.log(`  ${failures === 0 ? 'ok' : '  '}       ${doc.label}: ${pages.length} pages, tightest ${worst}px`);
  }

  if (failures) {
    console.log(
      `\n[page-fit] ${failures} page(s) over or near the sheet.\n` +
        'A page clips its overflow rather than spilling, so this is content that\n' +
        'silently disappears from a document somebody signs. Move the section to\n' +
        'its own page, or cut copy until it fits.',
    );
    process.exit(1);
  }
  console.log('\n[page-fit] every page of every document fits its sheet.');
}

main().catch((e) => {
  console.error('[page-fit]', e?.message || e);
  process.exit(1);
});
