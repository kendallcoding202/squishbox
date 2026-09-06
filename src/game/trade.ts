import { CHARACTER_BY_ID, RARITY_INFO } from "../data/characters";
import type { Inventory } from "./state";

/**
 * Escrow-style trade. Design rules, each aimed at a known scam from kids' trading games:
 *  1. Atomic swap: nobody ever "gives first". Both sides' items move in one step or not at all.
 *  2. Any change to either side clears BOTH confirmations (no last-second swap).
 *  3. Confirm is disabled for COOLDOWN_MS after the last change, so the final offer is readable.
 *  4. Items are checked against real inventories at execution time (no duplicates, no ghosts).
 *  5. A lopsided trade shows a warning before the kid can confirm.
 */

export const COOLDOWN_MS = 3000;

export interface TradeSide {
  owner: string;
  items: string[]; // character ids, duplicates allowed
  confirmed: boolean;
}

export type TradeStatus = "open" | "locked" | "completed" | "declined";

export interface Trade {
  id: string;
  a: TradeSide;
  b: TradeSide;
  status: TradeStatus;
  version: number;
  lastChangedAt: number;
}

export type SideKey = "a" | "b";

export function createTrade(id: string, ownerA: string, ownerB: string, now: number): Trade {
  return {
    id,
    a: { owner: ownerA, items: [], confirmed: false },
    b: { owner: ownerB, items: [], confirmed: false },
    status: "open",
    version: 0,
    lastChangedAt: now,
  };
}

export function setOffer(trade: Trade, side: SideKey, items: string[], now: number): Trade {
  if (trade.status !== "open") throw new Error(`Trade is ${trade.status}`);
  const next = structuredClone(trade);
  next[side].items = [...items];
  next.a.confirmed = false;
  next.b.confirmed = false;
  next.version += 1;
  next.lastChangedAt = now;
  return next;
}

export function canConfirm(trade: Trade, now: number): { ok: boolean; waitMs: number } {
  const waitMs = Math.max(0, COOLDOWN_MS - (now - trade.lastChangedAt));
  const nonEmpty = trade.a.items.length + trade.b.items.length > 0;
  return { ok: trade.status === "open" && waitMs === 0 && nonEmpty, waitMs };
}

export function confirm(trade: Trade, side: SideKey, now: number): Trade {
  const check = canConfirm(trade, now);
  if (!check.ok) throw new Error(check.waitMs > 0 ? `Wait ${check.waitMs}ms` : "Cannot confirm");
  const next = structuredClone(trade);
  next[side].confirmed = true;
  if (next.a.confirmed && next.b.confirmed) next.status = "locked";
  return next;
}

export function decline(trade: Trade): Trade {
  if (trade.status === "completed") throw new Error("Already completed");
  return { ...structuredClone(trade), status: "declined" };
}

function counts(items: string[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const id of items) m.set(id, (m.get(id) ?? 0) + 1);
  return m;
}

export function owns(inv: Inventory, items: string[]): boolean {
  for (const [id, n] of counts(items)) if ((inv[id] ?? 0) < n) return false;
  return true;
}

/** Execute a locked trade. Returns new inventories; never mutates inputs. Throws if anything is off. */
export function execute(
  trade: Trade,
  invA: Inventory,
  invB: Inventory,
): { trade: Trade; invA: Inventory; invB: Inventory } {
  if (trade.status !== "locked") throw new Error("Both sides must confirm first");
  if (!owns(invA, trade.a.items)) throw new Error(`${trade.a.owner} no longer has those items`);
  if (!owns(invB, trade.b.items)) throw new Error(`${trade.b.owner} no longer has those items`);
  const nextA: Inventory = { ...invA };
  const nextB: Inventory = { ...invB };
  for (const id of trade.a.items) {
    nextA[id] = (nextA[id] ?? 0) - 1;
    nextB[id] = (nextB[id] ?? 0) + 1;
  }
  for (const id of trade.b.items) {
    nextB[id] = (nextB[id] ?? 0) - 1;
    nextA[id] = (nextA[id] ?? 0) + 1;
  }
  for (const inv of [nextA, nextB]) for (const k of Object.keys(inv)) if ((inv[k] ?? 0) <= 0) delete inv[k];
  return { trade: { ...structuredClone(trade), status: "completed" }, invA: nextA, invB: nextB };
}

export function itemsValue(items: string[]): number {
  return items.reduce((sum, id) => {
    const c = CHARACTER_BY_ID.get(id);
    return sum + (c ? RARITY_INFO[c.rarity].value : 0);
  }, 0);
}

export interface Assessment {
  giveValue: number;
  getValue: number;
  /** getValue / giveValue; Infinity when giving nothing. */
  ratio: number;
  verdict: "great" | "fair" | "poor" | "bad";
  warning: string | null;
}

/** How the trade looks from `side`'s point of view. */
export function assess(trade: Trade, side: SideKey): Assessment {
  const give = itemsValue(trade[side].items);
  const get = itemsValue(trade[side === "a" ? "b" : "a"].items);
  const ratio = give === 0 ? Infinity : get / give;
  let verdict: Assessment["verdict"] = "fair";
  let warning: string | null = null;
  if (ratio >= 1.3) verdict = "great";
  else if (ratio >= 0.7) verdict = "fair";
  else if (ratio >= 0.35) {
    verdict = "poor";
    warning = "You would give away more than you get. Sure?";
  } else {
    verdict = "bad";
    warning = "This trade is very one-sided. You'd lose a lot.";
  }
  return { giveValue: give, getValue: get, ratio, verdict, warning };
}
