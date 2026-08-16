#!/usr/bin/env node
/**
 * A route file may export handlers and Next's route config — nothing else.
 *
 * This exists because nothing else catches it. `tsc --noEmit` compiles an
 * illegal export happily, the CI typecheck step passes, every test passes, and
 * the failure appears only during `next build`:
 *
 *   Type error: Route "src/app/api/.../route.ts" does not match the required
 *   types of a Next.js Route. "CHASE_AFTER_DAYS" is not a valid Route export field.
 *
 * On a machine that cannot spare the disk or the ten minutes to run a full
 * production build, that means the first thing to notice is the deploy. Which
 * is exactly what happened: a constant shared out of a route file shipped, and
 * the build failed after the push rather than before it.
 *
 * Runs in about a second over five hundred files.
 *
 * Usage: node scripts/check-route-exports.mjs
 */
import { readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';

/** Everything Next accepts from a route module. */
const HANDLERS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'];
const CONFIG = [
  'dynamic',
  'dynamicParams',
  'revalidate',
  'fetchCache',
  'runtime',
  'preferredRegion',
  'maxDuration',
  'generateStaticParams',
  'config',
];
const LEGAL = new Set([...HANDLERS, ...CONFIG]);

// Types are erased before the bundler sees them, so `export type` is fine.
const VALUE_EXPORT = /^export\s+(?!type\b)(?:async\s+)?(?:const|let|var|function|class)\s+([A-Za-z0-9_$]+)/gm;
const DEFAULT_EXPORT = /^export\s+default\b/m;

function routeFiles() {
  const out = execSync('git ls-files "src/app/**/route.ts" "src/app/**/route.tsx"', {
    encoding: 'utf8',
  }).trim();
  return out ? out.split('\n') : [];
}

const files = routeFiles();
const problems = [];

for (const file of files) {
  const source = readFileSync(file, 'utf8');

  for (const match of source.matchAll(VALUE_EXPORT)) {
    if (!LEGAL.has(match[1])) {
      problems.push({ file, name: match[1] });
    }
  }
  if (DEFAULT_EXPORT.test(source)) {
    problems.push({ file, name: 'default' });
  }
}

if (problems.length) {
  console.error('[route-exports] a route file may only export handlers and route config.\n');
  for (const p of problems) {
    console.error(`  ${p.file}`);
    console.error(`    illegal export: ${p.name}`);
  }
  console.error(
    `\n  Move it to a module beside the route and import it back.\n` +
      `  Legal exports: ${HANDLERS.join(', ')}, ${CONFIG.join(', ')}.\n`,
  );
  process.exit(1);
}

console.log(`[route-exports] ${files.length} route files, no illegal exports.`);
