#!/usr/bin/env node
// Write art-work/jobs.json: one entry per picture the game needs, each with its prompt,
// reference image, size and background. Read by generate.py.
//
// Reads the game's own data (characters, boxes, the buddy's places), so a new dumpling or a
// new prop shows up here without anyone remembering to add it.
import { build } from "esbuild";
import { mkdirSync, writeFileSync } from "node:fs";
import { BOXES, PLACES, PROPS, STYLE, dumplingPrompt } from "./spec.mjs";

const root = new URL("../../", import.meta.url);
async function load(entry) {
  const out = await build({ entryPoints: [new URL(entry, root).pathname], bundle: true, format: "esm", platform: "neutral", write: false, logLevel: "silent" });
  return import(`data:text/javascript;base64,${Buffer.from(out.outputFiles[0].text).toString("base64")}`);
}

const { CHARACTERS } = await load("src/data/characters.ts");
const { BOXES: GAME_BOXES } = await load("src/data/boxes.ts");
const { SPOTS, PLACES: GAME_PLACES } = await load("src/game/room.ts");

const jobs = [];
const add = (group, id, prompt, ref, { size = "1024x1024", background = "transparent" } = {}) =>
  jobs.push({ key: `${group}/${id}`, group, id, prompt, ref, size, background });

for (const c of CHARACTERS) add("dumplings", c.id, dumplingPrompt(c), "dumpling.png");

for (const b of GAME_BOXES) {
  if (!BOXES[b.id]) throw new Error(`No art description for the box "${b.id}" in scripts/art/spec.mjs`);
  add("boxes", b.id, `${STYLE.STYLE_THING} ${BOXES[b.id]}`, "dumpling.png");
}

const needed = SPOTS.filter((s) => s.glyph || s.seat).map((s) => s.id);
for (const id of [...needed, "bowl-full", "cup-full", "window"]) {
  const p = PROPS[id];
  if (!p) throw new Error(`No art description for the prop "${id}" in scripts/art/spec.mjs`);
  const wide = typeof p === "object" && p.wide;
  add("props", id, `${STYLE.STYLE_THING} ${typeof p === "object" ? p.text : p}`, "scenery.png", { size: wide ? "1536x1024" : "1024x1024" });
}

for (const p of GAME_PLACES) {
  if (!PLACES[p.id]) throw new Error(`No art description for the place "${p.id}" in scripts/art/spec.mjs`);
  add("rooms", p.id, `${STYLE.STYLE_PLACE} ${PLACES[p.id]}`, "scenery.png", { size: "1536x1024", background: "opaque" });
}

mkdirSync(new URL("art-work/", root), { recursive: true });
writeFileSync(new URL("art-work/jobs.json", root), JSON.stringify(jobs, null, 1));
const counts = jobs.reduce((m, j) => ({ ...m, [j.group]: (m[j.group] ?? 0) + 1 }), {});
console.log(`${jobs.length} pictures:`, counts);
