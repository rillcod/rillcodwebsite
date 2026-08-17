import { describe, expect, it } from "vitest";
import { ISSUED_PAGE_PX, measureIssuedDocumentHeight } from "./document-preview-height";

function fakeDoc(pages: Array<{ offsetTop: number; offsetHeight: number }>, scrollHeight = 1500) {
  return {
    querySelectorAll: () => pages,
    defaultView: {
      getComputedStyle: () => ({
        paddingTop: "24px",
        paddingBottom: "24px",
        rowGap: "24px",
        gap: "24px",
      }),
    },
    body: { scrollHeight },
    documentElement: { scrollHeight },
  } as unknown as Document;
}

describe("measureIssuedDocumentHeight", () => {
  it("does not trust a short iframe scrollHeight when sheets stack taller", () => {
    const pages = [
      { offsetTop: 24, offsetHeight: ISSUED_PAGE_PX },
      { offsetTop: 24 + ISSUED_PAGE_PX + 24, offsetHeight: ISSUED_PAGE_PX },
      { offsetTop: 24 + (ISSUED_PAGE_PX + 24) * 2, offsetHeight: ISSUED_PAGE_PX },
    ];
    const h = measureIssuedDocumentHeight(fakeDoc(pages, 1500));
    expect(h).toBeGreaterThan(1500);
    expect(h).toBe(pages[2].offsetTop + ISSUED_PAGE_PX + 24);
  });
});
