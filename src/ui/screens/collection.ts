import { RARITIES, RARITY_INFO, SERIES, SERIES_BY_ID, charactersInSeries, type Character, type Rarity, type SeriesId } from "../../data/characters";
import { displayName, NICKNAME_MAX, onShelf, ownedInSeries, sellSpare, sellValue, seriesUnlocked, seriesUnlockProgress, setNickname, SHELF_MAX, toggleShelf, totalItems } from "../../game/state";
import { confetti, h, overlay, toast } from "../dom";
import { dumplingEl } from "../dumpling";
import { coin, haptic } from "../sound";
import { store } from "../store";

let filter: Rarity | "all" = "all";
let series: SeriesId = "s1";

function detail(c: Character): void {
  const info = RARITY_INFO[c.rarity];
  const render = (): HTMLElement => {
    const s = store.state;
    const count = s.inventory[c.id] ?? 0;
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
    const sellBtn = h("button", { class: "btn sm secondary", disabled: count < 2 }, `Sell a spare · +${sellValue(c.id)}`);
    sellBtn.addEventListener("click", () => {
      if (!armed) {
        armed = true;
        sellBtn.textContent = "Tap again to sell";
        sellBtn.classList.add("bad");
        setTimeout(() => { armed = false; sellBtn.textContent = `Sell a spare · +${sellValue(c.id)}`; sellBtn.classList.remove("bad"); }, 2500);
        return;
      }
      const box: { r: ReturnType<typeof sellSpare> } = { r: { ok: false } };
      store.update((st) => { box.r = sellSpare(st, c.id, Date.now()); });
      if (box.r.ok) { coin(); haptic("success"); toast(`+${box.r.coins} coins from the Steam Pot`); confetti(["#ffd23f", "#fff"], 25); }
      swap();
    });

    const shelved = onShelf(s, c.id);
    const shelfBtn = h("button", { class: "btn sm" + (shelved ? " secondary" : ""), onclick: () => {
      let r: ReturnType<typeof toggleShelf> = "full";
      store.update((st) => { r = toggleShelf(st, c.id); });
      if (r === "full") toast(`Shelf is full (${SHELF_MAX}). Take one off first.`);
      else { haptic("light"); toast(r === "added" ? "On the shelf!" : "Off the shelf"); }
      swap();
    } }, shelved ? "Take off shelf" : "⭐ Put on shelf");

    return h("div", { class: "sheet" },
      h("div", { class: "reveal-stage" }, h("div", { class: "glow on", style: `background:${info.glow}` }), dumplingEl(c, 200, { idle: true })),
      h("h2", { style: "margin-top:4px" }, nick ?? c.name),
      h("p", null, nick ? h("span", { class: "muted small" }, `(${c.name}) `) : null, h("span", { class: "badge", style: `background:${info.color}` }, info.label), " ", h("span", { class: "pill" }, `×${count}`)),
      h("p", { class: "muted", style: "margin-top:10px" }, c.flavor),
      h("p", { class: "muted small", style: "margin-top:6px" }, "Press and drag to squish!"),
      h("div", { class: "row", style: "margin-top:14px;gap:8px" }, nameInput, h("button", { class: "btn sm", onclick: saveNick }, "Name")),
      h("div", { style: "margin-top:10px" }, shelfBtn),
      h("div", { class: "row between", style: "margin-top:12px" },
        h("div", { class: "small muted grow", style: "text-align:left" }, count >= 2 ? `You have ${count - 1} spare${count > 2 ? "s" : ""}. The Steam Pot pays ${sellValue(c.id)} coins each.` : "Get a second one to trade or sell it."),
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
    const n = unlocked ? (s.inventory[c.id] ?? 0) : 0;
    const info = RARITY_INFO[c.rarity];
    const art = dumplingEl(c, 80);
    const tile = h("div", {
      class: "tile" + (n ? "" : " locked"),
      style: `border-bottom:4px solid ${info.color}`,
      role: "button", tabindex: n ? "0" : "-1",
      "aria-label": n ? `${displayName(s, c.id)}, ${info.label}, owned ${n}` : `Unknown ${info.label} dumpling`,
    },
      n > 1 ? h("span", { class: "count" }, `×${n}`) : null,
      onShelf(s, c.id) ? h("span", { class: "star" }, "⭐") : null,
      art,
      h("div", { class: "name" }, n ? displayName(s, c.id) : "???"),
    );
    if (n) {
      // Open details on a tap. A drag (a squish) of more than a few pixels is not a tap.
      let downAt = 0, downX = 0, downY = 0;
      tile.addEventListener("pointerdown", (e) => { downAt = Date.now(); downX = e.clientX; downY = e.clientY; });
      tile.addEventListener("pointerup", (e) => {
        const moved = Math.hypot(e.clientX - downX, e.clientY - downY);
        if (Date.now() - downAt < 400 && moved < 8) detail(c);
      });
      tile.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") detail(c); });
    }
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
