/**
 * Design tokens for the school report book.
 *
 * These were declared inline at the top of a 2,100-line pdf.ts, which made them
 * invisible to anything else and impossible to reuse when the document is split
 * into per-section builders.
 *
 * NOTE ON BRAND: this is the *default* letterhead accent. The document builder
 * deliberately shadows it with `design.accentColor` for per-school theming, so
 * helpers that take `color = BRAND` fall back to this constant rather than the
 * school's chosen accent. That distinction is intentional — do not "fix" it by
 * threading design state into these primitives.
 */

/** Official school-report letterhead accent (aligned with Rillcod school materials). */
export const BRAND = '#7a0606';
export const INK = '#111827';
export const MUTED = '#6b7280';
export const RULE = '#d1d5db';
export const BORDER = '#e5e7eb';
export const HEADER_BG = '#1f2937';
export const PAGE_WIDTH_CONTENT = 515;

/** Minimum vertical space (pt) required before starting a block — kept low so content packs above first. */
export const PDF_MIN_SECTION = 32;
export const PDF_MIN_PANEL = 64;
export const PDF_MIN_TABLE = 44;
export const PDF_MIN_CHART = 88;
export const PDF_MIN_APPENDIX = 96;
export const PDF_MIN_METRICS = 56;

export const APPENDIX_A_ACCENT = BRAND;
export const APPENDIX_C_ACCENT = '#0f766e';
export const APPENDIX_B_ACCENT = '#1e3a5f';
export const APPENDIX_D_ACCENT = '#065f46';
export const APPENDIX_ROSTER_TINT = '#f3f4f6';
export const APPENDIX_GRADEBOOK_TINT = '#f3f4f6';

export const PRINT_BORDER = '#374151';
export const PRINT_BORDER_LIGHT = '#9ca3af';
export const PRINT_GROUP_BAR = '#4b5563';
