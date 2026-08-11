import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (relativePath: string) => readFileSync(join(process.cwd(), relativePath), 'utf8');

describe('credential dashboard trust boundary', () => {
  const listRoute = read('src/app/api/students/credentials-list/route.ts');
  const sendRoute = read('src/app/api/students/send-credentials/route.ts');
  const dashboard = read('src/app/dashboard/students/resend-credentials/page.tsx');

  it('never returns stored passwords from the bulk credential listing', () => {
    expect(listRoute).not.toContain("select('email, status, password");
    expect(listRoute).not.toMatch(/password\s*:\s*r\.password/);
    expect(listRoute).not.toContain('parentCred:');
    expect(listRoute).not.toContain("{ error: error.message }");
    expect(listRoute).not.toContain("{ error: err.message");
  });

  it('never renders persisted passwords into the dashboard DOM', () => {
    expect(dashboard).not.toContain('credEmail?.password');
    expect(dashboard).not.toContain('parentCred?.password');
    expect(dashboard).not.toMatch(/Password:\s*\{s\./);
  });

  it('resolves recipients and credentials on the server from one student id', () => {
    expect(sendRoute).toContain('body.studentId');
    expect(sendRoute).toContain("from('parent_student_links')");
    expect(sendRoute).toContain(".eq('student_id', row.id)");
    expect(sendRoute).toContain("from('registration_results')");
    expect(sendRoute).not.toContain('body.studentPassword');
    expect(sendRoute).not.toContain('body.parentPassword');
    expect(sendRoute).not.toContain('body.parentEmail');
  });
});
