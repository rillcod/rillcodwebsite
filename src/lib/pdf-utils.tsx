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
export async function generateReportPDF(element: HTMLElement, filename: string): Promise<void> {
    // Lazy-load browser-only libs to prevent SSR crash
    const [{ toPng }, { default: jsPDF }] = await Promise.all([
        import('html-to-image'),
        import('jspdf'),
    ]);

    // Wait for all images to finish loading
    const imgs = element.querySelectorAll('img');
    await Promise.allSettled(
        Array.from(imgs).map(img =>
            img.complete
                ? Promise.resolve()
                : new Promise(res => { img.onload = res; img.onerror = res; })
        )
    );

    const dataUrl = await toPng(element, {
        pixelRatio: 2,
        cacheBust: true,
        skipAutoScale: false,
        width: 794,
        height: element.scrollHeight,
    });

    const pdfH = element.scrollHeight;
    const pdf = new jsPDF({ orientation: 'portrait', unit: 'px', format: [794, pdfH] });
    pdf.addImage(dataUrl, 'PNG', 0, 0, 794, pdfH);
    pdf.save(filename);
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
        if (responsive) {
            setScale(1);
            return;
        }
        const outer = containerRef.current;
        const inner = innerRef.current;
        if (!outer || !inner) return;

        const update = () => {
            const w = outer.clientWidth;
            const s = w < CARD_W ? w / CARD_W : 1;
            setScale(s);
            // Use the actual rendered height of the inner card for accurate clipping
            const h = inner.scrollHeight || 1123;
            setCardHeight(h);
        };

        update();
        const ro = new ResizeObserver(update);
        ro.observe(outer);
        ro.observe(inner);
        return () => ro.disconnect();
    }, [report, children, responsive]); // re-run when report, children or responsive changes

    // Smart scaling: even if responsive=true, we scale if screen is narrower than the card
    // but we use actual width tracking.

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
