import { boxesInSeries, BOXES, type Box } from "../../data/boxes";
import { CHARACTERS, CHARACTER_BY_ID, RARITY_INFO, SERIES, SERIES_BY_ID, charactersInSeries, type Character, type SeriesId } from "../../data/characters";
import { describeOdds } from "../../game/odds";
import { systemRng } from "../../game/rng";
import {
  boxesOpenedToday, canClaimDaily, claimDaily, claimReward, displayName, luckyNext, openBox, ownedCount, ownedInSeries,
  PITY_AT, rewardsForSeries, rewardStatus, seriesUnlocked, seriesUnlockProgress, takeNewUnlocks, type OpenResult,
} from "../../game/state";
import { confetti, h, onTap, overlay, toast } from "../dom";
import { detail } from "./collection";
import { dumplingEl } from "../dumpling";
import { coin, haptic, pop, reveal as revealSound, soundEnabled, thud } from "../sound";
import { store } from "../store";

let shopSeries: SeriesId = "s1";
let rerender: () => void = () => {};
export function onHomeRerender(fn: () => void): void { rerender = fn; }

export function coinsPill(): HTMLElement {
  return h("div", { class: "coins", id: "coins" }, h("i", { class: "dot" }), String(store.state.coins));
}

export function soundToggle(): HTMLElement {
  const on = store.state.settings.sound;
  return h("button", {
    class: "iconbtn", "aria-label": on ? "Sound on" : "Sound off", "aria-pressed": String(on),
    onclick: () => store.update((s) => { s.settings.sound = !s.settings.sound; }),
  }, on ? "🔊" : "🔇");
}

function oddsTable(box: Box): HTMLElement {
  const rows = describeOdds(box).flatMap(({ rarity, percent, oneIn }) => {
    const info = RARITY_INFO[rarity];
    return [
      h("i", { class: "swatch", style: `background:${info.color}` }),
      h("div", { class: "row" }, h("span", { style: "min-width:78px;font-weight:700" }, info.label), h("div", { class: "bar grow" }, h("i", { style: `width:${percent}%;background:${info.color}` }))),
      h("span", { class: "pct" }, `${percent}%`),
      h("span", { class: "onein" }, oneIn ? `1 in ${oneIn}` : "never"),
    ];
  });
  return h("div", { class: "odds", "aria-label": `Odds for ${box.name}` }, ...rows);
}

function boxCard(box: Box): HTMLElement {
  const s = store.state;
  const today = new Date();
  const short = box.price - s.coins;
  const capped = boxesOpenedToday(s, today) >= s.parent.dailyBoxCap;
  const lucky = luckyNext(s);
  const btn = h("button", {
    class: "btn block" + (lucky ? " lucky" : ""),
    style: "margin-top:14px",
    disabled: short > 0 || capped,
    onclick: () => startOpen(box),
  }, capped ? "Done for today" : short > 0 ? `Need ${short} more` : lucky ? `Lucky open! · ${box.price}` : `Open · ${box.price}`);
  return h("div", { class: "card box-card" },
    h("div", { class: "row" },
      h("div", { class: "emoji" }, box.emoji),
      h("div", { class: "grow" }, h("h3", null, box.name), h("p", { class: "muted small" }, box.tagline)),
      h("span", { class: "pill" }, `${box.price} coins`),
    ),
    oddsTable(box),
    btn,
  );
}

/** Box-opening ceremony: three squishes with steam, a rarity tease, then the reveal. */
export function startOpen(box: Box): void {
  let rolled: OpenResult = { ok: false, reason: "coins" };
  store.update((s) => { rolled = openBox(s, box, systemRng, new Date()); });
  const result = rolled as OpenResult;
  if (!result.ok) { toast(result.reason === "cap" ? "That's enough boxes for today!" : result.reason === "locked" ? "That series isn't unlocked yet" : "Not enough coins"); return; }
  const c = CHARACTER_BY_ID.get(result.characterId) as Character;
  const info = RARITY_INFO[c.rarity];
  const rarePlus = c.rarity === "rare" || c.rarity === "epic" || c.rarity === "legendary";

  let taps = 0;
  const dots = [0, 1, 2].map(() => h("i"));
  const glow = h("div", { class: "glow", style: `background:${info.glow}` });
  const mystery = h("div", { class: "mystery", role: "button", "aria-label": "Squish the box", tabindex: "0" }, box.emoji);
  const steam = h("div", { class: "steam" });
  const stage = h("div", { class: "reveal-stage" }, glow, steam, mystery);
  const title = h("h2", { style: "margin:6px 0 0" }, result.lucky ? "Lucky box!" : "Squish it!");
  const sub = h("p", { class: "muted" }, result.lucky ? "A Rare or better is guaranteed. Tap three times!" : "Tap the box three times");
  const footer = h("div", { style: "margin-top:16px;display:flex;gap:10px;justify-content:center" });
  const sheet = h("div", { class: "sheet" + (c.rarity === "legendary" ? " legendary" : "") }, stage, h("div", { class: "taps" }, ...dots), title, sub, footer);
  const ov = overlay(sheet);

  const puff = (n: number) => {
    for (let i = 0; i < n; i++) {
      const p = h("i", { style: `left:${35 + Math.random() * 30}%;animation-delay:${Math.random() * 0.2}s;--dx:${(Math.random() - 0.5) * 60}px` });
      steam.appendChild(p);
      setTimeout(() => p.remove(), 1400);
    }
  };

  const doReveal = () => {
    mystery.remove();
    stage.classList.remove("tappable");
    glow.classList.add("on");
    if (c.rarity === "legendary") ov.classList.add("flash");
    const d = dumplingEl(c, 200, { idle: true, fullSquish: true });
    d.classList.add("reveal-in");
    stage.appendChild(d);
    title.replaceChildren(c.name, result.isNew ? h("span", { class: "newtag" }, "NEW!") : "");
    sub.replaceChildren(
      h("span", { class: "badge", style: `background:${info.color}` }, info.label), " ",
      h("span", { class: "muted small" }, c.flavor),
    );
    pop();
    setTimeout(() => revealSound(c.rarity), 120);
    haptic(rarePlus ? "success" : "medium");
    if (c.rarity === "epic" || c.rarity === "legendary") confetti([info.color, info.glow, "#ff8f5e", "#fff"], c.rarity === "legendary" ? 160 : 70);
    const again = h("button", { class: "btn", onclick: () => { ov.remove(); startOpen(box); } }, `Open another · ${box.price}`);
    const s = store.state;
    if (s.coins < box.price || boxesOpenedToday(s, new Date()) >= s.parent.dailyBoxCap) again.disabled = true;
    footer.append(h("button", { class: "btn secondary", onclick: () => ov.remove() }, "Done"), again);
    if (result.isNew) checkRewards();
  };

  const hit = () => {
    if (taps >= 3) return;
    taps++;
    dots[taps - 1]?.classList.add("on");
    mystery.classList.remove("hit1", "hit2", "hit3");
    void mystery.offsetWidth; // restart animation
    mystery.classList.add(`hit${taps}`);
    thud(0.6 + taps * 0.2);
    haptic(taps === 3 ? "heavy" : "light");
    puff(2 + taps * 2);
    if (taps === 2 && rarePlus) {
      // tease: the glow leaks out before the reveal for a rare or better
      glow.classList.add("tease");
      sub.textContent = "Ooh… something's glowing";
    }
    if (taps === 3) setTimeout(doReveal, 260);
  };
  // The stage takes the taps, not the emoji: it wobbles, and a quick tap that misses it should still count.
  stage.classList.add("tappable");
  stage.addEventListener("pointerdown", hit);
  mystery.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") hit(); });
}

/** Pops a toast when a reward became claimable so the kid knows to look at the album. */
function checkRewards(): void {
  const s = store.state;
  const ready = SERIES.filter((ser) => seriesUnlocked(s, ser.id)).flatMap((ser) => rewardsForSeries(ser.id)).filter((r) => rewardStatus(s, r) === "ready");
  if (ready.length) setTimeout(() => toast(`Album reward ready: ${ready[0]?.label}`), 1200);
}

function luckyMeter(): HTMLElement {
  const s = store.state;
  const n = Math.min(s.pity, PITY_AT - 1);
  const next = luckyNext(s);
  const segs = Array.from({ length: PITY_AT }, (_, i) => h("i", { class: i < n ? "on" : i === n && next ? "on" : "" }));
  return h("div", { class: "card" },
    h("div", { class: "row between" },
      h("div", { class: "grow" },
        h("h3", null, next ? "Lucky meter is full!" : "Lucky meter"),
        h("p", { class: "muted small" }, next ? "Your next box is guaranteed Rare or better." : `A Rare or better is guaranteed by box ${PITY_AT}. ${PITY_AT - 1 - n} to go.`),
      ),
      h("span", { class: "pill" }, `${next ? PITY_AT : n} / ${PITY_AT}`),
    ),
    h("div", { class: "meter" + (next ? " full" : "") }, ...segs),
  );
}

function albumCard(): HTMLElement {
  const s = store.state;
  const rows = SERIES.filter((ser) => seriesUnlocked(s, ser.id)).flatMap((ser) => [
    h("div", { class: "row between", style: "margin-top:10px" }, h("b", { class: "small" }, ser.name), h("span", { class: "small muted" }, `${ownedInSeries(s.inventory, ser.id)} / ${charactersInSeries(ser.id).length}`)),
    ...rewardsForSeries(ser.id).map((r) => {
    const status = rewardStatus(s, r);
    const [have, need] = r.progress(s.inventory);
    const pct = Math.round((have / need) * 100);
    return h("div", { class: "reward " + status },
      h("div", { class: "grow" },
        h("div", { class: "row between" }, h("b", { class: "small" }, r.label), h("span", { class: "small muted" }, status === "claimed" ? "✓ claimed" : `${have} / ${need}`)),
        h("div", { class: "bar" }, h("i", { style: `width:${pct}%` })),
      ),
      status === "ready"
        ? h("button", { class: "btn sm good", onclick: () => { let got = 0; store.update((st) => { got = claimReward(st, r.id, Date.now()); }); coin(); haptic("success"); toast(`+${got} coins!`); confetti(["#3fae7a", "#ffd23f", "#fff"], 40); } }, `+${r.coins}`)
        : h("span", { class: "pill", style: status === "claimed" ? "opacity:.5" : "" }, `+${r.coins}`),
    );
  })]);
  return h("div", { class: "card" }, h("h3", null, "Album goals"), h("p", { class: "muted small" }, "Complete sets to earn coins."), ...rows);
}

function seriesTabs(): HTMLElement {
  const s = store.state;
  return h("div", { class: "chips", style: "padding-top:0" }, ...SERIES.map((ser) => {
    const open = seriesUnlocked(s, ser.id);
    return h("button", { class: "chip" + (shopSeries === ser.id ? " on" : ""), onclick: () => { shopSeries = ser.id; rerender(); } }, `${open ? "" : "🔒 "}${ser.name}`);
  }));
}

/** Locked series: silhouettes of what's coming plus the unlock progress. */
function teaser(id: SeriesId): HTMLElement {
  const s = store.state;
  const ser = SERIES_BY_ID.get(id);
  const [have, need] = seriesUnlockProgress(s, id);
  const from = ser?.unlockFrom ? SERIES_BY_ID.get(ser.unlockFrom)?.name : "";
  const preview = charactersInSeries(id).filter((c) => c.rarity !== "legendary").slice(0, 6);
  return h("div", { class: "card teaser" },
    h("h3", null, `${ser?.name} is coming`),
    h("p", { class: "muted small" }, ser?.tagline),
    h("div", { class: "row", style: "justify-content:center;gap:4px;margin:12px 0" }, ...preview.map((c) => h("div", { class: "silhouette" }, dumplingEl(c, 56)))),
    h("p", { class: "small", style: "font-weight:700" }, `Collect ${need} different ${from} to unlock. ${have} / ${need} so far.`),
    h("div", { class: "bar", style: "height:8px;background:#f3ebe0;border-radius:4px;overflow:hidden;margin-top:6px" }, h("i", { style: `display:block;height:100%;width:${Math.round((have / need) * 100)}%;background:var(--accent)` })),
  );
}

function celebrateUnlock(id: SeriesId): void {
  const ser = SERIES_BY_ID.get(id);
  if (!ser) return;
  confetti(["#8fe0c4", "#ffd23f", "#ff8f5e", "#fff"], 120);
  revealSound("epic"); haptic("success");
  const ov = overlay(h("div", { class: "sheet" },
    h("div", { class: "reveal-stage", style: "height:200px" }, h("div", { class: "glow on", style: "background:#bfeedd" }), dumplingEl(charactersInSeries(id)[0] as Character, 170, { idle: true })),
    h("h2", null, `${ser.name} unlocked!`),
    h("p", { class: "muted", style: "margin-top:8px" }, `${ser.tagline} New boxes are in the shop and there's a new neighbor to trade with.`),
    h("button", { class: "btn block", style: "margin-top:16px", onclick: () => { shopSeries = id; ov.remove(); rerender(); } }, "Show me"),
  ));
}

function shelfSection(): HTMLElement {
  const s = store.state;
  const items = s.shelf.map((id) => CHARACTER_BY_ID.get(id)).filter(Boolean) as Character[];
  return h("div", null,
    h("h2", null, "My shelf"),
    items.length === 0
      ? h("div", { class: "shelf empty" }, h("p", { class: "muted small" }, "Your shelf is empty. Tap a dumpling in your Collection and put it on display."))
      : h("div", { class: "shelf" },
          h("div", { class: "shelf-row" }, ...items.map((c) => {
            const item = h("div", { class: "shelf-item tappable", role: "button", tabindex: "0", "aria-label": `${displayName(s, c.id)}, open details` },
              dumplingEl(c, 72, { idle: true }), h("div", { class: "small", style: "font-weight:800" }, displayName(s, c.id)));
            onTap(item, () => detail(c));
            return item;
          })),
          h("div", { class: "plank" }),
        ),
  );
}

function welcome(): void {
  const first = BOXES[0] as Box;
  const ov = overlay(h("div", { class: "sheet" },
    h("div", { class: "reveal-stage", style: "height:200px" }, h("div", { class: "glow on", style: "background:#ffe08a" }), dumplingEl(CHARACTERS[0] as Character, 170, { idle: true })),
    h("h2", null, "Welcome to Squishbox!"),
    h("p", { class: "muted", style: "margin-top:8px" }, "Open steamer baskets, collect squishy dumplings, and trade your spares. Press a dumpling to squish it. Here are 50 coins to start."),
    h("button", { class: "btn block", style: "margin-top:16px", onclick: () => { store.update((s) => { s.onboarded = true; }); ov.remove(); startOpen(first); } }, "Open my first basket"),
    h("button", { class: "btn ghost block", style: "margin-top:6px", onclick: () => { store.update((s) => { s.onboarded = true; }); ov.remove(); } }, "Look around first"),
  ), () => store.update((s) => { s.onboarded = true; }));
}

export function renderHome(): HTMLElement {
  const s = store.state;
  const today = new Date();
  const claimable = canClaimDaily(s, today);
  const owned = ownedCount(s.inventory);

  if (!s.onboarded && !document.querySelector(".overlay")) setTimeout(welcome, 50);
  const fresh = takeNewUnlocks(s);
  if (fresh.length) { store.persist(); if (!document.querySelector(".overlay")) setTimeout(() => celebrateUnlock(fresh[0] as SeriesId), 400); }

  const daily = h("div", { class: "card row between" },
    h("div", { class: "grow" },
      h("h3", null, claimable ? "Daily coins are ready!" : "Daily coins claimed"),
      h("p", { class: "muted small" }, s.streak > 1 ? `${s.streak} day streak` : claimable ? "Come back every day for a bonus" : "Come back tomorrow"),
    ),
    h("button", {
      class: "btn" + (claimable ? "" : " secondary"),
      disabled: !claimable,
      onclick: () => {
        let got = 0;
        store.update((st) => { got = claimDaily(st, new Date()); });
        coin(); haptic("success");
        toast(`+${got} coins!`);
        document.getElementById("coins")?.classList.add("bump");
      },
    }, claimable ? "Claim" : "✓"),
  );

  const recent = s.log.filter((l) => l.kind === "open").slice(0, 6).map((l) => l.text.match(/: (.+?) \(/)?.[1]).filter(Boolean) as string[];
  const recentChars = recent.map((name) => CHARACTERS.find((c) => c.name === name)).filter(Boolean) as Character[];

  return h("div", { class: "screen" },
    h("div", { class: "topbar" }, h("h1", null, "Squishbox"), h("div", { class: "row", style: "gap:8px" }, soundToggle(), coinsPill())),
    h("p", { class: "muted small", style: "margin-bottom:12px" }, `${owned} of ${CHARACTERS.length} dumplings collected · ${boxesOpenedToday(s, today)} of ${s.parent.dailyBoxCap} boxes today${soundEnabled() ? "" : " · sound off"}`),
    daily,
    shelfSection(),
    recentChars.length ? h("div", null,
      h("h2", null, "Fresh from the steamer"),
      h("div", { class: "row", style: "overflow-x:auto;gap:6px;padding-bottom:4px" }, ...recentChars.map((c) => {
        const item = h("div", { class: "tappable", style: "text-align:center", role: "button", tabindex: "0", "aria-label": `${displayName(s, c.id)}, open details` },
          dumplingEl(c, 64, { inHorizontalScroller: true }), h("div", { class: "small muted" }, displayName(s, c.id)));
        onTap(item, () => detail(c));
        return item;
      })),
    ) : null,
    h("h2", null, "Shop"),
    h("p", { class: "muted small", style: "margin:-6px 0 10px" }, "Odds are shown on every box, and they count the lucky meter. Coins are free: there is no real money in Squishbox."),
    seriesTabs(),
    seriesUnlocked(s, shopSeries) ? h("div", { class: "shop-grid" }, ...boxesInSeries(shopSeries).map(boxCard)) : teaser(shopSeries),
    h("h2", null, "Progress"),
    h("div", { class: "progress-grid" }, luckyMeter(), albumCard()),
  );
}
