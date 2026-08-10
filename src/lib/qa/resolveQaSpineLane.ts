/**
 * Map a class to platform_syllabus_week_template.lane_index 1-14.
 *
 * SKILL-LEVEL LANES (not grade-locked):
 *   1  = Beginner A  (default Basic 1 · Young Innovator)
 *   2  = Beginner B  (default Basic 2 · Young Innovator)
 *   3  = Beginner C  (default Basic 3 · Young Innovator)
 *   4  = Intermediate A – Python  (default Basic 4)
 *   5  = Intermediate A – HTML/CSS (default Basic 4)
 *   6  = Intermediate B – Python  (default Basic 5)
 *   7  = Intermediate B – HTML/CSS (default Basic 5)
 *   8  = Advanced A – Python  (default Basic 6)
 *   9  = Advanced A – HTML/CSS (default Basic 6)
 *   10 = Advanced B – Web App (default JSS 1)
 *   11 = Advanced C – Web App (default JSS 2, 40-week)
 *   12 = Expert – Web App (default JSS 3)
 *   13 = Professional – UI/UX Design (default SS 1)
 *   14 = Professional – Mobile Dev (default SS 2)
 *
 * DYNAMIC ASSIGNMENT: A school new to coding can pin JSS1 classes to lane 1
 * (beginner content). An advanced school can pin Basic 5 to lane 10. The
 * qa_spine_lane field on the class table drives this. grade+track is only
 * the *default* fallback when no pin is set.
 */

const GRADE_TRACK_TO_LANE: Record<string, number> = {
  // --- Beginner tiers ---
  'basic_1|young_innovator': 1,
  'basic_2|young_innovator': 2,
  'basic_3|young_innovator': 3,
  // --- Intermediate tiers ---
  'basic_4|python': 4,
  'basic_4|html_css': 5,
  'basic_5|python': 6,
  'basic_5|html_css': 7,
  // --- Advanced tiers ---
  'basic_6|python': 8,
  'basic_6|html_css': 9,
  'jss_1|jss_web_app': 10,
  'jss_2|jss_web_app': 11,
  'jss_3|jss_web_app': 12,
  // --- Professional tiers ---
  'ss_1|ui_ux_design': 13,
  'ss_2|mobile_development': 14,
};

/** Descriptive label per lane for display in the UI */
export const LANE_LABELS: Record<number, string> = {
  1:  'Beginner A — Computer Awareness & ScratchJr (Sprites, Motion, Sounds & Simple Loops)',
  2:  'Beginner B — Scratch 3.0 Foundations (Costumes, Backdrops, Events, Broadcast Messaging & Nested Loops)',
  3:  'Beginner C — Scratch 3.0 Advanced Logic (Variables, Scorekeeping, Sensing, Cloning, Custom Blocks & Game Physics)',
  4:  'Intermediate A — Python Foundations',
  5:  'Intermediate A — HTML/CSS Foundations',
  6:  'Intermediate B — Python (APIs, Data, Testing)',
  7:  'Intermediate B — HTML/CSS (JavaScript & DOM)',
  8:  'Advanced A — Python (OOP, ML, Networking)',
  9:  'Advanced A — Full-Stack Web (React, Node, DevOps)',
  10: 'Advanced B — Web App (Frontend + Backend + DevOps)',
  11: 'Advanced C — Web App (TypeScript, Next.js) [40wk]',
  12: 'Expert — Full-Stack + AI + System Design',
  13: 'Professional — UI/UX Design (Figma, Adobe XD, AI)',
  14: 'Professional — Mobile Dev (Dart, Flutter, Capacitor)',
};

function normalize(s: string | null | undefined): string {
  return (s ?? '').trim().toLowerCase();
}

export function resolveQaSpineLane(input: {
  qa_spine_lane?: number | null;
  qa_grade_key?: string | null;
  qa_track_hint?: string | null;
}): { lane: number; source: 'pinned' | 'grade_track' | 'default' } {
  // 1. Teacher/admin pinned lane overrides everything — enables dynamic assignment
  const pin = input.qa_spine_lane;
  if (typeof pin === 'number' && pin >= 1 && pin <= 14) {
    return { lane: Math.floor(pin), source: 'pinned' };
  }

  // 2. Grade + track default mapping (fallback when no pin is set)
  const g = normalize(input.qa_grade_key);
  const t = normalize(input.qa_track_hint);
  if (g && t) {
    const k = `${g}|${t.replace(/\s/g, '_')}`;
    if (GRADE_TRACK_TO_LANE[k] != null) {
      return { lane: GRADE_TRACK_TO_LANE[k], source: 'grade_track' };
    }
    // Handle common input variations
    const t2 = t.replace('html/css', 'html_css');
    if (t2 !== t && g) {
      const k2 = `${g}|${t2}`;
      if (GRADE_TRACK_TO_LANE[k2] != null) {
        return { lane: GRADE_TRACK_TO_LANE[k2], source: 'grade_track' };
      }
    }
  }

  // 3. Default to lane 1 (absolute beginner)
  return { lane: 1, source: 'default' };
}

/** Total available lanes in the system */
export const MAX_LANE = 14;
