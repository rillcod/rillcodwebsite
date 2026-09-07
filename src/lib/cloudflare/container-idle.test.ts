import { describe, it, expect, vi } from 'vitest';
vi.mock('@cloudflare/containers', () => ({
  Container: class {
    ctx: any;
    renewActivityTimeout = vi.fn();
    constructor(ctx: any) { this.ctx = ctx; }
    async onActivityExpired() { await this.ctx.stop(); }
  },
  getContainer: vi.fn(),
}));
// The Worker has its own tsconfig. Load it at runtime under the SDK mock so the
// application typecheck does not merge Workers globals with Next/DOM globals.
const { NextAppContainer } = await import('../../cloudflare/' + 'container-gateway');

function instance(pending: unknown = 0, status = 200) {
  const fetch = vi.fn(async () => Response.json({ pending }, { status }));
  const ctx: any = { container: { running: true, getTcpPort: () => ({ fetch }) }, stop: vi.fn() };
  const container = new NextAppContainer(ctx, { CRON_SECRET: 'test' } as any);
  return { ctx, fetch, container };
}

describe('container idle shutdown', () => {
  it('stops as soon as the Node process confirms background work finished', async () => {
    const { container, ctx } = instance();
    await container.onActivityExpired();
    expect(ctx.stop).toHaveBeenCalledOnce();
  });
  it('protects active automation after its parent response has completed', async () => {
    const { container, ctx } = instance(2);
    await container.onActivityExpired();
    expect(ctx.stop).not.toHaveBeenCalled();
    expect(container.renewActivityTimeout).toHaveBeenCalledOnce();
  });
  it('does not wake a sleeping instance for an activity probe', async () => {
    const { container, ctx, fetch } = instance();
    ctx.container.running = false;
    await container.onActivityExpired();
    expect(fetch).not.toHaveBeenCalled();
  });
  it('does not mistake a failed probe for finished work', async () => {
    const { container, ctx } = instance(undefined, 503);
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      await container.onActivityExpired();
      expect(ctx.stop).not.toHaveBeenCalled();
      expect(container.renewActivityTimeout).toHaveBeenCalledOnce();
      expect(log).toHaveBeenCalled();
    } finally { log.mockRestore(); }
  });
});
