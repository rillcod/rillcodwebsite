import fs from 'fs';
import path from 'path';

function walk(dir, out = []) {
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name);
    if (fs.statSync(p).isDirectory()) walk(p, out);
    else if (name === 'page.tsx') out.push(p);
  }
  return out;
}

const TOKEN_RE = /mobile-page-root|MOBILE_PAGE_BOTTOM|MOBILE_PAGE_ROOT/;
const pages = walk('src/app/dashboard');
const missing = [];

for (const file of pages) {
  const content = fs.readFileSync(file, 'utf8');
  if (TOKEN_RE.test(content)) continue;
  const isRedirect = /redirect\s*\(/.test(content);
  const isReexport = /export\s+\{\s*default\s*\}\s+from/.test(content);
  const isWrapper = /export default function Page\(\)\s*\{\s*return\s+<\w+/.test(content) && !/className=/.test(content);
  missing.push({
    file: file.replace(/\\/g, '/'),
    kind: isRedirect ? 'redirect' : isReexport ? 'reexport' : isWrapper ? 'wrapper' : 'needs-patch',
  });
}

const needs = missing.filter((m) => m.kind === 'needs-patch');
console.log('Missing token:', missing.length);
console.log('Needs patch:', needs.length);
for (const m of needs) console.log(m.file);
console.log('\nWrappers:', missing.filter((m) => m.kind === 'wrapper').length);
console.log('Redirects:', missing.filter((m) => m.kind === 'redirect').length);
console.log('Reexports:', missing.filter((m) => m.kind === 'reexport').length);
