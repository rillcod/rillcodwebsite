/**
 * Turn lesson content into something worth listening to.
 *
 * Everything this platform generates renders through AIMarkdown, so the text a
 * read-aloud button has to hand is markdown, not prose. Passed to a voice model
 * unchanged, a learner hears "asterisk asterisk important asterisk asterisk",
 * every URL read character by character, and a fenced code block recited as
 * punctuation. The voice is only as good as what it is given.
 *
 * Deepgram Aura is context-aware — it decides pacing and emphasis from the text
 * itself — which is exactly why the input has to be clean. Markup noise makes it
 * pace around symbols that were never meant to be spoken.
 *
 * The rule followed here: remove what is notation, keep what is language. Where
 * a construct carries meaning aloud (a heading introduces, a list enumerates) it
 * becomes a sentence boundary so the voice pauses instead of running on.
 */

/** Educational shorthand that reads badly letter by letter. */
const SPOKEN_FORMS: Array<[RegExp, string]> = [
  [/\be\.g\.\s*/gi, 'for example, '],
  [/\bi\.e\.\s*/gi, 'that is, '],
  [/\betc\.(?=\s|$)/gi, 'and so on.'],
  [/\bvs\.?\s/gi, 'versus '],
  [/\bapprox\.\s*/gi, 'approximately '],
  [/\bFig\.\s*(?=\d)/gi, 'Figure '],
  [/\bNo\.\s*(?=\d)/g, 'Number '],
];

/**
 * Symbols that are read as words in the middle of a sentence.
 *
 * Deliberately short. Aura already handles digits, currency and ordinary
 * punctuation well, and aggressive substitution does more harm than good — "&"
 * in a title is worth expanding, but rewriting every hyphen or slash mangles
 * dates, ratios and hyphenated words that were fine as they were.
 */
const SPOKEN_SYMBOLS: Array<[RegExp, string]> = [
  [/\s&\s/g, ' and '],
  [/\s\+\s/g, ' plus '],
  [/\s=\s/g, ' equals '],
  [/\s%(?=\s|$)/g, ' percent'],
  [/(\d)\s*%/g, '$1 percent'],
];

export type SpeechTextOptions = {
  /**
   * What to do with fenced code. Reading it aloud is useless; announcing it
   * tells a learner following along that something was skipped, which is
   * kinder than silence where they can see a block on screen.
   */
  codeBlocks?: 'announce' | 'omit';
};

/**
 * Normalise markdown (and stray HTML) into speakable prose.
 *
 * Order matters: code fences are removed before inline markers, or a stray
 * backtick inside a block would unbalance the inline pass.
 */
export function toSpeechText(input: string, options: SpeechTextOptions = {}): string {
  const codeBlocks = options.codeBlocks ?? 'announce';
  let text = input.replace(/\r\n/g, '\n');

  // Fenced code — never spoken.
  text = text.replace(/```[\s\S]*?```/g, codeBlocks === 'announce' ? ' (code example) ' : ' ');
  text = text.replace(/~~~[\s\S]*?~~~/g, codeBlocks === 'announce' ? ' (code example) ' : ' ');

  // Images before links: the syntax differs only by a leading "!".
  text = text.replace(/!\[([^\]]*)\]\([^)]*\)/g, (_m, alt) => (alt ? ` image: ${alt}. ` : ' '));
  // Links keep their label and drop the URL — nobody wants an address spelled out.
  text = text.replace(/\[([^\]]+)\]\([^)]*\)/g, '$1');
  // A bare URL left in the prose is noise too.
  text = text.replace(/\bhttps?:\/\/\S+/g, ' ');

  text = text.replace(/<[^>]+>/g, ' '); // stray HTML
  text = text.replace(/`([^`]+)`/g, '$1'); // inline code keeps its content

  // A heading is spoken as its own sentence so the voice pauses after it.
  text = text.replace(/^\s{0,3}#{1,6}\s*(.+?)\s*#*\s*$/gm, (_m, heading) =>
    /[.!?:]$/.test(heading) ? `${heading}` : `${heading}.`,
  );

  text = text.replace(/^\s{0,3}>\s?/gm, ''); // block quotes
  text = text.replace(/^\s{0,3}([-*_])\s*\1\s*\1[-*_\s]*$/gm, ' '); // horizontal rules

  // List markers carry no sound; the line break already implies the pause.
  text = text.replace(/^\s*[-*+]\s+/gm, '');
  text = text.replace(/^\s*\d+[.)]\s+/gm, '');

  // Table pipes read as nothing useful; treat cells as clauses.
  text = text.replace(/^\s*\|?[\s:|-]{4,}\|?\s*$/gm, ' '); // separator row
  text = text.replace(/\s*\|\s*/g, ', ');

  text = text.replace(/(\*\*\*|___)(.+?)\1/g, '$2');
  text = text.replace(/(\*\*|__)(.+?)\1/g, '$2');
  text = text.replace(/(\*|_)(.+?)\1/g, '$2');
  text = text.replace(/~~(.+?)~~/g, '$1');

  for (const [pattern, replacement] of SPOKEN_FORMS) text = text.replace(pattern, replacement);
  for (const [pattern, replacement] of SPOKEN_SYMBOLS) text = text.replace(pattern, replacement);

  // A blank line is a paragraph break: make it a full stop so the voice lands
  // rather than running two ideas together.
  text = text.replace(/\n{2,}/g, '. ');
  text = text.replace(/\n/g, '. ');

  // Tidy the punctuation the steps above inevitably double up.
  text = text.replace(/\s+/g, ' ');
  text = text.replace(/\s+([,.!?;:])/g, '$1');
  text = text.replace(/([.!?])\s*\.(?=\s|$)/g, '$1');
  text = text.replace(/,\s*(?=[.!?])/g, '');
  text = text.replace(/\.{2,}/g, '.');
  text = text.replace(/(^|\s)[,.]+(?=\s|$)/g, '$1');

  const cleaned = text.replace(/\s+/g, ' ').trim();

  // Land the ending. The last line of a list or a passage has no trailing
  // newline to become a full stop, so without this the voice trails off
  // mid-breath on the final item instead of finishing.
  if (!cleaned || /[.!?]$/.test(cleaned)) return cleaned;
  return `${cleaned}.`;
}

/**
 * Voices Deepgram Aura accepts, read from the model's own enum.
 *
 * Validated rather than passed through: an unknown speaker is a 400 from the
 * model, which would surface to a learner as read-aloud being broken.
 */
export const AURA_VOICES = [
  'amalthea', 'andromeda', 'apollo', 'arcas', 'aries', 'asteria', 'athena',
  'atlas', 'aurora', 'callista', 'cora', 'cordelia', 'delia', 'draco',
  'electra', 'harmonia', 'helena', 'hera', 'hermes', 'hyperion', 'iris',
  'janus', 'juno', 'jupiter', 'luna', 'mars', 'minerva', 'neptune',
  'odysseus', 'ophelia', 'orion', 'orpheus', 'pandora', 'phoebe', 'pluto',
  'saturn', 'thalia', 'theia', 'vesta', 'zeus',
] as const;

export type AuraVoice = (typeof AURA_VOICES)[number];

/**
 * Named voices for the places this platform actually reads aloud, so callers
 * pick a purpose rather than memorising forty Greek names.
 */
export const VOICE_ROLES = {
  /** Default classroom narration: clear and unhurried. */
  lesson: 'athena',
  /** Younger learners and story content: warmer. */
  story: 'luna',
  /** Instructions and assessment prompts: crisp and neutral. */
  instruction: 'orion',
} as const satisfies Record<string, AuraVoice>;

export type VoiceRole = keyof typeof VOICE_ROLES;

export function isAuraVoice(value: string): value is AuraVoice {
  return (AURA_VOICES as readonly string[]).includes(value);
}

/** Resolve a role name, a raw voice, or nothing, to a voice the model accepts. */
export function resolveVoice(requested?: string): AuraVoice {
  if (!requested) return VOICE_ROLES.lesson;
  if (requested in VOICE_ROLES) return VOICE_ROLES[requested as VoiceRole];
  if (isAuraVoice(requested)) return requested;
  return VOICE_ROLES.lesson;
}
