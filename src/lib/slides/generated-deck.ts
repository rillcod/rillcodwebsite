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
  const titleLines = wrapSlideText(slide.title, 34).slice(0, 3);
  const titleStartY =
    titleLines.length === 1 ? 220 : titleLines.length === 2 ? 185 : 150;
  const bullets = slide.bullets.slice(0, 5);
  let cursorY = Math.max(360, titleStartY + titleLines.length * 84 + 48);
  const bulletMarkup = bullets
    .map((bullet) => {
      const lines = wrapSlideText(bullet, 58).slice(0, 2);
      const y = cursorY;
      cursorY += Math.max(82, lines.length * 45 + 28);
      return `
      <circle cx="126" cy="${y - 12}" r="8" fill="${accent.glow}" />
      <text x="158" y="${y}" fill="#E2E8F0" font-family="Arial, Helvetica, sans-serif" font-size="34" font-weight="500">
        ${lines
          .map(
            (line, lineIndex) =>
              `<tspan x="158" dy="${lineIndex === 0 ? 0 : 45}">${escapeSlideXml(
                line
              )}</tspan>`
          )
          .join("")}
      </text>`;
    })
    .join("");

  const takeaway = slide.takeaway
    ? `<rect x="104" y="746" width="1392" height="88" rx="26" fill="#FFFFFF" fill-opacity="0.07" stroke="#FFFFFF" stroke-opacity="0.12" />
       <text x="142" y="798" fill="#F8FAFC" font-family="Arial, Helvetica, sans-serif" font-size="27" font-weight="700">Remember: ${escapeSlideXml(
         slide.takeaway
       )}</text>`
    : "";

  return `<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="900" viewBox="0 0 1600 900" role="img" aria-label="${escapeSlideXml(
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
  </defs>
  <rect width="1600" height="900" fill="#0B1120" />
  <rect width="1600" height="900" fill="url(#glow)" />
  <rect x="0" y="0" width="18" height="900" fill="url(#accent)" />
  <rect x="104" y="68" width="210" height="42" rx="21" fill="url(#accent)" />
  <text x="209" y="96" text-anchor="middle" fill="#FFFFFF" font-family="Arial, Helvetica, sans-serif" font-size="18" font-weight="800" letter-spacing="2">${escapeSlideXml(
    slide.kicker.toUpperCase()
  )}</text>
  <text x="1496" y="94" text-anchor="end" fill="#94A3B8" font-family="Arial, Helvetica, sans-serif" font-size="20" font-weight="700">WEEK ${
    options.week
  } - ${options.index + 1}/${options.total}</text>
  <text x="104" y="${titleStartY}" fill="#F8FAFC" font-family="Arial, Helvetica, sans-serif" font-size="68" font-weight="800" letter-spacing="-2">
    ${titleLines
      .map(
        (line, lineIndex) =>
          `<tspan x="104" dy="${lineIndex === 0 ? 0 : 82}">${escapeSlideXml(
            line
          )}</tspan>`
      )
      .join("")}
  </text>
  ${bulletMarkup}
  ${takeaway}
  <text x="104" y="868" fill="#64748B" font-family="Arial, Helvetica, sans-serif" font-size="18" font-weight="700">RILLCOD ACADEMY</text>
  <text x="1496" y="868" text-anchor="end" fill="#64748B" font-family="Arial, Helvetica, sans-serif" font-size="18">${escapeSlideXml(
    options.courseTitle
  )}</text>
</svg>`;
}
