import { describe, expect, it } from 'vitest';

import {
  OUTREACH_ANGLES,
  buildOutreachMessage,
  outreachPlainText,
  type OutreachAngle,
} from './outreach-copy';
import { containsMonetaryFigure } from './proposal-narrative';

const ANGLES = OUTREACH_ANGLES.map((a) => a.id);
const CTX = { schoolName: 'Bay-Flowers International School', contactName: 'Mrs Eze' };

/** Every string a school will actually read, for one angle. */
function everyString(angle: OutreachAngle): string[] {
  const m = buildOutreachMessage(angle, CTX);
  return [
    m.subject,
    m.title,
    m.ctaLabel,
    ...m.opening,
    ...m.closing,
    ...(m.list ? [m.list.heading, ...m.list.points.flatMap((p) => [p.label, p.body])] : []),
  ];
}

describe('outreach copy', () => {
  it('covers every angle', () => {
    expect(ANGLES).toEqual(['cold_pitch', 'free_demo', 'check_in', 'resumption_slot']);
  });

  /*
    The same rule the proposal narrative enforces on the AI engine, applied to
    the copy we write ourselves. Commercial terms live in `partnership_terms`
    and print on the document from that record. An email that quotes a share or
    a fee is a number nobody agreed, sent to the one person who will hold us to
    it — and this copy had promised "30% profit-sharing", "guaranteed".
  */
  for (const angle of ANGLES) {
    it(`${angle} states no price, percentage or share`, () => {
      for (const line of everyString(angle)) {
        // The monetary check, not the full commercial one: the free-session
        // angle offers something genuinely free, which the wider rule rejects
        // because a model writing "free" has invented a concession.
        expect(containsMonetaryFigure(line), line).toBe(false);
      }
    });
  }

  /*
    Robotics is real and it is taught, but it is not the programme and it does
    not belong in a subject line. Coding and applied AI are what a school
    actually receives every term; leading on robotics sells a department we do
    not run, and a proprietor who feels oversold at signature does not renew.
  */
  for (const angle of ANGLES) {
    it(`${angle} does not lead on robotics`, () => {
      const { subject, title } = buildOutreachMessage(angle, CTX);
      expect(`${subject} ${title}`.toLowerCase()).not.toContain('robotic');
    });
  }

  it('claims nothing we do not deliver', () => {
    const all = ANGLES.flatMap(everyString).join(' ').toLowerCase();
    // No accreditation body has accredited this curriculum.
    expect(all).not.toContain('accredited');
    // Report cards carry a QR that verifies a result. They do not carry video.
    expect(all).not.toContain('scan-to-watch');
    // A guarantee is a contractual word, and the contract is the MoU.
    expect(all).not.toContain('guaranteed');
  });

  it('addresses a named contact when there is one, and the school when there is not', () => {
    expect(buildOutreachMessage('cold_pitch', CTX).opening[0]).toBe('Dear Mrs Eze,');
    expect(
      buildOutreachMessage('cold_pitch', { schoolName: 'Bay-Flowers' }).opening[0],
    ).toBe('Dear Bay-Flowers Leadership,');
  });

  it('names the reference in a follow-up, so the school knows which document', () => {
    const { subject } = buildOutreachMessage('check_in', { ...CTX, reference: 'RC-PROP-2026-00042' });
    expect(subject).toContain('RC-PROP-2026-00042');
  });

  describe('the pasteable version', () => {
    it('carries the link when there is one, and no dangling label when there is not', () => {
      const withLink = outreachPlainText('check_in', {
        ...CTX,
        shareUrl: 'https://rillcod.com/p/tok',
      });
      expect(withLink.body).toContain('https://rillcod.com/p/tok');

      const without = outreachPlainText('check_in', CTX);
      expect(without.body).not.toContain('http');
      // No empty "read it here:" left behind pointing at nothing.
      expect(without.body).not.toContain('online:');
    });

    it('reads as a letter, not a broadcast', () => {
      const { body } = outreachPlainText('cold_pitch', CTX);
      expect(body.startsWith('Dear Mrs Eze,')).toBe(true);
      expect(body).toContain('Warm regards');
      // The old version opened with a star, wrote every heading in asterisks
      // and put an emoji on each of six bullets. This gets read on a phone.
      expect(body).not.toMatch(/[\u{1F300}-\u{1FAFF}]/u);
    });
  });
});
