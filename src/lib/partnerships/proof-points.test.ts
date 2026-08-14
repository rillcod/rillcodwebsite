import { describe, expect, it } from 'vitest';
import { approx, loadProofPoints } from './proof-points';

describe('marketing figures', () => {
  it('rounds down, never up, so the claim is one we are already past', () => {
    expect(approx(895)).toBe('800+');
    expect(approx(29)).toBe('25+');
    expect(approx(1_640)).toBe('1500+');
  });

  it('leaves a small number exact, because "15+" reads as fewer than 15', () => {
    expect(approx(3)).toBe('3');
    expect(approx(19)).toBe('19');
  });

  it('never claims a round number it has not reached', () => {
    // The failure that matters: 99 must not print as "100+".
    expect(approx(99)).toBe('95+');
    expect(approx(999)).toBe('900+');
  });
});

/** Mirrors the PostgREST builder: chainable filters, thenable at the end. */
function db(counts: Record<string, number | null>, throwOn?: string) {
  return {
    from(table: string) {
      if (table === throwOn) throw new Error('database is down');
      const chain: Record<string, unknown> = {
        select: () => chain,
        eq: () => chain,
        neq: () => chain,
        then: (resolve: (v: { count: number | null }) => unknown) =>
          resolve({ count: counts[table] ?? null }),
      };
      return chain;
    },
  };
}

describe('counting our own footprint', () => {
  it('counts schools, students and years at issue time', async () => {
    const proof = await loadProofPoints(
      db({ schools: 29, portal_users: 895, curriculum_progression_levels: 12 }) as any,
    );
    expect(proof).toEqual({ partnerSchools: 29, students: 895, years: 12 });
  });

  it('omits the band rather than printing zeros', async () => {
    // A cover claiming "0 partner schools" is worse than a cover with no band.
    expect(await loadProofPoints(db({ schools: 0, portal_users: 895 }) as any)).toBeNull();
    expect(await loadProofPoints(db({ schools: 29, portal_users: 0 }) as any)).toBeNull();
  });

  it('never stops a proposal being issued when the counts fail', async () => {
    expect(await loadProofPoints(db({}, 'schools') as any)).toBeNull();
  });

  it('leaves the recipient out of its own proof', async () => {
    // The school is already a `schools` row the moment it is picked, so without
    // excluding it the cover cites the prospect as one of the partners it is
    // using to persuade them.
    const filters: string[] = [];
    const spy = {
      from() {
        const chain: Record<string, unknown> = {
          select: () => chain,
          eq: () => chain,
          neq: (col: string) => {
            filters.push(col);
            return chain;
          },
          then: (resolve: (v: { count: number }) => unknown) => resolve({ count: 29 }),
        };
        return chain;
      },
    };

    await loadProofPoints(spy as any, 'school-being-quoted');
    expect(filters).toContain('id');
  });
});
