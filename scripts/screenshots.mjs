#!/usr/bin/env node
/**
 * Generates the App Store screenshots in store/screenshots/ from the real web build.
 *
 * The first thing a stranger sees in search results is this set, so each frame is the app
 * itself under a short caption, never a mockup. Run it after any visual change:
 *
 *   npm run screenshots
 *
 * Playwright is not a dependency of the app and CI does not need it, so install it once:
 *
 *   npm i -D playwright && npx playwright install chromium
 *
 * or point PLAYWRIGHT_MODULE at an existing install (a sandbox with a global copy, say).
 *
 * How a frame is built: the app is rendered at the device's logical size with the matching
 * device pixel ratio, so the capture comes out at exactly the pixel size Apple asks for.
 * That PNG is then embedded in a caption frame and re-captured at the same size. Nothing is
 * scaled up, and the app pixels are the app's own.
 */
import { mkdir, readdir, unlink, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "store", "screenshots");
const PORT = Number(process.env.PORT ?? 4173);
const BASE = `http://127.0.0.1:${PORT}`;

/** Apple's required sizes, as logical viewport times device pixel ratio. */
const DEVICES = [
  { id: "iphone69", width: 440, height: 956, scale: 3 }, // 1320 x 2868
  { id: "ipad13", width: 1032, height: 1376, scale: 2 }, // 2064 x 2752
];

/** Fraction of the frame width the app screenshot occupies, leaving room for the caption. */
const IMG_FRACTION = 0.84;

async function loadPlaywright() {
  for (const spec of [process.env.PLAYWRIGHT_MODULE, "playwright"].filter(Boolean)) {
    try {
      return (await import(spec)).chromium;
    } catch {
      /* try the next one */
    }
  }
  console.error("Playwright not found. Install it once with:\n  npm i -D playwright && npx playwright install chromium\nor set PLAYWRIGHT_MODULE to an existing install.");
  process.exit(1);
}

function dayKey(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/**
 * A collection worth photographing: part way through series one, series two earned, a few
 * finishes to show what the fuss is about, and a buddy far enough along to have furnished
 * its room. Item keys carry the finish as a suffix (c10x is a gold Sesame); see
 * src/game/finishes.ts.
 */
function seedSave(now = new Date()) {
  const t = now.getTime();
  const today = dayKey(now);
  return {
    version: 1,
    playerName: "You",
    coins: 265,
    // Ten of these are spares (two or more), which is what the trade picker lists: enough to
    // fill its grid, and with a finish or two in there to show what a spare can be worth.
    inventory: {
      c01: 3, c02: 1, c03: 2, c05: 2, c06: 1, c09: 2, c11: 2, c12: 1,
      u01: 1, u03: 2, u05: 1, r02: 2, r05: 1, e02: 1,
      c04g: 1, u02g: 2, r01g: 1,
      c07r: 2, u08r: 1, e01r: 1,
      c10x: 2, r04x: 1, l01x: 1,
    },
    lastDailyClaim: null,
    streak: 4,
    clockHighWater: t,
    unlockedSeries: ["s1", "s2"],
    appliedDeliveries: [],
    buddy: { characterId: "l01", since: t - 20 * 864e5, visits: 14, lastVisitDay: today, momentIndex: 2 },
    boxesToday: { day: today, count: 3 },
    stats: { boxesOpened: 47, coinsEarned: 520, coinsSpent: 430, tradesCompleted: 6, tradesDeclined: 2, coinsFromSales: 34 },
    log: [
      { t: t - 3e5, kind: "open", text: "Opened Steamer Basket: Mochi (common)" },
      { t: t - 5e5, kind: "open", text: "Opened Golden Basket: Mintie (rare) NEW" },
      { t: t - 12e5, kind: "reward", text: "Album reward: Collect 5 different dumplings (+15 coins)" },
      { t: t - 24e5, kind: "open", text: "Opened Steamer Basket: Snowball (common)" },
      { t: t - 36e5, kind: "trade", text: "Traded Pip to Mika for Sprout" },
      { t: t - 72e5, kind: "sell", text: "Sold a spare Dough to the Steam Pot for 2 coins" },
      { t: t - 108e5, kind: "open", text: "Opened Steamer Basket: Taro (common) NEW" },
      { t: t - 144e5, kind: "buddy", text: "Golden Dumpling is my buddy now" },
      { t: t - 936e5, kind: "daily", text: "Claimed 35 coins (day 4 streak)" },
    ],
    parent: { pin: "1234", tradingEnabled: true, dailyBoxCap: 10, onlineTrading: false, buddyEnabled: true },
    bots: {},
    settings: { sound: true },
    pity: 6,
    nicknames: { c04: "Bouncy" },
    rewardsClaimed: ["first5"],
    onboarded: true,
    shelf: ["l01", "c10", "u08", "c04"],
    celebrated: ["s2"],
    net: null,
  };
}

/** Scroll a heading to the top of the viewport so the shot is framed on that section. */
async function scrollToHeading(page, text, offset = 16) {
  await page.evaluate(({ text, offset }) => {
    const el = [...document.querySelectorAll("h1, h2")].find((h) => h.textContent.trim() === text);
    if (el) window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - offset);
  }, { text, offset });
  await page.waitForTimeout(400);
}

/**
 * `**marked**` text is drawn in the accent colour, and a newline is a line break. Keep
 * captions to two short lines: they are read at thumbnail size in search results.
 */
const SHOTS = [
  {
    name: "open",
    caption: "Open it.\n**See what you got.**",
    // The pull is forced to the best possible outcome (see forceLuckiestRoll) so this frame
    // is the same every run rather than whatever the odds happened to give.
    lucky: true,
    async prepare(page) {
      await page.click(".box-card >> nth=0 >> button.btn");
      await page.waitForSelector(".mystery");
      for (let i = 0; i < 3; i++) {
        await page.dispatchEvent(".reveal-stage", "pointerdown").catch(() => page.dispatchEvent(".mystery", "pointerdown"));
        await page.waitForTimeout(260);
      }
      await page.waitForSelector(".reveal-in");
      // The sheet is fixed; this only tidies the dimmed page showing through behind it,
      // which the click had scrolled half way down.
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.waitForTimeout(1500); // let the confetti spread and the dumpling settle
    },
  },
  {
    name: "noads",
    caption: "No ads. No purchases.\n**No accounts.**",
    async prepare(page) {
      await scrollToHeading(page, "Shop");
    },
  },
  {
    name: "collection",
    caption: "**Fifty to collect.**\nSome come out gold.",
    hash: "collection",
    async prepare(page) {
      await page.waitForSelector(".grid .tile");
      await page.waitForTimeout(300);
    },
  },
  {
    name: "buddy",
    caption: "Pick one\n**to look after.**",
    hash: "buddy",
    async prepare(page) {
      await page.waitForSelector(".room");
      await page.waitForTimeout(500);
    },
  },
  {
    name: "trade",
    caption: "Trade your spares\n**with the neighbors.**",
    hash: "trade",
    async prepare(page) {
      await page.waitForSelector(".neighbors");
      await page.click(".neighbors .neighbor >> text=Trade >> nth=0");
      await page.waitForSelector(".trade-cols");
      // One from each side, so the frame shows a real swap and the fairness read on it.
      await page.click(".trade-col >> nth=0 >> text=+ Add");
      await page.waitForSelector(".picker .tile");
      await page.click(".picker .tile >> nth=0");
      await page.click(".trade-col >> nth=1 >> text=+ Add");
      await page.waitForSelector(".picker .tile");
      await page.click(".picker .tile >> nth=0");
      // Leave the spare picker open over the swap. The trade screen alone is short enough to
      // leave the bottom half of the frame empty, and the picker both fills it and shows the
      // finishes a kid has to trade.
      await page.click(".trade-col >> nth=0 >> text=+ Add");
      await page.waitForSelector(".picker .tile");
      await page.waitForTimeout(600);
    },
  },
  {
    name: "parents",
    caption: "A corner\n**for grown-ups.**",
    hash: "parents",
    async prepare(page) {
      await page.fill("input[type=password]", "1234");
      await page.click("text=Unlock");
      await page.waitForSelector("text=Activity");
      await page.waitForTimeout(300);
    },
  },
];

/**
 * Feeds the game's only source of randomness a fixed sequence, so the hero frame is the same
 * every run instead of whatever the odds happened to give. openBox draws three times in
 * order: the rarity, which character of that rarity, and the finish.
 *
 *   0.98  -> epic (the table is common 62, uncommon 26, rare 9, epic 2.5, legendary 0.5)
 *   0.10  -> the first epic, Royal Bao
 *   0.999 -> gold (plain 90, glitter 7, rainbow 2.5, gold 0.5)
 *
 * Deliberately not the legendary: it is called Golden Dumpling, and a gold one labels itself
 * "Gold Golden Dumpling", which reads like a bug on the one frame most people will ever see.
 */
const FORCED_ROLLS = [0.98, 0.1, 0.999];

const forceHeroRoll = (rolls) => {
  const real = crypto.getRandomValues.bind(crypto);
  let i = 0;
  crypto.getRandomValues = (arr) => {
    if (arr instanceof Uint32Array && arr.length === 1) {
      const v = rolls[i++ % rolls.length];
      arr[0] = Math.min(0xffffffff, Math.floor(v * 4294967296));
      return arr;
    }
    return real(arr);
  };
};

function captionHtml(caption) {
  const escaped = caption.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]);
  return escaped.replace(/\*\*(.+?)\*\*/gs, "<em>$1</em>").replace(/\n/g, "<br>");
}

function frameHtml({ width, height, png, caption }) {
  const imgW = Math.round(width * IMG_FRACTION);
  const gap = Math.round(height * 0.012);
  const capH = height - Math.round(height * IMG_FRACTION) - gap;
  const fontSize = Math.round(width * 0.062);
  return `<!doctype html><meta charset="utf-8"><style>
    *{margin:0;padding:0;box-sizing:border-box}
    html,body{width:${width}px;height:${height}px;overflow:hidden}
    body{
      background:
        radial-gradient(110% 60% at 50% -8%, #fffaf2 0%, rgba(255,250,242,0) 62%),
        linear-gradient(180deg, #fff4e6 0%, #ffe6ca 100%);
      font-family: ui-rounded,"SF Pro Rounded","Nunito","Segoe UI Variable",system-ui,-apple-system,sans-serif;
      display:flex; flex-direction:column; align-items:center;
    }
    .cap{height:${capH}px; display:flex; align-items:center; justify-content:center; padding:0 ${Math.round(width * 0.07)}px}
    .cap h1{font-size:${fontSize}px; line-height:1.12; font-weight:800; color:#2b2118; letter-spacing:-0.025em; text-align:center}
    .cap em{font-style:normal; color:#ff8f5e}
    .shot{width:${imgW}px; border-radius:${Math.round(width * 0.04)}px; overflow:hidden;
      box-shadow:0 ${Math.round(height * 0.012)}px ${Math.round(height * 0.03)}px rgba(90,60,20,.22);
      outline:1px solid rgba(90,60,20,.07); outline-offset:-1px}
    .shot img{display:block; width:100%}
  </style>
  <div class="cap"><h1>${captionHtml(caption)}</h1></div>
  <div class="shot"><img src="data:image/png;base64,${png}"></div>`;
}

async function waitForServer(url, timeoutMs = 60000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`Preview server never came up at ${url}`);
}

async function main() {
  const chromium = await loadPlaywright();
  await mkdir(OUT, { recursive: true });

  const server = spawn("npx", ["vite", "preview", "--port", String(PORT), "--strictPort"], {
    cwd: ROOT,
    stdio: "ignore",
    detached: false,
  });
  const stop = () => { try { server.kill("SIGTERM"); } catch { /* already gone */ } };
  process.on("exit", stop);
  process.on("SIGINT", () => { stop(); process.exit(130); });

  let browser;
  try {
    await waitForServer(BASE);
    browser = await chromium.launch();
    const save = seedSave();

    // Clear the previous set so a renamed shot cannot leave a stale file behind.
    for (const f of await readdir(OUT)) if (f.endsWith(".png")) await unlink(join(OUT, f));

    for (const device of DEVICES) {
      for (const [i, shot] of SHOTS.entries()) {
        const ctx = await browser.newContext({
          viewport: { width: device.width, height: device.height },
          deviceScaleFactor: device.scale,
          hasTouch: true,
          isMobile: true,
          reducedMotion: "no-preference",
        });
        if (shot.lucky) await ctx.addInitScript(forceHeroRoll, FORCED_ROLLS);
        const page = await ctx.newPage();
        const errors = [];
        page.on("pageerror", (e) => errors.push(String(e.message)));

        const hash = shot.hash ?? "home";
        await page.goto(`${BASE}/#${hash}`);
        await page.evaluate((s) => localStorage.setItem("squishbox.save.v1", JSON.stringify(s)), save);
        await page.reload();
        await page.waitForSelector(".screen");
        await page.waitForTimeout(400);
        await shot.prepare(page);

        const png = (await page.screenshot()).toString("base64");
        if (errors.length) console.warn(`  ! ${device.id}-${shot.name}: ${errors.join("; ")}`);

        const frame = await browser.newPage({
          viewport: { width: device.width * device.scale, height: device.height * device.scale },
          deviceScaleFactor: 1,
        });
        await frame.setContent(frameHtml({
          width: device.width * device.scale,
          height: device.height * device.scale,
          png,
          caption: shot.caption,
        }));
        await frame.waitForTimeout(250);
        const file = join(OUT, `${device.id}-${i + 1}-${shot.name}.png`);
        await frame.screenshot({ path: file });
        await frame.close();
        await ctx.close();
        console.log(`  ${device.id}-${i + 1}-${shot.name}.png  ${device.width * device.scale}x${device.height * device.scale}`);
      }
    }
  } finally {
    if (browser) await browser.close();
    stop();
  }
  console.log(`\nWrote ${DEVICES.length * SHOTS.length} screenshots to store/screenshots/`);
}

await main();
