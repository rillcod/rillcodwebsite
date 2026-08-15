import { qrDataUrl } from '@/lib/cards/qr';
import { HD_QR_PRINT_PX } from '@/lib/qr/hd-qr';
import { brandContact } from '@/config/brand';

/**
 * Scan-to-watch codes for the capstone clips a school recorded this term.
 *
 * Paper cannot play a video, and the single most persuasive thing in a school
 * report is a board member pointing a phone at a page and watching a child's
 * robot move. Each code resolves to `/c/<token>`, which needs no account —
 * whoever is holding the printout has one in their hand, not a login.
 *
 * Pairing is by recency, not by cleverness. A clip records what a class built;
 * it carries no link back to a specific course, so guessing which spotlight it
 * illustrates would put a QR next to the wrong project and be worse than none.
 * Newest first, one per spotlight, and a spotlight with no clip left simply
 * prints without a code.
 */
export type CapstoneCode = { token: string; title: string; qrDataUrl: string };

export async function loadCapstoneQrCodes(
  db: { from: (t: string) => any },
  schoolId: string,
  academicTermId: string | null,
  limit = 4,
): Promise<CapstoneCode[]> {
  try {
    let query = db
      .from('school_gallery_media')
      .select('share_token, title, created_at')
      .eq('school_id', schoolId)
      .eq('is_capstone_demo', true)
      .eq('media_type', 'video')
      .order('created_at', { ascending: false })
      .limit(limit);

    // Scoped to the term the report covers when the clips were tagged with one.
    // A report about this term should not point at last term's demonstrations.
    if (academicTermId) query = query.eq('academic_term_id', academicTermId);

    const { data, error } = await query;
    if (error || !data?.length) return [];

    const appUrl = (process.env.NEXT_PUBLIC_APP_URL || brandContact.siteUrl).replace(/\/$/, '');
    return await Promise.all(
      data.map(async (row: any) => ({
        token: String(row.share_token),
        title: String(row.title ?? 'Capstone demonstration'),
        qrDataUrl: await qrDataUrl(`${appUrl}/c/${row.share_token}`, HD_QR_PRINT_PX),
      })),
    );
  } catch (error) {
    // A report is not worth failing over a missing QR. It prints without one.
    console.warn('[school-report] could not build capstone QR codes:', error);
    return [];
  }
}
