import { BOTS, BOT_BY_ID, botAccepts, botProposal, type Bot } from "../../game/bots";
import { CHARACTERS, CHARACTER_BY_ID, RARITY_INFO, type Character } from "../../data/characters";
import { systemRng } from "../../game/rng";
import { log, type Inventory } from "../../game/state";
import { assess, canConfirm, confirm, createTrade, execute, owns, setOffer, type SideKey, type Trade } from "../../game/trade";
import { confetti, h, overlay, toast } from "../dom";
import { dumplingEl } from "../dumpling";
import { store } from "../store";

/** Screen-local state: one trade at a time. Not persisted, so a reload cancels it (no stuck escrows). */
let active: Trade | null = null;
let partner: Bot | null = null;
let proposals: Trade[] | null = null;
let ticker = 0;
let lastMessage: string | null = null;

let rerender: () => void = () => {};
export function onTradeRerender(fn: () => void): void { rerender = fn; }

function spares(inv: Inventory): [string, number][] {
  return Object.entries(inv).filter(([, n]) => n >= 2);
}

function ensureProposals(): Trade[] {
  if (proposals) return proposals;
  const now = Date.now();
  proposals = BOTS.map((b) => botProposal(b, store.botInventory(b.id), store.state.inventory, now, systemRng)).filter(Boolean) as Trade[];
  return proposals;
}

function openWith(bot: Bot, seed?: Trade): void {
  partner = bot;
  active = seed ?? createTrade(`t-${Date.now()}`, "you", bot.id, Date.now());
  lastMessage = null;
  clearInterval(ticker);
  ticker = window.setInterval(rerender, 250);
  rerender();
}

function closeTrade(): void {
  active = null;
  partner = null;
  clearInterval(ticker);
  rerender();
}

function miniItem(id: string, onRemove?: () => void): HTMLElement {
  const c = CHARACTER_BY_ID.get(id) as Character;
  return h("div", { class: "trade-item" },
    dumplingEl(c, 48),
    h("div", { class: "small", style: "font-weight:800;white-space:nowrap;overflow:hidden;text-overflow:ellipsis" }, c.name),
    onRemove ? h("button", { class: "rm", "aria-label": `Remove ${c.name}`, onclick: onRemove }, "×") : null,
  );
}

/** Pick an item to add to a side. Kids can only offer spares (keeps one of everything, so nobody trades away their whole collection). */
function picker(side: SideKey): void {
  if (!active || !partner) return;
  const t = active;
  const inv = side === "a" ? store.state.inventory : store.botInventory(partner.id);
  const inTrade = new Map<string, number>();
  for (const id of t[side].items) inTrade.set(id, (inTrade.get(id) ?? 0) + 1);
  const options = spares(inv).filter(([id, n]) => n - 1 - (inTrade.get(id) ?? 0) > 0);
  const who = side === "a" ? "your" : `${partner.name}'s`;
  const ov = overlay(h("div", { class: "sheet" },
    h("h2", null, `Add one of ${who} spares`),
    options.length === 0 ? h("p", { class: "muted", style: "margin-top:10px" }, side === "a" ? "You need two of the same dumpling to trade one away." : `${partner.name} has no spares left to give.`) : null,
    h("div", { class: "picker" }, ...options.map(([id, n]) => {
      const c = CHARACTER_BY_ID.get(id) as Character;
      return h("button", { class: "tile", style: `border-bottom:4px solid ${RARITY_INFO[c.rarity].color}`, onclick: () => {
        active = setOffer(t, side, [...t[side].items, id], Date.now());
        ov.remove(); rerender();
      } }, h("span", { class: "count" }, `×${n}`), dumplingEl(c, 56), h("div", { class: "name" }, c.name));
    })),
    h("button", { class: "btn secondary block", style: "margin-top:14px", onclick: () => ov.remove() }, "Cancel"),
  ));
}

function onConfirm(): void {
  if (!active || !partner) return;
  const bot = partner;
  let t = confirm(active, "a", Date.now());
  active = t;
  rerender();
  // The neighbor "thinks" for a moment, then accepts or declines by the same rules a real friend would face.
  setTimeout(() => {
    if (!active || active.id !== t.id) return;
    const botInv = store.botInventory(bot.id);
    if (botAccepts(bot, t, "b", botInv) && owns(store.state.inventory, t.a.items) && owns(botInv, t.b.items)) {
      t = confirm(t, "b", Date.now());
      const r = execute(t, store.state.inventory, botInv);
      store.update((s) => {
        s.inventory = r.invA;
        s.bots[bot.id] = r.invB;
        s.stats.tradesCompleted += 1;
        const gave = t.a.items.map((id) => CHARACTER_BY_ID.get(id)?.name).join(", ") || "nothing";
        const got = t.b.items.map((id) => CHARACTER_BY_ID.get(id)?.name).join(", ") || "nothing";
        log(s, "trade", `Traded ${gave} to ${bot.name} for ${got}`, Date.now());
      });
      proposals = null;
      confetti(["#3fae7a", "#ffd23f", "#ff8f5e"], 50);
      toast(`Trade complete with ${bot.name}!`);
      closeTrade();
    } else {
      active = setOffer(t, "b", t.b.items, Date.now()); // resets both confirmations so the kid can edit
      store.update((s) => { s.stats.tradesDeclined += 1; });
      lastMessage = `${bot.name} said no thanks. ${bot.minRatio > 1 ? `${bot.name} only trades up.` : "Try adding a bit more, or ask for less."}`;
      rerender();
    }
  }, 900 + Math.random() * 600);
}

function tradeView(): HTMLElement {
  const t = active as Trade;
  const bot = partner as Bot;
  const a = assess(t, "a");
  const cc = canConfirm(t, Date.now());
  const youConfirmed = t.a.confirmed;
  const verdictText = { great: "Great deal for you", fair: "Looks fair", poor: "You give more than you get", bad: "Very one-sided" }[a.verdict];

  const col = (side: SideKey, title: string) => h("div", { class: "trade-col" },
    h("h3", null, title),
    h("div", { class: "trade-items" }, ...t[side].items.map((id, i) => miniItem(id, youConfirmed ? undefined : () => {
      const items = [...t[side].items]; items.splice(i, 1);
      active = setOffer(t, side, items, Date.now()); rerender();
    }))),
    youConfirmed ? null : h("button", { class: "btn sm secondary", style: "margin-top:8px", onclick: () => picker(side) }, "+ Add"),
  );

  const confirmBtn = youConfirmed
    ? h("button", { class: "btn block good", disabled: true }, `Waiting for ${bot.name}…`)
    : h("button", { class: "btn block" + (a.verdict === "bad" ? " bad" : ""), disabled: !cc.ok, onclick: onConfirm },
        cc.waitMs > 0 ? `Read it over… ${Math.ceil(cc.waitMs / 1000)}` : t.a.items.length + t.b.items.length === 0 ? "Add something to trade" : "Confirm trade");

  return h("div", { class: "screen" },
    h("div", { class: "topbar" },
      h("button", { class: "btn ghost sm", onclick: closeTrade }, "‹ Back"),
      h("div", { class: "neighbor" }, h("span", { class: "face" }, bot.emoji), h("b", null, bot.name)),
    ),
    h("div", { class: "card" },
      h("div", { class: "trade-cols" }, col("a", "You give"), col("b", `${bot.name} gives`)),
      h("div", { class: `fair ${a.verdict}` }, verdictText, a.warning ? h("div", { class: "small", style: "font-weight:600;margin-top:2px" }, a.warning) : null),
      lastMessage ? h("p", { class: "small", style: "margin-top:10px;color:var(--bad);font-weight:700" }, lastMessage) : null,
      h("div", { style: "margin-top:12px" }, confirmBtn),
      h("p", { class: "muted small", style: "margin-top:10px" }, "Both of you confirm, then everything swaps at once. If anything changes, both confirmations reset."),
    ),
  );
}

export function renderTrade(): HTMLElement {
  const s = store.state;
  if (!s.parent.tradingEnabled) {
    return h("div", { class: "screen" }, h("h1", null, "Trade"), h("div", { class: "card", style: "margin-top:12px" }, h("h3", null, "Trading is off"), h("p", { class: "muted" }, "A parent turned trading off in the Parent corner.")));
  }
  if (active && partner) return tradeView();

  const offers = ensureProposals();
  const mySpares = spares(s.inventory).length;

  return h("div", { class: "screen" },
    h("div", { class: "topbar" }, h("h1", null, "Trade"), h("span", { class: "pill" }, `${mySpares} spares`)),
    h("p", { class: "muted small" }, "Trade your spare dumplings with neighbors. You always keep one of each."),
    h("h2", null, "Offers for you"),
    offers.length === 0
      ? h("div", { class: "card muted" }, mySpares === 0 ? "Open some boxes first. Neighbors want your spares!" : "No offers right now. Start a trade below.")
      : h("div", null, ...offers.map((t) => {
          const bot = BOT_BY_ID.get(t.b.owner) as Bot;
          const want = CHARACTER_BY_ID.get(t.a.items[0] as string) as Character;
          const give = CHARACTER_BY_ID.get(t.b.items[0] as string) as Character;
          return h("div", { class: "card row" },
            h("span", { class: "face", style: "font-size:28px" }, bot.emoji),
            h("div", { class: "grow" }, h("b", null, bot.name), h("div", { class: "small muted" }, `wants your ${want.name} for ${give.name}`)),
            h("div", { class: "row", style: "gap:4px" }, dumplingEl(want, 40), h("span", { class: "muted" }, "⇄"), dumplingEl(give, 40)),
            h("button", { class: "btn sm", onclick: () => openWith(bot, { ...structuredClone(t), lastChangedAt: Date.now() }) }, "Look"),
          );
        })),
    h("h2", null, "Neighbors"),
    h("div", { class: "neighbors" }, ...BOTS.map((bot) => {
      const inv = store.botInventory(bot.id);
      const sp = spares(inv);
      const preview = sp.slice(0, 4).map(([id]) => dumplingEl(CHARACTER_BY_ID.get(id) as Character, 36));
      return h("div", { class: "card neighbor" },
        h("span", { class: "face" }, bot.emoji),
        h("div", { class: "grow" }, h("b", null, bot.name), h("div", { class: "small muted" }, `${sp.length} spares · ${Object.keys(inv).length} of ${CHARACTERS.length} collected`), h("div", { class: "row", style: "gap:2px;margin-top:4px" }, ...preview)),
        h("button", { class: "btn sm secondary", onclick: () => openWith(bot) }, "Trade"),
      );
    })),
  );
}
