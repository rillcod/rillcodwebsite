import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SCHOOL_REPORT_DESIGN,
  describeEnabledAppendices,
  normalizeSchoolReportDesign,
  showReportSection,
} from './design';

describe('school report appendix controls', () => {
  it('defaults all appendices on', () => {
    const design = normalizeSchoolReportDesign(null);
    expect(showReportSection(design, 'learnerRoster')).toBe(true);
    expect(showReportSection(design, 'finance')).toBe(true);
    expect(showReportSection(design, 'appendixGradebook')).toBe(true);
    expect(showReportSection(design, 'appendixPayment')).toBe(true);
  });

  it('describes only enabled appendices', () => {
    const design = {
      ...DEFAULT_SCHOOL_REPORT_DESIGN,
      sections: {
        ...DEFAULT_SCHOOL_REPORT_DESIGN.sections,
        appendixGradebook: false,
        appendixPayment: false,
      },
    };
    const text = describeEnabledAppendices(design);
    expect(text).toContain('Appendix A');
    expect(text).toContain('Appendix B');
    expect(text).not.toContain('Appendix C');
    expect(text).not.toContain('Appendix D');
  });

  it('reports when no appendices are selected', () => {
    const design = {
      ...DEFAULT_SCHOOL_REPORT_DESIGN,
      sections: {
        ...DEFAULT_SCHOOL_REPORT_DESIGN.sections,
        learnerRoster: false,
        finance: false,
        appendixGradebook: false,
        appendixPayment: false,
      },
    };
    expect(describeEnabledAppendices(design)).toContain('No detachable appendices');
  });

  it('forces billing appendices off when excludeBilling is set', () => {
    const design = normalizeSchoolReportDesign({
      excludeBilling: true,
      sections: {
        finance: true,
        appendixPayment: true,
      },
    });
    expect(showReportSection(design, 'finance')).toBe(false);
    expect(showReportSection(design, 'appendixPayment')).toBe(false);
    expect(design.excludeBilling).toBe(true);
  });
});
