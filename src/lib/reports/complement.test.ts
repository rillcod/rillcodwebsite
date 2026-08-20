import { describe, expect, it } from 'vitest';
import { parseScoreAuthority, progressReportComplement, scoreAuthorityFromStanding } from './complement';

describe('progress report complement', () => {
  it('keeps optional schools on the Rillcod report and compulsory on one complementary record', () => {
    expect(scoreAuthorityFromStanding('optional')).toBe('rillcod');
    expect(scoreAuthorityFromStanding('compulsory')).toBe('host_school');
    expect(parseScoreAuthority({ score_authority: 'host_school' })).toBe('host_school');
    expect(progressReportComplement('rillcod').documentTitle).toBe('Progress Report');
    expect(progressReportComplement('host_school').documentTitle).toBe('Rillcod Progress Report');
    expect(progressReportComplement('host_school').parentNotice).toMatch(/Rillcod progress report/i);
    expect(progressReportComplement('host_school').parentNotice).toMatch(/add together/i);
    expect(progressReportComplement('host_school').parentNotice).toMatch(/sit beside/i);
    expect(progressReportComplement('host_school').overallCaption).toBe('First Test + Second Test + Examination');
    expect(progressReportComplement('host_school').schoolTestsCaption).toMatch(/First Test/);
    expect(progressReportComplement('host_school').schoolTestsCaption).toMatch(/Second Test/);
    expect(progressReportComplement('host_school').schoolTestsCaption).toMatch(/Examination/);
    expect(progressReportComplement('host_school').learningNote).toMatch(/not mixed/i);
  });
});
