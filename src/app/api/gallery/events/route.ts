/**
 * GET /api/gallery/events — the real photographs and clips of the programme.
 *
 * Read off the folder rather than a list somebody keeps in sync. The public
 * gallery was ten entries all pointing at one stock photograph from Pexels while
 * thirty pictures of actual Rillcod classrooms sat unused; a hand-maintained
 * array is how that happens. Drop a file into `public/images/EVENTS/` and it is
 * on the site.
 *
 * Public on purpose: this is the same content the gallery page shows anybody.
 */
import { NextResponse } from 'next/server';
import fs from 'node:fs';
import path from 'node:path';

export const dynamic = 'force-dynamic';
// The folder changes rarely; re-read it a few times an hour rather than per hit.
export const revalidate = 900;

const DIR = 'public/images/EVENTS';
const WEB = '/images/EVENTS';
const IMAGE = /\.(jpe?g|png|webp)$/i;
const VIDEO = /\.(mp4|webm|mov)$/i;

export type EventMedia = {
  src: string;
  kind: 'image' | 'video';
  /** Bytes, so a caller can avoid putting a 7MB clip on a phone. */
  size: number;
};

export async function GET() {
  try {
    const dir = path.join(process.cwd(), DIR);
    if (!fs.existsSync(dir)) return NextResponse.json({ media: [] });

    const media: EventMedia[] = fs
      .readdirSync(dir)
      .filter((name) => IMAGE.test(name) || VIDEO.test(name))
      .sort()
      .map((name) => {
        let size = 0;
        try {
          size = fs.statSync(path.join(dir, name)).size;
        } catch {
          // A file that cannot be stat'd is still servable; size is a hint only.
        }
        return {
          // Encoded here, because these arrive from a phone as
          // "WhatsApp Image … (1).jpeg" and a raw space is not a URL.
          src: `${WEB}/${encodeURIComponent(name)}`,
          kind: VIDEO.test(name) ? ('video' as const) : ('image' as const),
          size,
        };
      });

    return NextResponse.json({
      media,
      images: media.filter((m) => m.kind === 'image').length,
      videos: media.filter((m) => m.kind === 'video').length,
    });
  } catch (error) {
    // A gallery that cannot read the folder shows its written content rather
    // than failing the page.
    console.warn('[gallery] could not list event media:', error);
    return NextResponse.json({ media: [], images: 0, videos: 0 });
  }
}
