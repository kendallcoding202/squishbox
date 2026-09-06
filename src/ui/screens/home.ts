import { BOXES, type Box } from "../../data/boxes";
import { CHARACTER_BY_ID, RARITY_INFO, type Character } from "../../data/characters";
import { describeOdds } from "../../game/odds";
import { systemRng } from "../../game/rng";
import { boxesOpenedToday, canClaimDaily, claimDaily, openBox, ownedCount, type OpenResult } from "../../game/state";
import { CHARACTERS } from "../../data/characters";
import { confetti, h, overlay, toast } from "../dom";
import { dumplingEl } from "../dumpling";
import { store } from "../store";

export function coinsPill(): HTMLElement {
  return h("div", { class: "coins", id: "coins" }, h("i", { class: "dot" }), String(store.state.coins));
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
  const btn = h("button", {
    class: "btn block",
    style: "margin-top:14px",
    disabled: short > 0 || capped,
    onclick: () => startOpen(box),
  }, capped ? "Done for today" : short > 0 ? `Need ${short} more` : `Open · ${box.price}`);
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

/** Box-opening ceremony: three squishes, then the reveal. */
function startOpen(box: Box): void {
  let rolled: OpenResult = { ok: false, reason: "coins" };
  store.update((s) => { rolled = openBox(s, box, systemRng, new Date()); });
  const result = rolled as OpenResult;
  if (!result.ok) { toast(result.reason === "cap" ? "That's enough boxes for today!" : "Not enough coins"); return; }
  const c = CHARACTER_BY_ID.get(result.characterId) as Character;
  const info = RARITY_INFO[c.rarity];

  let taps = 0;
  const dots = [0, 1, 2].map(() => h("i"));
  const glow = h("div", { class: "glow", style: `background:${info.glow}` });
  const mystery = h("div", { class: "mystery", role: "button", "aria-label": "Squish the box" }, box.emoji);
  const stage = h("div", { class: "reveal-stage" }, glow, mystery);
  const title = h("h2", { style: "margin:6px 0 0" }, "Squish it!");
  const sub = h("p", { class: "muted" }, "Tap the box three times");
  const footer = h("div", { style: "margin-top:16px;display:flex;gap:10px;justify-content:center" });
  const sheet = h("div", { class: "sheet" }, stage, h("div", { class: "taps" }, ...dots), title, sub, footer);
  const ov = overlay(sheet);

  const reveal = () => {
    mystery.remove();
    glow.classList.add("on");
    const d = dumplingEl(c, 200, { idle: true });
    d.classList.add("reveal-in");
    stage.appendChild(d);
    title.replaceChildren(c.name, result.isNew ? h("span", { class: "newtag" }, "NEW!") : "");
    sub.replaceChildren(
      h("span", { class: "badge", style: `background:${info.color}` }, info.label), " ",
      h("span", { class: "muted small" }, c.flavor),
    );
    if (c.rarity === "epic" || c.rarity === "legendary") confetti([info.color, info.glow, "#ff8f5e", "#fff"], c.rarity === "legendary" ? 140 : 70);
    const again = h("button", { class: "btn", onclick: () => { ov.remove(); startOpen(box); } }, `Open another · ${box.price}`);
    const s = store.state;
    if (s.coins < box.price || boxesOpenedToday(s, new Date()) >= s.parent.dailyBoxCap) again.disabled = true;
    footer.append(h("button", { class: "btn secondary", onclick: () => ov.remove() }, "Done"), again);
  };

  mystery.addEventListener("pointerdown", () => {
    if (taps >= 3) return;
    taps++;
    dots[taps - 1]?.classList.add("on");
    mystery.classList.remove("hit");
    void mystery.offsetWidth; // restart animation
    mystery.classList.add("hit");
    if (navigator.vibrate) navigator.vibrate(15);
    if (taps === 3) setTimeout(reveal, 250);
  });
}

export function renderHome(): HTMLElement {
  const s = store.state;
  const today = new Date();
  const claimable = canClaimDaily(s, today);
  const owned = ownedCount(s.inventory);

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
        toast(`+${got} coins!`);
        document.getElementById("coins")?.classList.add("bump");
      },
    }, claimable ? "Claim" : "✓"),
  );

  const recent = s.log.filter((l) => l.kind === "open").slice(0, 6).map((l) => l.text.match(/: (.+?) \(/)?.[1]).filter(Boolean) as string[];
  const recentChars = recent.map((name) => CHARACTERS.find((c) => c.name === name)).filter(Boolean) as Character[];

  return h("div", { class: "screen" },
    h("div", { class: "topbar" }, h("h1", null, "Squishbox"), coinsPill()),
    h("p", { class: "muted small", style: "margin-bottom:12px" }, `${owned} of ${CHARACTERS.length} dumplings collected · ${boxesOpenedToday(s, today)} of ${s.parent.dailyBoxCap} boxes today`),
    daily,
    recentChars.length ? h("div", null,
      h("h2", null, "Fresh from the steamer"),
      h("div", { class: "row", style: "overflow-x:auto;gap:6px;padding-bottom:4px" }, ...recentChars.map((c) => dumplingEl(c, 64))),
    ) : null,
    h("h2", null, "Shop"),
    h("p", { class: "muted small", style: "margin:-6px 0 10px" }, "Odds are shown on every box. Coins are free: no real money in this prototype."),
    h("div", { class: "shop-grid" }, ...BOXES.map(boxCard)),
  );
}
