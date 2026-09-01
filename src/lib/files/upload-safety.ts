export type UploadReceipt = {
  file_id: string;
  url: string;
  name: string;
  type: string | null;
  size: number | null;
  storage_path: string;
  sha256: string | null;
  integrity_status: 'sha256_recorded' | 'metadata_only';
  scan_status: 'clean' | 'pending' | 'unavailable';
};

type StoredFileForReceipt = {
  id?: unknown;
  public_url?: unknown;
  original_filename?: unknown;
  mime_type?: unknown;
  file_size?: unknown;
  storage_path?: unknown;
  is_virus_scanned?: unknown;
  virus_scan_result?: unknown;
  metadata?: unknown;
};

const MIME_EXTENSIONS: Record<string, readonly string[]> = {
  'image/jpeg': ['jpg', 'jpeg'],
  'image/png': ['png'],
  'image/webp': ['webp'],
  'application/pdf': ['pdf'],
};

function startsWith(bytes: Uint8Array, expected: readonly number[], offset = 0): boolean {
  return expected.every((value, index) => bytes[index + offset] === value);
}

/**
 * Browser MIME values and filename extensions are user-controlled. Confirm the
 * bytes before a school file reaches durable storage so an executable cannot be
 * renamed to .pdf or .jpg and treated as learner evidence.
 */
export function validateAllowedUploadSignature(input: {
  filename: string;
  mimeType: string;
  bytes: Uint8Array;
}): string | null {
  const mimeType = input.mimeType.trim().toLowerCase();
  const extensions = MIME_EXTENSIONS[mimeType];
  if (!extensions) return 'This file type is not supported.';

  const extension = input.filename.split('.').pop()?.toLowerCase() ?? '';
  if (!extensions.includes(extension)) {
    return 'The filename extension does not match the selected file type.';
  }

  const bytes = input.bytes;
  const signatureMatches = mimeType === 'image/jpeg'
    ? startsWith(bytes, [0xff, 0xd8, 0xff])
    : mimeType === 'image/png'
      ? startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
      : mimeType === 'image/webp'
        ? startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) && startsWith(bytes, [0x57, 0x45, 0x42, 0x50], 8)
        : startsWith(bytes, [0x25, 0x50, 0x44, 0x46, 0x2d]);

  return signatureMatches ? null : 'The file contents do not match its stated format.';
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function storedHash(metadata: unknown): string | null {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return null;
  const value = (metadata as Record<string, unknown>).file_hash;
  return typeof value === 'string' && /^[a-f0-9]{64}$/i.test(value) ? value.toLowerCase() : null;
}

/** Client-safe receipt retained with assignment evidence and usable on retry. */
export function buildUploadReceipt(row: StoredFileForReceipt): UploadReceipt {
  const storagePath = asString(row.storage_path);
  const hash = storedHash(row.metadata);
  const scanResult = asString(row.virus_scan_result).toLowerCase();
  const scanStatus: UploadReceipt['scan_status'] = row.is_virus_scanned === true && scanResult === 'clean'
    ? 'clean'
    : scanResult === 'pending_external_scan' || scanResult === 'signature_validated'
      ? 'pending'
      : 'unavailable';

  return {
    file_id: asString(row.id),
    url: asString(row.public_url) || `/api/media/${storagePath}`,
    name: asString(row.original_filename) || 'Submission',
    type: asString(row.mime_type) || null,
    size: Number.isFinite(Number(row.file_size)) ? Number(row.file_size) : null,
    storage_path: storagePath,
    sha256: hash,
    integrity_status: hash ? 'sha256_recorded' : 'metadata_only',
    scan_status: scanStatus,
  };
}

export function mediaStoragePath(url: string): string | null {
  try {
    const parsed = new URL(url, 'https://rillcod.local');
    const marker = '/api/media/';
    const index = parsed.pathname.indexOf(marker);
    return index >= 0 ? decodeURIComponent(parsed.pathname.slice(index + marker.length)) : null;
  } catch {
    return null;
  }
}

export function receiptMatchesStoredFile(receipt: Partial<UploadReceipt>, row: StoredFileForReceipt): boolean {
  const expected = buildUploadReceipt(row);
  if (!receipt.file_id || receipt.file_id !== expected.file_id) return false;
  if (mediaStoragePath(String(receipt.url ?? '')) !== expected.storage_path) return false;
  if (receipt.storage_path && receipt.storage_path !== expected.storage_path) return false;
  if (receipt.sha256 && expected.sha256 && receipt.sha256.toLowerCase() !== expected.sha256) return false;
  return true;
}
