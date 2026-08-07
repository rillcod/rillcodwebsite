/**
 * What kind of file is this, and can the browser show it?
 *
 * One answer, because there were three. UniversalFilePreviewModal had a correct
 * one built on anchored extension patterns; the library viewer and the lesson
 * viewer each had a hand-rolled copy that was wrong in the same two ways.
 *
 * Wrong the first way: they tested MIME prefixes.
 *
 *     fileType?.startsWith('image/')      // stored value is "png"
 *     fileType === 'application/pdf'      // stored value is "pdf"
 *
 * files.service.ts stores file_type as a bare extension — `ext.toLowerCase()`
 * — so none of those were ever true. Every file fell through to guessing from
 * the URL, and video never played at all, because isVideo had no fallback.
 *
 * Wrong the second way: the guess used substring matching.
 *
 *     ['jpg','png','gif','webp'].some(ext => url.toLowerCase().includes(ext))
 *
 * "gif" is inside "gift". A PDF under a path containing "gift" rendered as an
 * <img> and showed a broken-image icon; a key with no extension matched
 * nothing and showed "Format Unsupported". Both are what a broken viewer looks
 * like from the outside.
 *
 * So: extensions are matched anchored, the stored type is accepted in either
 * shape, and the library's own coarse content_type is the last word rather than
 * the first — it knows "video" but not "mp4 vs mov".
 */

/** Storage keys arrive as /api/media/<key>; strip query and fragment first. */
function extensionOf(url: string | null | undefined): string {
  if (!url) return '';
  const path = url.split('?')[0].split('#')[0];
  const match = /\.([a-z0-9]+)$/i.exec(path);
  return match ? match[1].toLowerCase() : '';
}

/**
 * The extension a stored type names, whether it is a MIME type or already one.
 *
 * Accepts "image/png", "png" and "PNG" alike, because all three are in the
 * database: uploads store the extension, external links store a MIME type, and
 * older rows store whatever they were given.
 */
function extensionOfType(fileType: string | null | undefined): string {
  if (!fileType) return '';
  const value = fileType.trim().toLowerCase();
  if (!value) return '';
  const slash = value.indexOf('/');
  // "application/pdf" -> "pdf", "image/jpeg" -> "jpeg", "png" -> "png"
  return (slash >= 0 ? value.slice(slash + 1) : value).replace(/^x-/, '');
}

export type FileKind =
  | 'image'
  | 'pdf'
  | 'video'
  | 'audio'
  | 'presentation'
  | 'doc'
  | 'code'
  | 'other';

const BY_EXTENSION: Record<string, FileKind> = {
  // image
  png: 'image', jpg: 'image', jpeg: 'image', gif: 'image', webp: 'image',
  svg: 'image', bmp: 'image', heic: 'image', avif: 'image',
  // pdf
  pdf: 'pdf',
  // video — "quicktime" and "x-matroska" arrive as MIME subtypes
  mp4: 'video', webm: 'video', mov: 'video', m4v: 'video', avi: 'video',
  mkv: 'video', quicktime: 'video', matroska: 'video',
  // audio — ogg is deliberately audio; video/ogg is vanishingly rare here
  mp3: 'audio', wav: 'audio', ogg: 'audio', m4a: 'audio', aac: 'audio',
  flac: 'audio', mpeg: 'audio',
  // presentation
  ppt: 'presentation', pptx: 'presentation',
  'vnd.ms-powerpoint': 'presentation',
  'vnd.openxmlformats-officedocument.presentationml.presentation': 'presentation',
  // documents
  doc: 'doc', docx: 'doc', xls: 'doc', xlsx: 'doc', csv: 'doc', rtf: 'doc',
  msword: 'doc',
  // code and plain text
  txt: 'code', py: 'code', js: 'code', ts: 'code', json: 'code', html: 'code',
  css: 'code', md: 'code', c: 'code', cpp: 'code', sql: 'code', sh: 'code',
};

/**
 * The library's own content_type. Coarser than an extension and consulted last,
 * so a 'document' row holding a .png is still shown as the image it is.
 */
const BY_CONTENT_TYPE: Record<string, FileKind> = {
  video: 'video',
  audio: 'audio',
  image: 'image',
  presentation: 'presentation',
  document: 'doc',
  guide: 'doc',
};

export function fileKind(input: {
  url?: string | null;
  fileType?: string | null;
  contentType?: string | null;
}): FileKind {
  // The explicit type leads: it is what the uploader recorded, and a storage
  // key is allowed to have no extension at all.
  const fromType = BY_EXTENSION[extensionOfType(input.fileType)];
  if (fromType) return fromType;

  const fromUrl = BY_EXTENSION[extensionOf(input.url)];
  if (fromUrl) return fromUrl;

  const fromContent = BY_CONTENT_TYPE[(input.contentType ?? '').trim().toLowerCase()];
  if (fromContent) return fromContent;

  return 'other';
}

/** Kinds the browser renders itself. Anything else is offered as a download. */
export function isPreviewable(kind: FileKind): boolean {
  return kind === 'image' || kind === 'pdf' || kind === 'video' || kind === 'audio';
}

// URL-only helpers, kept for callers that genuinely have nothing but a link
// (submission attachments are stored as bare URLs).
export const isImageUrl = (url: string) => fileKind({ url }) === 'image';
export const isPdfUrl = (url: string) => fileKind({ url }) === 'pdf';
export const isVideoUrl = (url: string) => fileKind({ url }) === 'video';
export const isAudioUrl = (url: string) => fileKind({ url }) === 'audio';
export const isDocUrl = (url: string) => {
  const kind = fileKind({ url });
  return kind === 'doc' || kind === 'presentation';
};
export const isCodeOrTextUrl = (url: string) => fileKind({ url }) === 'code';
