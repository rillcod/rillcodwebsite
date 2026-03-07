'use client';

import { useEffect, useRef, useState } from 'react';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
import ReportCard from '@/components/reports/ReportCard';

// ─── oklch → rgba converter ────────────────────────────────────────────────────
// Tailwind v4 generates all colors as oklch(). html2canvas v1 cannot parse them.
// This pure-math converter handles ANY oklch value so we never miss a color.
function oklchToRgba(str: string): string | null {
    const m = str.match(
        /oklch\(\s*([\d.]+%?)\s+([\d.]+)\s+([\d.]+)(?:\s*\/\s*([\d.]+%?))?\s*\)/i
    );
    if (!m) return null;

    let L = parseFloat(m[1]);
    if (m[1].endsWith('%')) L /= 100;
    const C = parseFloat(m[2]);
    const H = parseFloat(m[3]) * (Math.PI / 180);
    let alpha = m[4] !== undefined ? parseFloat(m[4]) : 1;
    if (m[4]?.endsWith('%')) alpha /= 100;

    // oklch → oklab
    const a = C * Math.cos(H);
    const b = C * Math.sin(H);

    // oklab → LMS cone coords
    const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
    const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
    const s_ = L - 0.0894841775 * a - 1.2914855480 * b;
    const lc = l_ ** 3;
    const mc = m_ ** 3;
    const sc = s_ ** 3;

    // LMS → linear sRGB
    const lr =  4.0767416621 * lc - 3.3077115913 * mc + 0.2309699292 * sc;
    const lg = -1.2684380046 * lc + 2.6097574011 * mc - 0.3413193965 * sc;
    const lb = -0.0041960863 * lc - 0.7034186147 * mc + 1.7076147010 * sc;

    // linear → sRGB gamma
    const gamma = (c: number) => {
        const abs = Math.abs(c);
        return abs <= 0.0031308
            ? c * 12.92
            : Math.sign(c) * (1.055 * abs ** (1 / 2.4) - 0.055);
    };

    const R = Math.round(Math.max(0, Math.min(255, gamma(lr) * 255)));
    const G = Math.round(Math.max(0, Math.min(255, gamma(lg) * 255)));
    const B = Math.round(Math.max(0, Math.min(255, gamma(lb) * 255)));

    return alpha < 1
        ? `rgba(${R},${G},${B},${+alpha.toFixed(4)})`
        : `rgb(${R},${G},${B})`;
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
.border-white\/10{border-color:rgba(255,255,255,0.1)!important}
.bg-white\/5{background-color:rgba(255,255,255,0.05)!important}
`;

// ─── Shared PDF generation ─────────────────────────────────────────────────────
// Uses a two-pass approach:
//   1. Inject CSS class overrides (fast, covers known classes)
//   2. Walk the entire cloned DOM and convert any remaining oklch computed values
//      to rgba() inline styles using the mathematical converter above.
// This means NO oklch color can survive into the canvas — works permanently.
export async function generateReportPDF(element: HTMLElement, filename: string): Promise<void> {
    // Wait for images
    const imgs = element.querySelectorAll('img');
    await Promise.allSettled(
        Array.from(imgs).map(img =>
            img.complete
                ? Promise.resolve()
                : new Promise(res => { img.onload = res; img.onerror = res; })
        )
    );

    const canvas = await html2canvas(element, {
        scale: 2,
        useCORS: true,
        allowTaint: false,
        logging: false,
        backgroundColor: '#ffffff',
        width: 794,
        height: element.scrollHeight,
        windowWidth: 794,
        windowHeight: element.scrollHeight,
        x: 0,
        y: 0,
        onclone: (clonedDoc: Document) => {
            // Pass 1 — inject class-level overrides
            const style = clonedDoc.createElement('style');
            style.textContent = OKLCH_HEX_OVERRIDES;
            clonedDoc.head.appendChild(style);

            // Force a synchronous style recalculation so computed styles
            // reflect the overrides we just injected before we walk the DOM.
            void (clonedDoc.documentElement as HTMLElement).offsetHeight;

            // Pass 2 — walk every element and fix remaining oklch values
            const win = clonedDoc.defaultView;
            if (!win) return;

            const COLOR_PROPS = [
                'color',
                'background-color',
                'border-top-color',
                'border-right-color',
                'border-bottom-color',
                'border-left-color',
                'fill',
                'stroke',
            ] as const;

            clonedDoc.querySelectorAll<HTMLElement>('*').forEach(el => {
                const cs = win.getComputedStyle(el);
                for (const prop of COLOR_PROPS) {
                    const val = cs.getPropertyValue(prop);
                    if (val && val.includes('oklch')) {
                        const converted = oklchToRgba(val);
                        if (converted) el.style.setProperty(prop, converted, 'important');
                    }
                }
            });
        },
    } as any);

    const imgData = canvas.toDataURL('image/png', 1.0);
    const pdfH = canvas.height / 2; // scale:2 so divide by 2 to get px
    const pdf = new jsPDF({ orientation: 'portrait', unit: 'px', format: [794, pdfH] });
    pdf.addImage(imgData, 'PNG', 0, 0, 794, pdfH);
    pdf.save(filename);
}

// ─── Responsive scaled preview of a ReportCard ───────────────────────────────
// Fits the fixed 794px-wide A4 card into whatever container width is available.
// Height tracks the rendered card height dynamically so the outer wrapper
// never clips or leaves whitespace.
const CARD_W = 794;

export function ScaledReportCard({ report, orgSettings }: { report: any; orgSettings: any }) {
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
    }, [report]); // re-run when report changes so height recalculates

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
                <ReportCard report={report} orgSettings={orgSettings} />
            </div>
        </div>
    );
}
