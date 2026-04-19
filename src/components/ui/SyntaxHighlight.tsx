'use client';

import { useTheme } from '@/contexts/theme-context';

// ─── Token-based syntax highlighter — no external dependencies ───────────────
// Supports Python (full), JS/TS (basic), HTML/CSS (basic)

type TokType =
  | 'keyword' | 'builtin' | 'string' | 'comment'
  | 'number'  | 'decorator' | 'funcname' | 'operator' | 'plain';

interface Token { type: TokType; value: string }

// ── Python ────────────────────────────────────────────────────────────────────
const PY_KEYWORDS = new Set([
  'False','None','True','and','as','assert','async','await','break',
  'class','continue','def','del','elif','else','except','finally',
  'for','from','global','if','import','in','is','lambda','nonlocal',
  'not','or','pass','raise','return','try','while','with','yield',
  'self','cls',
]);
const PY_BUILTINS = new Set([
  'print','len','range','int','str','float','list','dict','set','tuple',
  'bool','input','type','isinstance','hasattr','getattr','setattr',
  'enumerate','zip','map','filter','sorted','reversed','min','max',
  'sum','abs','round','open','repr','format','id','dir','vars','iter',
  'next','any','all','hex','oct','bin','chr','ord','hash','callable',
  'super','object','property','staticmethod','classmethod',
  'Exception','ValueError','TypeError','KeyError','IndexError',
  'AttributeError','NotImplementedError','StopIteration','RuntimeError',
  'FileNotFoundError','IOError','OSError',
]);

function tokenizePython(line: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  let prevKeyword = '';

  while (i < line.length) {
    // Comment
    if (line[i] === '#') {
      tokens.push({ type: 'comment', value: line.slice(i) });
      break;
    }
    // Triple-quoted string (rare on a single line but handle it)
    const tri = line.slice(i, i + 3);
    if (tri === '"""' || tri === "'''") {
      const end = line.indexOf(tri, i + 3);
      const val = end === -1 ? line.slice(i) : line.slice(i, end + 3);
      tokens.push({ type: 'string', value: val });
      i += val.length; prevKeyword = ''; continue;
    }
    // f/b/r string prefix
    if (/^[fFbBrRuU]/.test(line[i]) && (line[i + 1] === '"' || line[i + 1] === "'")) {
      const q = line[i + 1];
      let j = i + 2;
      while (j < line.length && line[j] !== q) { if (line[j] === '\\') j++; j++; }
      tokens.push({ type: 'string', value: line.slice(i, j + 1) });
      i = j + 1; prevKeyword = ''; continue;
    }
    // Single/double string
    if (line[i] === '"' || line[i] === "'") {
      const q = line[i];
      let j = i + 1;
      while (j < line.length && line[j] !== q) { if (line[j] === '\\') j++; j++; }
      tokens.push({ type: 'string', value: line.slice(i, j + 1) });
      i = j + 1; prevKeyword = ''; continue;
    }
    // Number
    if (/[0-9]/.test(line[i]) || (line[i] === '.' && /[0-9]/.test(line[i + 1] ?? ''))) {
      let j = i;
      if (line[i] === '0' && /[xXoObB]/.test(line[i + 1] ?? '')) {
        j += 2; while (j < line.length && /[0-9a-fA-F_]/.test(line[j])) j++;
      } else { while (j < line.length && /[0-9._eEjJ]/.test(line[j])) j++; }
      tokens.push({ type: 'number', value: line.slice(i, j) });
      i = j; prevKeyword = ''; continue;
    }
    // Decorator
    if (line[i] === '@') {
      let j = i + 1;
      while (j < line.length && /[\w.]/.test(line[j])) j++;
      tokens.push({ type: 'decorator', value: line.slice(i, j) });
      i = j; prevKeyword = ''; continue;
    }
    // Identifier
    if (/[a-zA-Z_]/.test(line[i])) {
      let j = i;
      while (j < line.length && /\w/.test(line[j])) j++;
      const word = line.slice(i, j);
      if (prevKeyword === 'def' || prevKeyword === 'class') {
        tokens.push({ type: 'funcname', value: word });
        prevKeyword = '';
      } else if (PY_KEYWORDS.has(word)) {
        tokens.push({ type: 'keyword', value: word });
        prevKeyword = word;
      } else if (PY_BUILTINS.has(word)) {
        tokens.push({ type: 'builtin', value: word });
        prevKeyword = '';
      } else {
        tokens.push({ type: 'plain', value: word });
        prevKeyword = '';
      }
      i = j; continue;
    }
    // Whitespace
    if (line[i] === ' ' || line[i] === '\t') {
      let j = i;
      while (j < line.length && (line[j] === ' ' || line[j] === '\t')) j++;
      tokens.push({ type: 'plain', value: line.slice(i, j) });
      i = j; continue;
    }
    // Operators / punctuation
    tokens.push({ type: 'operator', value: line[i] });
    i++;
  }
  return tokens;
}

// ── JS/TS basic ───────────────────────────────────────────────────────────────
const JS_KEYWORDS = new Set([
  'const','let','var','function','return','if','else','for','while',
  'class','extends','new','import','export','default','from','async',
  'await','try','catch','finally','throw','typeof','instanceof','in',
  'of','switch','case','break','continue','this','super','static',
  'null','undefined','true','false','void','delete','yield',
]);
const JS_BUILTINS = new Set([
  'console','Math','Array','Object','String','Number','Boolean','Date',
  'JSON','Promise','Error','Map','Set','Symbol','Proxy','Reflect',
  'parseInt','parseFloat','isNaN','isFinite','setTimeout','setInterval',
  'clearTimeout','clearInterval','fetch','document','window','navigator',
]);

function tokenizeJS(line: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;

  while (i < line.length) {
    // Line comment
    if (line.slice(i, i + 2) === '//') {
      tokens.push({ type: 'comment', value: line.slice(i) }); break;
    }
    // Template literal (simple single-line)
    if (line[i] === '`') {
      let j = i + 1;
      while (j < line.length && line[j] !== '`') { if (line[j] === '\\') j++; j++; }
      tokens.push({ type: 'string', value: line.slice(i, j + 1) });
      i = j + 1; continue;
    }
    // String
    if (line[i] === '"' || line[i] === "'") {
      const q = line[i]; let j = i + 1;
      while (j < line.length && line[j] !== q) { if (line[j] === '\\') j++; j++; }
      tokens.push({ type: 'string', value: line.slice(i, j + 1) });
      i = j + 1; continue;
    }
    // Number
    if (/[0-9]/.test(line[i])) {
      let j = i;
      while (j < line.length && /[0-9._eExXa-fA-F]/.test(line[j])) j++;
      tokens.push({ type: 'number', value: line.slice(i, j) });
      i = j; continue;
    }
    // Identifier
    if (/[a-zA-Z_$]/.test(line[i])) {
      let j = i;
      while (j < line.length && /[\w$]/.test(line[j])) j++;
      const word = line.slice(i, j);
      if (JS_KEYWORDS.has(word)) tokens.push({ type: 'keyword', value: word });
      else if (JS_BUILTINS.has(word)) tokens.push({ type: 'builtin', value: word });
      else tokens.push({ type: 'plain', value: word });
      i = j; continue;
    }
    if (line[i] === ' ' || line[i] === '\t') {
      let j = i;
      while (j < line.length && (line[j] === ' ' || line[j] === '\t')) j++;
      tokens.push({ type: 'plain', value: line.slice(i, j) });
      i = j; continue;
    }
    tokens.push({ type: 'operator', value: line[i] }); i++;
  }
  return tokens;
}

// ── Token colours (theme-aware) ────────────────────────────────────
const getTokColor = (type: TokType, isDark: boolean): string => {
  if (isDark) {
    // VS Code Dark+ palette for dark theme
    const darkColors: Record<TokType, string> = {
      keyword:   '#569cd6',
      builtin:   '#4ec9b0',
      string:    '#ce9178',
      comment:   '#6a9955',
      number:    '#b5cea8',
      decorator: '#c586c0',
      funcname:  '#dcdcaa',
      operator:  '#d4d4d4',
      plain:     '#d4d4d4',
    };
    return darkColors[type];
  } else {
    // Light theme colors
    const lightColors: Record<TokType, string> = {
      keyword:   '#0000ff',
      builtin:   '#267f99',
      string:    '#a31515',
      comment:   '#008000',
      number:    '#098658',
      decorator: '#af00db',
      funcname:  '#795e26',
      operator:  '#000000',
      plain:     '#000000',
    };
    return lightColors[type];
  }
};

function tokenizeLine(line: string, lang: string): Token[] {
  if (lang === 'python' || lang === 'py') return tokenizePython(line);
  if (lang === 'javascript' || lang === 'js' || lang === 'typescript' || lang === 'ts' || lang === 'jsx' || lang === 'tsx')
    return tokenizeJS(line);
  // HTML / CSS / other — plain with slight colouring via single-colour render
  return [{ type: 'plain', value: line }];
}

// ── Keyframe injection (once) ─────────────────────────────────────────────────
const ANIM_STYLE = `
@keyframes shFadeIn {
  from { opacity: 0; transform: translateX(-4px); }
  to   { opacity: 1; transform: translateX(0); }
}
@keyframes shCursor {
  0%,100% { opacity: 1; } 50% { opacity: 0; }
}
`;

let styleInjected = false;
function ensureStyles() {
  if (styleInjected || typeof document === 'undefined') return;
  styleInjected = true;
  const el = document.createElement('style');
  el.textContent = ANIM_STYLE;
  document.head.appendChild(el);
}

// ── Component ─────────────────────────────────────────────────────────────────
const LANG_COLOR: Record<string, string> = {
  python: '#3b82f6', py: '#3b82f6',
  javascript: '#f7df1e', js: '#f7df1e', jsx: '#f7df1e',
  typescript: '#3178c6', ts: '#3178c6', tsx: '#3178c6',
  html: '#e34c26', css: '#264de4',
  robotics: '#10b981',
};

export function SyntaxHighlight({
  code,
  language = 'python',
  showLineNumbers = true,
  maxLines,
  animate = false,
  streaming = false,
  className = '',
}: {
  code: string;
  language?: string;
  showLineNumbers?: boolean;
  maxLines?: number;
  /** Stagger-fade each line in on mount */
  animate?: boolean;
  /** Show a blinking cursor on the last line (for AI streaming) */
  streaming?: boolean;
  className?: string;
}) {
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === 'dark';
  
  if (animate || streaming) ensureStyles();

  const lang = language.toLowerCase().trim();
  const allLines = code.split('\n');
  if (allLines[allLines.length - 1] === '') allLines.pop();
  const displayLines = maxLines ? allLines.slice(0, maxLines) : allLines;
  const truncated = maxLines ? allLines.length > maxLines : false;
  const accentColor = LANG_COLOR[lang] ?? '#569cd6';

  // Theme-aware colors
  const backgroundColor = isDark ? '#0b0b14' : '#f8f9fa';
  const borderColor = isDark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.1)';
  const headerBg = isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.03)';
  const headerBorder = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)';
  const lineNumberColor = isDark ? 'rgba(255,255,255,0.18)' : 'rgba(0,0,0,0.3)';
  const lineNumberBorder = isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.1)';
  const hoverBg = isDark ? 'rgba(255,255,255,0.025)' : 'rgba(0,0,0,0.025)';

  return (
    <div
      className={className}
      style={{
        background: backgroundColor,
        border: `1px solid ${borderColor}`,
        overflow: 'hidden',
        fontFamily: 'JetBrains Mono, Fira Code, Menlo, Consolas, monospace',
        // subtle glow matching language
        boxShadow: `0 0 24px ${accentColor}12, inset 0 1px 0 ${isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)'}`,
      }}
    >
      {/* Header bar */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '6px 12px',
        background: headerBg,
        borderBottom: `1px solid ${headerBorder}`,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#ff5f57', display: 'inline-block' }} />
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#febc2e', display: 'inline-block' }} />
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#28c840', display: 'inline-block' }} />
          <span style={{
            marginLeft: 8, fontSize: 9, fontWeight: 900,
            color: accentColor, letterSpacing: '0.15em',
            textTransform: 'uppercase' as const, opacity: 0.9,
          }}>
            {lang || 'code'}
          </span>
          {streaming && (
            <span style={{
              marginLeft: 6, fontSize: 8, color: '#28c840', fontWeight: 900,
              letterSpacing: '0.1em', textTransform: 'uppercase' as const,
              animation: 'shCursor 1s infinite',
            }}>● generating</span>
          )}
        </div>
        <span style={{ fontSize: 9, color: isDark ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.4)', letterSpacing: '0.1em' }}>
          {allLines.length} line{allLines.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Code body */}
      <div style={{ overflowX: 'auto', overflowY: 'auto', maxHeight: maxLines ? `${maxLines * 1.75 + 3}rem` : undefined }}>
        <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 12, lineHeight: 1.7 }}>
          <tbody>
            {displayLines.map((line, idx) => (
              <tr
                key={idx}
                style={{
                  verticalAlign: 'top',
                  ...(animate ? {
                    animation: `shFadeIn 0.25s ease both`,
                    animationDelay: `${Math.min(idx * 0.018, 0.6)}s`,
                  } : {}),
                }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = hoverBg; }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
              >
                {showLineNumbers && (
                  <td style={{
                    padding: '0 10px',
                    textAlign: 'right',
                    color: lineNumberColor,
                    userSelect: 'none',
                    fontSize: 10,
                    minWidth: 36,
                    borderRight: `1px solid ${lineNumberBorder}`,
                    whiteSpace: 'nowrap',
                  }}>
                    {idx + 1}
                  </td>
                )}
                <td style={{ padding: '0 16px', whiteSpace: 'pre' }}>
                  {tokenizeLine(line, lang).map((tok, ti) => (
                    <span key={ti} style={{ color: getTokColor(tok.type, isDark) }}>{tok.value}</span>
                  ))}
                  {/* Blinking cursor on last visible line during streaming */}
                  {streaming && idx === displayLines.length - 1 && (
                    <span style={{
                      display: 'inline-block', width: 2, height: '1em',
                      background: accentColor, marginLeft: 1, verticalAlign: 'text-bottom',
                      animation: 'shCursor 0.8s infinite',
                    }} />
                  )}
                  {line === '' && <span>&nbsp;</span>}
                </td>
              </tr>
            ))}
            {truncated && (
              <tr>
                <td
                  colSpan={showLineNumbers ? 2 : 1}
                  style={{ padding: '4px 16px', color: isDark ? 'rgba(255,255,255,0.25)' : 'rgba(0,0,0,0.4)', fontSize: 10, fontStyle: 'italic' }}
                >
                  … {allLines.length - maxLines!} more line{allLines.length - maxLines! !== 1 ? 's' : ''} hidden
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Bottom glow accent */}
      <div style={{
        height: 2,
        background: `linear-gradient(90deg, ${accentColor}40, transparent)`,
      }} />
    </div>
  );
}
