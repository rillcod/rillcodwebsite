import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const sourcePath = path.join(root, 'resources', 'icon.png');
const resPath = path.join(root, 'android', 'app', 'src', 'main', 'res');
const background = { r: 15, g: 15, b: 26, alpha: 255 };

const densities = {
  ldpi: { adaptive: 81, legacy: 36 },
  mdpi: { adaptive: 108, legacy: 48 },
  hdpi: { adaptive: 162, legacy: 72 },
  xhdpi: { adaptive: 216, legacy: 96 },
  xxhdpi: { adaptive: 324, legacy: 144 },
  xxxhdpi: { adaptive: 432, legacy: 192 },
};

function isConnectedWhite(data, index) {
  const offset = index * 4;
  const r = data[offset];
  const g = data[offset + 1];
  const b = data[offset + 2];
  return Math.min(r, g, b) >= 225 && Math.max(r, g, b) - Math.min(r, g, b) <= 24;
}

async function extractLogo() {
  const { data, info } = await sharp(sourcePath)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const pixelCount = info.width * info.height;
  const visited = new Uint8Array(pixelCount);
  const queue = new Int32Array(pixelCount);
  let head = 0;
  let tail = 0;

  const enqueue = (index) => {
    if (!visited[index] && isConnectedWhite(data, index)) {
      visited[index] = 1;
      queue[tail++] = index;
    }
  };

  for (let x = 0; x < info.width; x += 1) {
    enqueue(x);
    enqueue((info.height - 1) * info.width + x);
  }
  for (let y = 0; y < info.height; y += 1) {
    enqueue(y * info.width);
    enqueue(y * info.width + info.width - 1);
  }

  while (head < tail) {
    const index = queue[head++];
    const x = index % info.width;
    const y = Math.floor(index / info.width);
    if (x > 0) enqueue(index - 1);
    if (x + 1 < info.width) enqueue(index + 1);
    if (y > 0) enqueue(index - info.width);
    if (y + 1 < info.height) enqueue(index + info.width);
  }

  for (let index = 0; index < pixelCount; index += 1) {
    if (visited[index]) data[index * 4 + 3] = 0;
  }

  return sharp(data, { raw: info })
    .trim({ background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();
}

async function centeredLogo(logo, size, coverage) {
  const resized = await sharp(logo)
    .resize(Math.round(size * coverage), Math.round(size * coverage), {
      fit: 'inside',
      withoutEnlargement: false,
    })
    .png()
    .toBuffer();
  const metadata = await sharp(resized).metadata();

  return sharp({
    create: {
      width: size,
      height: size,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite([{
      input: resized,
      left: Math.round((size - metadata.width) / 2),
      top: Math.round((size - metadata.height) / 2),
    }])
    .png()
    .toBuffer();
}

async function generateDensity(logo, density, sizes) {
  const directory = path.join(resPath, 'mipmap-' + density);
  await fs.mkdir(directory, { recursive: true });

  const foreground = await centeredLogo(logo, sizes.adaptive, 0.62);
  await sharp(foreground)
    .png({ compressionLevel: 9 })
    .toFile(path.join(directory, 'ic_launcher_foreground.png'));

  await sharp({
    create: { width: sizes.adaptive, height: sizes.adaptive, channels: 4, background },
  })
    .png({ compressionLevel: 9 })
    .toFile(path.join(directory, 'ic_launcher_background.png'));

  const legacyLogo = await centeredLogo(logo, sizes.legacy, 0.72);
  const legacy = await sharp({
    create: { width: sizes.legacy, height: sizes.legacy, channels: 4, background },
  })
    .composite([{ input: legacyLogo }])
    .png({ compressionLevel: 9 })
    .toBuffer();

  await sharp(legacy).toFile(path.join(directory, 'ic_launcher.png'));

  const roundBackground = Buffer.from(
    '<svg width="' + sizes.legacy + '" height="' + sizes.legacy + '" viewBox="0 0 ' +
      sizes.legacy + ' ' + sizes.legacy + '">' +
      '<circle cx="' + sizes.legacy / 2 + '" cy="' + sizes.legacy / 2 + '" r="' +
      sizes.legacy / 2 + '" fill="#0f0f1a"/></svg>',
  );
  await sharp(roundBackground)
    .composite([{ input: legacyLogo }])
    .png({ compressionLevel: 9 })
    .toFile(path.join(directory, 'ic_launcher_round.png'));
}

const logo = await extractLogo();
for (const [density, sizes] of Object.entries(densities)) {
  await generateDensity(logo, density, sizes);
}

console.log('Generated Android launcher icons with adaptive safe spacing.');
