/** Synthetic, local-only PDF proof for the proposal's money page. */
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import { buildPartnershipProposalHTML } from '../src/lib/partnerships/templates/proposal-html';
import { buildFixtureCurriculum } from './fixtures/curriculum-fixture';
import { schoolUpside } from '../src/lib/partnerships/proposal-sections';

const directory = path.resolve('tmp/pdfs/partnership-money-proof');
fs.mkdirSync(directory, { recursive: true });
const html = buildPartnershipProposalHTML({
  school: { name: 'Example International School', city: 'Benin City', state: 'Edo' },
  curriculum: buildFixtureCurriculum(), reference: 'SAMPLE-NOT-FOR-ISSUE', dateLabel: '16 September 2026',
  proof: { partnerSchools: 0, students: 0, years: 0 },
  upside: schoolUpside({ roll: 420, feePerStudent: 25000, sections: null, fixedPackage: null, sharePercent: 30, cycle: 'term' }),
  scopeToOffer: 'B2',
}).replace(/src="\/(.*?)"/g, (_, asset) => `src="${pathToFileURL(path.resolve('public', decodeURIComponent(asset))).href}"`)
  .replace('</head>', '<style>.page:not(.page-money){display:none!important}</style></head>');
const source = path.join(directory, 'page.html');
fs.writeFileSync(source, html);
const pdf = path.join(directory, 'page.pdf');
const result = spawnSync(process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', [
  '--headless', '--disable-gpu', '--no-pdf-header-footer', '--allow-file-access-from-files',
  `--user-data-dir=${path.join(directory, 'chrome-profile')}`, '--virtual-time-budget=4000',
  `--print-to-pdf=${pdf}`, pathToFileURL(source).href,
], { encoding: 'utf8', timeout: 60_000 });
if (result.error || result.status !== 0) throw result.error || new Error(result.stderr);
console.log(pdf);
