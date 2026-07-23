/**
 * Generates a sample roster PDF so you can preview the official format locally.
 * Run: node scripts/generate-roster-sample.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const outDir = path.join(root, 'output', 'pdf');
const logoB64 = fs
  .readFileSync(path.join(root, 'tmp', 'favicon-b64.txt'), 'utf8')
  .trim();
const logoDataUrl = `data:image/png;base64,${logoB64}`;

const jsPDFModule = await import('jspdf');
const jsPDF = jsPDFModule.default?.jsPDF ?? jsPDFModule.jsPDF ?? jsPDFModule.default;
const autoTableModule = await import('jspdf-autotable');
const autoTable = autoTableModule.default;

const PAGE_MARGIN = 14;
const PAGE_WIDTH = 210;
const HEADER_BAND_H = 32;
const INK = [17, 24, 39];
const MUTED = [107, 114, 128];
const BORDER = [229, 231, 235];
const TABLE_HEAD_BG = [243, 244, 246];
const TABLE_HEAD_RULE = [55, 65, 81];
const TABLE_HEAD_INK = [17, 24, 39];
const PANEL_BG = [249, 250, 251];
const accentRgb = [26, 58, 143];
const RESULT_CHECK_URL = 'www.rillcod.com/result-check';
const org = 'Rillcod Technologies';
const orgWebsite = 'www.rillcod.com';
const dateStr = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });

const sampleRows = [
  { name: 'Ada Okafor', rcDisplay: 'RC-48291037' },
  { name: 'Chinedu Bello', rcDisplay: 'RC-59102846' },
  { name: 'Fatima Yusuf', rcDisplay: 'RC-70283951' },
  { name: 'Emeka Nwosu', rcDisplay: 'RC-81374062' },
  { name: 'Grace Eze', rcDisplay: 'RC-92465173' },
];

function drawLetterhead(doc) {
  const accentRuleH = 1.2;
  const bodyTop = accentRuleH;
  doc.setFillColor(...accentRgb);
  doc.rect(0, 0, PAGE_WIDTH, accentRuleH, 'F');
  doc.setFillColor(255, 255, 255);
  doc.rect(0, bodyTop, PAGE_WIDTH, HEADER_BAND_H - accentRuleH, 'F');
  doc.setDrawColor(...TABLE_HEAD_RULE);
  doc.setLineWidth(0.35);
  doc.line(PAGE_MARGIN, HEADER_BAND_H, PAGE_WIDTH - PAGE_MARGIN, HEADER_BAND_H);

  const logoSize = 18;
  const logoPad = 1.2;
  const logoBox = logoSize + logoPad * 2;
  const logoY = bodyTop + (HEADER_BAND_H - accentRuleH - logoBox) / 2;
  const logoX = PAGE_MARGIN;
  doc.setDrawColor(...BORDER);
  doc.setFillColor(...PANEL_BG);
  doc.roundedRect(logoX, logoY, logoBox, logoBox, 1.2, 1.2, 'FD');
  doc.addImage(logoDataUrl, 'PNG', logoX + logoPad, logoY + logoPad, logoSize, logoSize);

  const brandX = logoX + logoBox + 5;
  doc.setTextColor(...INK);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text(org, brandX, bodyTop + 8);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.2);
  doc.setTextColor(...MUTED);
  doc.text(orgWebsite, brandX, bodyTop + 12.5);
  doc.setFontSize(6.8);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(107, 114, 128);
  doc.text('STUDENT RESULT VERIFICATION', brandX, bodyTop + 16.5);

  const rightX = PAGE_WIDTH - PAGE_MARGIN;
  const badgeW = 40;
  const badgeX = rightX - badgeW;
  doc.setDrawColor(...TABLE_HEAD_INK);
  doc.roundedRect(badgeX, bodyTop + 5, badgeW, 8, 0.8, 0.8, 'S');
  doc.setTextColor(...INK);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6);
  doc.text('OFFICIAL DOCUMENT', badgeX + badgeW / 2, bodyTop + 10.5, { align: 'center' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.5);
  doc.setTextColor(...MUTED);
  doc.text(dateStr, rightX, bodyTop + 16, { align: 'right' });
  doc.text('RCR-JSS1-20260723', rightX, bodyTop + 21, { align: 'right' });
}

function drawClassPanel(doc, y) {
  const contentW = PAGE_WIDTH - PAGE_MARGIN * 2;
  const panelH = 32;
  doc.setFillColor(...PANEL_BG);
  doc.setDrawColor(...BORDER);
  doc.roundedRect(PAGE_MARGIN, y, contentW, panelH, 2, 2, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(...INK);
  doc.text('Class: JSS 1', PAGE_MARGIN + 4, y + 6);
  doc.text('5 students', PAGE_WIDTH - PAGE_MARGIN - 4, y + 6, { align: 'right' });
  const urlBoxY = y + 11;
  doc.setFillColor(255, 255, 255);
  doc.setDrawColor(...TABLE_HEAD_INK);
  doc.setLineWidth(0.45);
  doc.roundedRect(PAGE_MARGIN + 4, urlBoxY, contentW - 8, 16, 1, 1, 'FD');
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(...MUTED);
  doc.text('Parents verify results at', PAGE_WIDTH / 2, urlBoxY + 4.8, { align: 'center' });
  doc.setFont('courier', 'bold');
  doc.setFontSize(12);
  doc.setTextColor(...INK);
  doc.text(RESULT_CHECK_URL, PAGE_WIDTH / 2, urlBoxY + 12, { align: 'center' });
  doc.setDrawColor(...BORDER);
  doc.setLineWidth(0.2);
  doc.roundedRect(PAGE_MARGIN, y, contentW, panelH, 2, 2, 'S');
  return y + panelH + 5;
}

const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: true });
drawLetterhead(doc);
let startY = drawClassPanel(doc, HEADER_BAND_H + 6);

autoTable(doc, {
  startY,
  head: [['#', 'Student name', 'RC number']],
  body: sampleRows.map((row, i) => [String(i + 1), row.name, row.rcDisplay]),
  theme: 'grid',
  styles: { fontSize: 9, cellPadding: 2.5, lineColor: [156, 163, 175], lineWidth: 0.2 },
  headStyles: {
    fillColor: TABLE_HEAD_BG,
    textColor: INK,
    fontStyle: 'bold',
    fontSize: 8,
    lineColor: TABLE_HEAD_RULE,
    lineWidth: 0.2,
  },
  margin: { left: PAGE_MARGIN, right: PAGE_MARGIN },
});

fs.mkdirSync(outDir, { recursive: true });
const outPath = path.join(outDir, 'roster-format-sample.pdf');
const buf = Buffer.from(doc.output('arraybuffer'));
fs.writeFileSync(outPath, buf);
console.log(`Sample roster PDF written to ${outPath}`);
