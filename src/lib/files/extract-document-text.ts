/**
 * Universal client-side document text extractor for CBT & exam authoring.
 * Supports:
 *  - .pdf  (via existing pdf.js + Tesseract OCR fallback)
 *  - .pptx (PowerPoint slides + speaker notes, pure-TS ZIP + DecompressionStream)
 *  - .docx (Word document paragraphs & tables, pure-TS ZIP + DecompressionStream)
 *  - .txt, .md, .csv, .rtf
 *  - .doc, .ppt (legacy binary Office best-effort UTF-16LE / ASCII text recovery)
 */

import { extractPdfText } from '@/lib/pdf/extract-text';

export type SupportedDocumentKind = 'pdf' | 'pptx' | 'docx' | 'doc' | 'ppt' | 'txt';
export type DocumentContentRole = 'study_material' | 'question_paper' | 'answer_key';

export interface ExtractedSourceDocument {
  id: string;
  name: string;
  kind: SupportedDocumentKind;
  role: DocumentContentRole;
  text: string;
  charCount: number;
  wordCount: number;
  selected: boolean;
}

/**
 * Automatically classifies an uploaded file as Study Material (slides/notes),
 * a Question Paper (numbered exam questions), or an Answer Key / Marking Scheme
 * so multiple uploaded files can be combined intelligently.
 */
export function classifyDocumentRole(fileName: string, text: string): DocumentContentRole {
  const lowerName = fileName.toLowerCase();
  if (/(answer[\s_-]?key|marking[\s_-]?(?:scheme|guide)|solutions?|rubric|answers?\b)/i.test(lowerName)) {
    return 'answer_key';
  }
  const head = text.slice(0, 1200);
  const answerPairs = (text.match(/(?:^|\n)\s*(?:Q(?:uestion)?\s*)?\d+[\.\)\:\-]\s*(?:[A-Da-d]\b|True|False|Award\s+\d+)/gi) ?? []).length;
  if (/(?:^|\n)\s*(?:ANSWER\s+KEY|MARKING\s+(?:GUIDE|SCHEME)|SOLUTIONS)\b/i.test(head) && answerPairs >= 3) {
    return 'answer_key';
  }

  const numberedQs = (text.match(/(?:^|\n)\s*(?:Q(?:uestion)?\s*\d+|\d+[\.\)])\s+\S/gi) ?? []).length;
  const optionLines = (text.match(/(?:^|\n|\s)(?:\([A-Da-d]\)|[A-Da-d][\.\)])\s+\S/g) ?? []).length;
  if (numberedQs >= 3 && (optionLines >= 4 || /(?:exam|test|quiz|questions|section\s+a)/i.test(lowerName))) {
    return 'question_paper';
  }
  return 'study_material';
}

export const ACCEPTED_DOCUMENT_EXTENSIONS =
  '.pdf,.ppt,.pptx,.doc,.docx,.txt,.md,.csv,.rtf,application/pdf,text/plain,application/vnd.openxmlformats-officedocument.presentationml.presentation,application/vnd.ms-powerpoint,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/msword';

export function detectDocumentKind(file: File): SupportedDocumentKind {
  const lower = file.name.toLowerCase();
  if (lower.endsWith('.pdf') || file.type === 'application/pdf') return 'pdf';
  if (lower.endsWith('.pptx')) return 'pptx';
  if (lower.endsWith('.ppt')) return 'ppt';
  if (lower.endsWith('.docx')) return 'docx';
  if (lower.endsWith('.doc')) return 'doc';
  return 'txt';
}

function decodeXmlEntities(input: string): string {
  return input
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, num) => {
      const code = parseInt(num, 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : '';
    })
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => {
      const code = parseInt(hex, 16);
      return Number.isFinite(code) ? String.fromCodePoint(code) : '';
    });
}

async function inflateRawBytes(compressed: Uint8Array): Promise<Uint8Array> {
  if (typeof DecompressionStream === 'undefined') {
    throw new Error('This browser does not support built-in Office file decompression.');
  }
  const stream = new DecompressionStream('deflate-raw');
  const writer = stream.writable.getWriter();
  const safeBytes = new Uint8Array(compressed.byteLength);
  safeBytes.set(compressed);
  void writer.write(safeBytes).then(() => writer.close());

  const reader = stream.readable.getReader();
  const chunks: Uint8Array[] = [];
  let totalLength = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      chunks.push(value);
      totalLength += value.byteLength;
    }
  }
  const out = new Uint8Array(totalLength);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return out;
}

/**
 * Parses ZIP Central Directory entries (works reliably even when ZIP entries use
 * streaming data descriptors, as PowerPoint & Word routinely do).
 */
async function readZipEntries(
  buffer: ArrayBuffer,
  filter: (path: string) => boolean,
): Promise<Map<string, string>> {
  const bytes = new Uint8Array(buffer);
  const view = new DataView(buffer);
  const decoder = new TextDecoder('utf-8', { fatal: false });
  const results = new Map<string, string>();

  // Locate End of Central Directory record (0x06054b50) scanning backwards
  const minEocdOffset = Math.max(0, bytes.length - 65_557);
  let eocdOffset = -1;
  for (let i = bytes.length - 22; i >= minEocdOffset; i--) {
    if (
      bytes[i] === 0x50
      && bytes[i + 1] === 0x4b
      && bytes[i + 2] === 0x05
      && bytes[i + 3] === 0x06
    ) {
      eocdOffset = i;
      break;
    }
  }
  if (eocdOffset < 0) {
    throw new Error('Not a valid Office Open XML (.docx / .pptx) archive.');
  }

  const totalEntries = view.getUint16(eocdOffset + 10, true);
  const centralDirOffset = view.getUint32(eocdOffset + 16, true);

  let ptr = centralDirOffset;
  for (let entryIdx = 0; entryIdx < totalEntries && ptr + 46 <= bytes.length; entryIdx++) {
    if (view.getUint32(ptr, true) !== 0x02014b50) break;

    const compressionMethod = view.getUint16(ptr + 10, true);
    const compressedSize = view.getUint32(ptr + 20, true);
    const nameLen = view.getUint16(ptr + 28, true);
    const extraLen = view.getUint16(ptr + 30, true);
    const commentLen = view.getUint16(ptr + 32, true);
    const localHeaderOffset = view.getUint32(ptr + 42, true);

    const nameBytes = bytes.subarray(ptr + 46, ptr + 46 + nameLen);
    const filePath = decoder.decode(nameBytes);
    ptr += 46 + nameLen + extraLen + commentLen;

    if (!filter(filePath)) continue;
    if (localHeaderOffset + 30 > bytes.length) continue;
    if (view.getUint32(localHeaderOffset, true) !== 0x04034b50) continue;

    const localNameLen = view.getUint16(localHeaderOffset + 26, true);
    const localExtraLen = view.getUint16(localHeaderOffset + 28, true);
    const dataStart = localHeaderOffset + 30 + localNameLen + localExtraLen;
    const dataEnd = dataStart + compressedSize;
    if (dataEnd > bytes.length) continue;

    const rawSlice = bytes.subarray(dataStart, dataEnd);
    try {
      if (compressionMethod === 0) {
        results.set(filePath, decoder.decode(rawSlice));
      } else if (compressionMethod === 8) {
        const inflated = await inflateRawBytes(rawSlice);
        results.set(filePath, decoder.decode(inflated));
      }
    } catch {
      // Skip corrupted individual XML part and continue extracting remaining parts
    }
  }

  return results;
}

function extractXmlTextRuns(xml: string, tagName: 'a:t' | 'w:t', paraBreakTag?: string): string {
  let working = xml;
  if (paraBreakTag) {
    working = working.replace(new RegExp(`</${paraBreakTag}>`, 'g'), '\n');
  }
  const regex = new RegExp(`<${tagName}(?:\\s[^>]*)?>([\\s\\S]*?)</${tagName}>|\\n`, 'g');
  const parts: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = regex.exec(working)) !== null) {
    if (match[0] === '\n') {
      parts.push('\n');
    } else if (match[1]) {
      parts.push(decodeXmlEntities(match[1]));
    }
  }
  return parts
    .join(' ')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n[ \t]+/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

async function extractPptxText(file: File, maxChars: number): Promise<string> {
  const buf = await file.arrayBuffer();
  const entries = await readZipEntries(
    buf,
    (p) => /^ppt\/slides\/slide\d+\.xml$/i.test(p) || /^ppt\/notesSlides\/notesSlide\d+\.xml$/i.test(p),
  );

  const slideNums = Array.from(entries.keys())
    .map((p) => {
      const m = p.match(/^ppt\/slides\/slide(\d+)\.xml$/i);
      return m ? parseInt(m[1], 10) : null;
    })
    .filter((n): n is number => n !== null)
    .sort((a, b) => a - b);

  const sections: string[] = [];
  let totalLen = 0;

  for (const num of slideNums) {
    if (totalLen >= maxChars) break;
    const slideXml = entries.get(`ppt/slides/slide${num}.xml`) ?? '';
    const notesXml = entries.get(`ppt/notesSlides/notesSlide${num}.xml`) ?? '';
    const slideText = extractXmlTextRuns(slideXml, 'a:t', 'a:p');
    const notesText = notesXml ? extractXmlTextRuns(notesXml, 'a:t', 'a:p') : '';

    const combined = [
      slideText ? `[Slide ${num}]\n${slideText}` : '',
      notesText && notesText.length > 5 ? `[Slide ${num} Notes] ${notesText}` : '',
    ]
      .filter(Boolean)
      .join('\n');

    if (combined) {
      sections.push(combined);
      totalLen += combined.length;
    }
  }

  return sections.join('\n\n').slice(0, maxChars).trim();
}

async function extractDocxText(file: File, maxChars: number): Promise<string> {
  const buf = await file.arrayBuffer();
  const entries = await readZipEntries(
    buf,
    (p) => p === 'word/document.xml' || /^word\/header\d*\.xml$/i.test(p),
  );

  const mainXml = entries.get('word/document.xml') ?? '';
  if (!mainXml) return '';
  return extractXmlTextRuns(mainXml, 'w:t', 'w:p').slice(0, maxChars).trim();
}

function stripRtf(raw: string): string {
  return raw
    .replace(/\\par[d]?/g, '\n')
    .replace(/\\tab/g, ' ')
    .replace(/\\'[0-9a-fA-F]{2}/g, '')
    .replace(/\\[a-z]+-?\d* ?/gi, '')
    .replace(/[{}]/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * Best-effort readable text recovery for legacy binary .doc / .ppt files (OLE2).
 * Scans UTF-16LE and ASCII text runs and filters out binary metadata noise.
 */
async function extractLegacyOfficeBinaryText(file: File, maxChars: number): Promise<string> {
  const buf = await file.arrayBuffer();
  const bytes = new Uint8Array(buf);

  // First check if the file is actually an OOXML zip renamed as .doc/.ppt
  if (bytes.length >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04) {
    const kind = detectDocumentKind(file);
    try {
      const zipText = kind === 'ppt'
        ? await extractPptxText(file, maxChars)
        : await extractDocxText(file, maxChars);
      if (zipText.length >= 40) return zipText;
    } catch {
      // Fall through to binary recovery
    }
  }

  // Pass 1: UTF-16LE runs (PowerPoint & Word binary text streams)
  const utf16Chunks: string[] = [];
  let current = '';
  for (let i = 0; i + 1 < bytes.length; i += 2) {
    const lo = bytes[i];
    const hi = bytes[i + 1];
    const code = lo | (hi << 8);
    if ((code >= 32 && code <= 126) || code === 10 || code === 13 || code === 9) {
      current += code === 13 ? '\n' : String.fromCharCode(code);
    } else {
      if (current.trim().length >= 20 && /[a-zA-Z]{3,}/.test(current)) {
        utf16Chunks.push(current.trim());
      }
      current = '';
    }
  }
  if (current.trim().length >= 20 && /[a-zA-Z]{3,}/.test(current)) {
    utf16Chunks.push(current.trim());
  }

  const filterNoise = (lines: string[]) =>
    lines
      .filter((s) => !/^(Root Entry|WordDocument|PowerPoint Document|Current User|SummaryInformation|Microsoft|Times New Roman|Calibri|Arial|Normal|Heading \d)$/i.test(s))
      .filter((s) => (s.match(/[a-zA-Z0-9\s.,?!:;'"()\-/%]/g)?.length ?? 0) / Math.max(1, s.length) > 0.85);

  const cleanUtf16 = filterNoise(utf16Chunks).join('\n').trim();
  if (cleanUtf16.length >= 120) {
    return cleanUtf16.slice(0, maxChars).trim();
  }

  // Pass 2: ASCII printable runs
  const asciiChunks: string[] = [];
  let asc = '';
  for (let i = 0; i < bytes.length; i++) {
    const b = bytes[i];
    if ((b >= 32 && b <= 126) || b === 10 || b === 13 || b === 9) {
      asc += b === 13 ? '\n' : String.fromCharCode(b);
    } else {
      if (asc.trim().length >= 24 && /[a-zA-Z]{3,}\s+[a-zA-Z]{2,}/.test(asc)) {
        asciiChunks.push(asc.trim());
      }
      asc = '';
    }
  }
  if (asc.trim().length >= 24 && /[a-zA-Z]{3,}\s+[a-zA-Z]{2,}/.test(asc)) {
    asciiChunks.push(asc.trim());
  }

  return filterNoise(asciiChunks).join('\n').slice(0, maxChars).trim();
}

export async function extractDocumentText(
  file: File,
  maxChars = 20_000,
  onProgress?: (msg: string) => void,
): Promise<{ kind: SupportedDocumentKind; text: string }> {
  const kind = detectDocumentKind(file);
  const lower = file.name.toLowerCase();

  if (kind === 'txt') {
    onProgress?.(`Reading ${file.name}…`);
    const raw = await file.text();
    const cleaned = lower.endsWith('.rtf') ? stripRtf(raw) : raw.trim();
    return { kind, text: cleaned.slice(0, maxChars).trim() };
  }

  if (kind === 'pdf') {
    onProgress?.(`Extracting text from ${file.name}…`);
    const text = await extractPdfText(file, maxChars, onProgress);
    return { kind, text };
  }

  if (kind === 'pptx') {
    onProgress?.(`Reading slides from ${file.name}…`);
    const text = await extractPptxText(file, maxChars);
    return { kind, text };
  }

  if (kind === 'docx') {
    onProgress?.(`Reading Word document ${file.name}…`);
    const text = await extractDocxText(file, maxChars);
    return { kind, text };
  }

  // Legacy .doc / .ppt
  onProgress?.(`Extracting text from ${file.name}…`);
  const text = await extractLegacyOfficeBinaryText(file, maxChars);
  return { kind, text };
}

/**
 * Combines 1 or more selected source documents into a single clearly delimited
 * prompt payload with fair per-file character budgeting so no single file crowds out the rest.
 */
export function buildCombinedSourceMaterial(
  docs: ExtractedSourceDocument[],
  extraNotes?: string,
  maxTotalChars = 22_000,
): { combinedText: string; summaryLabel: string; selectedCount: number } {
  const active = docs.filter((d) => d.selected && d.text.trim().length > 0);
  const extra = (extraNotes ?? '').trim();

  if (active.length === 0) {
    return {
      combinedText: extra.slice(0, maxTotalChars),
      summaryLabel: extra ? 'Pasted Notes' : '',
      selectedCount: 0,
    };
  }

  const extraReserve = extra ? Math.min(4_000, extra.length) : 0;
  const budgetForDocs = Math.max(4_000, maxTotalChars - extraReserve);

  // Order files smartly: Question Papers first, Study Material next, Answer Keys last
  // (so trailing answer keys automatically pair with preceding question papers!)
  const roleOrder: Record<DocumentContentRole, number> = {
    question_paper: 0,
    study_material: 1,
    answer_key: 2,
  };
  const ordered = [...active].sort((a, b) => roleOrder[a.role] - roleOrder[b.role]);
  const perDocBudget = Math.floor(budgetForDocs / ordered.length);

  const sections = ordered.map((doc, idx) => {
    const snippet = doc.text.slice(0, perDocBudget).trim();
    if (doc.role === 'answer_key') {
      return `=== ANSWER KEY (${doc.kind.toUpperCase()}): ${doc.name} ===\nANSWER KEY:\n${snippet}`;
    }
    const roleTag = doc.role === 'question_paper' ? 'QUESTION PAPER' : 'STUDY MATERIAL';
    return `=== SOURCE FILE ${idx + 1} [${roleTag} · ${doc.kind.toUpperCase()}]: ${doc.name} ===\n${snippet}`;
  });

  if (extra) {
    sections.push(`=== ADDITIONAL TEACHER NOTES ===\n${extra.slice(0, extraReserve)}`);
  }

  const summaryLabel = active.length === 1
    ? active[0].name
    : `${active.length} combined files (${active.map((d) => d.name).join(', ').slice(0, 80)})`;

  return {
    combinedText: sections.join('\n\n'),
    summaryLabel,
    selectedCount: active.length,
  };
}
