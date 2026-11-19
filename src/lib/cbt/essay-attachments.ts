export type EssayAttachment = {
  name: string;
  url: string;
  isImage: boolean;
};

const ATTACHMENT_LINE_RE = /^\[Attachment:\s*([^\]]+)\]\(([^)]+)\)\s*$/i;

export function isImageAttachment(nameOrUrl: string): boolean {
  const clean = nameOrUrl.split('?')[0].toLowerCase();
  if (/\.(png|jpe?g|webp|gif|bmp|avif)$/.test(clean)) return true;
  if (clean.endsWith('.pdf')) return false;
  return true;
}

/**
 * Splits a stored CBT essay/written answer string into clean student text
 * and structured image/file attachments (backward-compatible with plain strings).
 */
export function parseEssayAnswer(raw: string | null | undefined): {
  text: string;
  attachments: EssayAttachment[];
} {
  const source = String(raw ?? '');
  if (!source) return { text: '', attachments: [] };

  const lines = source.split(/\r?\n/);
  const textLines: string[] = [];
  const attachments: EssayAttachment[] = [];

  for (const line of lines) {
    const match = line.trim().match(ATTACHMENT_LINE_RE);
    if (match) {
      const name = match[1].trim();
      const url = match[2].trim();
      if (url) {
        attachments.push({
          name: name || 'Attachment',
          url,
          isImage: isImageAttachment(name || url),
        });
      }
    } else {
      textLines.push(line);
    }
  }

  // Trim trailing blank lines introduced solely as separator before attachments
  while (textLines.length > 0 && textLines[textLines.length - 1].trim() === '' && attachments.length > 0) {
    textLines.pop();
  }

  return {
    text: textLines.join('\n'),
    attachments,
  };
}

/**
 * Serializes essay text and attachments back into a single string suitable for
 * `cbt_sessions.answers[questionId]`.
 */
export function serializeEssayAnswer(text: string, attachments: EssayAttachment[]): string {
  const cleanText = text.replace(/\s+$/, '');
  const validAttachments = attachments.filter((a) => a.url?.trim());
  if (validAttachments.length === 0) return text;
  const attachmentBlock = validAttachments
    .map((a) => `[Attachment: ${(a.name || 'Image').replace(/[\[\]()]/g, '')}](${a.url.trim()})`)
    .join('\n');
  return cleanText ? `${cleanText}\n\n${attachmentBlock}` : attachmentBlock;
}

export function hasEssayResponse(raw: string | null | undefined): boolean {
  const { text, attachments } = parseEssayAnswer(raw);
  return text.trim().length > 0 || attachments.length > 0;
}

export function countEssayWords(text: string): number {
  const trimmed = text.trim();
  if (!trimmed) return 0;
  return trimmed.split(/\s+/).filter(Boolean).length;
}
