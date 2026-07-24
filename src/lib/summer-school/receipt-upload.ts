const RECEIPT_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'gif', 'webp', 'heic', 'heif', 'pdf']);

/** Client/server guard for bank-transfer receipt uploads (images + PDF, incl. HEIC). */
export function isAllowedReceiptFile(file: { name: string; type: string }): boolean {
  const type = String(file.type || '').toLowerCase();
  if (type.startsWith('image/')) return true;
  if (type === 'application/pdf') return true;
  const ext = file.name.split('.').pop()?.toLowerCase();
  return ext ? RECEIPT_EXTENSIONS.has(ext) : false;
}

export function receiptAcceptAttribute(): string {
  return 'image/*,.heic,.heif,.pdf,application/pdf';
}

const DEFAULT_PUBLIC_APP_URL = 'https://www.rillcod.com';

export function publicAppBaseUrl(): string {
  return (process.env.NEXT_PUBLIC_APP_URL || DEFAULT_PUBLIC_APP_URL).replace(/\/$/, '');
}

/** Turn relative media paths into absolute URLs for validation and storage. */
export function normalizeReceiptPublicUrl(url: string): string {
  const trimmed = url.trim();
  if (!trimmed) return trimmed;
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) return trimmed;
  if (trimmed.startsWith('/')) return `${publicAppBaseUrl()}${trimmed}`;
  return trimmed;
}

function receiptStoragePath(pathname: string): boolean {
  const path = pathname.toLowerCase();
  return (
    path.includes('/summer-school-receipts/') ||
    path.includes('/api/media/summer-school-receipts/') ||
    (path.includes('/portfolio-images/') && path.includes('summer-school-receipts'))
  );
}

/** Receipt URLs must point at our public receipt storage paths. */
export function isAllowedReceiptStorageUrl(url: string): boolean {
  const normalized = normalizeReceiptPublicUrl(url);
  try {
    const parsed = new URL(normalized);
    return receiptStoragePath(parsed.pathname);
  } catch {
    return receiptStoragePath(normalized.toLowerCase());
  }
}

export type ParsedBankTransferReference =
  | { ok: true; raw: string; receiptUrl: string | null; transferReference: string | null }
  | { ok: false; error: string };

export function parseBankTransferReference(raw: string | undefined | null): ParsedBankTransferReference {
  const trimmed = String(raw || '').trim();
  if (!trimmed) {
    return { ok: false, error: 'Bank transfer reference or receipt is required' };
  }
  if (trimmed.startsWith('http') || trimmed.startsWith('/')) {
    const receiptUrl = normalizeReceiptPublicUrl(trimmed);
    if (!isAllowedReceiptStorageUrl(receiptUrl)) {
      return {
        ok: false,
        error: 'Invalid receipt upload. Please use the receipt upload button on the form.',
      };
    }
    return { ok: true, raw: receiptUrl, receiptUrl, transferReference: null };
  }
  if (trimmed.length < 3) {
    return { ok: false, error: 'Transfer reference must be at least 3 characters' };
  }
  if (trimmed.length > 160) {
    return { ok: false, error: 'Transfer reference is too long' };
  }
  return { ok: true, raw: trimmed, receiptUrl: null, transferReference: trimmed };
}
