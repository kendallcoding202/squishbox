import { BOTS, BOT_BY_ID, botAccepts, botProposal, type Bot } from "../../game/bots";
import { CHARACTERS, CHARACTER_BY_ID, RARITY_INFO, type Character } from "../../data/characters";
import { systemRng } from "../../game/rng";
import { displayName, log, NICKNAME_MAX, seriesUnlocked, type Inventory } from "../../game/state";
import { assess, canConfirm, confirm, createTrade, execute, owns, setOffer, type SideKey, type Trade } from "../../game/trade";
import { api, ApiError, type Friend } from "../../net/api";
import { ensureRegistered, net, syncNow, token } from "../../net/sync";
import { confetti, h, overlay, toast } from "../dom";
import { dumplingEl } from "../dumpling";
import { haptic, nope, success } from "../sound";
import { store } from "../store";

/**
 * One trade at a time. A partner is either a neighbor (a bot, runs on the device) or a friend
 * (a real person, runs on the trading post). Both use the same escrow rules and the same screen.
 */
type Partner = { kind: "bot"; bot: Bot } | { kind: "friend"; friend: Friend };

let active: Trade | null = null;
let partner: Partner | null = null;
let mySide: SideKey = "a";
let proposals: Trade[] | null = null;
let ticker = 0;
let poller = 0;
let lastMessage: string | null = null;
let busy = false;

let rerender: () => void = () => {};
export function onTradeRerender(fn: () => void): void { rerender = fn; }

const now = () => Date.now() + (partner?.kind === "friend" ? net.skewMs : 0);
const partnerName = () => (partner?.kind === "bot" ? partner.bot.name : partner?.friend.name ?? "");
const otherSide = (): SideKey => (mySide === "a" ? "b" : "a");

function visibleBots(): Bot[] {
  return BOTS.filter((b) => !b.requiresSeries || seriesUnlocked(store.state, b.requiresSeries));
}

function spares(inv: Inventory): [string, number][] {
  return Object.entries(inv).filter(([, n]) => n >= 2);
}

function ensureProposals(): Trade[] {
  if (proposals) return proposals;
  const nowMs = Date.now();
  proposals = visibleBots().map((b) => botProposal(b, store.botInventory(b.id), store.state.inventory, nowMs, systemRng)).filter(Boolean) as Trade[];
  return proposals;
}

function openWithBot(bot: Bot, seed?: Trade): void {
  partner = { kind: "bot", bot };
  mySide = "a";
  active = seed ?? createTrade(`t-${Date.now()}`, "you", bot.id, Date.now());
  lastMessage = null;
  clearInterval(ticker);
  ticker = window.setInterval(rerender, 250);
  rerender();
}

async function openWithFriend(friend: Friend, existing?: Trade): Promise<void> {
  const t = token();
  if (!t) return;
  busy = true; rerender();
  try {
    await syncNow(); // push the latest inventory so the post knows our spares
    const trade = existing ?? (await api.createTrade(t, friend.id));
    partner = { kind: "friend", friend };
    mySide = trade.a.owner === store.state.net?.playerId ? "a" : "b";
    active = trade;
    lastMessage = null;
    clearInterval(ticker); ticker = window.setInterval(rerender, 250);
    clearInterval(poller); poller = window.setInterval(() => { void pollRemote(); }, 2000);
  } catch (e) {
    toast(e instanceof ApiError ? e.message : "Can't reach the trading post");
  } finally {
    busy = false; rerender();
  }
}

async function pollRemote(): Promise<void> {
  const t = token();
  if (!t || !active || partner?.kind !== "friend") return;
  try {
    const fresh = await api.getTrade(t, active.id);
    if (!active || fresh.id !== active.id) return;
    if (fresh.status === "completed") { await finishRemote(); return; }
    if (fresh.status === "declined") { lastMessage = `${partnerName()} closed this trade.`; active = fresh; rerender(); setTimeout(closeTrade, 1500); return; }
    if (fresh.version !== active.version || fresh.a.confirmed !== active.a.confirmed || fresh.b.confirmed !== active.b.confirmed) { active = fresh; rerender(); }
  } catch { /* transient; next poll */ }
}

async function finishRemote(): Promise<void> {
  clearInterval(poller);
  await syncNow(); // applies the delivery and toasts
  proposals = null;
  closeTrade();
}

function closeTrade(): void {
  active = null; partner = null;
  clearInterval(ticker); clearInterval(poller);
  rerender();
}

function miniItem(id: string, onRemove?: () => void): HTMLElement {
  const c = CHARACTER_BY_ID.get(id) as Character | undefined;
  if (!c) return h("div", { class: "trade-item" }, "?");
  return h("div", { class: "trade-item" },
    dumplingEl(c, 48),
    h("div", { class: "small", style: "font-weight:800;white-space:nowrap;overflow:hidden;text-overflow:ellipsis" }, displayName(store.state, c.id)),
    onRemove ? h("button", { class: "rm", "aria-label": `Remove ${c.name}`, onclick: onRemove }, "×") : null,
  );
}

async function changeOffer(side: SideKey, items: string[]): Promise<void> {
  if (!active) return;
  if (partner?.kind === "friend") {
    const t = token(); if (!t) return;
    busy = true; rerender();
    try { active = await api.offer(t, active.id, items); }
    catch (e) { toast(e instanceof ApiError ? e.message : "Can't reach the trading post"); }
    finally { busy = false; rerender(); }
  } else {
    active = setOffer(active, side, items, Date.now());
    rerender();
  }
}

/** Pick an item to add to a side. Only spares can be offered, so nobody trades away their whole collection. */
function picker(side: SideKey): void {
  if (!active || !partner) return;
  const t = active;
  const inv = side === mySide ? store.state.inventory : partner.kind === "bot" ? store.botInventory(partner.bot.id) : {};
  const inTrade = new Map<string, number>();
  for (const id of t[side].items) inTrade.set(id, (inTrade.get(id) ?? 0) + 1);
  const options = spares(inv).filter(([id, n]) => n - 1 - (inTrade.get(id) ?? 0) > 0);
  const who = side === mySide ? "your" : `${partnerName()}'s`;
  const ov = overlay(h("div", { class: "sheet" },
    h("h2", null, `Add one of ${who} spares`),
    options.length === 0 ? h("p", { class: "muted", style: "margin-top:10px" }, side === mySide ? "You need two of the same dumpling to trade one away." : `${partnerName()} has no spares left to give.`) : null,
    h("div", { class: "picker" }, ...options.map(([id, n]) => {
      const c = CHARACTER_BY_ID.get(id) as Character;
      return h("button", { class: "tile", style: `border-bottom:4px solid ${RARITY_INFO[c.rarity].color}`, onclick: () => {
        ov.remove();
        void changeOffer(side, [...t[side].items, id]);
      } }, h("span", { class: "count" }, `×${n}`), dumplingEl(c, 56), h("div", { class: "name" }, c.name));
    })),
    h("button", { class: "btn secondary block", style: "margin-top:14px", onclick: () => ov.remove() }, "Cancel"),
  ));
}

async function onConfirm(): Promise<void> {
  if (!active || !partner) return;
  if (partner.kind === "friend") {
    const t = token(); if (!t) return;
    busy = true; rerender();
    try {
      const r = await api.confirm(t, active.id);
      if (r.completed) { confetti(["#3fae7a", "#ffd23f", "#ff8f5e"], 50); success(); haptic("success"); await finishRemote(); return; }
      active = r;
    } catch (e) {
      toast(e instanceof ApiError ? e.message : "Can't reach the trading post");
      void pollRemote();
    } finally { busy = false; rerender(); }
    return;
  }
  const bot = partner.bot;
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
      success(); haptic("success");
      toast(`Trade complete with ${bot.name}!`);
      closeTrade();
    } else {
      active = setOffer(t, "b", t.b.items, Date.now()); // resets both confirmations so the kid can edit
      store.update((s) => { s.stats.tradesDeclined += 1; });
      nope(); haptic("medium");
      lastMessage = `${bot.name} said no thanks. ${bot.minRatio > 1 ? `${bot.name} only trades up.` : "Try adding a bit more, or ask for less."}`;
      rerender();
    }
  }, 900 + Math.random() * 600);
}

async function onDecline(): Promise<void> {
  if (partner?.kind === "friend" && active) {
    const t = token();
    if (t) { try { await api.decline(t, active.id); } catch { /* ignore */ } }
  }
  closeTrade();
}

function tradeView(): HTMLElement {
  const t = active as Trade;
  const remote = partner?.kind === "friend";
  const a = assess(t, mySide);
  const cc = canConfirm(t, now());
  const youConfirmed = t[mySide].confirmed;
  const theyConfirmed = t[otherSide()].confirmed;
  const verdictText = { great: "Great deal for you", fair: "Looks fair", poor: "You give more than you get", bad: "Very one-sided" }[a.verdict];

  const col = (side: SideKey, title: string) => {
    const mine = side === mySide;
    const canEdit = !youConfirmed && !busy && (mine || !remote);
    return h("div", { class: "trade-col" },
      h("h3", null, title, !mine && remote && theyConfirmed ? h("span", { class: "badge", style: "background:var(--good);margin-left:6px" }, "✓ ready") : null),
      h("div", { class: "trade-items" }, ...t[side].items.map((id, i) => miniItem(id, canEdit ? () => {
        const items = [...t[side].items]; items.splice(i, 1);
        void changeOffer(side, items);
      } : undefined))),
      canEdit ? h("button", { class: "btn sm secondary", style: "margin-top:8px", onclick: () => picker(side) }, "+ Add") : null,
      !mine && remote && t[side].items.length === 0 ? h("p", { class: "muted small", style: "margin-top:6px" }, `Waiting for ${partnerName()} to add something…`) : null,
    );
  };

  const confirmBtn = youConfirmed
    ? h("button", { class: "btn block good", disabled: true }, `Waiting for ${partnerName()}…`)
    : h("button", { class: "btn block" + (a.verdict === "bad" ? " bad" : ""), disabled: !cc.ok || busy, onclick: () => { void onConfirm(); } },
        busy ? "…" : cc.waitMs > 0 ? `Read it over… ${Math.ceil(cc.waitMs / 1000)}` : t.a.items.length + t.b.items.length === 0 ? "Add something to trade" : "Confirm trade");

  return h("div", { class: "screen" },
    h("div", { class: "topbar" },
      h("button", { class: "btn ghost sm", onclick: () => { void onDecline(); } }, "‹ Back"),
      h("div", { class: "neighbor" }, h("span", { class: "face" }, partner?.kind === "bot" ? partner.bot.emoji : "🧑‍🤝‍🧑"), h("b", null, partnerName())),
    ),
    h("div", { class: "card" },
      h("div", { class: "trade-cols" }, col(mySide, "You give"), col(otherSide(), `${partnerName()} gives`)),
      h("div", { class: `fair ${a.verdict}` }, verdictText, a.warning ? h("div", { class: "small", style: "font-weight:600;margin-top:2px" }, a.warning) : null),
      lastMessage ? h("p", { class: "small", style: "margin-top:10px;color:var(--bad);font-weight:700" }, lastMessage) : null,
      h("div", { style: "margin-top:12px" }, confirmBtn),
      h("p", { class: "muted small", style: "margin-top:10px" }, remote
        ? "Both of you confirm, then everything swaps at once. If either side changes anything, both confirmations reset. Nobody ever gives first."
        : "Both of you confirm, then everything swaps at once. If anything changes, both confirmations reset."),
    ),
  );
}

// ---- friends ----

function namePrompt(): void {
  const cur = store.state.net?.name ?? "";
  const input = h("input", { type: "text", maxlength: String(NICKNAME_MAX), value: cur, placeholder: "Basket name", autocomplete: "off" }) as HTMLInputElement;
  const save = async () => {
    const t = token(); if (!t) return;
    try {
      const r = await api.rename(t, input.value);
      store.update((s) => { if (s.net) s.net.name = r.name; });
      toast(`You're ${r.name}`);
      ov.remove(); rerender();
    } catch (e) { toast(e instanceof ApiError ? e.message : "Can't reach the trading post"); }
  };
  input.addEventListener("keydown", (e) => { if (e.key === "Enter") void save(); });
  const ov = overlay(h("div", { class: "sheet" },
    h("h2", null, "Name your basket"),
    h("p", { class: "muted small", style: "margin:6px 0 12px" }, "This is what friends see. Pick a fun name, not your real name."),
    input,
    h("button", { class: "btn block", style: "margin-top:12px", onclick: () => { void save(); } }, "Save"),
    h("button", { class: "btn ghost block", style: "margin-top:6px", onclick: () => ov.remove() }, "Cancel"),
  ));
}

function friendsSection(): HTMLElement {
  const s = store.state;
  if (!s.parent.onlineTrading) {
    return h("div", { class: "card muted small" }, "Trading with friends online is turned off in the Parent corner.");
  }
  const me = s.net;
  if (!me) {
    return h("div", { class: "card" },
      h("h3", null, "Trade with friends"),
      h("p", { class: "muted small", style: "margin:6px 0 10px" }, net.error ?? "Connecting to the trading post…"),
      h("button", { class: "btn sm secondary", onclick: () => { void ensureRegistered().then(() => syncNow()).then(rerender); } }, "Try again"),
    );
  }
  const codeInput = h("input", { type: "text", placeholder: "Friend's code, like TARO-71", autocapitalize: "characters", autocomplete: "off", maxlength: "12" }) as HTMLInputElement;
  const add = async () => {
    const t = token(); if (!t) return;
    const code = codeInput.value.trim();
    if (!code) return;
    try {
      const f = await api.addFriend(t, code);
      toast(`Added ${f.name}!`); haptic("success");
      codeInput.value = "";
      await syncNow(); rerender();
    } catch (e) { toast(e instanceof ApiError ? e.message : "Can't reach the trading post"); nope(); }
  };
  codeInput.addEventListener("keydown", (e) => { if (e.key === "Enter") void add(); });
  const share = async () => {
    const text = `Add me in Squishbox! My basket code is ${me.code}`;
    try {
      if (navigator.share) await navigator.share({ text });
      else { await navigator.clipboard.writeText(me.code); toast("Code copied"); }
    } catch { /* user cancelled */ }
  };
  const ago = (t: number) => { const d = Math.floor((Date.now() - t) / 86400000); return d <= 0 ? "today" : d === 1 ? "yesterday" : `${d} days ago`; };
  const myOffers = net.trades.filter((t) => {
    const side: SideKey = t.a.owner === me.playerId ? "a" : "b";
    const other: SideKey = side === "a" ? "b" : "a";
    return t.status === "open" && t[other].items.length > 0 && !t[side].confirmed;
  });
  return h("div", null,
    h("div", { class: "card" },
      h("div", { class: "row between" },
        h("div", { class: "grow" }, h("h3", null, me.name), h("p", { class: "muted small" }, "Your basket code: ", h("b", { style: "font-size:16px;letter-spacing:.05em" }, me.code))),
        h("div", { class: "row", style: "gap:6px" },
          h("button", { class: "btn sm secondary", onclick: namePrompt, "aria-label": "Change basket name" }, "✏️"),
          h("button", { class: "btn sm", onclick: () => { void share(); } }, "Share"),
        ),
      ),
      h("div", { class: "row", style: "margin-top:12px;gap:8px" }, codeInput, h("button", { class: "btn sm", onclick: () => { void add(); } }, "Add")),
      !net.online && net.error ? h("p", { class: "small", style: "margin-top:8px;color:var(--bad);font-weight:700" }, net.error) : null,
    ),
    myOffers.length ? h("div", null, h("h2", null, "Friend offers"), ...myOffers.map((t) => {
      const otherId = t.a.owner === me.playerId ? t.b.owner : t.a.owner;
      const f = net.friends.find((x) => x.id === otherId) ?? { id: otherId, name: "a friend", code: "", lastSeen: 0 };
      const theirs = t[t.a.owner === me.playerId ? "b" : "a"].items;
      return h("div", { class: "card row" },
        h("span", { class: "face", style: "font-size:24px" }, "🎁"),
        h("div", { class: "grow" }, h("b", null, f.name), h("div", { class: "small muted" }, `offers ${theirs.map((id) => CHARACTER_BY_ID.get(id)?.name ?? "?").join(", ")}`)),
        h("button", { class: "btn sm", onclick: () => { void openWithFriend(f, t); } }, "Look"),
      );
    })) : null,
    h("h2", null, "Friends"),
    net.friends.length === 0
      ? h("div", { class: "card muted small" }, "No friends yet. Share your code, or add a friend's code above.")
      : h("div", { class: "neighbors" }, ...net.friends.map((f) => h("div", { class: "card neighbor" },
          h("span", { class: "face" }, "🧺"),
          h("div", { class: "grow" }, h("b", null, f.name), h("div", { class: "small muted" }, `${f.code} · seen ${ago(f.lastSeen)}`)),
          h("button", { class: "btn sm secondary", disabled: busy, onclick: () => { void openWithFriend(f); } }, "Trade"),
        ))),
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
    h("p", { class: "muted small" }, "Trade your spare dumplings with friends and neighbors. You always keep one of each."),
    friendsSection(),
    h("h2", null, "Offers from neighbors"),
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
            h("button", { class: "btn sm", onclick: () => openWithBot(bot, { ...structuredClone(t), lastChangedAt: Date.now() }) }, "Look"),
          );
        })),
    h("h2", null, "Neighbors"),
    h("div", { class: "neighbors" }, ...visibleBots().map((bot) => {
      const inv = store.botInventory(bot.id);
      const sp = spares(inv);
      const preview = sp.slice(0, 4).map(([id]) => dumplingEl(CHARACTER_BY_ID.get(id) as Character, 36));
      return h("div", { class: "card neighbor" },
        h("span", { class: "face" }, bot.emoji),
        h("div", { class: "grow" }, h("b", null, bot.name), h("div", { class: "small muted" }, `${sp.length} spares · ${Object.keys(inv).length} of ${CHARACTERS.length} collected`), h("div", { class: "row", style: "gap:2px;margin-top:4px" }, ...preview)),
        h("button", { class: "btn sm secondary", onclick: () => openWithBot(bot) }, "Trade"),
      );
    })),
  );
}
