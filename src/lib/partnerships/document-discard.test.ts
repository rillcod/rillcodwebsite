import { describe, expect, it } from "vitest";
import { canDeletePartnershipDocument } from "@/lib/partnerships/document-discard";

describe("canDeletePartnershipDocument", () => {
  it("lets a proposal go in any state", () => {
    expect(canDeletePartnershipDocument({ status: "sent", document_kind: "proposal", open_count: 4 })).toBe(true);
    expect(canDeletePartnershipDocument({ status: "void", document_kind: "proposal" })).toBe(true);
  });

  it("lets an unsigned MoU go, and holds a signed one", () => {
    expect(canDeletePartnershipDocument({ status: "draft", document_kind: "mou" })).toBe(true);
    expect(canDeletePartnershipDocument({ status: "sent", document_kind: "mou", open_count: 2 })).toBe(true);
    expect(canDeletePartnershipDocument({ status: "signed", document_kind: "mou" })).toBe(false);
  });
});
