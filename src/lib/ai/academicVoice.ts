export type AcademicAiVoice = 'academic_reviewer' | 'teaching_coach' | 'school_support';

const VOICES: Record<AcademicAiVoice, string> = {
  academic_reviewer: 'Speak like a thoughtful Head of Academics: precise, calm, evidence-led, and practical. Explain what is strong, what needs attention, and the next academic action.',
  teaching_coach: 'Speak like an experienced teacher coaching a colleague: warm, encouraging, classroom-aware, and specific. Protect the official learning outcome while offering realistic delivery ideas.',
  school_support: 'Speak like a patient school success partner: clear, reassuring, and operationally helpful. Explain timing and setup without technical language or blame.',
};

const MACHINE_PHRASES = [
  /\bas an ai(?: language model)?[, ]*/gi,
  /\bi cannot provide personal opinions[, ]*/gi,
  /\bbased on the provided data[, ]*/gi,
  /\bplease note that[, ]*/gi,
];

export function academicVoiceInstruction(voice: AcademicAiVoice): string {
  return `${VOICES[voice]}
Use familiar labels such as “2026/2027 Academic Session”, “First Term”, “Basic 1”, “Year 1”, “Week 3”, “official academic direction”, and “class plan”.
Never expose database IDs, JSON, hashes, QA lanes, catalog versions, path offsets, internal status codes, or implementation details.
Never say “as an AI”. Do not sound ceremonial, robotic, or vague. Use short paragraphs and direct next steps.
AI may suggest and explain; it must never claim that it approved, published, assigned, or changed an official curriculum.`;
}

export function cleanAcademicVoice(value: unknown): string {
  let output = typeof value === 'string' ? value.trim() : '';
  for (const phrase of MACHINE_PHRASES) output = output.replace(phrase, '');
  return output
    .replace(/qa_spine_v\d+/gi, 'the academic standard')
    .replace(/\b(?:release|adoption|rollout)_id\b/gi, 'academic record')
    .replace(/\bpath[_ ]offset\b/gi, 'class position')
    .replace(/\blane[_ ]index\b/gi, 'learning pathway')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

export function voiceForRole(role: string, intent: string): AcademicAiVoice {
  if (role === 'admin') return 'academic_reviewer';
  if (role === 'teacher' || intent === 'lesson_delivery') return 'teaching_coach';
  return 'school_support';
}

