import { CHARACTERS, RARITIES, RARITY_INFO, type Character, type Rarity } from "../../data/characters";
import { ownedCount, totalItems } from "../../game/state";
import { h, overlay } from "../dom";
import { dumplingEl } from "../dumpling";
import { store } from "../store";

let filter: Rarity | "all" = "all";

function detail(c: Character, count: number): void {
  const info = RARITY_INFO[c.rarity];
  const ov = overlay(h("div", { class: "sheet" },
    h("div", { class: "reveal-stage" }, h("div", { class: "glow on", style: `background:${info.glow}` }), dumplingEl(c, 200, { idle: true })),
    h("h2", { style: "margin-top:4px" }, c.name),
    h("p", null, h("span", { class: "badge", style: `background:${info.color}` }, info.label), " ", h("span", { class: "pill" }, `×${count}`)),
    h("p", { class: "muted", style: "margin-top:10px" }, c.flavor),
    h("p", { class: "muted small", style: "margin-top:6px" }, "Squish me!"),
    h("button", { class: "btn secondary block", style: "margin-top:16px", onclick: () => ov.remove() }, "Close"),
  ));
}

export function renderCollection(): HTMLElement {
  const s = store.state;
  const list = CHARACTERS.filter((c) => filter === "all" || c.rarity === filter);
  const chips = [h("button", { class: "chip" + (filter === "all" ? " on" : ""), onclick: () => { filter = "all"; rerender(); } }, "All"),
    ...RARITIES.map((r) => h("button", {
      class: "chip" + (filter === r ? " on" : ""),
      style: filter === r ? `background:${RARITY_INFO[r].color}` : "",
      onclick: () => { filter = r; rerender(); },
    }, RARITY_INFO[r].label))];

  const tiles = list.map((c) => {
    const n = s.inventory[c.id] ?? 0;
    const info = RARITY_INFO[c.rarity];
    return h("button", {
      class: "tile" + (n ? "" : " locked"),
      style: `border-bottom:4px solid ${info.color}`,
      onclick: () => n && detail(c, n),
      "aria-label": n ? `${c.name}, ${info.label}, owned ${n}` : `Unknown ${info.label} dumpling`,
    },
      n > 1 ? h("span", { class: "count" }, `×${n}`) : null,
      dumplingEl(c, 80),
      h("div", { class: "name" }, n ? c.name : "???"),
    );
  });

  return h("div", { class: "screen" },
    h("div", { class: "topbar" }, h("h1", null, "Collection"), h("span", { class: "pill" }, `${ownedCount(s.inventory)} / ${CHARACTERS.length}`)),
    h("p", { class: "muted small", style: "margin-bottom:8px" }, `${totalItems(s.inventory)} dumplings in your basket. Spares can be traded.`),
    h("div", { class: "chips" }, ...chips),
    h("div", { class: "grid" }, ...tiles),
  );
}

let rerender: () => void = () => {};
export function onCollectionRerender(fn: () => void): void { rerender = fn; }
