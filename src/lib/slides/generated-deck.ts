export type GeneratedSlideKind =
  | "title"
  | "concept"
  | "example"
  | "activity"
  | "recap";

export type GeneratedSlide = {
  kind: GeneratedSlideKind;
  kicker: string;
  title: string;
  bullets: string[];
  takeaway: string;
};

const SLIDE_KINDS = new Set<GeneratedSlideKind>([
  "title",
  "concept",
  "example",
  "activity",
  "recap",
]);

function cleanText(value: unknown, maxLength: number): string {
  return typeof value === "string"
    ? value.replace(/\s+/g, " ").trim().slice(0, maxLength)
    : "";
}

export function normaliseGeneratedSlides(payload: unknown): GeneratedSlide[] {
  const raw = Array.isArray(payload)
    ? payload
    : payload &&
      typeof payload === "object" &&
      Array.isArray((payload as { slides?: unknown }).slides)
    ? (payload as { slides: unknown[] }).slides
    : [];

  return raw
    .slice(0, 8)
    .map((item, index): GeneratedSlide | null => {
      if (!item || typeof item !== "object") return null;
      const row = item as Record<string, unknown>;
      const title = cleanText(row.title, 100);
      if (!title) return null;
      const kind = SLIDE_KINDS.has(row.kind as GeneratedSlideKind)
        ? (row.kind as GeneratedSlideKind)
        : index === 0
        ? "title"
        : index === raw.length - 1
        ? "recap"
        : "concept";
      const bullets = (Array.isArray(row.bullets) ? row.bullets : [])
        .map((bullet) => cleanText(bullet, 150))
        .filter(Boolean)
        .slice(0, 5);
      return {
        kind,
        kicker:
          cleanText(row.kicker, 54) ||
          (index === 0 ? "Learning journey" : "Key idea"),
        title,
        bullets,
        takeaway: cleanText(row.takeaway, 180),
      };
    })
    .filter((slide): slide is GeneratedSlide => slide !== null);
}

export function escapeSlideXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export function wrapSlideText(value: string, maxCharacters: number): string[] {
  const words = value.trim().split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length <= maxCharacters || !current) {
      current = candidate;
    } else {
      lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  return lines;
}

const ACCENTS: Record<
  GeneratedSlideKind,
  { start: string; end: string; glow: string }
> = {
  title: { start: "#8B5CF6", end: "#2563EB", glow: "#A78BFA" },
  concept: { start: "#2563EB", end: "#0891B2", glow: "#60A5FA" },
  example: { start: "#059669", end: "#0D9488", glow: "#34D399" },
  activity: { start: "#EA580C", end: "#D97706", glow: "#FB923C" },
  recap: { start: "#7C3AED", end: "#DB2777", glow: "#C084FC" },
};

/** Canvas and safe area. Everything below is laid out inside these bounds. */
const W = 1600;
const H = 900;
const MARGIN_X = 104;
const CONTENT_W = W - MARGIN_X * 2;
const FOOTER_Y = 868;

const FONT = "Arial, Helvetica, sans-serif";

/**
 * Arial's average advance is close to 0.5em across mixed-case prose, and every
 * caller here wraps prose. Slightly pessimistic on purpose: a line that stops
 * short looks considered, a line that runs past the margin looks broken.
 */
const AVG_CHAR_EM = 0.52;
const charsThatFit = (widthPx: number, fontSize: number) =>
  Math.max(12, Math.floor(widthPx / (fontSize * AVG_CHAR_EM)));

/**
 * Type ramp tried largest first. Bullets are laid out at the first size whose
 * wrapped height fits the body box — so a slide with five long bullets sets
 * smaller rather than running off the canvas.
 *
 * The previous renderer used one fixed 34px size and a fixed 82px step, which
 * put five two-line bullets at y≈950 on a 900px canvas: the last bullets ran
 * through the takeaway panel and out of the bottom of the slide.
 */
const BULLET_RAMP = [34, 31, 28, 26, 24, 22, 20];

type BulletLayout = {
  fontSize: number;
  lineHeight: number;
  gap: number;
  items: { lines: string[]; y: number }[];
  height: number;
};

/** Clamps a wrapped bullet to `maxLines`, marking the cut so nothing reads as complete when it isn't. */
function clampLines(lines: string[], maxLines: number): string[] {
  if (lines.length <= maxLines) return lines;
  const kept = lines.slice(0, maxLines);
  kept[maxLines - 1] = `${kept[maxLines - 1].replace(/[\s.,;:]+$/, "")}…`;
  return kept;
}

/**
 * Fits the bullets inside the body box, or reports that they do not fit.
 *
 * Tries the type ramp largest-first, and at each size allows progressively
 * fewer lines per bullet. Returns null only when even the smallest single-line
 * setting overflows, which tells the caller to drop trailing bullets rather
 * than draw them off the slide.
 */
function layoutBullets(
  bullets: string[],
  boxTop: number,
  boxBottom: number,
  textLeft: number
): BulletLayout | null {
  if (bullets.length === 0) return null;
  const available = boxBottom - boxTop;
  if (available <= 0) return null;
  const textWidth = W - MARGIN_X - textLeft;

  for (const fontSize of BULLET_RAMP) {
    const lineHeight = Math.round(fontSize * 1.32);
    const gap = Math.round(fontSize * 1.18);
    const maxChars = charsThatFit(textWidth, fontSize);
    // Three lines only once the type is small enough for it to still read.
    const lineOptions = fontSize <= 26 ? [3, 2, 1] : [2, 1];

    for (const maxLines of lineOptions) {
      const wrapped = bullets.map((b) =>
        clampLines(wrapSlideText(b, maxChars), maxLines)
      );
      const height =
        wrapped.reduce((sum, lines) => sum + lines.length * lineHeight, 0) +
        gap * (bullets.length - 1);
      if (height > available) continue;

      let y = boxTop + fontSize;
      const items = wrapped.map((lines) => {
        const item = { lines, y };
        y += lines.length * lineHeight + gap;
        return item;
      });
      return { fontSize, lineHeight, gap, items, height };
    }
  }
  return null;
}

/**
 * Lays out as many bullets as the box can hold.
 *
 * A slide carrying more prose than a slide can hold is a content problem, but
 * drawing it past the bottom edge is a rendering one. Bullets are dropped from
 * the end until the rest fit, so what is shown is always fully legible.
 */
function fitBullets(
  bullets: string[],
  boxTop: number,
  boxBottom: number,
  textLeft: number
): { layout: BulletLayout | null; dropped: number } {
  for (let count = bullets.length; count > 0; count--) {
    const layout = layoutBullets(
      bullets.slice(0, count),
      boxTop,
      boxBottom,
      textLeft
    );
    if (layout) return { layout, dropped: bullets.length - count };
  }
  return { layout: null, dropped: bullets.length };
}

export function renderGeneratedSlideSvg(
  slide: GeneratedSlide,
  options: {
    index: number;
    total: number;
    courseTitle: string;
    week: number;
  }
): string {
  const accent = ACCENTS[slide.kind];
  const isTitleSlide = slide.kind === "title";

  // ── Header ────────────────────────────────────────────────────────────────
  const kicker = slide.kicker.toUpperCase();
  // Pill sized to its text. It was a fixed 210px, so any kicker past ~14
  // characters printed straight out through both ends of the pill.
  const kickerFont = 18;
  const pillW = Math.min(
    620,
    Math.max(180, Math.round(kicker.length * kickerFont * 0.66) + 56)
  );
  const pillH = 42;
  const pillY = 68;

  // ── Title ─────────────────────────────────────────────────────────────────
  const titleFont = isTitleSlide ? 82 : 66;
  const titleLH = Math.round(titleFont * 1.2);
  const titleLines = wrapSlideText(
    slide.title,
    charsThatFit(CONTENT_W, titleFont)
  ).slice(0, 3);
  const titleTop = (isTitleSlide ? 250 : 196) + titleFont;
  const titleBottom = titleTop + (titleLines.length - 1) * titleLH;

  // ── Body box ──────────────────────────────────────────────────────────────
  const hasTakeaway = Boolean(slide.takeaway);
  const takeawayTop = 726;
  const bodyTop = titleBottom + (isTitleSlide ? 56 : 44);
  const bodyBottom = (hasTakeaway ? takeawayTop : FOOTER_Y - 24) - 24;
  const textLeft = MARGIN_X + 54;

  const { layout, dropped } = fitBullets(
    slide.bullets,
    bodyTop,
    bodyBottom,
    textLeft
  );

  const bulletMarkup = layout
    ? layout.items
        .map(({ lines, y }) => {
          const dotR = Math.max(6, Math.round(layout.fontSize * 0.24));
          const dotCY = y - Math.round(layout.fontSize * 0.32);
          return `
  <circle cx="${MARGIN_X + 22}" cy="${dotCY}" r="${
            dotR + 5
          }" fill="${accent.glow}" fill-opacity="0.18" />
  <circle cx="${MARGIN_X + 22}" cy="${dotCY}" r="${dotR}" fill="${accent.glow}" />
  <text x="${textLeft}" y="${y}" fill="#E2E8F0" font-family="${FONT}" font-size="${
            layout.fontSize
          }" font-weight="500">
${lines
  .map(
    (line, i) =>
      `    <tspan x="${textLeft}" dy="${
        i === 0 ? 0 : layout.lineHeight
      }">${escapeSlideXml(line)}</tspan>`
  )
  .join("\n")}
  </text>`;
        })
        .join("")
    : "";

  // Says so rather than hiding it, so a deck that is over-stuffed is visible
  // to the teacher instead of quietly losing points.
  const overflowNote =
    dropped > 0 && layout
      ? `
  <text x="${textLeft}" y="${
          bodyBottom + 6
        }" fill="#94A3B8" font-family="${FONT}" font-size="18" font-style="italic">+${dropped} more point${
          dropped === 1 ? "" : "s"
        } in the lesson notes</text>`
      : "";

  // ── Takeaway ──────────────────────────────────────────────────────────────
  const takeawayFont = 26;
  const takeawayText = wrapSlideText(
    slide.takeaway,
    charsThatFit(CONTENT_W - 210, takeawayFont)
  )[0];
  const takeaway = hasTakeaway
    ? `
  <rect x="${MARGIN_X}" y="${takeawayTop}" width="${CONTENT_W}" height="88" rx="26" fill="#FFFFFF" fill-opacity="0.07" stroke="#FFFFFF" stroke-opacity="0.12" />
  <rect x="${MARGIN_X}" y="${takeawayTop}" width="6" height="88" rx="3" fill="url(#accent)" />
  <text x="${MARGIN_X + 38}" y="${
        takeawayTop + 53
      }" font-family="${FONT}" font-size="${takeawayFont}" font-weight="700">
    <tspan fill="${
      accent.glow
    }">Remember</tspan><tspan fill="#475569" dx="14">|</tspan><tspan fill="#F8FAFC" dx="14">${escapeSlideXml(
        takeawayText
      )}</tspan>
  </text>`
    : "";

  // ── Deck progress ─────────────────────────────────────────────────────────
  // Shows position in the deck at a glance, which the page counter alone never did.
  const progress =
    options.total > 1 ? (options.index + 1) / options.total : 1;
  const progressW = Math.max(24, Math.round(CONTENT_W * progress));

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="${escapeSlideXml(
    slide.title
  )}">
  <defs>
    <linearGradient id="accent" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${accent.start}" />
      <stop offset="100%" stop-color="${accent.end}" />
    </linearGradient>
    <radialGradient id="glow" cx="0.86" cy="0.1" r="0.75">
      <stop offset="0%" stop-color="${accent.glow}" stop-opacity="0.28" />
      <stop offset="100%" stop-color="#0F172A" stop-opacity="0" />
    </radialGradient>
    <pattern id="grid" width="48" height="48" patternUnits="userSpaceOnUse">
      <circle cx="1.5" cy="1.5" r="1.5" fill="#FFFFFF" fill-opacity="0.035" />
    </pattern>
  </defs>
  <rect width="${W}" height="${H}" fill="#0B1120" />
  <rect width="${W}" height="${H}" fill="url(#grid)" />
  <rect width="${W}" height="${H}" fill="url(#glow)" />
  <rect x="0" y="0" width="18" height="${H}" fill="url(#accent)" />

  <rect x="${MARGIN_X}" y="${pillY}" width="${pillW}" height="${pillH}" rx="21" fill="url(#accent)" />
  <text x="${
    MARGIN_X + pillW / 2
  }" y="${pillY + 28}" text-anchor="middle" fill="#FFFFFF" font-family="${FONT}" font-size="${kickerFont}" font-weight="800" letter-spacing="2">${escapeSlideXml(
    kicker
  )}</text>
  <text x="${W - MARGIN_X}" y="${
    pillY + 26
  }" text-anchor="end" fill="#94A3B8" font-family="${FONT}" font-size="20" font-weight="700">WEEK ${
    options.week
  } — ${options.index + 1}/${options.total}</text>

  <text x="${MARGIN_X}" y="${titleTop}" fill="#F8FAFC" font-family="${FONT}" font-size="${titleFont}" font-weight="800" letter-spacing="-2">
${titleLines
  .map(
    (line, i) =>
      `    <tspan x="${MARGIN_X}" dy="${i === 0 ? 0 : titleLH}">${escapeSlideXml(
        line
      )}</tspan>`
  )
  .join("\n")}
  </text>
${isTitleSlide ? `  <rect x="${MARGIN_X}" y="${titleBottom + 26}" width="132" height="7" rx="4" fill="url(#accent)" />` : ""}
${bulletMarkup}
${overflowNote}
${takeaway}

  <rect x="${MARGIN_X}" y="${
    FOOTER_Y + 14
  }" width="${CONTENT_W}" height="5" rx="3" fill="#FFFFFF" fill-opacity="0.08" />
  <rect x="${MARGIN_X}" y="${
    FOOTER_Y + 14
  }" width="${progressW}" height="5" rx="3" fill="url(#accent)" />
  <text x="${MARGIN_X}" y="${FOOTER_Y}" fill="#64748B" font-family="${FONT}" font-size="18" font-weight="700" letter-spacing="1">RILLCOD TECHNOLOGIES</text>
  <text x="${
    W - MARGIN_X
  }" y="${FOOTER_Y}" text-anchor="end" fill="#64748B" font-family="${FONT}" font-size="18">${escapeSlideXml(
    options.courseTitle
  )}</text>
</svg>`;
}
