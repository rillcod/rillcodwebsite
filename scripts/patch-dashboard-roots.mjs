import fs from 'fs';
import path from 'path';

const ROOT = path.join('src', 'app', 'dashboard');
const TOKEN_RE = /mobile-page-root|MOBILE_PAGE_BOTTOM|MOBILE_PAGE_ROOT/;

function collectFiles(dir, out = []) {
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name);
    if (fs.statSync(p).isDirectory()) collectFiles(p, out);
    else if (/^(page|panel)\.tsx$/.test(name) || /Page\.tsx$/.test(name)) out.push(p);
  }
  return out;
}

function isReexportOnly(content) {
  return (
    /export\s+\{\s*default\s*\}\s+from/.test(content) ||
    (/export default function Page\(\)\s*\{\s*return\s+<\w+/.test(content) &&
      !/className=/.test(content))
  );
}

function shouldPatchClass(cls) {
  if (TOKEN_RE.test(cls)) return false;
  if (/^(fixed|absolute|sticky)\b/.test(cls)) return false;
  if (/\binset-0\b/.test(cls)) return false;
  if (/\bz-\[?\d/.test(cls) && /\bfixed\b/.test(cls)) return false;

  return (
    /\bmin-h-screen\b/.test(cls) ||
    /\bmin-h-dvh\b/.test(cls) ||
    /\bmin-h-\[/.test(cls) ||
    (/\bmax-w-/.test(cls) && /\bmx-auto\b/.test(cls)) ||
    (/\bspace-y-/.test(cls) && (/\bp-4\b/.test(cls) || /\bp-1\b/.test(cls) || /\bmx-auto\b/.test(cls) || /\bmin-h/.test(cls))) ||
    (/\bp-4\b/.test(cls) && /\bspace-y-/.test(cls) && !/\brounded/.test(cls)) ||
    /^space-y-[0-9]+$/.test(cls.trim())
  );
}

function patchClassValue(cls) {
  if (!shouldPatchClass(cls)) return cls;
  return `${cls.trim()} mobile-page-root`;
}

function patchContent(content) {
  if (TOKEN_RE.test(content)) return content;
  if (isReexportOnly(content)) return content;

  let next = content;

  next = next.replace(/className="([^"]*)"/g, (m, cls) => {
    const patched = patchClassValue(cls);
    return patched === cls ? m : `className="${patched}"`;
  });

  next = next.replace(/className=\{`([^`]*)`\}/g, (m, cls) => {
    if (TOKEN_RE.test(cls)) return m;
    const trimmed = cls.trim();
    if (trimmed.includes('${')) {
      if (
        /\bmin-h-screen\b/.test(trimmed) ||
        (/\bmax-w-/.test(trimmed) && /\bmx-auto\b/.test(trimmed))
      ) {
        return `className={\`mobile-page-root ${trimmed}\`}`;
      }
      return m;
    }
    const patched = patchClassValue(trimmed);
    return patched === trimmed ? m : `className={${JSON.stringify(patched)}}`;
  });

  return next;
}

const files = collectFiles(ROOT);
let changed = 0;

for (const file of files) {
  const orig = fs.readFileSync(file, 'utf8');
  const next = patchContent(orig);
  if (next !== orig) {
    fs.writeFileSync(file, next, 'utf8');
    changed++;
    console.log(file.replace(/\\/g, '/'));
  }
}

console.log(`\nUpdated ${changed} dashboard page/panel files`);
