#!/usr/bin/env node
// Make an old build write a known save the first time it runs, for the upgrade test only.
// Usage: node seed-old-build.mjs <dist/index.html> <save.json>
import { readFileSync, writeFileSync } from "node:fs";
const [html, saveFile] = process.argv.slice(2);
const save = JSON.stringify(JSON.parse(readFileSync(saveFile, "utf8")));
const seed = `<script>(function(){var K="squishbox.save.v1";if(!localStorage.getItem(K))localStorage.setItem(K,${JSON.stringify(save)});localStorage.setItem("squishbox.test.marker","written by the old build");})();</script>`;
const page = readFileSync(html, "utf8");
if (!page.includes("<head>")) throw new Error("no <head> in " + html);
writeFileSync(html, page.replace("<head>", "<head>" + seed));
console.log("seeded", html);
