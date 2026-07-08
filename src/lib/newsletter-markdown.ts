/**
 * Escape HTML so raw markup in the source can NEVER become live HTML. This runs BEFORE the
 * markdown transforms — the markdown tokens (** * ` # -) contain none of & < > so the regexes
 * below still match. Without this, newsletter content is a stored-XSS vector: it's rendered via
 * dangerouslySetInnerHTML to every recipient (students/parents) and injected into the print window.
 */
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function inlineMd(t: string): string {
  return escapeHtml(t)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/`(.+?)`/g, '<code>$1</code>');
}

/** Full block-level markdown → HTML renderer (headings, lists, paragraphs, HR). */
export function renderMarkdown(text: string): string {
  const lines = text.split('\n');
  const out: string[] = [];
  let inUl = false, inOl = false;

  const closeList = () => {
    if (inUl) { out.push('</ul>'); inUl = false; }
    if (inOl) { out.push('</ol>'); inOl = false; }
  };

  for (const raw of lines) {
    if (raw.startsWith('# ')) {
      closeList();
      out.push(`<h2 class="nl-h1">${inlineMd(raw.slice(2))}</h2>`);
    } else if (raw.startsWith('## ')) {
      closeList();
      out.push(`<h3 class="nl-h2">${inlineMd(raw.slice(3))}</h3>`);
    } else if (raw.startsWith('### ')) {
      closeList();
      out.push(`<h4 class="nl-h3">${inlineMd(raw.slice(4))}</h4>`);
    } else if (/^---+$/.test(raw.trim())) {
      closeList();
      out.push('<hr class="nl-hr"/>');
    } else if (/^[*-] /.test(raw)) {
      if (inOl) { out.push('</ol>'); inOl = false; }
      if (!inUl) { out.push('<ul class="nl-ul">'); inUl = true; }
      out.push(`<li>${inlineMd(raw.slice(2))}</li>`);
    } else if (/^\d+\. /.test(raw)) {
      if (inUl) { out.push('</ul>'); inUl = false; }
      if (!inOl) { out.push('<ol class="nl-ol">'); inOl = true; }
      out.push(`<li>${inlineMd(raw.replace(/^\d+\. /, ''))}</li>`);
    } else if (!raw.trim()) {
      closeList();
      out.push('<div class="nl-gap"></div>');
    } else {
      closeList();
      out.push(`<p class="nl-p">${inlineMd(raw)}</p>`);
    }
  }
  closeList();
  return out.join('');
}
