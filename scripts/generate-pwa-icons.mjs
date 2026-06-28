// Generates PWA icons from an inline SVG using sharp.
// Run: node scripts/generate-pwa-icons.mjs
import sharp from "sharp";
import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(root, "public", "icons");

const BG = "#3b82f6";
const BG2 = "#1d4ed8";

// A clean book/Bible glyph on a rounded gradient tile.
// `safe` controls the glyph inset so maskable icons survive platform cropping
// (Android masks to a circle within the 80% safe zone).
function svg({ size, maskable }) {
  const r = maskable ? 0 : Math.round(size * 0.22); // square corners for maskable (full bleed)
  const pad = maskable ? size * 0.22 : size * 0.16; // extra inset inside maskable safe zone
  const w = size - pad * 2;
  const h = w * 0.86;
  const x = (size - w) / 2;
  const y = (size - h) / 2;
  const spine = x + w / 2;
  const stroke = Math.max(2, size * 0.018);
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${BG}"/>
      <stop offset="1" stop-color="${BG2}"/>
    </linearGradient>
  </defs>
  <rect width="${size}" height="${size}" rx="${r}" fill="url(#g)"/>
  <g fill="none" stroke="#ffffff" stroke-width="${stroke}" stroke-linejoin="round" stroke-linecap="round">
    <!-- open book -->
    <path d="M ${x} ${y} Q ${spine} ${y - h * 0.06} ${spine} ${y + h * 0.04}
             L ${spine} ${y + h} Q ${spine} ${y + h * 0.92} ${x} ${y + h} Z" fill="rgba(255,255,255,0.10)"/>
    <path d="M ${x + w} ${y} Q ${spine} ${y - h * 0.06} ${spine} ${y + h * 0.04}
             L ${spine} ${y + h} Q ${spine} ${y + h * 0.92} ${x + w} ${y + h} Z" fill="rgba(255,255,255,0.10)"/>
    <line x1="${spine}" y1="${y + h * 0.04}" x2="${spine}" y2="${y + h}"/>
    <!-- cross on the spine -->
    <line x1="${spine}" y1="${y + h * 0.22}" x2="${spine}" y2="${y + h * 0.5}" stroke-width="${stroke * 1.3}"/>
    <line x1="${spine - w * 0.07}" y1="${y + h * 0.32}" x2="${spine + w * 0.07}" y2="${y + h * 0.32}" stroke-width="${stroke * 1.3}"/>
  </g>
</svg>`;
}

const targets = [
  { name: "icon-192.png", size: 192, maskable: false },
  { name: "icon-512.png", size: 512, maskable: false },
  { name: "icon-192-maskable.png", size: 192, maskable: true },
  { name: "icon-512-maskable.png", size: 512, maskable: true },
  { name: "apple-touch-icon.png", size: 180, maskable: false },
  { name: "icon-badge.png", size: 96, maskable: false },
];

await mkdir(outDir, { recursive: true });
for (const t of targets) {
  const buf = Buffer.from(svg(t));
  await sharp(buf).png().toFile(join(outDir, t.name));
  console.log("wrote", t.name);
}
// Favicon (multi-size PNG is fine for modern browsers; keep at public root).
await sharp(Buffer.from(svg({ size: 32, maskable: false })))
  .png()
  .toFile(join(root, "public", "favicon.png"));
console.log("wrote favicon.png");
