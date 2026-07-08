// Standard, automatic class naming so every class created anywhere reads the same
// orderly way:  "{Short School} · {Programme} · {Grade Range}"
//   e.g. "Gabus High · Teen Developers · JSS 1"  /  "Franej · Young Innovators · Basic 1-3"
// Online/cohort programmes (no school term) use:  "{Programme} · {Cohort}".
//
// Everything is DERIVED from the school name + programme + grade range — no hardcoded
// per-school map — so it works for new schools automatically.

const FILLER_PHRASES = [
  'group of schools', 'group of school', 'education centre', 'education center',
  'tender loving care', 'preparatory secondary', 'secondary section',
];
// Generic descriptor words stripped from a school name (the distinctive proper noun and
// "High" / campus markers are kept). NB: connectors of/and/the are NOT stripped so
// names like "Word of Faith" survive.
const FILLER_WORDS = /\b(international|preparatory|secondary|comprehensive|montessori|montessorri|montesorri|nursery|grammar|model|academy|college|schools?|institute|education|centre|center|catholic|imperial|standard|section|coding|creative|class)\b/gi;
const CONNECTORS = new Set(['of', 'and', 'the', 'to']);

function titleCase(s: string): string {
  return s.toLowerCase().replace(/\s+/g, ' ').trim()
    .split(' ')
    .map((w) => (CONNECTORS.has(w) ? w : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(' ');
}

/** Concise, distinct school name derived from the full name. */
export function shortSchoolName(full: string | null | undefined): string {
  if (!full || !full.trim()) return ''; // no school → dropped from the name (online/independent)
  let s = full.trim();
  // Campus / section marker in parentheses → keep as a short suffix so a school with
  // separate Basic / Secondary / GRA sub-schools stays distinguishable.
  let suffix = '';
  const m = s.match(/\(\s*(basic|secondary|junior|senior|gra|primary)\s*\)/i);
  if (m) {
    const tag = m[1].toLowerCase();
    suffix = tag === 'gra' ? ' GRA' : tag === 'secondary' ? ' Sec' : ' ' + titleCase(tag);
  }
  s = s.replace(/\([^)]*\)/g, ' ');
  s = titleCase(s);
  for (const p of FILLER_PHRASES) s = s.replace(new RegExp(p.replace(/ /g, '\\s+'), 'ig'), ' ');
  s = s.replace(FILLER_WORDS, ' ').replace(/\s+/g, ' ').trim();
  if (!s) s = titleCase(full); // everything was filler — fall back to the cleaned full name
  const words = s.split(' ').filter(Boolean).slice(0, 3); // keep it short
  return (words.join(' ') + suffix).trim();
}

// "Primary"/"Pry" normalise to Basic — the school convention uses Basic, not Primary.
// Nursery/KG (pre-primary) are their own levels.
const LVL: Record<string, string> = {
  js: 'JSS', jss: 'JSS', sss: 'SSS', ss: 'SS', basic: 'Basic', primary: 'Basic',
  pry: 'Basic', elementary: 'Basic', elem: 'Basic', grade: 'Grade', year: 'Year',
  nursery: 'Nursery', nur: 'Nursery', creche: 'Nursery',
  kg: 'KG', kindergarten: 'KG', reception: 'KG',
};

/** Pull grade tokens (level + number) out of any messy string. */
export function parseGrades(str: string | null | undefined): { lvl: string; n: number }[] {
  const out: { lvl: string; n: number }[] = [];
  const re = /\b(SSS|SS|JSS|JS|BASIC|PRIMARY|PRY|ELEMENTARY|ELEM|NURSERY|NUR|CRECHE|KINDERGARTEN|KG|RECEPTION|GRADE|YEAR)\s*0*(\d+)/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec((str || '').toUpperCase()))) out.push({ lvl: LVL[m[1].toLowerCase()], n: parseInt(m[2], 10) });
  return out;
}

/** "Basic 1-3" / "JSS 2" from a set of grade tokens (dominant level wins). */
export function formatGradeRange(grades: { lvl: string; n: number }[]): string | null {
  if (!grades.length) return null;
  const byLvl: Record<string, number[]> = {};
  for (const g of grades) (byLvl[g.lvl] = byLvl[g.lvl] || []).push(g.n);
  const lvl = Object.entries(byLvl).sort((a, b) => b[1].length - a[1].length)[0][0];
  const ns = byLvl[lvl];
  const lo = Math.min(...ns), hi = Math.max(...ns);
  return lo === hi ? `${lvl} ${lo}` : `${lvl} ${lo}-${hi}`;
}

/**
 * Standard grade BAND for a single grade, so a school can run several classes for the
 * same programme split cleanly by level — Basic 1-3 / Basic 4-6 / JSS 1-3 / SS 1-3 —
 * and the naming stays consistent. A student is always placed in the band of their grade.
 */
export function gradeBand(grade: string | null | undefined): string | null {
  const g = parseGrades(grade)[0];
  if (!g) return null;
  const { lvl, n } = g;
  if (lvl === 'JSS') return 'JSS 1-3';
  if (lvl === 'SS' || lvl === 'SSS') return 'SS 1-3';
  // Primary-style levels split lower (1-3) / upper (4-6).
  return `${lvl} ${n <= 3 ? '1-3' : '4-6'}`;
}

const PROG_SHORT: Record<string, string> = {
  'young innovators': 'Young Innov',
  'teen developers': 'Teen Dev',
  'web development bootcamp': 'Web Dev',
  'data analysis with python': 'Data Analysis',
};
export function shortProgramme(p: string | null | undefined): string {
  if (!p) return '';
  return PROG_SHORT[p.toLowerCase().trim()] || p.trim();
}

/** Infer the programme when a class has none, from its name then its grade level. */
export function inferProgramme(name: string | null | undefined, grades: { lvl: string; n: number }[] = []): string {
  const n = (name || '').toLowerCase();
  if (/web\s*dev/.test(n)) return 'Web Development Bootcamp';
  if (/data analy/.test(n)) return 'Data Analysis with Python';
  if (/python|teen|senior|jss|secondary|develop|\bss\b/.test(n)) return 'Teen Developers';
  if (/scratch|young|creative|coding|innovator|kids|basic|primary|elem|grade/.test(n)) return 'Young Innovators';
  if (grades.some((g) => /JSS|SS|SSS/.test(g.lvl))) return 'Teen Developers';
  return 'Young Innovators';
}

/** The one place that composes a class name — used by every creation path. */
/** Collapse a repeated leading prefix: "A · B · A · B · C" → "A · B · C". Guards against
 *  an already-composed class name being fed back in as a segment (the double-prefix bug). */
export function collapseRepeatedClassName(name: string): string {
  let s = name.split('·').map((p) => p.trim()).filter(Boolean);
  let changed = true;
  while (changed && s.length >= 4) {
    changed = false;
    for (let k = Math.floor(s.length / 2); k >= 1; k--) {
      if (s.slice(0, k).join('|') === s.slice(k, 2 * k).join('|')) { s = s.slice(k); changed = true; break; }
    }
  }
  return s.join(' · ');
}

export function buildClassName(opts: {
  schoolName?: string | null;
  programme?: string | null;
  range?: string | null;
  online?: boolean;
  cohort?: string | null;
}): string {
  const prog = shortProgramme(opts.programme);
  // A range/grade must be a bare band ("Basic 5"), never a composed name. If a caller passes
  // a full "School · Programme · X" by mistake, keep only its last segment so the prefix
  // isn't doubled; collapseRepeatedClassName is the final belt-and-suspenders.
  const range = opts.range && opts.range.includes('·') ? opts.range.split('·').pop()!.trim() : opts.range;
  const raw = opts.online
    ? [prog || 'Class', opts.cohort].filter(Boolean).join(' · ')
    : [shortSchoolName(opts.schoolName), prog, range].filter(Boolean).join(' · ');
  return collapseRepeatedClassName(raw);
}

// ───────────────────────────────────────────────────────────────────────────
// Canonical bands with NUMERIC bounds — the foundation for placement. A band is
// a level + inclusive [low, high] grade range. Storing the bounds (not just the
// label) lets fixed bands and teacher-chosen single/custom bands coexist: a
// student's grade is placed into whichever class band covers its number.
// ───────────────────────────────────────────────────────────────────────────

export interface CanonicalBand {
  lvl: string;   // 'Basic' | 'Primary' | 'JSS' | 'SS' | 'Grade' | 'Year' | …
  low: number;
  high: number;
  label: string; // e.g. 'Basic 1-3' | 'JSS 1' | 'SS 1-3'
}

/** First single grade token from any messy string. */
export function parseGrade(str: string | null | undefined): { lvl: string; n: number } | null {
  return parseGrades(str)[0] ?? null;
}

/** Label for a level + inclusive range (collapses low===high to a single grade). */
export function bandLabel(lvl: string, low: number, high: number): string {
  return low === high ? `${lvl} ${low}` : `${lvl} ${low}-${high}`;
}

/**
 * Clean, canonical SPECIFIC grade from any messy grade/section/class string — the ONE place a
 * student's `grade` is normalised so every creation path stores it the same way. The grade is
 * always a single grade from the school vocabulary (Basic 1-6, JSS 1-3, SS 1-3, Nursery/KG),
 * kept SEPARATE from the section/class (e.g. section "Quincy · Teen Dev · JSS 1-3", grade "JSS 1").
 *
 * Returns a specific grade ("Basic 5" / "JSS 1"), or null when no grade is present (programme
 * labels, cohort names, free text). A RANGE input (a class band like "JSS 1-3") collapses to the
 * band's LOWEST grade as the specific placeholder — an exact per-student grade the source never
 * captured, correctable later. Composed class names use their last segment; level synonyms are
 * normalised (JS→JSS, SSS→SS, Primary/Pry→Basic).
 */
export function canonicalGrade(input: string | null | undefined): string | null {
  if (!input || !String(input).trim()) return null;
  const seg = String(input).includes('·') ? String(input).split('·').pop()!.trim() : String(input);
  const grades = parseGrades(seg);
  if (!grades.length) return null;
  const norm = (l: string) => (l === 'JS' ? 'JSS' : l === 'SSS' ? 'SS' : l);
  const lvl = norm(grades[0].lvl);
  const rm = seg.match(/(\d+)\s*[-–]\s*(\d+)/);
  // Range → lowest specific grade; otherwise the lowest token of the dominant level.
  const low = rm
    ? Math.min(+rm[1], +rm[2])
    : Math.min(...grades.filter((g) => norm(g.lvl) === lvl).map((g) => g.n));
  return `${lvl} ${low}`;
}

/** Fixed-band policy (the default): Basic/Primary split 1-3 / 4-6; JSS 1-3; SS 1-3. */
export function fixedBand(grade: string | null | undefined): CanonicalBand | null {
  const g = parseGrade(grade);
  if (!g) return null;
  const { lvl, n } = g;
  if (lvl === 'JSS' || lvl === 'JS') return { lvl: 'JSS', low: 1, high: 3, label: 'JSS 1-3' };
  if (lvl === 'SS' || lvl === 'SSS') return { lvl: 'SS', low: 1, high: 3, label: 'SS 1-3' };
  if (lvl === 'Nursery' || lvl === 'KG') return { lvl, low: 1, high: 2, label: `${lvl} 1-2` };
  const low = n <= 3 ? 1 : 4;
  const high = n <= 3 ? 3 : 6;
  return { lvl, low, high, label: bandLabel(lvl, low, high) };
}

/** Single-grade band ("Basic 2"). */
export function singleBand(grade: string | null | undefined): CanonicalBand | null {
  const g = parseGrade(grade);
  if (!g) return null;
  const lvl = g.lvl === 'JS' ? 'JSS' : g.lvl === 'SSS' ? 'SS' : g.lvl;
  return { lvl, low: g.n, high: g.n, label: bandLabel(lvl, g.n, g.n) };
}

/** Explicit custom range ("Basic 1-2"), clamped so low ≤ high. */
export function rangeBand(lvl: string, a: number, b: number): CanonicalBand {
  const low = Math.min(a, b);
  const high = Math.max(a, b);
  return { lvl, low, high, label: bandLabel(lvl, low, high) };
}

export type BandGranularity = 'fixed' | 'single';

/**
 * The band a grade should map to under a chosen granularity. 'fixed' (default) →
 * Basic 1-3 / 4-6, JSS 1-3, SS 1-3. 'single' → that exact grade.
 */
export function bandForGrade(grade: string | null | undefined, granularity: BandGranularity = 'fixed'): CanonicalBand | null {
  return granularity === 'single' ? singleBand(grade) : fixedBand(grade);
}

/** Does a class band cover a given grade string? (same level + number in range) */
export function bandCoversGrade(band: { lvl: string; low: number; high: number } | null | undefined, grade: string | null | undefined): boolean {
  if (!band) return false;
  const g = parseGrade(grade);
  if (!g) return false;
  const lvl = g.lvl === 'JS' ? 'JSS' : g.lvl === 'SSS' ? 'SS' : g.lvl;
  const bl = band.lvl === 'JS' ? 'JSS' : band.lvl === 'SSS' ? 'SS' : band.lvl;
  return lvl === bl && g.n >= band.low && g.n <= band.high;
}

/** Parse a band LABEL ("Basic 1-3" / "JSS 2") back into bounds. */
export function parseBandLabel(label: string | null | undefined): CanonicalBand | null {
  const m = (label || '').trim().match(/^([A-Za-z]+)\s*0*(\d+)\s*(?:-\s*0*(\d+))?$/);
  if (!m) return null;
  const rawLvl = m[1].toUpperCase();
  const lvl = LVL[rawLvl.toLowerCase()] || (rawLvl === 'JS' ? 'JSS' : rawLvl === 'SSS' ? 'SS' : m[1]);
  const low = parseInt(m[2], 10);
  const high = m[3] ? parseInt(m[3], 10) : low;
  return { lvl, low: Math.min(low, high), high: Math.max(low, high), label: bandLabel(lvl, Math.min(low, high), Math.max(low, high)) };
}

// ── Fixed option lists for the class-name pickers — the ONLY grades/bands a class may use,
//    so free-typed names are impossible and every class follows one convention. ──────────
export const FIXED_BANDS = ['Nursery 1-2', 'KG 1-2', 'Basic 1-3', 'Basic 4-6', 'JSS 1-3', 'SS 1-3'] as const;
export const SINGLE_GRADES = [
  'Nursery 1', 'Nursery 2', 'KG 1', 'KG 2',
  'Basic 1', 'Basic 2', 'Basic 3', 'Basic 4', 'Basic 5', 'Basic 6',
  'JSS 1', 'JSS 2', 'JSS 3', 'SS 1', 'SS 2', 'SS 3',
] as const;

/** Compose the one canonical class name from an explicit programme + a chosen band/grade. */
export function composeClassName(opts: {
  schoolName?: string | null;
  programme?: string | null;
  grade?: string | null;              // a single grade or a band label ("Basic 2" / "Basic 1-3")
  granularity?: BandGranularity;      // 'fixed' (default) collapses to a band; 'single' keeps the grade
  online?: boolean;
  cohort?: string | null;
}): { name: string; band: CanonicalBand | null; tier: string | null } {
  const tier = canonicalTier(opts.programme);
  const band = opts.grade ? (bandForGrade(opts.grade, opts.granularity ?? 'fixed') || parseBandLabel(opts.grade)) : null;
  const online = opts.online ?? /online/i.test(opts.schoolName || '');
  const name = buildClassName({
    schoolName: opts.schoolName,
    programme: tier || opts.programme,
    range: band?.label ?? null,
    online,
    cohort: opts.cohort,
  });
  return { name, band, tier: tier || (opts.programme?.trim() || null) };
}

/** Canonical tier/programme name (explicit choice — NEVER derived from age). */
export function canonicalTier(programme: string | null | undefined): string | null {
  const p = (programme || '').toLowerCase().trim();
  if (!p) return null;
  if (/young|innovator|scratch|kids|creative/.test(p)) return 'Young Innovators';
  if (/teen|developer|python/.test(p)) return 'Teen Developers';
  if (/web\s*dev/.test(p)) return 'Web Development Bootcamp';
  if (/data analy/.test(p)) return 'Data Analysis with Python';
  return programme!.trim();
}
