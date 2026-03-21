import sharp from 'sharp';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const logoPath = path.join(root, 'public', 'logo.png');

async function generateIcon(size, outputPath) {
  // Safe zone: logo occupies 80% of canvas (maskable spec)
  const logoSize = Math.round(size * 0.80);

  // Resize logo to fit within logoSize x logoSize, preserving aspect ratio
  const resizedLogo = await sharp(logoPath)
    .resize(logoSize, logoSize, { fit: 'inside', background: { r: 15, g: 15, b: 26, alpha: 0 } })
    .png()
    .toBuffer();

  // Get actual dimensions after resize
  const meta = await sharp(resizedLogo).metadata();
  const left = Math.round((size - meta.width) / 2);
  const top = Math.round((size - meta.height) / 2);

  await sharp({
    create: {
      width: size,
      height: size,
      channels: 4,
      background: { r: 15, g: 15, b: 26, alpha: 255 }, // #0f0f1a
    },
  })
    .composite([{ input: resizedLogo, left, top }])
    .png({ compressionLevel: 9 })
    .toFile(outputPath);

  console.log(`✓ Generated ${outputPath} (${size}x${size})`);
}

await generateIcon(192, path.join(root, 'public', 'icon-192x192.png'));
await generateIcon(512, path.join(root, 'public', 'icon-512x512.png'));
await generateIcon(180, path.join(root, 'public', 'apple-touch-icon.png'));
console.log('Done!');
