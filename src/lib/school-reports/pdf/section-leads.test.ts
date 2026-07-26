import { describe, expect, it, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({ geminiGenerateText: vi.fn() }));
vi.mock('@/lib/gemini/client', () => ({ geminiGenerateText: mocks.geminiGenerateText }));

import {
  generateSectionLeads,
  normaliseSectionLeads,
  sanitiseLead,
  sectionLeadBlock,
} from './section-leads';
import type { SchoolPerformanceReportRow } from '../types';

const report = { snapshot: { school: { name: 'X' }, period: { termLabel: 'First Term', academicYear: '2026/2027' } } } as unknown as SchoolPerformanceReportRow;

describe('sanitiseLead', () => {
  it('rejects any lead containing a figure', () => {
    // A lead saying "attendance held at 91%" beside a table showing 88% makes
    // the whole book untrustworthy, so this is enforced rather than requested.
    expect(sanitiseLead('Attendance held at 91% this term.')).toBeNull();
    expect(sanitiseLead('3 programmes ran this term.')).toBeNull();
  });

  it('rejects overlong leads and empty values', () => {
    expect(sanitiseLead('x'.repeat(200))).toBeNull();
    expect(sanitiseLead('   ')).toBeNull();
    expect(sanitiseLead(null)).toBeNull();
  });

  it('rejects claims about where a section sits in the document', () => {
    // Sections are reordered via the registry and hidden when empty, so a
    // positional claim is a statement that will eventually be false in print.
    // The live model produced exactly this before the rule existed.
    expect(sanitiseLead('The final section details plans for next term.')).toBeNull();
    expect(sanitiseLead('This first part covers delivery.')).toBeNull();
    expect(sanitiseLead('See the section below for detail.')).toBeNull();
  });

  it('does not reject ordinary wording that merely mentions next term', () => {
    expect(sanitiseLead('This section describes agreed actions for the coming term.')).not.toBeNull();
    expect(sanitiseLead('Focus areas for the next term are set out here.')).not.toBeNull();
  });

  it('accepts and tidies a clean sentence', () => {
    expect(sanitiseLead('  This section  sets out what was taught. ')).toBe('This section sets out what was taught.');
  });
});

describe('normaliseSectionLeads', () => {
  it('keeps only known section keys', () => {
    const leads = normaliseSectionLeads({
      leads: { curriculumDelivery: 'What was covered.', bogusSection: 'Ignore me.' },
    });
    expect(leads).toEqual({ curriculumDelivery: 'What was covered.' });
  });

  it('accepts a bare object as well as a wrapped one', () => {
    expect(normaliseSectionLeads({ nextPhase: 'Where we go next.' })).toEqual({ nextPhase: 'Where we go next.' });
  });

  it('drops individually invalid leads without losing valid ones', () => {
    const leads = normaliseSectionLeads({
      curriculumDelivery: 'Scores rose by 12%.',
      partnershipBriefing: 'How the partnership is going.',
    });
    expect(leads).toEqual({ partnershipBriefing: 'How the partnership is going.' });
  });

  it('returns nothing for junk', () => {
    expect(normaliseSectionLeads(null)).toEqual({});
    expect(normaliseSectionLeads('nope')).toEqual({});
  });
});

describe('generateSectionLeads', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns leads when the model answers cleanly', async () => {
    mocks.geminiGenerateText.mockResolvedValue({
      text: JSON.stringify({ leads: { nextPhase: 'Where the partnership goes next.' } }),
      model: 'gemini',
    });
    await expect(generateSectionLeads(report)).resolves.toEqual({ nextPhase: 'Where the partnership goes next.' });
  });

  it('never throws or blocks the report when the model fails', async () => {
    // A book must render without waiting on decoration.
    mocks.geminiGenerateText.mockRejectedValue(new Error('offline'));
    await expect(generateSectionLeads(report)).resolves.toEqual({});

    mocks.geminiGenerateText.mockResolvedValue({ text: 'not json', model: 'x' });
    await expect(generateSectionLeads(report)).resolves.toEqual({});

    mocks.geminiGenerateText.mockResolvedValue(null);
    await expect(generateSectionLeads(report)).resolves.toEqual({});
  });
});

describe('sectionLeadBlock', () => {
  it('renders nothing when there is no lead', () => {
    expect(sectionLeadBlock({}, 'nextPhase', '#000')).toEqual([]);
    expect(sectionLeadBlock(undefined as never, 'nextPhase', '#000')).toEqual([]);
  });

  it('renders an italic muted opener when present', () => {
    const [node] = sectionLeadBlock({ nextPhase: 'Onward.' }, 'nextPhase', '#666') as Array<Record<string, unknown>>;
    expect(node.text).toBe('Onward.');
    expect(node.italics).toBe(true);
  });
});
