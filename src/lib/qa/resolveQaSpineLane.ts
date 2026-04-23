/**
 * Map teacher-provided grade/track (or a pinned lane) to platform_syllabus_week_template.lane_index 1-11.
 * Class *display* name (e.g. SCRATCHCC) is ignored for spine selection — identity is (school_id, class_id) for path rotation.
 */

const GRADE_TRACK_TO_LANE: Record<string, number> = {
  'basic_1|young_innovator': 1,
  'basic_2|young_innovator': 2,
  'basic_3|young_innovator': 3,
  'basic_4|python': 4,
  'basic_4|html_css': 5,
  'basic_5|python': 6,
  'basic_5|html_css': 7,
  'basic_6|python': 8,
  'basic_6|html_css': 9,
  'jss_1|jss_web_app': 10,
  'jss_2|jss_web_app': 11,
};

function normalize(s: string | null | undefined): string {
  return (s ?? '').trim().toLowerCase();
}

export function resolveQaSpineLane(input: {
  qa_spine_lane?: number | null;
  qa_grade_key?: string | null;
  qa_track_hint?: string | null;
}): { lane: number; source: 'pinned' | 'grade_track' | 'default' } {
  const pin = input.qa_spine_lane;
  if (typeof pin === 'number' && pin >= 1 && pin <= 11) {
    return { lane: Math.floor(pin), source: 'pinned' };
  }
  const g = normalize(input.qa_grade_key);
  const t = normalize(input.qa_track_hint);
  if (g && t) {
    const k = `${g}|${t.replace(/\s/g, '_')}`;
    if (GRADE_TRACK_TO_LANE[k] != null) {
      return { lane: GRADE_TRACK_TO_LANE[k], source: 'grade_track' };
    }
    const t2 = t.replace('html/css', 'html_css');
    if (t2 !== t && g) {
      const k2 = `${g}|${t2}`;
      if (GRADE_TRACK_TO_LANE[k2] != null) {
        return { lane: GRADE_TRACK_TO_LANE[k2], source: 'grade_track' };
      }
    }
  }
  return { lane: 1, source: 'default' };
}
