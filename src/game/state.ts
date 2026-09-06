import { CHARACTERS, CHARACTER_BY_ID, RARITY_INFO, SERIES, SERIES_BY_ID, charactersInSeries, type Rarity, type SeriesId } from "../data/characters";
import type { Box } from "../data/boxes";
import { rollBox } from "./odds";
import type { Rng } from "./rng";

export type Inventory = Record<string, number>;

export interface LogEntry {
  t: number;
  kind: "daily" | "open" | "trade" | "parent" | "sell" | "reward";
  text: string;
}

export interface ParentSettings {
  pin: string | null;
  tradingEnabled: boolean;
  /** Boxes a kid may open per calendar day. */
  dailyBoxCap: number;
}

export interface SaveState {
  version: 1;
  playerName: string;
  coins: number;
  inventory: Inventory;
  lastDailyClaim: string | null;
  streak: number;
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
}

export const STARTING_COINS = 50;
export const DAILY_COINS = 20;
export const STREAK_BONUS = 5; // per consecutive day, capped
export const STREAK_CAP = 5;
export const LOG_LIMIT = 200;
/** Lucky meter: the PITY_AT-th box since the last Rare-or-better is guaranteed Rare or better. */
export const PITY_AT = 10;
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
    boxesToday: { day: "", count: 0 },
    stats: { boxesOpened: 0, coinsEarned: STARTING_COINS, coinsSpent: 0, tradesCompleted: 0, tradesDeclined: 0, coinsFromSales: 0 },
    log: [],
    parent: { pin: null, tradingEnabled: true, dailyBoxCap: 10 },
    bots: {},
    settings: { sound: true },
    pity: 0,
    nicknames: {},
    rewardsClaimed: [],
    onboarded: false,
    shelf: [],
    celebrated: [],
  };
}

// ---- Series ----

export function ownedInSeries(inv: Inventory, id: SeriesId): number {
  return charactersInSeries(id).filter((c) => (inv[c.id] ?? 0) > 0).length;
}

export function seriesUnlocked(state: SaveState, id: SeriesId): boolean {
  const s = SERIES_BY_ID.get(id);
  if (!s || !s.unlockFrom) return true;
  return ownedInSeries(state.inventory, s.unlockFrom) >= s.unlockAt;
}

/** Progress toward unlocking a series as [have, need]. */
export function seriesUnlockProgress(state: SaveState, id: SeriesId): [number, number] {
  const s = SERIES_BY_ID.get(id);
  if (!s || !s.unlockFrom) return [0, 0];
  return [Math.min(s.unlockAt, ownedInSeries(state.inventory, s.unlockFrom)), s.unlockAt];
}

/** Series that just became unlocked and have not been celebrated yet. Marks them celebrated. */
export function takeNewUnlocks(state: SaveState): SeriesId[] {
  const fresh = SERIES.filter((s) => s.unlockFrom && seriesUnlocked(state, s.id) && !state.celebrated.includes(s.id)).map((s) => s.id);
  for (const id of fresh) state.celebrated.push(id);
  return fresh;
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

export function canClaimDaily(state: SaveState, today: Date): boolean {
  return state.lastDailyClaim !== dayKey(today);
}

/** Free daily coins with a small streak bonus. Once per calendar day. */
export function claimDaily(state: SaveState, today: Date): number {
  if (!canClaimDaily(state, today)) return 0;
  state.streak = state.lastDailyClaim === yesterdayKey(today) ? state.streak + 1 : 1;
  const bonus = Math.min(state.streak - 1, STREAK_CAP) * STREAK_BONUS;
  const amount = DAILY_COINS + bonus;
  state.coins += amount;
  state.stats.coinsEarned += amount;
  state.lastDailyClaim = dayKey(today);
  log(state, "daily", `Claimed ${amount} coins (day ${state.streak} streak)`, today.getTime());
  return amount;
}

export function boxesOpenedToday(state: SaveState, today: Date): number {
  return state.boxesToday.day === dayKey(today) ? state.boxesToday.count : 0;
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
export function openBox(state: SaveState, box: Box, rng: Rng, today: Date): OpenResult {
  if (!seriesUnlocked(state, box.series)) return { ok: false, reason: "locked" };
  if (state.coins < box.price) return { ok: false, reason: "coins" };
  if (boxesOpenedToday(state, today) >= state.parent.dailyBoxCap) return { ok: false, reason: "cap" };
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
        return {
          ...fresh,
          ...parsed,
          stats: { ...fresh.stats, ...(parsed.stats ?? {}) },
          parent: { ...fresh.parent, ...(parsed.parent ?? {}) },
          settings: { ...fresh.settings, ...(parsed.settings ?? {}) },
        } as SaveState;
      }
    }
  } catch {
    /* corrupt or unavailable storage: start fresh */
  }
  return newState();
}

export function saveState(storage: Pick<Storage, "setItem"> | null, state: SaveState): void {
  try {
    storage?.setItem(KEY, JSON.stringify(state));
  } catch {
    /* quota or private mode: ignore */
  }
}

export function resetState(storage: Pick<Storage, "removeItem"> | null): void {
  try {
    storage?.removeItem(KEY);
  } catch {
    /* ignore */
  }
}
