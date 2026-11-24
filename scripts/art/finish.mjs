#!/usr/bin/env node
// Turn the raw generated pictures in art-work/raw/ into the files the game ships, in src/art/.
//
// - Dumplings are trimmed to their outline and set on a 512 square, centred and standing on
//   the same line, so every character sits the same way in a tile and on the buddy's floor.
// - Props and baskets are trimmed and fitted to a small square (wide props to a wide box).
// - Rooms have their wall/floor line found and are cropped so it sits 43% of the way down,
//   which is where the game's layout puts the join between the wall and the floor.
// Everything is written as WebP: a phone does not need 1 MB PNGs.
//
// Needs sharp, which is not a dependency of the game: `npm install --no-save sharp`.
// Usage: node scripts/art/finish.mjs [group ...]
import { mkdirSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";

let sharp;
try { sharp = (await import("sharp")).default; } catch { console.error("Needs sharp: npm install --no-save sharp"); process.exit(1); }

const root = new URL("../../", import.meta.url).pathname;
const raw = join(root, "art-work", "raw");
const out = join(root, "src", "art");
const groups = process.argv.slice(2).length ? process.argv.slice(2) : ["dumplings", "props", "boxes", "rooms"];
const WIDE = new Set(["cushion", "puddle", "grass", "mat"]);

/** Trim to the opaque outline. sharp's trim works from the corner colour, which is fully transparent here. */
async function trimmed(file) {
  const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  let top = info.height, left = info.width, right = -1, bottom = -1;
  for (let y = 0; y < info.height; y++) {
    for (let x = 0; x < info.width; x++) {
      if (data[(y * info.width + x) * 4 + 3] > 24) {
        if (x < left) left = x; if (x > right) right = x;
        if (y < top) top = y; if (y > bottom) bottom = y;
      }
    }
  }
  if (right < 0) throw new Error(`${file} is empty`);
  return sharp(file).extract({ left, top, width: right - left + 1, height: bottom - top + 1 });
}

/** Fit inside box w x h, then place on a canvas of cw x ch, centred horizontally, bottom `pad` from the foot. */
async function place(file, { box: [w, h], canvas: [cw, ch], pad, centreY = false }) {
  const img = await (await trimmed(file)).resize({ width: w, height: h, fit: "inside" }).png().toBuffer();
  const meta = await sharp(img).metadata();
  const left = Math.round((cw - meta.width) / 2);
  const top = centreY ? Math.round((ch - meta.height) / 2) : ch - pad - meta.height;
  return sharp({ create: { width: cw, height: ch, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: img, left, top }]);
}

/** The row where the wall meets the floor: the biggest change in average colour between 30% and 70% down. */
async function horizon(file) {
  const { data, info } = await sharp(file).removeAlpha().resize({ width: 256 }).raw().toBuffer({ resolveWithObject: true });
  const rows = [];
  for (let y = 0; y < info.height; y++) {
    let r = 0, g = 0, b = 0;
    for (let x = 0; x < info.width; x++) { const i = (y * info.width + x) * 3; r += data[i]; g += data[i + 1]; b += data[i + 2]; }
    rows.push([r / info.width, g / info.width, b / info.width]);
  }
  let best = 0, at = Math.round(info.height * 0.43);
  for (let y = Math.round(info.height * 0.3); y < Math.round(info.height * 0.7); y++) {
    const a = rows[y - 2], c = rows[y + 2];
    const d = Math.abs(a[0] - c[0]) + Math.abs(a[1] - c[1]) + Math.abs(a[2] - c[2]);
    if (d > best) { best = d; at = y; }
  }
  return at / info.height;
}

async function run(group, id, file) {
  const dir = join(out, group);
  mkdirSync(dir, { recursive: true });
  const dest = join(dir, `${id}.webp`);
  const webp = { quality: 86, alphaQuality: 92, effort: 5 };
  if (group === "dumplings") {
    await (await place(file, { box: [448, 448], canvas: [512, 512], pad: 16 })).webp(webp).toFile(dest);
  } else if (group === "props") {
    const wide = WIDE.has(id);
    await (await place(file, wide ? { box: [384, 160], canvas: [384, 160], pad: 0, centreY: true } : { box: [240, 240], canvas: [256, 256], pad: 8 })).webp(webp).toFile(dest);
  } else if (group === "boxes") {
    await (await place(file, { box: [300, 300], canvas: [320, 320], pad: 10, centreY: true })).webp(webp).toFile(dest);
  } else if (group === "rooms") {
    const meta = await sharp(file).metadata();
    const h = await horizon(file);
    // Crop from the top so the line lands at 43%: (h*H - t) / (H - t) = 0.43.
    const t = Math.max(0, Math.round((h * meta.height - 0.43 * meta.height) / 0.57));
    await sharp(file).extract({ left: 0, top: t, width: meta.width, height: meta.height - t })
      .resize({ width: 1200 }).webp({ quality: 80, effort: 5 }).toFile(dest);
    console.log(`  ${id}: wall/floor line found ${Math.round(h * 100)}% down, cropped ${t}px off the top`);
  }
}

for (const group of groups) {
  const dir = join(raw, group);
  if (!existsSync(dir)) continue;
  const files = readdirSync(dir).filter((f) => f.endsWith(".png")).sort();
  for (const f of files) await run(group, f.replace(/\.png$/, ""), join(dir, f));
  console.log(`${group}: ${files.length}`);
}
