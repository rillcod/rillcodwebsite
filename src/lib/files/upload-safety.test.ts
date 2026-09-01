import { describe, expect, it } from 'vitest';
import {
  buildUploadReceipt,
  mediaStoragePath,
  receiptMatchesStoredFile,
  validateAllowedUploadSignature,
} from './upload-safety';

describe('upload safety and durable receipts', () => {
  it('accepts real signatures and rejects renamed executable content', () => {
    expect(validateAllowedUploadSignature({
      filename: 'work.pdf',
      mimeType: 'application/pdf',
      bytes: new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31]),
    })).toBeNull();
    expect(validateAllowedUploadSignature({
      filename: 'work.pdf',
      mimeType: 'application/pdf',
      bytes: new TextEncoder().encode('<script>alert(1)</script>'),
    })).toContain('contents');
    expect(validateAllowedUploadSignature({
      filename: 'work.exe',
      mimeType: 'application/pdf',
      bytes: new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d]),
    })).toContain('extension');
  });

  it('recognizes JPEG, PNG and WebP magic bytes', () => {
    expect(validateAllowedUploadSignature({ filename: 'a.jpg', mimeType: 'image/jpeg', bytes: new Uint8Array([0xff, 0xd8, 0xff]) })).toBeNull();
    expect(validateAllowedUploadSignature({ filename: 'a.png', mimeType: 'image/png', bytes: new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]) })).toBeNull();
    expect(validateAllowedUploadSignature({ filename: 'a.webp', mimeType: 'image/webp', bytes: new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]) })).toBeNull();
  });

  it('builds an honest hash receipt without claiming an absent malware scan', () => {
    const row = {
      id: 'file-1',
      public_url: 'https://www.rillcod.com/api/media/school/file.pdf',
      original_filename: 'Work.pdf',
      mime_type: 'application/pdf',
      file_size: 123,
      storage_path: 'school/file.pdf',
      is_virus_scanned: false,
      virus_scan_result: 'pending_external_scan',
      metadata: { file_hash: 'a'.repeat(64) },
    };
    const receipt = buildUploadReceipt(row);

    expect(receipt).toMatchObject({
      file_id: 'file-1',
      sha256: 'a'.repeat(64),
      integrity_status: 'sha256_recorded',
      scan_status: 'pending',
    });
    expect(mediaStoragePath(receipt.url)).toBe('school/file.pdf');
    expect(receiptMatchesStoredFile(receipt, row)).toBe(true);
    expect(receiptMatchesStoredFile({ ...receipt, sha256: 'b'.repeat(64) }, row)).toBe(false);
    expect(receiptMatchesStoredFile({ ...receipt, url: '/api/media/other/file.pdf' }, row)).toBe(false);
  });
});
