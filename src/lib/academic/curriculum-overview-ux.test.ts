import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const overview = readFileSync(
  join(process.cwd(), 'src/components/curriculum/CurriculumBuildingBlockInspector.tsx'),
  'utf8',
);
const roster = readFileSync(
  join(process.cwd(), 'src/components/curriculum/MasterCurriculumRoster.tsx'),
  'utf8',
);
const builder = readFileSync(
  join(process.cwd(), 'src/app/dashboard/academic/build/page.tsx'),
  'utf8',
);

describe('curriculum overview experience', () => {
  it('uses a plain overview name and removes internal dependency-map language', () => {
    expect(builder).toContain('Overview');
    expect(overview).toContain('Curriculum overview');
    expect(overview).not.toContain('Building Block Inspector');
    expect(overview).not.toContain('5-Tier Dependency Map');
  });

  it('shows every curriculum week using the page scroll', () => {
    expect(overview).toContain('weeks.map((week: any, weekIndex: number)');
    expect(overview).not.toContain('.slice(0, 4)');
    expect(overview).not.toContain('max-h-32');
    expect(roster).not.toContain('(t.weeks ?? []).slice(0, 4)');
    expect(roster).not.toContain("isAdmin ? 'max-h-24'");
  });

  it('explains the safe curriculum-to-class update rule', () => {
    expect(overview).toContain('How changes reach classes');
    expect(overview).toContain('a new approved version becomes available to future class plans');
    expect(overview).toContain('classes already in progress keep their current version');
  });
});
