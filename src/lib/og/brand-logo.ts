/**
 * Load the brand logo for next/og ImageResponse.
 * Prefer the on-disk public file (container/local); fall back to the live public URL
 * (Cloudflare Workers have no reliable FS for public/). Same pic either way.
 */
function toDataUrl(bytes: ArrayBuffer | Buffer | Uint8Array): string {
  const buf = Buffer.isBuffer(bytes)
    ? bytes
    : Buffer.from(bytes instanceof ArrayBuffer ? bytes : bytes.buffer);
  return `data:image/png;base64,${buf.toString('base64')}`;
}

export async function loadBrandLogoDataUrl(): Promise<string | null> {
  // 1) Node filesystem — used by the container build and locally
  try {
    const fs = await import('node:fs/promises');
    const path = await import('node:path');
    const file = path.join(process.cwd(), 'public', 'images', 'logo.png');
    const buf = await fs.readFile(file);
    return toDataUrl(buf);
  } catch {
    // Cloudflare / missing file — continue
  }

  // 2) Public URL — same asset Facebook/social scrapers already hit
  const base = (
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.NEXT_PUBLIC_SITE_URL ||
    'https://rillcod.com'
  ).replace(/\/$/, '');

  try {
    const res = await fetch(`${base}/images/logo.png`, { cache: 'force-cache' });
    if (!res.ok) return null;
    return toDataUrl(await res.arrayBuffer());
  } catch {
    return null;
  }
}
