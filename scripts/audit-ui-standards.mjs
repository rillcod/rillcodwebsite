import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();

async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async (entry) => {
    const absolute = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(absolute) : absolute;
  }));
  return nested.flat();
}

const sourceFiles = (await walk(path.join(root, 'src')))
  .filter((file) => /\.(?:css|tsx?|jsx?)$/.test(file));
const pageFiles = sourceFiles.filter((file) => file.endsWith(`${path.sep}page.tsx`));
const dashboardPages = pageFiles.filter((file) => file.includes(`${path.sep}app${path.sep}dashboard${path.sep}`));
const publicPages = pageFiles.filter((file) => !dashboardPages.includes(file));
const failures = [];

async function expectFileContains(relativePath, expected, reason) {
  const source = await readFile(path.join(root, relativePath), 'utf8');
  if (!source.includes(expected)) failures.push(`${relativePath}: ${reason}`);
}

await expectFileContains(
  'src/app/layout.tsx',
  'app-visual-standard',
  'the root layout must keep the shared visual-standard scope',
);
await expectFileContains(
  'src/components/layout/DashboardShell.tsx',
  'app-page-main',
  'dashboard pages must remain inside the normalized page canvas',
);
await expectFileContains(
  'src/components/ui/button.tsx',
  'min-h-11',
  'shared buttons must preserve a 44px mobile touch target',
);
await expectFileContains(
  'src/components/ui/input.tsx',
  'min-h-11',
  'shared inputs must preserve a 44px mobile touch target',
);
await expectFileContains(
  'src/components/layout/AppProviders.tsx',
  'hasPublicMarketingFooter',
  'public footer visibility must use the central route policy',
);
await expectFileContains(
  'src/components/layout/Navigation.tsx',
  'isAppUtilityRoute',
  'navigation visibility must use the central route policy',
);

const navbar = await readFile(path.join(root, 'src/components/layout/DesktopTopNavbar.tsx'), 'utf8');
if (navbar.includes('aria-label="Search dashboard"')) {
  failures.push('DesktopTopNavbar: do not reintroduce a persistent global search beside page-level search');
}

const dataTable = await readFile(path.join(root, 'src/components/ui/DataTable.tsx'), 'utf8');
if (dataTable.includes('filterable') || dataTable.includes('Filter className=')) {
  failures.push('DataTable: do not reintroduce a non-functional filter control');
}

for (const file of sourceFiles) {
  const relative = path.relative(root, file).replaceAll('\\', '/');
  const source = await readFile(file, 'utf8');
  if (/border-(?:2|4)\s+border-black/.test(source)) {
    failures.push(`${relative}: hard black borders are outside the product standard`);
  }
  if (/shadow-\[[^\]\n]*(?:#000|rgba\(0,0,0,1\))/i.test(source)) {
    failures.push(`${relative}: hard-coded black offset shadows are outside the product standard`);
  }
}

for (const file of publicPages) {
  const relative = path.relative(root, file).replaceAll('\\', '/');
  const source = await readFile(file, 'utf8');
  if (/min-h-screen\s+pt-(?:16|20|24)/.test(source)) {
    failures.push(`${relative}: remove fixed-nav top padding; the public navigation is in normal flow`);
  }

  source.split(/\r?\n/).forEach((line, index) => {
    const legacyWhiteCard = /bg-white(?!\/) [^"']*rounded[^"']*shadow/.test(line);
    const hasThemePair = line.includes('dark:bg-');
    const isIntentionalBrandCta = line.includes('text-blue-');
    if (legacyWhiteCard && !hasThemePair && !isIntentionalBrandCta) {
      failures.push(`${relative}:${index + 1}: use bg-card/border-border or provide a dark-mode pair`);
    }
  });
}

if (failures.length) {
  console.error('UI standards audit failed:');
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log(
  `UI standards audit passed (${pageFiles.length} pages: ${dashboardPages.length} dashboard, ${publicPages.length} public).`,
);
