import { NextRequest, NextResponse } from 'next/server';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { normalizeExtractedAcademicText } from '@/lib/files/extract-document-text';

function isBlockedHost(hostname: string): boolean {
  const h = hostname.toLowerCase().trim();
  if (!h || h === 'localhost' || h.endsWith('.local') || h.endsWith('.internal')) return true;
  if (h === '::1' || h === '[::1]') return true;
  if (/^127\./.test(h) || /^10\./.test(h) || /^192\.168\./.test(h) || /^169\.254\./.test(h) || /^0\./.test(h)) {
    return true;
  }
  const m172 = h.match(/^172\.(\d+)\./);
  if (m172) {
    const second = parseInt(m172[1], 10);
    if (second >= 16 && second <= 31) return true;
  }
  return false;
}

function htmlToReadableArticleText(html: string): { title: string; text: string } {
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const rawTitle = (titleMatch?.[1] || '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();

  // Prefer <article> or <main> content if present
  const mainMatch =
    html.match(/<article\b[^>]*>([\s\S]*?)<\/article>/i)
    || html.match(/<main\b[^>]*>([\s\S]*?)<\/main>/i);
  let body = mainMatch ? mainMatch[1] : html;

  // Strip non-content regions
  body = body
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '\n')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '\n')
    .replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi, '\n')
    .replace(/<svg\b[^>]*>[\s\S]*?<\/svg>/gi, '\n')
    .replace(/<(?:nav|header|footer|aside|form|iframe)\b[^>]*>[\s\S]*?<\/(?:nav|header|footer|aside|form|iframe)>/gi, '\n')
    // Preserve headings & list/paragraph boundaries
    .replace(/<h[1-3][^>]*>([\s\S]*?)<\/h[1-3]>/gi, '\n\n## $1\n')
    .replace(/<li[^>]*>/gi, '\n- ')
    .replace(/<(?:p|div|br|tr|section|blockquote|pre)[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'");

  const cleaned = normalizeExtractedAcademicText(body).slice(0, 24_000);
  return { title: rawTitle, text: cleaned };
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { data: profile } = await supabase
      .from('portal_users')
      .select('id, role')
      .eq('id', user.id)
      .maybeSingle();

    if (!profile || !['admin', 'teacher', 'school'].includes(profile.role ?? '')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await request.json().catch(() => ({}));
    const rawUrl = String(body?.url || '').trim();
    let parsedUrl: URL;
    try {
      parsedUrl = new URL(rawUrl);
    } catch {
      return NextResponse.json({ error: 'Enter a valid http:// or https:// article URL.' }, { status: 400 });
    }

    if (!['http:', 'https:'].includes(parsedUrl.protocol) || isBlockedHost(parsedUrl.hostname)) {
      return NextResponse.json({ error: 'That URL cannot be fetched.' }, { status: 400 });
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8_000);
    let html = '';
    try {
      const res = await fetch(parsedUrl.toString(), {
        method: 'GET',
        redirect: 'follow',
        headers: {
          'User-Agent': 'RillcodAcademyBot/1.0 (+https://rillcod.com)',
          Accept: 'text/html,text/plain;q=0.9,*/*;q=0.5',
        },
        signal: controller.signal,
      });
      if (!res.ok) {
        return NextResponse.json({ error: `Could not fetch article (HTTP ${res.status}).` }, { status: 502 });
      }
      const contentType = (res.headers.get('content-type') || '').toLowerCase();
      if (!contentType.includes('text/') && !contentType.includes('html') && !contentType.includes('xml')) {
        return NextResponse.json({ error: 'That URL is not a readable web article or text page.' }, { status: 400 });
      }
      const raw = await res.text();
      html = raw.slice(0, 1_500_000);
    } finally {
      clearTimeout(timeout);
    }

    const { title, text } = htmlToReadableArticleText(html);
    if (text.length < 80) {
      return NextResponse.json(
        { error: 'Not enough readable article text was found at that URL (the site may block automated readers — try copy-pasting the text directly).' },
        { status: 422 },
      );
    }

    return NextResponse.json({
      data: {
        title: title || parsedUrl.hostname,
        url: parsedUrl.toString(),
        text,
        wordCount: text.split(/\s+/).filter(Boolean).length,
      },
    });
  } catch (err: any) {
    const msg = err?.name === 'AbortError'
      ? 'Article fetch timed out. Try pasting the article text directly.'
      : (err?.message || 'Could not extract article.');
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
