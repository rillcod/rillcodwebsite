/**
 * How tall a print-ready proposal or MoU actually is inside the preview iframe.
 *
 * `body.scrollHeight` is the iframe's viewport when the frame is still short —
 * a six-page document then measures as ~1500px, the wrapper clips the rest,
 * and scrolling stops mid-document. The sheets themselves know their size.
 */

/** A4 at 96dpi — the size every `.page` lays out against. */
export const ISSUED_PAGE_PX = 1123;

export function measureIssuedDocumentHeight(doc: Document): number {
  const pages = Array.from(doc.querySelectorAll<HTMLElement>(".page"));
  const win = doc.defaultView;
  const bodyStyle = win && doc.body ? win.getComputedStyle(doc.body) : null;
  const padTop = bodyStyle ? parseFloat(bodyStyle.paddingTop) || 0 : 0;
  const padBottom = bodyStyle ? parseFloat(bodyStyle.paddingBottom) || 0 : 0;
  const gap = bodyStyle
    ? parseFloat(bodyStyle.rowGap || bodyStyle.gap) || 0
    : 0;

  let stack = 0;
  if (pages.length) {
    const last = pages[pages.length - 1];
    const fromLayout = last.offsetTop + last.offsetHeight + padBottom;
    const fromBoxes =
      padTop +
      padBottom +
      pages.reduce((n, el) => n + Math.max(el.offsetHeight, ISSUED_PAGE_PX), 0) +
      gap * Math.max(0, pages.length - 1);
    stack = Math.max(fromLayout, fromBoxes);
  }

  const scroll = Math.max(
    doc.body?.scrollHeight ?? 0,
    doc.documentElement?.scrollHeight ?? 0,
  );

  return Math.ceil(Math.max(stack, scroll, ISSUED_PAGE_PX));
}
