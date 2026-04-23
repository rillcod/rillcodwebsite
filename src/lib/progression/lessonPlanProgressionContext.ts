export function parseBasicLevel(className: string | null | undefined): number | null {
  if (!className) return null;
  const m = className.match(/basic\s*(\d+)/i);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) ? n : null;
}

export function parseJssLevel(className: string | null | undefined): number | null {
  if (!className) return null;
  const jss = className.match(/jss\s*(\d+)/i);
  if (jss) {
    const n = Number(jss[1]);
    return Number.isFinite(n) ? n : null;
  }
  const basic = parseBasicLevel(className);
  if (basic && basic >= 7 && basic <= 9) return basic - 6;
  return null;
}

export function parseSsLevel(className: string | null | undefined): number | null {
  if (!className) return null;
  const ss = className.match(/ss\s*(\d+)/i);
  if (!ss) return null;
  const n = Number(ss[1]);
  return Number.isFinite(n) ? n : null;
}

export function resolveGradeKeyFromClassName(className: string | null | undefined): string | null {
  const basic = parseBasicLevel(className);
  if (basic && basic >= 1 && basic <= 6) return `basic_${basic}`;
  const jss = parseJssLevel(className);
  if (jss && jss >= 1 && jss <= 3) return `jss_${jss}`;
  const ss = parseSsLevel(className);
  if (ss && ss >= 1 && ss <= 3) return `ss_${ss}`;
  return null;
}

export function resolveSyllabusPhaseFromClassName(className: string | null | undefined): 'ss_1_3' | 'jss_1_3' | 'basic_1_6' {
  const ssLevel = parseSsLevel(className);
  if (ssLevel && ssLevel <= 3) return 'ss_1_3';
  const jssLevel = parseJssLevel(className);
  if (jssLevel && jssLevel <= 3) return 'jss_1_3';
  return 'basic_1_6';
}

export function resolveDefaultTrackFromPolicy(
  policy: Record<string, unknown>,
  className: string | null | undefined,
): string {
  const basicLevel = parseBasicLevel(className);
  const jssLevel = parseJssLevel(className);
  const ssLevel = parseSsLevel(className);
  const basic13Track = typeof policy.basic_1_3_track === 'string' ? policy.basic_1_3_track : 'young_innovator';
  const basic46Tracks = Array.isArray(policy.basic_4_6_tracks)
    ? policy.basic_4_6_tracks.filter((t): t is string => typeof t === 'string')
    : ['python', 'html_css'];
  const jssTracks = Array.isArray(policy.jss_1_3_tracks)
    ? policy.jss_1_3_tracks.filter((t): t is string => typeof t === 'string')
    : typeof policy.jss_1_3_track === 'string'
      ? [policy.jss_1_3_track]
      : ['jss_web_app'];
  const ssTracks = Array.isArray(policy.ss_1_3_tracks)
    ? policy.ss_1_3_tracks.filter((t): t is string => typeof t === 'string')
    : typeof policy.ss_1_3_track === 'string'
      ? [policy.ss_1_3_track]
      : Array.isArray(policy.ss_1_2_tracks)
        ? policy.ss_1_2_tracks.filter((t): t is string => typeof t === 'string')
        : typeof policy.ss_1_2_track === 'string'
          ? [policy.ss_1_2_track]
      : ['ss_uiux_mobile'];
  const jssTrack = jssTracks[0] ?? 'jss_web_app';
  const ssTrack = ssTracks[0] ?? 'ss_uiux_mobile';
  if (ssLevel && ssLevel <= 3) return ssTrack;
  if (jssLevel && jssLevel <= 3) return jssTrack;
  if (basicLevel && basicLevel <= 3) return basic13Track;
  return basic46Tracks[0] ?? 'python';
}
