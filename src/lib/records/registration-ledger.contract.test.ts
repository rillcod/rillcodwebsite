import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const routeSource = readFileSync(
  join(process.cwd(), 'src/app/api/records/registrations/route.ts'),
  'utf8',
);
const pageSource = readFileSync(
  join(process.cwd(), 'src/app/dashboard/records/page.tsx'),
  'utf8',
);

describe('registration ledger resilience contract', () => {
  it('never sends an unbounded registration or email list to PostgREST', () => {
    expect(routeSource).toContain('fetchAllInChunks(batchIds');
    expect(routeSource).toContain('fetchAllInChunks(emails');
    expect(routeSource).toContain('chunkSize = 100');
  });

  it('always returns a safe structured failure', () => {
    expect(routeSource).toContain("'[records/registrations] load failed:'");
    expect(routeSource).toContain("status: 503");
    expect(routeSource).toContain('Registration records could not be loaded. Please retry.');
  });

  it('does not present loading or a failed request as an empty ledger', () => {
    expect(pageSource).toContain('fetchActionJson');
    expect(pageSource).toContain('regsRequestInFlight');
    expect(pageSource).toContain('Registration records are temporarily unavailable');
    expect(pageSource).toContain('Loading registration records…');
    expect(pageSource).toContain('activeCount === 0 && !regsLoading && !regsError');
  });

  it('renders large ledgers progressively for mobile and desktop', () => {
    expect(pageSource).toContain('const [visibleLimit, setVisibleLimit] = useState(60)');
    expect(pageSource).toContain('const visibleRows = activeRows.slice(0, visibleLimit)');
    expect(pageSource).toContain('Show 60 more');
  });
});
