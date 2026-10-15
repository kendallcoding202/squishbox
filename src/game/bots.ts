import { BOX_BY_ID, type Box } from "../data/boxes";
import { itemKey, rollFinish } from "./finishes";
import { rollBox } from "./odds";
import type { Inventory } from "./state";
import { assess, createTrade, itemsValue, setOffer, type Trade } from "./trade";
import { mulberry32, type Rng } from "./rng";

/** Neighbors stand in for real friends in the prototype. Same trade engine, same rules. */
export interface Bot {
  id: string;
  name: string;
  emoji: string;
  /** How picky: minimum value ratio the bot accepts. */
  minRatio: number;
  seed: number;
  startingBoxes: { box: string; n: number }[];
  /** Only shows up once this series is unlocked. */
  requiresSeries?: "s2";
}

export const BOTS: readonly Bot[] = [
  { id: "mika", name: "Mika", emoji: "🐣", minRatio: 0.8, seed: 11, startingBoxes: [{ box: "steamer", n: 14 }, { box: "golden", n: 2 }] },
  { id: "theo", name: "Theo", emoji: "🦖", minRatio: 0.95, seed: 22, startingBoxes: [{ box: "steamer", n: 10 }, { box: "golden", n: 4 }] },
  { id: "ruby", name: "Ruby", emoji: "🦊", minRatio: 1.1, seed: 33, startingBoxes: [{ box: "golden", n: 6 }, { box: "feast", n: 1 }] },
  { id: "sam", name: "Sam", emoji: "🐼", minRatio: 0.7, seed: 44, startingBoxes: [{ box: "steamer", n: 20 }] },
  { id: "lin", name: "Lin", emoji: "🐉", minRatio: 0.9, seed: 55, startingBoxes: [{ box: "bamboo", n: 16 }, { box: "jade", n: 3 }], requiresSeries: "s2" },
];

export const BOT_BY_ID: ReadonlyMap<string, Bot> = new Map(BOTS.map((b) => [b.id, b]));

export function seedBotInventory(bot: Bot): Inventory {
  const rng = mulberry32(bot.seed);
  const inv: Inventory = {};
  for (const { box, n } of bot.startingBoxes) {
    const b = BOX_BY_ID.get(box) as Box;
    for (let i = 0; i < n; i++) {
      const c = rollBox(b, rng);
      // Neighbours open the same boxes a kid does, finishes included. Their trades stay on
      // the device, so a glittery neighbour offer can never reach a build that can't read it.
      const key = itemKey(c.id, rollFinish(rng));
      inv[key] = (inv[key] ?? 0) + 1;
    }
  }
  return inv;
}

/** Bots accept when the trade is at least `minRatio` fair for them and they keep one of everything. */
export function botAccepts(bot: Bot, trade: Trade, botSide: "a" | "b", botInv: Inventory): boolean {
  const a = assess(trade, botSide);
  if (trade[botSide].items.length === 0) return a.getValue > 0; // free gift, sure
  if (a.ratio < bot.minRatio) return false;
  const given = new Map<string, number>();
  for (const id of trade[botSide].items) given.set(id, (given.get(id) ?? 0) + 1);
  for (const [id, n] of given) if ((botInv[id] ?? 0) - n < 1) return false; // keeps its last copy
  return true;
}

/**
 * A bot proposes a swap: one of its spare dupes for one of the player's spare dupes of similar value.
 * Returns null when there is nothing sensible to offer.
 *
 * Everything here is keyed by ITEM KEY, not character id: a glittery Sprout is "u02g", and
 * CHARACTER_BY_ID knows nothing about it. Pricing goes through itemsValue, the same function
 * the trade screen and botAccepts use, so a finish is worth the same to a neighbour as it is
 * to the fairness meter — and an item this build cannot price is left out rather than
 * throwing. Reading a finished key as a character id is what used to take the whole Trade
 * tab down the first time a kid had two of the same glittery dumpling.
 */
export function botProposal(bot: Bot, botInv: Inventory, playerInv: Inventory, now: number, rng: Rng): Trade | null {
  const spare = (inv: Inventory) => Object.entries(inv).filter(([, n]) => n >= 2).map(([key]) => key);
  const botSpare = spare(botInv).filter((key) => !playerInv[key] && itemsValue([key]) > 0);
  const playerSpare = spare(playerInv).filter((key) => !botInv[key] && itemsValue([key]) > 0); // wants what it lacks
  if (botSpare.length === 0 || playerSpare.length === 0) return null;
  const want = playerSpare[Math.floor(rng() * playerSpare.length)] as string;
  const wantValue = itemsValue([want]);
  const candidates = botSpare
    .map((key) => ({ key, v: itemsValue([key]) }))
    .filter((c) => c.v >= wantValue * 0.6 && c.v <= wantValue * 1.6);
  if (candidates.length === 0) return null;
  const give = candidates[Math.floor(rng() * candidates.length)] as { key: string };
  let t = createTrade(`bot-${bot.id}-${now}`, "you", bot.id, now);
  t = setOffer(t, "b", [give.key], now);
  t = setOffer(t, "a", [want], now);
  return t;
}
