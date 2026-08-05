import {
  slugifySpecialProgram,
  type SpecialProgramContent,
  type SpecialProgramBonus,
  type SpecialProgramOutcome,
} from '@/lib/special-programs/types';

export type SpecialProgramFormState = {
  title: string;
  slug: string;
  button_label: string;
  is_published: boolean;
  is_featured: boolean;
  starts_on: string;
  ends_on: string;
  registration_deadline: string;
  online_fee: string;
  onsite_fee: string;
  deposit_percent: string;
  content: SpecialProgramContent;
};

export type AiBuildScope = 'full' | 'hero' | 'tracks' | 'weeks' | 'bonus' | 'outcomes';
export type AiApplyMode = 'replace' | 'fill_empty';

export function applySpecialProgramAiDraft(
  form: SpecialProgramFormState,
  data: Record<string, any>,
  mode: AiApplyMode,
  scope: AiBuildScope,
): SpecialProgramFormState {
  const next = { ...form, content: { ...form.content } };
  const fill = (cur: string | undefined, incoming: unknown) => {
    const v = typeof incoming === 'string' ? incoming.trim() : '';
    if (!v) return cur || '';
    if (mode === 'replace') return v;
    return (cur || '').trim() ? cur! : v;
  };

  if (scope === 'full' || scope === 'hero') {
    if (data.title && (mode === 'replace' || !next.title.trim())) next.title = String(data.title);
    if (data.button_label && (mode === 'replace' || !next.button_label.trim())) next.button_label = String(data.button_label);
    if (data.slug_hint && (mode === 'replace' || !next.slug.trim())) next.slug = slugifySpecialProgram(String(data.slug_hint));
    if (typeof data.suggested_online_fee === 'number' && (mode === 'replace' || !next.online_fee)) {
      next.online_fee = String(data.suggested_online_fee);
    }
    if (typeof data.suggested_onsite_fee === 'number' && (mode === 'replace' || !next.onsite_fee)) {
      next.onsite_fee = String(data.suggested_onsite_fee);
    }
    if (typeof data.suggested_deposit_percent === 'number' && (mode === 'replace' || !next.deposit_percent)) {
      next.deposit_percent = String(data.suggested_deposit_percent);
    }

    next.content = {
      ...next.content,
      season_badge: fill(next.content.season_badge, data.season_badge),
      title_line1: fill(next.content.title_line1, data.title_line1),
      title_line2: fill(next.content.title_line2, data.title_line2),
      hero_blurb: fill(next.content.hero_blurb, data.hero_blurb),
      curriculum_heading: fill(next.content.curriculum_heading, data.curriculum_heading),
      curriculum_intro: fill(next.content.curriculum_intro, data.curriculum_intro),
      ages_label: fill(next.content.ages_label, data.ages_label),
      duration_label: fill(next.content.duration_label, data.duration_label),
      sessions_per_week:
        typeof data.sessions_per_week === 'number'
          ? mode === 'replace' || !next.content.sessions_per_week
            ? Math.max(1, Math.min(7, Math.floor(data.sessions_per_week)))
            : next.content.sessions_per_week
          : next.content.sessions_per_week,
          weeks_heading: fill(next.content.weeks_heading, data.weeks_heading),
          weeks_intro: fill(next.content.weeks_intro, data.weeks_intro),
          register_heading: fill(next.content.register_heading, data.register_heading),
          next_path_heading: fill(next.content.next_path_heading, data.next_path_heading),
          next_path_intro: fill(next.content.next_path_intro, data.next_path_intro),
      age_min: typeof data.age_min === 'number'
        ? (mode === 'replace' || !next.content.age_min ? data.age_min : next.content.age_min)
        : next.content.age_min,
      age_max: typeof data.age_max === 'number'
        ? (mode === 'replace' || !next.content.age_max ? data.age_max : next.content.age_max)
        : next.content.age_max,
    };
  }

  if (scope === 'full' || scope === 'tracks') {
    if (Array.isArray(data.tracks) && data.tracks.length) {
      const mapped = data.tracks.map((t: any, i: number) => ({
        id: String(t.id || `track_${i + 1}`),
        icon: String(t.icon || '📚'),
        week: String(t.week || ''),
        title: String(t.title || ''),
        desc: String(t.desc || ''),
        topics: Array.isArray(t.topics) && t.topics.length ? t.topics.map(String) : [''],
        ...(typeof t.sessions_per_week === 'number'
          ? {
              sessions_per_week: Math.max(
                1,
                Math.min(7, Math.floor(t.sessions_per_week)),
              ),
            }
          : {}),
      }));
      next.content = {
        ...next.content,
        tracks: mode === 'replace' || !(next.content.tracks || []).length
          ? mapped
          : [...(next.content.tracks || []), ...mapped],
      };
    }
  }

  if (scope === 'full' || scope === 'weeks') {
    if (data.weeks_heading || data.weeks_intro) {
      next.content = {
        ...next.content,
        weeks_heading: fill(next.content.weeks_heading, data.weeks_heading),
        weeks_intro: fill(next.content.weeks_intro, data.weeks_intro),
      };
    }
    if (Array.isArray(data.weeks) && data.weeks.length) {
      const mapped = data.weeks.map((w: any) => ({
        num: String(w.num || ''),
        tag: String(w.tag || ''),
        title: String(w.title || ''),
        desc: String(w.desc || ''),
      }));
      next.content = {
        ...next.content,
        weeks: mode === 'replace' || !(next.content.weeks || []).length
          ? mapped
          : [...(next.content.weeks || []), ...mapped],
      };
    }
  }

  if (scope === 'full' || scope === 'bonus') {
    if (data.bonus && typeof data.bonus === 'object') {
      const incoming = data.bonus as SpecialProgramBonus;
      const cur = next.content.bonus || {};
      const items = Array.isArray(incoming.items) && incoming.items.length
        ? incoming.items.map((it) => ({ label: String(it.label || ''), desc: String(it.desc || '') }))
        : undefined;
      next.content = {
        ...next.content,
        bonus: {
          enabled: typeof incoming.enabled === 'boolean'
            ? (mode === 'replace' ? incoming.enabled : cur.enabled ?? incoming.enabled)
            : cur.enabled ?? true,
          badge: fill(cur.badge, incoming.badge),
          icon: fill(cur.icon, incoming.icon),
          title: fill(cur.title, incoming.title),
          desc: fill(cur.desc, incoming.desc),
          items: mode === 'replace' || !(cur.items || []).length
            ? (items || cur.items)
            : [...(cur.items || []), ...(items || [])],
        },
      };
    }
  }

  if (scope === 'full' || scope === 'outcomes') {
    next.content = {
      ...next.content,
      outcomes_heading: fill(next.content.outcomes_heading, data.outcomes_heading),
      outcomes_intro: fill(next.content.outcomes_intro, data.outcomes_intro),
    };
    if (Array.isArray(data.outcomes) && data.outcomes.length) {
      const mapped: SpecialProgramOutcome[] = data.outcomes.map((o: any) => ({
        icon: String(o.icon || '⭐'),
        title: String(o.title || ''),
        desc: String(o.desc || ''),
      }));
      next.content = {
        ...next.content,
        outcomes: mode === 'replace' || !(next.content.outcomes || []).length
          ? mapped
          : [...(next.content.outcomes || []), ...mapped],
      };
    }
  }

  return next;
}
