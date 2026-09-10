import { RARITIES, RARITY_INFO, SERIES, SERIES_BY_ID, charactersInSeries, type Character, type Rarity, type SeriesId } from "../../data/characters";
import { displayName, NICKNAME_MAX, onShelf, ownedInSeries, sellSpare, sellValue, seriesUnlocked, seriesUnlockProgress, setNickname, SHELF_MAX, toggleShelf, totalItems, chooseBuddy, setBuddyAside} from "../../game/state";
import { nextMilestone, reached } from "../../game/buddy";
import { FINISH_INFO, FINISHES, itemKey, SPECIAL_FINISHES, type Finish } from "../../game/finishes";
import { confetti, h, onTap, overlay, toast } from "../dom";
import { dumplingEl } from "../dumpling";
import { coin, haptic } from "../sound";
import { store } from "../store";

let filter: Rarity | "all" = "all";
let series: SeriesId = "s1";

/** Every finish of one character that the basket actually contains, best first. */
function ownedFinishes(inv: Record<string, number>, characterId: string): { finish: Finish; n: number }[] {
  return [...SPECIAL_FINISHES, "plain" as Finish]
    .map((finish) => ({ finish, n: inv[itemKey(characterId, finish)] ?? 0 }))
    .filter((x) => x.n > 0);
}

/** What to show on the shelf and in the grid: the fanciest one you own. */
function bestFinish(inv: Record<string, number>, characterId: string): Finish {
  return ownedFinishes(inv, characterId)[0]?.finish ?? "plain";
}

function totalOf(inv: Record<string, number>, characterId: string): number {
  return FINISHES.reduce((a, f) => a + (inv[itemKey(characterId, f)] ?? 0), 0);
}

function finishTag(finish: Finish): HTMLElement | null {
  return finish === "plain" ? null : h("span", { class: `finish-tag ${finish}` }, FINISH_INFO[finish].label);
}

/** The big single-dumpling sheet: name it, shelve it, sell a spare. Also opened from the home screen. */
export function detail(c: Character, startFinish?: Finish): void {
  const info = RARITY_INFO[c.rarity];
  // Which finish of this dumpling the sheet is showing. Naming is shared across all of them;
  // shelving and selling are per finish, because a gold spare is not a plain spare.
  let finish: Finish = startFinish ?? bestFinish(store.state.inventory, c.id);
  const render = (): HTMLElement => {
    const s = store.state;
    const owned = ownedFinishes(s.inventory, c.id);
    if (!owned.some((o) => o.finish === finish)) finish = owned[0]?.finish ?? "plain";
    const item = itemKey(c.id, finish);
    const count = s.inventory[item] ?? 0;
    const nick = s.nicknames[c.id];
    const nameInput = h("input", { type: "text", maxlength: String(NICKNAME_MAX), placeholder: c.name, value: nick ?? "", "aria-label": "Nickname", autocomplete: "off", autocapitalize: "words" }) as HTMLInputElement;
    const saveNick = () => {
      let clean = "";
      store.update((st) => { clean = setNickname(st, c.id, nameInput.value); });
      toast(clean ? `Named ${clean}!` : "Nickname cleared");
      haptic("light");
      swap();
    };
    nameInput.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); saveNick(); } });

    let armed = false;
    const sellBtn = h("button", { class: "btn sm secondary", disabled: count < 2 }, `Sell a spare · +${sellValue(item)}`);
    sellBtn.addEventListener("click", () => {
      if (!armed) {
        armed = true;
        sellBtn.textContent = "Tap again to sell";
        sellBtn.classList.add("bad");
        setTimeout(() => { armed = false; sellBtn.textContent = `Sell a spare · +${sellValue(item)}`; sellBtn.classList.remove("bad"); }, 2500);
        return;
      }
      const box: { r: ReturnType<typeof sellSpare> } = { r: { ok: false } };
      store.update((st) => { box.r = sellSpare(st, item, Date.now()); });
      if (box.r.ok) { coin(); haptic("success"); toast(`+${box.r.coins} coins from the Steam Pot`); confetti(["#ffd23f", "#fff"], 25); }
      swap();
    });

    const shelved = onShelf(s, item);
    const shelfBtn = h("button", { class: "btn sm" + (shelved ? " secondary" : ""), onclick: () => {
      let r: ReturnType<typeof toggleShelf> = "full";
      store.update((st) => { r = toggleShelf(st, item); });
      if (r === "full") toast(`Shelf is full (${SHELF_MAX}). Take one off first.`);
      else { haptic("light"); toast(r === "added" ? "On the shelf!" : "Off the shelf"); }
      swap();
    } }, shelved ? "Take off shelf" : "⭐ Put on shelf");

    const isBuddy = s.buddy?.characterId === c.id;

    // What turning up has actually earned. Only shown for the buddy, and only once there is
    // something to show — an empty "nothing yet" list would read as a chore list.
    const b = isBuddy ? s.buddy : null;
    const done = b ? reached(b) : [];
    const upcoming = b ? nextMilestone(b) : null;
    const milestones = b && done.length ? h("div", { class: "card", style: "margin-top:14px;text-align:left" },
      h("h3", null, `What ${displayName(s, c.id)} has learned`),
      h("ul", { class: "milestones" }, ...done.map((m) => h("li", null, h("span", null, "✓"), h("span", null, m.label)))),
      upcoming ? h("p", { class: "muted small", style: "margin-top:8px" }, `Next: something new in ${upcoming.visits - b.visits} more day${upcoming.visits - b.visits > 1 ? "s" : ""}.`) : null,
    ) : null;

    const buddyBtn = s.parent.buddyEnabled ? h("button", { class: "btn sm" + (isBuddy ? " secondary" : ""), onclick: () => {
      store.update((st) => { if (isBuddy) setBuddyAside(st, new Date()); else chooseBuddy(st, c.id, new Date()); });
      haptic("light");
      toast(isBuddy ? `${c.name} went back in the basket` : `${c.name} is your buddy!`);
      swap();
    } }, isBuddy ? "Not my buddy any more" : "\u{1F49B} Make my buddy") : null;

    return h("div", { class: "sheet" },
      h("div", { class: "reveal-stage" }, h("div", { class: "glow on", style: `background:${info.glow}` }), dumplingEl(c, 200, { idle: true, fullSquish: true, finish })),
      h("h2", { style: "margin-top:4px" }, nick ?? c.name),
      h("p", null, nick ? h("span", { class: "muted small" }, `(${c.name}) `) : null, h("span", { class: "badge", style: `background:${info.color}` }, info.label), " ", finishTag(finish), " ", h("span", { class: "pill" }, `×${count}`)),
      owned.length > 1 ? h("div", { class: "chips", style: "justify-content:center;margin-top:8px" }, ...owned.map(({ finish: f, n }) =>
        h("button", { class: "chip" + (f === finish ? " on" : ""), "aria-pressed": f === finish ? "true" : "false", onclick: () => { finish = f; swap(); } },
          `${FINISH_INFO[f].label} ×${n}`))) : null,
      h("p", { class: "muted", style: "margin-top:10px" }, c.flavor),
      h("p", { class: "muted small", style: "margin-top:6px" }, "Press and drag to squish!"),
      h("div", { class: "row", style: "margin-top:14px;gap:8px" }, nameInput, h("button", { class: "btn sm", onclick: saveNick }, "Name")),
      h("div", { class: "row", style: "margin-top:10px;gap:8px;justify-content:center;flex-wrap:wrap" }, shelfBtn, buddyBtn),
      milestones,
      h("div", { class: "row between", style: "margin-top:12px" },
        h("div", { class: "small muted grow", style: "text-align:left" }, count >= 2 ? `You have ${count - 1} spare${count > 2 ? "s" : ""}. The Steam Pot pays ${sellValue(item)} coins each.` : `Get a second ${finish === "plain" ? "one" : FINISH_INFO[finish].label.toLowerCase() + " one"} to trade or sell it.`),
        sellBtn,
      ),
      h("button", { class: "btn secondary block", style: "margin-top:14px", onclick: () => ov.remove() }, "Close"),
    );
  };
  let sheet = render();
  const ov = overlay(sheet);
  const swap = () => { const next = render(); sheet.replaceWith(next); sheet = next; };
}

export function renderCollection(): HTMLElement {
  const s = store.state;
  const unlocked = seriesUnlocked(s, series);
  const list = charactersInSeries(series).filter((c) => filter === "all" || c.rarity === filter);
  const seriesChips = SERIES.map((ser) => h("button", { class: "chip" + (series === ser.id ? " on" : ""), onclick: () => { series = ser.id; rerender(); } }, `${seriesUnlocked(s, ser.id) ? "" : "🔒 "}${ser.name}`));
  const chips = [h("button", { class: "chip" + (filter === "all" ? " on" : ""), onclick: () => { filter = "all"; rerender(); } }, "All"),
    ...RARITIES.map((r) => h("button", {
      class: "chip" + (filter === r ? " on" : ""),
      style: filter === r ? `background:${RARITY_INFO[r].color}` : "",
      onclick: () => { filter = r; rerender(); },
    }, RARITY_INFO[r].label))];

  const tiles = list.map((c) => {
    // One tile per dumpling however many finishes of it you have: the album is about
    // characters. The tile wears the best finish so a gold one is visible from the grid.
    const n = unlocked ? totalOf(s.inventory, c.id) : 0;
    const info = RARITY_INFO[c.rarity];
    const best = n ? bestFinish(s.inventory, c.id) : "plain";
    const art = dumplingEl(c, 80, { finish: best, decorative: true });
    const shelved = FINISHES.some((f) => onShelf(s, itemKey(c.id, f)));
    const finishNote = best === "plain" ? "" : `, ${FINISH_INFO[best].label.toLowerCase()}`;
    const tile = h("div", {
      class: "tile" + (n ? "" : " locked"),
      style: `border-bottom:4px solid ${info.color}`,
      role: "button", tabindex: n ? "0" : "-1",
      "aria-label": n ? `${displayName(s, c.id)}, ${info.label}${finishNote}, owned ${n}` : `Unknown ${info.label} dumpling`,
    },
      n > 1 ? h("span", { class: "count" }, `×${n}`) : null,
      shelved ? h("span", { class: "star" }, "⭐") : null,
      art,
      h("div", { class: "name" }, n ? displayName(s, c.id) : "???"),
    );
    if (n) onTap(tile, () => detail(c, best));
    return tile;
  });

  const [have, need] = seriesUnlockProgress(s, series);
  const from = SERIES_BY_ID.get(series)?.unlockFrom;
  return h("div", { class: "screen" },
    h("div", { class: "topbar" }, h("h1", null, "Collection"), h("span", { class: "pill" }, `${ownedInSeries(s.inventory, series)} / ${charactersInSeries(series).length}`)),
    h("p", { class: "muted small", style: "margin-bottom:8px" }, unlocked
      ? `${totalItems(s.inventory)} dumplings in your basket. Tap one to name it, shelve it, or sell a spare.`
      : `Locked. Collect ${need} different ${from ? SERIES_BY_ID.get(from)?.name : ""} to unlock. ${have} / ${need} so far.`),
    h("div", { class: "chips", style: "padding-bottom:4px" }, ...seriesChips),
    h("div", { class: "chips" }, ...chips),
    h("div", { class: "grid" + (unlocked ? "" : " locked-series") }, ...tiles),
  );
}

let rerender: () => void = () => {};
export function onCollectionRerender(fn: () => void): void { rerender = fn; }
