import { expect, it, vi } from 'vitest';
import { qrDataUrls } from './qr';
import { qrToDataUrl } from '@/lib/qr/hd-qr';

vi.mock('@/lib/qr/hd-qr', () => ({
  HD_QR_OPTIONS: {}, HD_QR_DISPLAY_PX: 280, HD_QR_EMBED_PX: 512, HD_QR_PRINT_PX: 1024,
  externalQrUrl: vi.fn(), qrToDataUrl: vi.fn(async (p: string) => `data:${p}`),
}));

it('deduplicates bitmap generation and reports actual bounded-batch progress', async () => {
  const progress = vi.fn();
  const result = await qrDataUrls(['a','b','c','d','e','a'], 1024, progress);
  expect([...result.keys()]).toEqual(['a','b','c','d','e']);
  expect(qrToDataUrl).toHaveBeenCalledTimes(5);
  expect(progress.mock.calls).toEqual([[0,5],[4,5],[5,5]]);
});

it('stops before generating when the caller cancels preparation', async () => {
  vi.mocked(qrToDataUrl).mockClear();
  await expect(qrDataUrls(['a'], 1024, () => { throw new Error('cancelled'); })).rejects.toThrow('cancelled');
  expect(qrToDataUrl).not.toHaveBeenCalled();
});
