import { describe, expect, it } from 'vitest';
import { fileKind, isImageUrl, isPreviewable } from './file-kind';

/**
 * These cases are the reported bug, not hypotheticals.
 *
 * The viewer showed broken-image icons and "Format Unsupported" for files that
 * were perfectly fine. Both causes are pinned here so a future rewrite of the
 * viewer cannot quietly reintroduce either.
 */
describe('the stored type is an extension, not a MIME type', () => {
  // files.service.ts writes `ext.toLowerCase()`, so every MIME-prefix test in
  // the old viewers — startsWith('image/'), === 'application/pdf' — was false
  // for every uploaded file that has ever existed.
  it('reads a bare extension', () => {
    expect(fileKind({ fileType: 'png' })).toBe('image');
    expect(fileKind({ fileType: 'pdf' })).toBe('pdf');
    expect(fileKind({ fileType: 'mp4' })).toBe('video');
  });

  it('still reads a real MIME type, since external links store those', () => {
    expect(fileKind({ fileType: 'image/png' })).toBe('image');
    expect(fileKind({ fileType: 'application/pdf' })).toBe('pdf');
    expect(fileKind({ fileType: 'video/quicktime' })).toBe('video');
  });

  it('is not case sensitive', () => {
    expect(fileKind({ fileType: 'PNG' })).toBe('image');
    expect(fileKind({ url: '/api/media/school/DIAGRAM.JPEG' })).toBe('image');
  });
});

describe('extensions match anchored, not as substrings', () => {
  it('does not call a gift voucher an image', () => {
    // "gif" is inside "gift". This rendered a PDF into an <img> tag, which is
    // exactly the broken-image icon that was reported.
    expect(fileKind({ url: '/api/media/school/gift-voucher.pdf' })).toBe('pdf');
    expect(isImageUrl('/api/media/school/gift-voucher.pdf')).toBe(false);
  });

  it('is not fooled by a folder named after a format', () => {
    expect(fileKind({ url: '/api/media/png-archive/term-report.pdf' })).toBe('pdf');
    expect(fileKind({ url: '/api/media/jpg/notes.docx' })).toBe('doc');
  });

  it('ignores the query string a signed URL carries', () => {
    expect(fileKind({ url: '/api/media/a/b/c.png?download=1&filename=x.pdf' })).toBe('image');
  });
});

describe('falling back rather than giving up', () => {
  it('uses the URL when no type was stored', () => {
    expect(fileKind({ url: '/api/media/class/lesson-slides/deck.svg' })).toBe('image');
  });

  it('uses the library category when a key has no extension at all', () => {
    // R2 keys are UUIDs; plenty carry no extension, and those were landing on
    // "Format Unsupported" with a perfectly playable video behind them.
    expect(
      fileKind({ url: '/api/media/school/9f8e7d6c-5b4a', contentType: 'video' })
    ).toBe('video');
  });

  it('prefers the real extension over a coarse category', () => {
    // A 'document' row holding a png is an image, whatever the row calls itself.
    expect(fileKind({ url: '/api/media/x/scan.png', contentType: 'document' })).toBe('image');
  });

  it('says other when nothing identifies it', () => {
    expect(fileKind({ url: '/api/media/x/9f8e7d6c' })).toBe('other');
    expect(fileKind({})).toBe('other');
  });
});

describe('what the browser will actually render', () => {
  it('previews media, offers the rest as a download', () => {
    expect(isPreviewable('image')).toBe(true);
    expect(isPreviewable('pdf')).toBe(true);
    expect(isPreviewable('video')).toBe(true);
    expect(isPreviewable('presentation')).toBe(false);
    expect(isPreviewable('other')).toBe(false);
  });
});
