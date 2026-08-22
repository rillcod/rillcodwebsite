import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const source = fs.readFileSync(path.join(process.cwd(), 'public', 'sw.js'), 'utf8');

describe('source-controlled service worker', () => {
  it('does not depend on generated Workbox or ignored fallback assets', () => {
    expect(source).not.toContain('importScripts(');
    expect(source).not.toContain('fallback-');
    expect(source).not.toContain('precacheAndRoute');
  });

  it('excludes API and dashboard assets from runtime caching', () => {
    expect(source).toContain('url.pathname.startsWith("/api/")');
    expect(source).toContain('url.pathname.startsWith("/dashboard")');
    expect(source).toContain('request.mode === "navigate"');
  });

  it('supports controlled updates, legacy-cache cleanup, push, and notification navigation', () => {
    expect(source).toContain('name.startsWith("workbox-")');
    expect(source).toContain('event.data?.type === "SKIP_WAITING"');
    expect(source).toContain('self.addEventListener("push"');
    expect(source).toContain('self.addEventListener("notificationclick"');
  });
});
