// Regenerates every icon and preview image from the logo mark in src/app/icon.svg.
// Run with: npm run brand
import { readFileSync, writeFileSync } from "node:fs";
import sharp from "sharp";

const root = new URL("../", import.meta.url);
const mark = readFileSync(new URL("src/app/icon.svg", root), "utf8");
const markInner = mark.replace(/^[\s\S]*?<svg[^>]*>/, "").replace(/<\/svg>\s*$/, "");

const png = (svg, size) => sharp(Buffer.from(svg), { density: 384 }).resize(size, size).png().toBuffer();

// favicon.ico for older browsers: PNG images inside an ICO container (16, 32, 48 px).
const sizes = [16, 32, 48];
const images = await Promise.all(sizes.map((size) => png(mark, size)));
const header = Buffer.alloc(6);
header.writeUInt16LE(0, 0);
header.writeUInt16LE(1, 2);
header.writeUInt16LE(images.length, 4);
let offset = 6 + 16 * images.length;
const entries = images.map((image, i) => {
  const entry = Buffer.alloc(16);
  entry.writeUInt8(sizes[i], 0);
  entry.writeUInt8(sizes[i], 1);
  entry.writeUInt16LE(1, 4);
  entry.writeUInt16LE(32, 6);
  entry.writeUInt32LE(image.length, 8);
  entry.writeUInt32LE(offset, 12);
  offset += image.length;
  return entry;
});
writeFileSync(new URL("src/app/favicon.ico", root), Buffer.concat([header, ...entries, ...images]));

// apple-icon: iOS adds its own rounded corners, so use a full-bleed square tile.
const appleSvg = mark.replace('rx="16"', 'rx="0"');
writeFileSync(new URL("src/app/apple-icon.png", root), await png(appleSvg, 180));

// Install icons for the web app manifest.
writeFileSync(new URL("public/icon-192.png", root), await png(mark, 192));
writeFileSync(new URL("public/icon-512.png", root), await png(mark, 512));

// Link preview image (WhatsApp, Slack, X, iMessage…), 1200×630.
const og = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#cbd3dc"/><stop offset="1" stop-color="#b4bfca"/>
    </linearGradient>
    <radialGradient id="coral" cx="0.1" cy="0" r="0.7"><stop offset="0" stop-color="#ff5c35" stop-opacity="0.28"/><stop offset="1" stop-color="#ff5c35" stop-opacity="0"/></radialGradient>
    <radialGradient id="teal" cx="0.95" cy="1" r="0.6"><stop offset="0" stop-color="#0f766e" stop-opacity="0.25"/><stop offset="1" stop-color="#0f766e" stop-opacity="0"/></radialGradient>
  </defs>
  <rect width="1200" height="630" fill="url(#bg)"/>
  <rect width="1200" height="630" fill="url(#coral)"/>
  <rect width="1200" height="630" fill="url(#teal)"/>
  <rect x="80" y="80" width="1040" height="470" rx="40" fill="#f7f9fb"/>
  <g transform="translate(150 185) scale(4)">${markInner}</g>
  <text x="460" y="285" font-family="Georgia, 'Times New Roman', serif" font-size="84" font-weight="700" fill="#0b1420" letter-spacing="-2">ShareAnything</text>
  <text x="462" y="352" font-family="Segoe UI, Helvetica, Arial, sans-serif" font-size="34" fill="#5a6675">Instant shared notes &amp; files.</text>
  <text x="462" y="400" font-family="Segoe UI, Helvetica, Arial, sans-serif" font-size="34" fill="#5a6675">Write together live. Share with a link.</text>
  <circle cx="474" cy="462" r="9" fill="#0f766e"/>
  <text x="494" y="473" font-family="Segoe UI, Helvetica, Arial, sans-serif" font-size="28" font-weight="600" fill="#0f766e">Live</text>
</svg>`;
const ogPng = await sharp(Buffer.from(og)).png().toBuffer();
writeFileSync(new URL("src/app/opengraph-image.png", root), ogPng);
writeFileSync(new URL("src/app/twitter-image.png", root), ogPng);

console.log("Brand assets written.");
