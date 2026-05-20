'use client';

import { useEffect, useRef, useState } from 'react';
// NOTE: html-to-image and jspdf are browser-only. Do NOT import them here at the
// module level — that causes a 56 s SSR hang + 404. They are loaded lazily inside
// generateReportPDF() via dynamic import() so the server never touches them.

// ─── Legacy color converters (kept for reference, no longer used) ─────────────
// html-to-image uses the browser's native renderer so no conversion is needed.

const sRgbGamma = (c: number) => {
    const abs = Math.abs(c);
    return abs <= 0.0031308
        ? c * 12.92
        : Math.sign(c) * (1.055 * abs ** (1 / 2.4) - 0.055);
};
const clamp8 = (v: number) => Math.round(Math.max(0, Math.min(255, v * 255)));
const pctAlpha = (s: string | undefined) => {
    if (s === undefined) return 1;
    const n = parseFloat(s);
    return s.endsWith('%') ? n / 100 : n;
};
const toRgbStr = (r: number, g: number, b: number, a: number) =>
    a < 1 ? `rgba(${r},${g},${b},${+a.toFixed(4)})` : `rgb(${r},${g},${b})`;

/** oklch / oklab shared LMS → linear sRGB matrix */
function oklabLinear(L: number, a: number, b: number) {
    const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
    const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
    const s_ = L - 0.0894841775 * a - 1.2914855480 * b;
    const lc = l_ ** 3, mc = m_ ** 3, sc = s_ ** 3;
    return [
         4.0767416621 * lc - 3.3077115913 * mc + 0.2309699292 * sc,
        -1.2684380046 * lc + 2.6097574011 * mc - 0.3413193965 * sc,
        -0.0041960863 * lc - 0.7034186147 * mc + 1.7076147010 * sc,
    ];
}

function convertOklch(str: string): string | null {
    const m = str.match(
        /oklch\(\s*([\d.]+%?)\s+([\d.]+)\s+([\d.]+)(?:\s*\/\s*([\d.]+%?))?\s*\)/i
    );
    if (!m) return null;
    let L = parseFloat(m[1]); if (m[1].endsWith('%')) L /= 100;
    const C = parseFloat(m[2]);
    const H = parseFloat(m[3]) * (Math.PI / 180);
    const alpha = pctAlpha(m[4]);
    const [lr, lg, lb] = oklabLinear(L, C * Math.cos(H), C * Math.sin(H));
    return toRgbStr(clamp8(sRgbGamma(lr)), clamp8(sRgbGamma(lg)), clamp8(sRgbGamma(lb)), alpha);
}

function convertOklab(str: string): string | null {
    const m = str.match(
        /oklab\(\s*([\d.]+%?)\s+([-\d.]+)\s+([-\d.]+)(?:\s*\/\s*([\d.]+%?))?\s*\)/i
    );
    if (!m) return null;
    let L = parseFloat(m[1]); if (m[1].endsWith('%')) L /= 100;
    const alpha = pctAlpha(m[4]);
    const [lr, lg, lb] = oklabLinear(L, parseFloat(m[2]), parseFloat(m[3]));
    return toRgbStr(clamp8(sRgbGamma(lr)), clamp8(sRgbGamma(lg)), clamp8(sRgbGamma(lb)), alpha);
}

/** CIE lab f-function inverse */
const labF = (t: number) => t > 6 / 29 ? t ** 3 : 3 * (6 / 29) ** 2 * (t - 4 / 29);
/** D50 reference white in XYZ */
const D50 = [0.3457 / 0.3585, 1.0, (1 - 0.3457 - 0.3585) / 0.3585];

function labToLinearSrgb(L: number, a: number, b: number): [number, number, number] {
    const fy = (L + 16) / 116;
    const X = labF(fy + a / 500) * D50[0];
    const Y = labF(fy) * D50[1];
    const Z = labF(fy - b / 200) * D50[2];
    // XYZ D50 → linear sRGB (Bradford D50→D65 + sRGB matrix combined)
    return [
         3.1338561 * X - 1.6168667 * Y - 0.4906146 * Z,
        -0.9787684 * X + 1.9161415 * Y + 0.0334540 * Z,
         0.0719453 * X - 0.2289914 * Y + 1.4052427 * Z,
    ];
}

function convertLab(str: string): string | null {
    const m = str.match(
        /\blab\(\s*([\d.]+%?)\s+([-\d.]+%?)\s+([-\d.]+%?)(?:\s*\/\s*([\d.]+%?))?\s*\)/i
    );
    if (!m) return null;
    const L = parseFloat(m[1]);
    const a = parseFloat(m[2]) * (m[2].endsWith('%') ? 1.25 : 1);
    const b = parseFloat(m[3]) * (m[3].endsWith('%') ? 1.25 : 1);
    const alpha = pctAlpha(m[4]);
    const [lr, lg, lb] = labToLinearSrgb(L, a, b);
    return toRgbStr(clamp8(sRgbGamma(lr)), clamp8(sRgbGamma(lg)), clamp8(sRgbGamma(lb)), alpha);
}

function convertLch(str: string): string | null {
    const m = str.match(
        /\blch\(\s*([\d.]+%?)\s+([\d.]+%?)\s+([\d.]+)(?:\s*\/\s*([\d.]+%?))?\s*\)/i
    );
    if (!m) return null;
    const L = parseFloat(m[1]);
    const C = parseFloat(m[2]) * (m[2].endsWith('%') ? 1.5 : 1);
    const H = parseFloat(m[3]) * (Math.PI / 180);
    const alpha = pctAlpha(m[4]);
    const [lr, lg, lb] = labToLinearSrgb(L, C * Math.cos(H), C * Math.sin(H));
    return toRgbStr(clamp8(sRgbGamma(lr)), clamp8(sRgbGamma(lg)), clamp8(sRgbGamma(lb)), alpha);
}

function convertDisplayP3(str: string): string | null {
    const m = str.match(
        /color\(\s*display-p3\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)(?:\s*\/\s*([\d.]+))?\s*\)/i
    );
    if (!m) return null;
    const decode = (c: number) => c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    const alpha = pctAlpha(m[4]);
    const lr = decode(parseFloat(m[1]));
    const lg = decode(parseFloat(m[2]));
    const lb = decode(parseFloat(m[3]));
    // P3 → linear sRGB matrix
    const R =  1.2249401 * lr - 0.2249401 * lg;
    const G = -0.0420569 * lr + 1.0420569 * lg;
    const B = -0.0196376 * lr - 0.0786361 * lg + 1.0982735 * lb;
    return toRgbStr(clamp8(sRgbGamma(R)), clamp8(sRgbGamma(G)), clamp8(sRgbGamma(B)), alpha);
}

/** Master converter — tries every modern color format, returns null if none match */
function convertModernColor(val: string): string | null {
    if (val.includes('oklch'))      return convertOklch(val);
    if (val.includes('oklab'))      return convertOklab(val);
    if (val.includes('display-p3')) return convertDisplayP3(val);
    if (val.includes('lch('))       return convertLch(val);
    if (val.includes('lab('))       return convertLab(val);
    return null;
}

/** True if the value contains any color function html2canvas v1 cannot parse */
function hasModernColor(val: string): boolean {
    return (
        val.includes('oklch') ||
        val.includes('oklab') ||
        val.includes('display-p3') ||
        val.includes('lch(') ||
        val.includes('lab(')
    );
}

/**
 * Replaces ALL modern color functions inside a raw CSS string (stylesheet text).
 * html2canvas parses <style> elements directly — so we must sanitize those too,
 * not just computed inline styles.
 */
function replaceColorsInCssText(css: string): string {
    return css
        .replace(/oklch\([^)]+\)/gi,           m => convertOklch(m)      ?? m)
        .replace(/oklab\([^)]+\)/gi,            m => convertOklab(m)      ?? m)
        .replace(/color\(\s*display-p3[^)]+\)/gi, m => convertDisplayP3(m) ?? m)
        .replace(/\blch\([^)]+\)/gi,            m => convertLch(m)        ?? m)
        .replace(/\blab\([^)]+\)/gi,            m => convertLab(m)        ?? m);
}

// ─── CSS class overrides — first-pass safety net ──────────────────────────────
// Covers the most common Tailwind v4 oklch classes used in ReportCard.
// The oklch DOM-walker below handles anything not caught here.
export const OKLCH_HEX_OVERRIDES = `
/* Grays */
.bg-white{background-color:#ffffff!important}
.bg-gray-50{background-color:#f9fafb!important}
.bg-gray-100{background-color:#f3f4f6!important}
.text-gray-900{color:#111827!important}
.text-gray-800{color:#1f2937!important}
.text-gray-700{color:#374151!important}
.text-gray-600{color:#4b5563!important}
.text-gray-500{color:#6b7280!important}
.text-gray-400{color:#9ca3af!important}
.text-gray-300{color:#d1d5db!important}
.text-gray-200{color:#e5e7eb!important}
.border-gray-50{border-color:#f9fafb!important}
.border-gray-100{border-color:#f3f4f6!important}
.border-gray-200{border-color:#e5e7eb!important}

/* Violet */
.text-violet-600{color:#7c3aed!important}
.text-violet-400{color:#a78bfa!important}
.bg-violet-600\/10{background-color:rgba(124,58,237,0.1)!important}
.bg-violet-600\/30{background-color:rgba(124,58,237,0.3)!important}
.bg-violet-50\/50{background-color:rgba(245,243,255,0.5)!important}

/* Emerald */
.bg-emerald-50\/50{background-color:rgba(236,253,245,0.5)!important}
.border-emerald-100{border-color:#d1fae5!important}
.text-emerald-900\/80{color:rgba(6,78,59,0.8)!important}

/* Amber */
.bg-amber-50\/50{background-color:rgba(255,251,235,0.5)!important}
.border-amber-100{border-color:#fef3c7!important}
.text-amber-900\/80{color:rgba(78,49,6,0.8)!important}
.text-amber-400{color:#fbbf24!important}
.text-amber-500\/10{color:rgba(245,158,11,0.1)!important}
.bg-amber-500\/10{background-color:rgba(245,158,11,0.1)!important}
.border-amber-500\/20{border-color:rgba(245,158,11,0.2)!important}

/* Indigo */
.bg-indigo-50\/50{background-color:rgba(238,242,255,0.5)!important}

/* White with opacity (on dark sections) */
.text-white{color:#ffffff!important}
.text-white\/90{color:rgba(255,255,255,0.9)!important}
.text-white\/80{color:rgba(255,255,255,0.8)!important}
.text-white\/60{color:rgba(255,255,255,0.6)!important}
.text-white\/40{color:rgba(255,255,255,0.4)!important}
.bg-white\/10{background-color:rgba(255,255,255,0.1)!important}
.border-border\/10{border-color:rgba(255,255,255,0.1)!important}
.bg-white\/5{background-color:rgba(255,255,255,0.05)!important}
`;

// ─── Shared PDF generation ─────────────────────────────────────────────────────
// Uses html-to-image which renders via the browser's native foreignObject SVG
// renderer — no custom CSS parser, so oklch/lab/lch/display-p3 all work natively.

/** Internal: renders element → jsPDF instance (shared by save + blob variants) */
async function buildPdf(element: HTMLElement, isLandscape = false, pixelRatio = 1.5, jpegQuality = 0.92) {
    const [{ toPng }, { default: jsPDF }] = await Promise.all([
        import('html-to-image'),
        import('jspdf'),
    ]);

    const imgs = element.querySelectorAll('img');
    await Promise.allSettled(
        Array.from(imgs).map(img =>
            img.complete
                ? Promise.resolve()
                : new Promise(res => { img.onload = res; img.onerror = res; })
        )
    );

    const W = isLandscape ? 1122 : 794;
    const H = isLandscape ? 794 : element.scrollHeight;

    const pngUrl = await toPng(element, {
        pixelRatio,
        cacheBust: true,
        skipAutoScale: false,
        width: W,
        height: H,
        backgroundColor: '#fff',
    });

    // Convert PNG→JPEG via canvas before passing to jsPDF.
    // jsPDF's PNG path does Array.join('') on raw pixel bytes which overflows
    // the JS max string length on large reports. JPEG path avoids this entirely.
    const jpegUrl = await new Promise<string>(resolve => {
        const img = new Image();
        img.onload = () => {
            const c = document.createElement('canvas');
            c.width = img.width;
            c.height = img.height;
            const ctx = c.getContext('2d')!;
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, c.width, c.height);
            ctx.drawImage(img, 0, 0);
            resolve(c.toDataURL('image/jpeg', jpegQuality));
        };
        img.src = pngUrl;
    });

    const pdf = new jsPDF({ orientation: isLandscape ? 'landscape' : 'portrait', unit: 'px', format: [W, H] });
    pdf.addImage(jpegUrl, 'JPEG', 0, 0, W, H);
    return pdf;
}

/** Download the report as a PDF file */
export async function generateReportPDF(element: HTMLElement, filename: string, isLandscape = false): Promise<void> {
    const pdf = await buildPdf(element, isLandscape, 2, 0.95);
    pdf.save(filename);
}

/** Return the report as a Blob (for Web Share API / attachment sending) */
export async function generateReportPDFBlob(element: HTMLElement, isLandscape = false): Promise<Blob> {
    const pdf = await buildPdf(element, isLandscape);
    return pdf.output('blob');
}

/** Convert a jsPDF instance to a clean base64 string via ArrayBuffer — avoids btoa() binary-string encoding bugs */
function pdfToBase64(pdf: any): string {
    const ab: ArrayBuffer = pdf.output('arraybuffer');
    const bytes = new Uint8Array(ab);
    let binary = '';
    const chunk = 8192;
    for (let i = 0; i < bytes.length; i += chunk) {
        binary += String.fromCharCode(...bytes.subarray(i, Math.min(i + chunk, bytes.length)));
    }
    return btoa(binary);
}

/** Return the report as a raw base64 string (no data-URI prefix) for email attachments.
 *  Uses 1× pixel ratio and 0.75 JPEG quality to keep the file well under 4 MB. */
export async function generateReportPDFBase64(element: HTMLElement, isLandscape = false): Promise<string> {
    const W = isLandscape ? 1122 : 794;

    // Clone the element so we never touch the React-managed DOM node.
    // The wrapper sits at left:0;top:0 (in the stacking context html-to-image can read)
    // but is opacity:0.001 so users never see it. The clone itself has full opacity,
    // so toPng(clone) captures normal content — opacity on the wrapper is irrelevant
    // because html-to-image only traverses the passed element's subtree.
    const clone = element.cloneNode(true) as HTMLElement;
    const wrapper = document.createElement('div');
    wrapper.style.cssText =
        `position:fixed;left:0;top:0;width:${W}px;z-index:99999;pointer-events:none;opacity:0.001;`;
    wrapper.appendChild(clone);
    document.body.appendChild(wrapper);

    // Let the browser do one layout pass on the clone before reading its dimensions
    await new Promise<void>(r => requestAnimationFrame(() => requestAnimationFrame(() => r())));

    try {
        const pdf = await buildPdf(clone, isLandscape, 1, 0.75);
        return pdfToBase64(pdf);
    } finally {
        document.body.removeChild(wrapper);
    }
}

/**
 * Convert a self-contained HTML string to a base64 PDF for email attachments.
 * Renders inside a hidden iframe so the full document context is preserved —
 * body CSS, pt units, class selectors, and @font-face all resolve correctly.
 */
export async function generateHtmlStringToPDFBase64(htmlString: string): Promise<string> {
    const [{ toPng }, { default: jsPDF }] = await Promise.all([
        import('html-to-image'),
        import('jspdf'),
    ]);

    const W = 794;
    const PAGE_H = 1123; // A4 height at 96 dpi (297mm × 96/25.4)
    const PIXEL_RATIO = 1.2;
    // Strip print script so it doesn't trigger a print dialog inside the iframe
    const cleanHtml = htmlString.replace(/<script[\s\S]*?<\/script>/gi, '');

    // Create a near-invisible iframe at full A4 width.
    // srcdoc gives it same-origin access, so html-to-image can read its DOM.
    const iframe = document.createElement('iframe');
    iframe.style.cssText =
        `position:fixed;left:0;top:0;width:${W}px;height:2000px;border:none;` +
        `z-index:99999;pointer-events:none;opacity:0.001;`;
    document.body.appendChild(iframe);

    // Wait for the iframe document to finish loading
    await new Promise<void>(resolve => {
        iframe.onload = () => resolve();
        iframe.srcdoc = cleanHtml;
    });

    // Flush layout inside the iframe
    await new Promise<void>(r => requestAnimationFrame(() => requestAnimationFrame(() => r())));

    const iDoc = iframe.contentDocument!;

    // @page margins (15mm top, 18mm sides, 14mm bottom) only apply during print.
    // Inject equivalent px padding onto the body so screen capture looks like A4.
    // 1mm = 3.7795px at 96 dpi → 15mm≈57px, 18mm≈68px, 14mm≈53px
    // Simulate @page margins (15mm≈57px top, 18mm≈68px sides, 14mm≈53px bottom)
    // by adding padding to the body and constraining width to exactly A4.
    // Use !important to override the wildcard reset in the assignment stylesheet.
    const pageStyle = iDoc.createElement('style');
    pageStyle.textContent =
        `html,body{margin:0!important;background:#fff!important;}` +
        `body{width:${W}px!important;` +
        `padding:57px 68px 53px!important;box-sizing:border-box!important;}`;
    iDoc.head.appendChild(pageStyle);

    // Re-flush so scrollHeight reflects the padded layout
    await new Promise<void>(r => requestAnimationFrame(() => requestAnimationFrame(() => r())));

    const H = Math.max(iDoc.body.scrollHeight, iDoc.documentElement.scrollHeight) || 1123;

    // Expand iframe to full document height so nothing gets clipped during capture
    iframe.style.height = `${H}px`;
    await new Promise<void>(r => requestAnimationFrame(() => requestAnimationFrame(() => r())));

    // Wait for any images inside the iframe to finish loading
    const imgs = iDoc.body.querySelectorAll('img');
    await Promise.allSettled(
        Array.from(imgs).map(img =>
            img.complete ? Promise.resolve() : new Promise(res => { img.onload = res; img.onerror = res; })
        )
    );

    let base64: string;
    try {
        const pngUrl = await toPng(iDoc.body, {
            pixelRatio: PIXEL_RATIO,
            cacheBust: true,
            width: W,
            height: H,
            backgroundColor: '#fff',
        });

        // Load the full-content image once
        const fullImg = await new Promise<HTMLImageElement>((resolve, reject) => {
            const img = new Image();
            img.onload = () => resolve(img);
            img.onerror = () => reject(new Error('Failed to load captured image'));
            img.src = pngUrl;
        });

        // Split the long image into A4-height pages so the PDF looks like a
        // properly paginated document rather than one tall scroll.
        const numPages = Math.ceil(H / PAGE_H);
        // Skip last page if its slice is almost empty (bottom-padding overflow artifact)
        const lastSliceH = H - (numPages - 1) * PAGE_H;
        const pagesToRender = numPages > 1 && lastSliceH < 80 ? numPages - 1 : numPages;
        const pdf = new jsPDF({ orientation: 'portrait', unit: 'px', format: [W, PAGE_H] });

        for (let p = 0; p < pagesToRender; p++) {
            if (p > 0) pdf.addPage([W, PAGE_H]);

            // Height of this page's content slice in content-px
            const sliceH = Math.min(PAGE_H, H - p * PAGE_H);
            // Corresponding pixel rows in the 2× image
            const srcY  = p * PAGE_H * PIXEL_RATIO;
            const srcH  = sliceH * PIXEL_RATIO;

            const pageCanvas = document.createElement('canvas');
            pageCanvas.width  = W * PIXEL_RATIO;
            pageCanvas.height = PAGE_H * PIXEL_RATIO;       // always full A4 height
            const ctx = pageCanvas.getContext('2d')!;
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, pageCanvas.width, pageCanvas.height);
            // Draw the slice of the full image at the top of this page canvas
            ctx.drawImage(fullImg, 0, srcY, W * PIXEL_RATIO, srcH, 0, 0, W * PIXEL_RATIO, srcH);

            pdf.addImage(pageCanvas.toDataURL('image/jpeg', 0.75), 'JPEG', 0, 0, W, PAGE_H);
        }

        base64 = pdfToBase64(pdf);
    } finally {
        document.body.removeChild(iframe);
    }

    return base64;
}

/**
 * Share the report card as a PDF attachment via the Web Share API.
 * On Android/iOS this shows the native share sheet which includes WhatsApp.
 * Falls back to direct download on browsers that don't support file sharing.
 * Returns 'shared' | 'downloaded' | 'unsupported'.
 */
export async function shareReportCard(
    element: HTMLElement,
    filename: string,
    shareText?: string,
): Promise<'shared' | 'downloaded' | 'unsupported'> {
    const blob = await generateReportPDFBlob(element);
    const file = new File([blob], filename, { type: 'application/pdf' });

    // Web Share API with files — works on Android Chrome, iOS Safari ≥15.1
    if (typeof navigator !== 'undefined' && navigator.canShare?.({ files: [file] })) {
        await navigator.share({
            files: [file],
            title: filename.replace('.pdf', '').replace(/_/g, ' '),
            text: shareText ?? 'Please find the attached progress report from Rillcod Technologies.',
        });
        return 'shared';
    }

    // Desktop / unsupported browser — fall back to download
    const url = URL.createObjectURL(blob);
    const a   = document.createElement('a');
    a.href    = url;
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
    return 'downloaded';
}

// ─── Responsive scaled preview of a ReportCard ───────────────────────────────
// Fits the fixed 794px-wide A4 card into whatever container width is available.
// Height tracks the rendered card height dynamically so the outer wrapper
// never clips or leaves whitespace.
const CARD_W = 794;

export function ScaledReportCard({ children, report, responsive = false }: { children: React.ReactNode; report?: any; responsive?: boolean }) {
    const containerRef = useRef<HTMLDivElement>(null);
    const innerRef     = useRef<HTMLDivElement>(null);
    const [scale, setScale]         = useState(1);
    const [cardHeight, setCardHeight] = useState(1123); // A4 default

    useEffect(() => {
        const outer = containerRef.current;
        const inner = innerRef.current;
        if (!outer || !inner) return;

        const update = () => {
            const w = outer.clientWidth;
            // Always scale down when container is narrower than the card
            const s = w < CARD_W ? w / CARD_W : 1;
            setScale(s);
            const h = inner.scrollHeight || 1123;
            setCardHeight(h);
        };

        update();
        const ro = new ResizeObserver(update);
        ro.observe(outer);
        ro.observe(inner);
        return () => ro.disconnect();
    }, [report, children]);

    return (
        <div
            ref={containerRef}
            style={{
                width: '100%',
                overflow: 'hidden',
                height: scale < 1 ? `${scale * cardHeight}px` : `${cardHeight}px`,
            }}
        >
            <div
                ref={innerRef}
                style={{
                    transform: `scale(${scale})`,
                    transformOrigin: 'top left',
                    width: CARD_W,
                }}
            >
                {children}
            </div>
        </div>
    );
}

/**
 * Open a clean popup window containing only the given element's HTML and print it.
 * Copies the current page's stylesheets so Tailwind classes render correctly.
 * Much more reliable than window.print() from a complex page with multiple divs.
 */
export function printElement(el: HTMLElement) {
    const styleSheets = Array.from(document.styleSheets)
        .map(ss => {
            try {
                return Array.from(ss.cssRules).map(r => r.cssText).join('\n');
            } catch {
                return ss.href ? `@import url("${ss.href}");` : '';
            }
        })
        .filter(Boolean)
        .join('\n');

    const linkTags = Array.from(document.querySelectorAll('link[rel="stylesheet"]'))
        .map(l => l.outerHTML)
        .join('\n');

    const w = window.open('', '_blank', 'width=900,height=1200,toolbar=0,menubar=0,scrollbars=1');
    if (!w) return;

    w.document.write(`<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
${linkTags}
<style>
${styleSheets}
@media print { @page { margin: 12mm 10mm; } body { margin: 0; background: white; } }
</style>
</head>
<body style="margin:0;background:white">
${el.outerHTML}
</body>
</html>`);
    w.document.close();
    // Wait for stylesheets to load before printing
    setTimeout(() => {
        w.focus();
        w.print();
        setTimeout(() => w.close(), 1000);
    }, 700);
}
