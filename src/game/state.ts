import { CHARACTER_BY_ID } from "../data/characters";
import type { Box } from "../data/boxes";
import { rollBox } from "./odds";
import type { Rng } from "./rng";

export type Inventory = Record<string, number>;

export interface LogEntry {
  t: number;
  kind: "daily" | "open" | "trade" | "parent";
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
  stats: { boxesOpened: number; coinsEarned: number; coinsSpent: number; tradesCompleted: number; tradesDeclined: number };
  log: LogEntry[];
  parent: ParentSettings;
  bots: Record<string, Inventory>;
}

export const STARTING_COINS = 50;
export const DAILY_COINS = 20;
export const STREAK_BONUS = 5; // per consecutive day, capped
export const STREAK_CAP = 5;
export const LOG_LIMIT = 200;

export function newState(playerName = "You"): SaveState {
  return {
    version: 1,
    playerName,
    coins: STARTING_COINS,
    inventory: {},
    lastDailyClaim: null,
    streak: 0,
    boxesToday: { day: "", count: 0 },
    stats: { boxesOpened: 0, coinsEarned: STARTING_COINS, coinsSpent: 0, tradesCompleted: 0, tradesDeclined: 0 },
    log: [],
    parent: { pin: null, tradingEnabled: true, dailyBoxCap: 10 },
    bots: {},
  };
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
  | { ok: true; characterId: string; isNew: boolean }
  | { ok: false; reason: "coins" | "cap" };

/** Spend coins, roll the box, add to inventory. */
export function openBox(state: SaveState, box: Box, rng: Rng, today: Date): OpenResult {
  if (state.coins < box.price) return { ok: false, reason: "coins" };
  if (boxesOpenedToday(state, today) >= state.parent.dailyBoxCap) return { ok: false, reason: "cap" };
  const c = rollBox(box, rng);
  state.coins -= box.price;
  state.stats.coinsSpent += box.price;
  state.stats.boxesOpened += 1;
  const key = dayKey(today);
  state.boxesToday = { day: key, count: boxesOpenedToday(state, today) + 1 };
  const isNew = !state.inventory[c.id];
  state.inventory[c.id] = (state.inventory[c.id] ?? 0) + 1;
  log(state, "open", `Opened ${box.name}: ${c.name} (${c.rarity})${isNew ? " NEW" : ""}`, today.getTime());
  return { ok: true, characterId: c.id, isNew };
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
      const parsed = JSON.parse(raw) as SaveState;
      if (parsed.version === 1) return { ...newState(), ...parsed };
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
