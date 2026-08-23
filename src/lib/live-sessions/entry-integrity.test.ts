import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(join(process.cwd(), path), 'utf8');

describe('live classroom entry integrity', () => {
  const page = read('src/app/dashboard/live-sessions/page.tsx');
  const boundary = read('src/components/live-session/LiveMeetingBoundary.tsx');
  const nextConfig = read('next.config.ts');

  it('does not turn a realtime live signal into attendance or unsolicited media entry', () => {
    expect(page).toContain("if (!wasLive && nowLive && profile.role === 'student')");
    expect(page).toContain('setAutoJoinToast({ ...full, ...updated })');
    expect(page).not.toContain("fetch(`/api/live-sessions/${updated.id}/join`, { method: 'POST' })");
    expect(page).not.toContain('Joining automatically');
    expect(page).toContain('attendance starts only after you enter');
  });

  it('requires durable start, end, and join responses before changing the client experience', () => {
    expect(page).toContain("if (!response.ok) throw new Error(payload.error || 'The session could not be started.')");
    expect(page).toContain("if (!response.ok) throw new Error(payload.error || 'The session could not be ended.')");
    expect(page).toContain('if (!joinResponse.ok)');
    expect(page).not.toContain('body: JSON.stringify({ session_url: resolvedUrl })');
  });

  it('contains classroom module failures and avoids production barrel rewriting', () => {
    expect(page).toContain('<LiveMeetingBoundary');
    expect(boundary).toContain('static getDerivedStateFromError()');
    expect(boundary).toContain('The classroom needs to reconnect');
    expect(nextConfig).not.toContain("'@livekit/components-react',");
  });
});
