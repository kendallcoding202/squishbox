import { CHARACTERS, CHARACTER_BY_ID, RARITY_INFO, SERIES, SERIES_BY_ID, charactersInSeries, type Rarity, type SeriesId } from "../data/characters";
import type { Box } from "../data/boxes";
import { newBuddy, recordVisit, type BuddyState } from "./buddy";
import { PITY_AT, rollBox } from "./odds";
import type { Rng } from "./rng";

export type Inventory = Record<string, number>;

export interface LogEntry {
  t: number;
  kind: "daily" | "open" | "trade" | "parent" | "sell" | "reward" | "buddy";
  text: string;
}

export interface ParentSettings {
  pin: string | null;
  tradingEnabled: boolean;
  /** Boxes a kid may open per calendar day. */
  dailyBoxCap: number;
  /** Trading with real friends through the trading post (friend codes). */
  onlineTrading: boolean;
  /** Looking after a buddy. On by default: it collects nothing and cannot punish a child. */
  buddyEnabled: boolean;
}

export interface NetCredentials { playerId: string; token: string; code: string; name: string }

export interface SaveState {
  version: 1;
  playerName: string;
  coins: number;
  inventory: Inventory;
  lastDailyClaim: string | null;
  streak: number;
  /** Latest wall clock this save has ever seen. The day ratchets forward, never back. */
  clockHighWater: number;
  /** Series the collection has earned. Latched, so a shrinking collection can't take one back. */
  unlockedSeries: SeriesId[];
  /** Delivery ids already applied, so a retried sync cannot grant the same trade twice. */
  appliedDeliveries: number[];
  /** The dumpling the kid looks after, if they've chosen one. Nothing here ever decays. */
  buddy: BuddyState | null;
  boxesToday: { day: string; count: number };
  stats: { boxesOpened: number; coinsEarned: number; coinsSpent: number; tradesCompleted: number; tradesDeclined: number; coinsFromSales: number };
  log: LogEntry[];
  parent: ParentSettings;
  bots: Record<string, Inventory>;
  settings: { sound: boolean };
  /** Boxes opened since the last Rare-or-better pull. See PITY_AT. */
  pity: number;
  nicknames: Record<string, string>;
  rewardsClaimed: string[];
  onboarded: boolean;
  /** Character ids on display, in order. Max SHELF_MAX. */
  shelf: string[];
  /** Series whose unlock celebration has already been shown. */
  celebrated: SeriesId[];
  /** Trading post identity. Random id and token, a friend code, a chosen basket name. No personal data. */
  net: NetCredentials | null;
}

export const STARTING_COINS = 50;
export const DAILY_COINS = 20;
export const STREAK_BONUS = 5; // per consecutive day, capped
export const STREAK_CAP = 5;
export const LOG_LIMIT = 200;
// Lives in odds.ts so the published odds can account for it; re-exported here where callers expect it.
export { PITY_AT };
/** Coins paid by the Steam Pot for one spare, by rarity. */
export const SELL_VALUE: Record<Rarity, number> = { common: 2, uncommon: 5, rare: 15, epic: 40, legendary: 120 };
export const NICKNAME_MAX = 12;
export const SHELF_MAX = 6;

export function newState(playerName = "You"): SaveState {
  return {
    version: 1,
    playerName,
    coins: STARTING_COINS,
    inventory: {},
    lastDailyClaim: null,
    streak: 0,
    clockHighWater: 0,
    unlockedSeries: [],
    appliedDeliveries: [],
    buddy: null,
    boxesToday: { day: "", count: 0 },
    stats: { boxesOpened: 0, coinsEarned: STARTING_COINS, coinsSpent: 0, tradesCompleted: 0, tradesDeclined: 0, coinsFromSales: 0 },
    log: [],
    // Online trading is off until a grown-up turns it on: nothing leaves the device by default,
    // and no server identity is created before a parent has had any say.
    parent: { pin: null, tradingEnabled: true, dailyBoxCap: 10, onlineTrading: false, buddyEnabled: true },
    bots: {},
    settings: { sound: true },
    pity: 0,
    nicknames: {},
    rewardsClaimed: [],
    onboarded: false,
    shelf: [],
    celebrated: [],
    net: null,
  };
}

/**
 * Apply a completed friend trade the trading post handed back. Never leaves counts below zero.
 *
 * Returns false when this delivery was already applied. The sync loop applies first and acks
 * second, so an ack that never lands — the trading post idles its machine down, and a cold
 * start beats the client's 8s timeout — leaves the delivery unacked and the server hands it
 * back on the next pass, every 20 seconds, granting the same dumplings each time.
 */
export function applyDelivery(state: SaveState, d: { id?: number; partnerName: string; give: string[]; get: string[] }, now: number): boolean {
  if (typeof d.id === "number") {
    if (state.appliedDeliveries.includes(d.id)) return false;
    state.appliedDeliveries.push(d.id);
    // the server only ever replays unacked ones; a short tail is plenty
    if (state.appliedDeliveries.length > 200) state.appliedDeliveries.splice(0, state.appliedDeliveries.length - 200);
  }
  for (const id of d.give) {
    const have = state.inventory[id] ?? 0;
    if (have <= 1) continue; // spares only: the last copy never leaves, even if the snapshot was stale
    state.inventory[id] = have - 1;
  }
  for (const id of d.get) if (CHARACTER_BY_ID.has(id)) state.inventory[id] = (state.inventory[id] ?? 0) + 1;
  latchUnlocks(state);
  state.stats.tradesCompleted += 1;
  const gave = d.give.map((id) => CHARACTER_BY_ID.get(id)?.name ?? id).join(", ") || "nothing";
  const got = d.get.map((id) => CHARACTER_BY_ID.get(id)?.name ?? id).join(", ") || "nothing";
  log(state, "trade", `Traded ${gave} to ${d.partnerName} for ${got}`, now);
  return true;
}

// ---- Series ----

export function ownedInSeries(inv: Inventory, id: SeriesId): number {
  return charactersInSeries(id).filter((c) => (inv[c.id] ?? 0) > 0).length;
}

export function seriesUnlocked(state: SaveState, id: SeriesId): boolean {
  const s = SERIES_BY_ID.get(id);
  if (!s || !s.unlockFrom) return true;
  if (state.unlockedSeries.includes(id)) return true; // earned once, kept for good
  return ownedInSeries(state.inventory, s.unlockFrom) >= s.unlockAt;
}

/**
 * Write down every series the collection currently earns, so it survives the collection
 * shrinking. Unlocking was derived live from the count, so selling a spare or trading a
 * dumpling away could drop a kid back under the bar — re-locking Series 2 and showing the
 * Series 2 dumplings they already owned as "???". Taking something back that a kid earned
 * is the worst version of this bug.
 */
export function latchUnlocks(state: SaveState): void {
  for (const s of SERIES) {
    if (!s.unlockFrom) continue;
    if (state.unlockedSeries.includes(s.id)) continue;
    if (ownedInSeries(state.inventory, s.unlockFrom) >= s.unlockAt) state.unlockedSeries.push(s.id);
  }
}

/** Progress toward unlocking a series as [have, need]. */
export function seriesUnlockProgress(state: SaveState, id: SeriesId): [number, number] {
  const s = SERIES_BY_ID.get(id);
  if (!s || !s.unlockFrom) return [0, 0];
  return [Math.min(s.unlockAt, ownedInSeries(state.inventory, s.unlockFrom)), s.unlockAt];
}

/** Series that just became unlocked and have not been celebrated yet. Marks them celebrated. */
/** Series that are unlocked but whose celebration the kid has not been shown yet. Does not consume. */
export function pendingUnlocks(state: SaveState): SeriesId[] {
  return SERIES.filter((s) => s.unlockFrom && seriesUnlocked(state, s.id) && !state.celebrated.includes(s.id)).map((s) => s.id);
}

/**
 * Spend the celebration, at the moment it is actually put on screen.
 *
 * Marking it any earlier loses it: the old code consumed every pending unlock during
 * render but only showed the modal when no other overlay was up, so unlocking Series 2
 * on a box pull — or while a friend's trade landed — marked it celebrated and then
 * never celebrated it.
 */
export function markCelebrated(state: SaveState, id: SeriesId): void {
  if (!state.celebrated.includes(id)) state.celebrated.push(id);
}

/** @deprecated Consumes whether or not the celebration is shown; use pendingUnlocks + markCelebrated. */
export function takeNewUnlocks(state: SaveState): SeriesId[] {
  const fresh = pendingUnlocks(state);
  for (const id of fresh) markCelebrated(state, id);
  return fresh;
}

// ---- Buddy ----

/**
 * Choose (or change) the dumpling the kid looks after. Only one at a time, and only one
 * they own. Changing buddy keeps nothing: the new buddy starts its own history, and the
 * old one simply goes back to being a dumpling in the basket. Nothing is lost or punished.
 */
export function chooseBuddy(state: SaveState, characterId: string, now: Date): boolean {
  if (!CHARACTER_BY_ID.has(characterId)) return false;
  if ((state.inventory[characterId] ?? 0) < 1) return false;
  if (state.buddy?.characterId === characterId) return false;
  state.buddy = newBuddy(characterId, effectiveNow(state, now).getTime());
  log(state, "buddy", `${CHARACTER_BY_ID.get(characterId)?.name} is my buddy now`, now.getTime());
  return true;
}

export function setBuddyAside(state: SaveState, now: Date): void {
  const name = state.buddy ? CHARACTER_BY_ID.get(state.buddy.characterId)?.name : null;
  state.buddy = null;
  if (name) log(state, "buddy", `${name} went back in the basket`, now.getTime());
}

/**
 * Count today's visit. True when it's the first of a new day, which is when the kid is
 * shown what the buddy got up to. Uses the same forward-only clock as everything else, so
 * winding the device back cannot farm extra visits.
 */
export function visitBuddy(state: SaveState, now: Date, pick: number): boolean {
  if (!state.buddy) return false;
  const today = effectiveNow(state, now);
  // A buddy that has been sold or traded away stops being the buddy, quietly.
  if ((state.inventory[state.buddy.characterId] ?? 0) < 1) { state.buddy = null; return false; }
  const first = recordVisit(state.buddy, dayKey(today), pick);
  if (first) markClockSeenExported(state, today);
  return first;
}

// ---- Shelf ----

export function onShelf(state: SaveState, characterId: string): boolean {
  return state.shelf.includes(characterId);
}

/** Toggle a dumpling on the shelf. Returns "added", "removed", or "full". Only owned dumplings can go on. */
export function toggleShelf(state: SaveState, characterId: string): "added" | "removed" | "full" | "not-owned" {
  if (onShelf(state, characterId)) {
    state.shelf = state.shelf.filter((id) => id !== characterId);
    return "removed";
  }
  if ((state.inventory[characterId] ?? 0) < 1) return "not-owned";
  if (state.shelf.length >= SHELF_MAX) return "full";
  state.shelf.push(characterId);
  return "added";
}

export function dayKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function yesterdayKey(d: Date): string {
  const y = new Date(d);
  y.setDate(y.getDate() - 1);
  return dayKey(y);
}

export function log(state: SaveState, kind: LogEntry["kind"], text: string, now: number): void {
  state.log.unshift({ t: now, kind, text });
  if (state.log.length > LOG_LIMIT) state.log.length = LOG_LIMIT;
}

/**
 * The clock the game runs on: never earlier than the latest moment this save has seen.
 *
 * Both the daily coins and the daily box cap — the only limit a parent actually sets —
 * hang off the device's calendar date, and Settings is two taps from any child. Winding
 * the clock back and forth between two dates farmed a day's coins every few seconds and
 * a fresh box allowance each way. A ratchet kills the round trip: going back is ignored.
 *
 * It does not stop a one-way jump into the future, which can't be settled without a
 * trusted clock; but that spends the day it skips to, and cannot be undone.
 */
export function effectiveNow(state: SaveState, wall: Date): Date {
  const high = Number.isFinite(state.clockHighWater) ? state.clockHighWater : 0;
  return wall.getTime() < high ? new Date(high) : wall;
}

function markClockSeenExported(state: SaveState, now: Date): void { markClockSeen(state, now); }
function markClockSeen(state: SaveState, now: Date): void {
  const ms = now.getTime();
  if (!Number.isFinite(state.clockHighWater) || ms > state.clockHighWater) state.clockHighWater = ms;
}

export function canClaimDaily(state: SaveState, today: Date): boolean {
  return state.lastDailyClaim !== dayKey(effectiveNow(state, today));
}

/** Free daily coins with a small streak bonus. Once per calendar day. */
export function claimDaily(state: SaveState, today: Date): number {
  const now = effectiveNow(state, today);
  if (!canClaimDaily(state, now)) return 0;
  markClockSeen(state, now);
  state.streak = state.lastDailyClaim === yesterdayKey(now) ? state.streak + 1 : 1;
  const bonus = Math.min(state.streak - 1, STREAK_CAP) * STREAK_BONUS;
  const amount = DAILY_COINS + bonus;
  state.coins += amount;
  state.stats.coinsEarned += amount;
  state.lastDailyClaim = dayKey(now);
  log(state, "daily", `Claimed ${amount} coins (day ${state.streak} streak)`, now.getTime());
  return amount;
}

export function boxesOpenedToday(state: SaveState, today: Date): number {
  return state.boxesToday.day === dayKey(effectiveNow(state, today)) ? state.boxesToday.count : 0;
}

export type OpenResult =
  | { ok: true; characterId: string; isNew: boolean; lucky: boolean }
  | { ok: false; reason: "coins" | "cap" | "locked" };

const RARE_PLUS: readonly Rarity[] = ["rare", "epic", "legendary"];

/** True when the next box will be forced to Rare or better. */
export function luckyNext(state: SaveState): boolean {
  return state.pity >= PITY_AT - 1;
}

/** Spend coins, roll the box, add to inventory. The lucky meter guarantees Rare+ every PITY_AT boxes. */
export function openBox(state: SaveState, box: Box, rng: Rng, wall: Date): OpenResult {
  const today = effectiveNow(state, wall); // the cap is a parent's setting; don't let the clock undo it
  if (!seriesUnlocked(state, box.series)) return { ok: false, reason: "locked" };
  if (state.coins < box.price) return { ok: false, reason: "coins" };
  if (boxesOpenedToday(state, today) >= state.parent.dailyBoxCap) return { ok: false, reason: "cap" };
  markClockSeen(state, today);
  const lucky = luckyNext(state);
  const rollFrom: Box = lucky ? { ...box, odds: { ...box.odds, common: 0, uncommon: 0 } } : box;
  const c = rollBox(rollFrom, rng);
  state.pity = RARE_PLUS.includes(c.rarity) ? 0 : state.pity + 1;
  state.coins -= box.price;
  state.stats.coinsSpent += box.price;
  state.stats.boxesOpened += 1;
  const key = dayKey(today);
  state.boxesToday = { day: key, count: boxesOpenedToday(state, today) + 1 };
  const isNew = !state.inventory[c.id];
  state.inventory[c.id] = (state.inventory[c.id] ?? 0) + 1;
  latchUnlocks(state);
  log(state, "open", `Opened ${box.name}: ${c.name} (${c.rarity})${isNew ? " NEW" : ""}${lucky ? " lucky" : ""}`, today.getTime());
  return { ok: true, characterId: c.id, isNew, lucky };
}

// ---- Steam Pot: sell spares for coins ----

export function sellValue(characterId: string): number {
  const c = CHARACTER_BY_ID.get(characterId);
  return c ? SELL_VALUE[c.rarity] : 0;
}

/** Sell one spare. Always keeps the last copy, so a collection can never shrink. */
export function sellSpare(state: SaveState, characterId: string, now: number): { ok: true; coins: number } | { ok: false } {
  const have = state.inventory[characterId] ?? 0;
  const c = CHARACTER_BY_ID.get(characterId);
  if (have < 2 || !c) return { ok: false };
  const coins = SELL_VALUE[c.rarity];
  state.inventory[characterId] = have - 1;
  state.coins += coins;
  state.stats.coinsEarned += coins;
  state.stats.coinsFromSales += coins;
  log(state, "sell", `Sold a spare ${c.name} to the Steam Pot for ${coins} coins`, now);
  return { ok: true, coins };
}

// ---- Album rewards ----

export interface Reward {
  id: string;
  series: SeriesId;
  label: string;
  coins: number;
  /** Progress as [have, need]. */
  progress: (inv: Inventory) => [number, number];
}

function rarityProgress(series: SeriesId, r: Rarity): (inv: Inventory) => [number, number] {
  return (inv) => {
    const all = charactersInSeries(series).filter((c) => c.rarity === r);
    return [all.filter((c) => (inv[c.id] ?? 0) > 0).length, all.length];
  };
}

function seriesRewards(series: SeriesId, prefix: string, legendaryLabel: string, scale: number): Reward[] {
  const n = charactersInSeries(series).length;
  return [
    { id: `${prefix}set-common`, series, label: `All ${RARITY_INFO.common.label}s`, coins: Math.round(30 * scale), progress: rarityProgress(series, "common") },
    { id: `${prefix}set-uncommon`, series, label: `All ${RARITY_INFO.uncommon.label}s`, coins: Math.round(40 * scale), progress: rarityProgress(series, "uncommon") },
    { id: `${prefix}set-rare`, series, label: `All ${RARITY_INFO.rare.label}s`, coins: Math.round(60 * scale), progress: rarityProgress(series, "rare") },
    { id: `${prefix}set-epic`, series, label: `All ${RARITY_INFO.epic.label}s`, coins: Math.round(100 * scale), progress: rarityProgress(series, "epic") },
    { id: `${prefix}set-legendary`, series, label: legendaryLabel, coins: Math.round(150 * scale), progress: rarityProgress(series, "legendary") },
    { id: `${prefix}album`, series, label: "Complete the whole album", coins: Math.round(500 * scale), progress: (inv) => [ownedInSeries(inv, series), n] },
  ];
}

export const REWARDS: readonly Reward[] = [
  { id: "first5", series: "s1", label: "Collect 5 different dumplings", coins: 15, progress: (inv) => [Math.min(5, ownedInSeries(inv, "s1")), 5] },
  ...seriesRewards("s1", "", "The Golden Dumpling", 1),
  ...seriesRewards("s2", "s2-", "The Jade Dragon", 1.2),
];

export function rewardsForSeries(id: SeriesId): Reward[] {
  return REWARDS.filter((r) => r.series === id);
}

export function rewardStatus(state: SaveState, r: Reward): "claimed" | "ready" | "locked" {
  if (state.rewardsClaimed.includes(r.id)) return "claimed";
  const [have, need] = r.progress(state.inventory);
  return have >= need ? "ready" : "locked";
}

export function claimReward(state: SaveState, rewardId: string, now: number): number {
  const r = REWARDS.find((x) => x.id === rewardId);
  if (!r || rewardStatus(state, r) !== "ready") return 0;
  state.rewardsClaimed.push(r.id);
  state.coins += r.coins;
  state.stats.coinsEarned += r.coins;
  log(state, "reward", `Album reward: ${r.label} (+${r.coins} coins)`, now);
  return r.coins;
}

// ---- Nicknames ----

/** Letters, numbers, spaces and a few friendly marks only; trimmed; capped. Empty clears it. */
export function setNickname(state: SaveState, characterId: string, raw: string): string {
  const clean = raw.replace(/[^\p{L}\p{N} '!?.-]/gu, "").replace(/\s+/g, " ").trim().slice(0, NICKNAME_MAX);
  if (clean) state.nicknames[characterId] = clean;
  else delete state.nicknames[characterId];
  return clean;
}

export function displayName(state: SaveState, characterId: string): string {
  return state.nicknames[characterId] ?? CHARACTER_BY_ID.get(characterId)?.name ?? "???";
}

export function ownedCount(inv: Inventory): number {
  return Object.values(inv).filter((n) => n > 0).length;
}

export function totalItems(inv: Inventory): number {
  return Object.values(inv).reduce((a, b) => a + b, 0);
}

export function inventoryValue(inv: Inventory): number {
  let v = 0;
  for (const [id, n] of Object.entries(inv)) {
    const c = CHARACTER_BY_ID.get(id);
    if (c) v += n * (({ common: 1, uncommon: 3, rare: 10, epic: 35, legendary: 150 })[c.rarity]);
  }
  return v;
}

// ---- persistence ----

const KEY = "squishbox.save.v1";

export function loadState(storage: Pick<Storage, "getItem"> | null): SaveState {
  try {
    const raw = storage?.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<SaveState>;
      if (parsed.version === 1) {
        const fresh = newState();
        // Older saves lack newer fields; nested objects are merged so defaults fill in.
        const merged = {
          ...fresh,
          ...parsed,
          stats: { ...fresh.stats, ...(parsed.stats ?? {}) },
          parent: { ...fresh.parent, ...(parsed.parent ?? {}) },
          settings: { ...fresh.settings, ...(parsed.settings ?? {}) },
        } as SaveState;
        // A spread only fills in what is missing, so a present-but-wrong field would go
        // straight through and throw on the first render, leaving a blank screen the kid
        // cannot get out of (the Parent corner reset is unreachable). Take the default instead.
        const obj = (v: unknown): boolean => !!v && typeof v === "object" && !Array.isArray(v);
        if (!obj(merged.inventory)) merged.inventory = fresh.inventory;
        if (!obj(merged.nicknames)) merged.nicknames = fresh.nicknames;
        if (!obj(merged.boxesToday)) merged.boxesToday = fresh.boxesToday;
        if (!Array.isArray(merged.log)) merged.log = fresh.log;
        if (!Array.isArray(merged.shelf)) merged.shelf = fresh.shelf;
        if (!Array.isArray(merged.rewardsClaimed)) merged.rewardsClaimed = fresh.rewardsClaimed;
        if (!Array.isArray(merged.celebrated)) merged.celebrated = fresh.celebrated;
        // A character id we don't know about (a hand-edited save, or one written by a build
        // that had a dumpling this one doesn't) reaches the Trade screen as undefined and
        // throws on .rarity, taking the whole tab down. Drop what we can't draw.
        for (const id of Object.keys(merged.inventory)) {
          const n = merged.inventory[id];
          if (!CHARACTER_BY_ID.has(id) || !Number.isFinite(n) || (n as number) <= 0) delete merged.inventory[id];
        }
        merged.shelf = merged.shelf.filter((id) => CHARACTER_BY_ID.has(id));
        if (!Array.isArray(merged.unlockedSeries)) merged.unlockedSeries = [];
        if (!Array.isArray(merged.appliedDeliveries)) merged.appliedDeliveries = [];
        latchUnlocks(merged); // saves from before the latch: bank what the collection already earns
        if (!Number.isFinite(merged.coins)) merged.coins = fresh.coins;
        if (!Number.isFinite(merged.pity)) merged.pity = fresh.pity;
        if (!Number.isFinite(merged.parent.dailyBoxCap) || merged.parent.dailyBoxCap < 1) merged.parent.dailyBoxCap = fresh.parent.dailyBoxCap;
        return merged;
      }
    }
  } catch {
    /* corrupt or unavailable storage: start fresh */
  }
  return newState();
}

/**
 * Returns false when the collection did not reach disk. Swallowing that silently means a
 * kid plays a whole session, closes the app, and finds an empty basket with no warning:
 * the caller is expected to say something.
 */
export function saveState(storage: Pick<Storage, "setItem"> | null, state: SaveState): boolean {
  if (!storage) return false;
  try {
    storage.setItem(KEY, JSON.stringify(state));
    return true;
  } catch {
    return false; // quota, private mode, or the webview evicted our storage
  }
}

export function resetState(storage: Pick<Storage, "removeItem"> | null): void {
  try {
    storage?.removeItem(KEY);
  } catch {
    /* ignore */
  }
}
