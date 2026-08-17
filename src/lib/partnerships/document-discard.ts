/**
 * What may be thrown away on the partnership desk.
 *
 * A proposal is a quote, not a contract — discard it in any state and issue
 * another. An MoU is the legal document; unsigned copies may still go. A
 * signed MoU must be withdrawn first so the school's link dies.
 */

export function canDeletePartnershipDocument(doc: {
  status: string;
  document_kind?: string | null;
  kind?: string | null;
  open_count?: number | null;
}): boolean {
  const kind = doc.document_kind || doc.kind || "";
  if (kind === "proposal") return true;
  if (kind === "mou") return doc.status !== "signed";
  return (
    doc.status === "draft" ||
    doc.status === "void" ||
    doc.status === "declined" ||
    (doc.status === "sent" && !(Number(doc.open_count) || 0))
  );
}
