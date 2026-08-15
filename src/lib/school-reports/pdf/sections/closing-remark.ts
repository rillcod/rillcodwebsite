import { brandContact } from '@/config/brand';
import { buildOfficialClosingRemark } from '../../closing-remark';
import { borderedPanelLayout, sectionTitle } from '../layout';
import { INK, MUTED } from '../tokens';
import type { SchoolReportPdfContext } from '../context';

/**
 * Closing remark, authorised signature and verification block.
 *
 * Always present — this is what makes the book an issued document rather than a
 * printout. The signature image itself is resolved in the context and is null
 * when the signatory was not in post on the issue date, so a reissued
 * historical report cannot be signed by someone who had already left; the blank
 * ruled space is kept either way so the layout does not shift.
 */
export function buildClosingRemarkSection(ctx: SchoolReportPdfContext): object[] {
  const {
    snapshot,
    narrative,
    officialSignature,
    reportPolicy,
    isPublished,
    generatedLabel,
    verificationCode,
    reportReference,
    verificationUrl,
    verificationQrDataUrl,
    report,
    brand,
  } = ctx;

  return [
    sectionTitle('Closing remark'),
    {
      text: buildOfficialClosingRemark(snapshot, narrative),
      fontSize: 9,
      lineHeight: 1.4,
      color: INK,
      italics: true,
      margin: [0, 0, 0, 8],
    },
    {
      table: {
        widths: ['50%', '50%'],
        body: [[
          {
            stack: [
              { text: `FOR ${brandContact.displayName.toUpperCase()}`, style: 'metaLabel', color: brand },
              ...(officialSignature
                ? [{ image: officialSignature, width: 110, height: 36, margin: [0, 4, 0, 1] as [number, number, number, number] }]
                : [{ text: '', margin: [0, 28, 0, 0] as [number, number, number, number] }]),
              { canvas: [{ type: 'line', x1: 0, y1: 0, x2: 140, y2: 0, lineWidth: 0.8, lineColor: INK }] },
              { text: reportPolicy.signatory.name, bold: true, fontSize: 8.5, margin: [0, 3, 0, 0] },
              { text: reportPolicy.signatory.title, color: MUTED, fontSize: 7 },
            ],
            margin: [8, 8, 8, 8],
          },
          {
            stack: [
              { text: `FOR ${snapshot.school.name.toUpperCase()}`, style: 'metaLabel', color: brand },
              { text: '', margin: [0, 28, 0, 0] as [number, number, number, number] },
              { canvas: [{ type: 'line', x1: 0, y1: 0, x2: 140, y2: 0, lineWidth: 0.8, lineColor: INK }] },
              { text: report.acknowledgement_name || 'Principal / Head of School', bold: true, fontSize: 8.5, margin: [0, 3, 0, 0] },
              { text: 'Authorised Signature, Date & Official Stamp', color: MUTED, fontSize: 7 },
            ],
            margin: [8, 8, 8, 8],
          },
        ]],
      },
      layout: borderedPanelLayout('#f9fafb'),
      margin: [0, 8, 0, 8],
    },
    {
      table: {
        widths: [58, '*'],
        body: [[
          verificationQrDataUrl
            ? { image: verificationQrDataUrl, width: 48, height: 48, margin: [3, 3, 3, 3] }
            : { text: 'VERIFY', bold: true, alignment: 'center', margin: [3, 18, 3, 3] },
          {
            stack: [
              { text: 'REPORT VERIFICATION', style: 'metaLabel', color: brand },
              // The short reference leads, because it is the one a bursar files
              // under and reads down a telephone. The twenty-character code is
              // what the verify page matches on, and is printed beneath it —
              // nobody dictates that one aloud.
              { text: reportReference, bold: true, fontSize: 9.5, margin: [0, 3, 0, 1] },
              { text: verificationCode, color: MUTED, fontSize: 7 },
              { text: verificationUrl, color: MUTED, fontSize: 6.5, margin: [0, 1, 0, 0] },
              { text: `Revision ${report.published_revision_number || 1} | Scan the code, or enter it at the address above, to confirm this report.`, color: MUTED, fontSize: 7, margin: [0, 3, 0, 0] },
            ],
            margin: [6, 6, 6, 6],
          },
        ]],
      },
      layout: borderedPanelLayout('#ffffff'),
      margin: [0, 0, 0, 7],
    },
    // Only shown once a school has formally acknowledged receipt.
    ...(report.acknowledged_at
      ? [{
          text: `Acknowledged by ${report.acknowledgement_name || 'school leadership'} on ${new Date(report.acknowledged_at).toLocaleDateString('en-GB')}${report.acknowledgement_note ? `. ${report.acknowledgement_note}` : '.'}`,
          color: '#067647',
          bold: true,
          fontSize: 7,
          margin: [0, 0, 0, 5] as [number, number, number, number],
        }]
      : []),
    {
      text: `Prepared by ${brandContact.displayName}  |  ${brandContact.web}. Official school performance report for ${snapshot.period.termLabel}, ${snapshot.period.academicYear}.`,
      color: MUTED,
      fontSize: 7,
      margin: [0, 2, 0, 0],
    },
  ];
}
