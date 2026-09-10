import { pickWeighted, type Rng } from "./rng";

/**
 * A dumpling comes out of the steamer plain, or with a finish on it. The character is the
 * same either way — a gold Taro is still Taro — so finishes add things to chase without
 * adding anyone new to draw, and they give a trade something to be excited about.
 */
export type Finish = "plain" | "glitter" | "rainbow" | "gold";

export const FINISHES: readonly Finish[] = ["plain", "glitter", "rainbow", "gold"];

/**
 * One letter on the end of a character id makes an item key: c01 is the plain one, c01g the
 * glittery one, c01x the gold one. Two things forced this shape:
 *
 *  - The trading post validates every item id against /^[a-z0-9]{2,8}$/i. A separator like
 *    "c01#gold" is dropped on the floor by cleanInventory and rejected outright by
 *    cleanItems, so a key has to stay short and alphanumeric to survive a friend trade.
 *  - Plain keeps the bare id, so every save written before finishes existed is already made
 *    of valid item keys. No migration, and no chance of a migration eating a collection.
 *
 * Parsing relies on every character id ending in a digit (c01, 2l01). finishes.test.ts
 * asserts that over the real character table, so a future id like "c1a" fails the build
 * rather than quietly parsing as a glittery "c1".
 */
const SUFFIX: Record<Finish, string> = { plain: "", glitter: "g", rainbow: "r", gold: "x" };

const BY_SUFFIX: ReadonlyMap<string, Finish> = new Map(
  FINISHES.filter((f) => SUFFIX[f] !== "").map((f) => [SUFFIX[f] as string, f] as const),
);

/**
 * weight: chance of this finish on any pull, independent of rarity and of which box.
 * value: what it multiplies the Steam Pot price and the trade-fairness estimate by.
 *
 * The weights are deliberately gentle. Expected value per box rises by 19% (0.90·1 +
 * 0.07·2 + 0.025·4 + 0.005·10), which keeps every box a coin sink — boxesAreCoinSinks in
 * progression.test.ts is the guard on that, because a box that pays for itself turns the
 * shop into a money printer and the daily cap into the only thing holding the game up.
 */
export const FINISH_INFO: Record<Finish, { label: string; weight: number; value: number }> = {
  plain: { label: "Plain", weight: 90, value: 1 },
  glitter: { label: "Glitter", weight: 7, value: 2 },
  rainbow: { label: "Rainbow", weight: 2.5, value: 4 },
  gold: { label: "Gold", weight: 0.5, value: 10 },
};

/** The finishes worth showing off, best first. Plain is not one of them. */
export const SPECIAL_FINISHES: readonly Finish[] = ["gold", "rainbow", "glitter"];

export function itemKey(characterId: string, finish: Finish): string {
  return characterId + SUFFIX[finish];
}

/**
 * Split an item key into the character and its finish. Returns null for a key that isn't
 * shaped like one; callers still have to check the character actually exists.
 */
export function parseItem(key: string): { characterId: string; finish: Finish } | null {
  if (!key) return null;
  const last = key.slice(-1);
  if (/[0-9]/.test(last)) return { characterId: key, finish: "plain" };
  const finish = BY_SUFFIX.get(last.toLowerCase());
  if (!finish) return null;
  const characterId = key.slice(0, -1);
  return characterId ? { characterId, finish } : null;
}

/** The character an item key refers to, or the key itself if it isn't parseable. */
export function characterIdOf(key: string): string {
  return parseItem(key)?.characterId ?? key;
}

export function finishOf(key: string): Finish {
  return parseItem(key)?.finish ?? "plain";
}

export function rollFinish(rng: Rng): Finish {
  return pickWeighted(FINISHES, FINISHES.map((f) => FINISH_INFO[f].weight), rng);
}

/** Long-run chance of each finish, for the card that has to tell the truth before you open. */
export function describeFinishOdds(): { finish: Finish; label: string; percent: number; oneIn: number | null }[] {
  const total = FINISHES.reduce((a, f) => a + FINISH_INFO[f].weight, 0);
  return FINISHES.map((finish) => {
    const exact = (FINISH_INFO[finish].weight / total) * 100;
    return {
      finish,
      label: FINISH_INFO[finish].label,
      percent: Math.round(exact * 100) / 100,
      oneIn: exact > 0 ? Math.round(100 / exact) : null,
    };
  });
}
