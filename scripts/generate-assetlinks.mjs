import { mkdir, writeFile } from 'node:fs/promises';
const fingerprint = process.argv[2]?.trim().toUpperCase();
if (!fingerprint || !/^([0-9A-F]{2}:){31}[0-9A-F]{2}$/.test(fingerprint)) {
  console.error('Usage: node scripts/generate-assetlinks.mjs AA:BB:... (Play App Signing SHA-256 fingerprint)');
  process.exit(1);
}
const payload = [{ relation: ['delegate_permission/common.handle_all_urls'], target: { namespace: 'android_app', package_name: 'com.rillcod.academy', sha256_cert_fingerprints: [fingerprint] } }];
await mkdir('public/.well-known', { recursive: true });
await writeFile('public/.well-known/assetlinks.json', `${JSON.stringify(payload, null, 2)}\n`);
console.log('Created public/.well-known/assetlinks.json');