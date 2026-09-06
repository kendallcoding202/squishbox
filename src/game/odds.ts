import { CHARACTERS, RARITIES, type Character, type Rarity } from "../data/characters";
import type { Box } from "../data/boxes";
import { pickWeighted, type Rng } from "./rng";

/** Roll one box: pick a rarity by the published odds, then a uniform character of that rarity. */
export function rollBox(box: Box, rng: Rng, pool: readonly Character[] = CHARACTERS): Character {
  const weights = RARITIES.map((r) => box.odds[r]);
  const rarity = pickWeighted(RARITIES, weights, rng);
  const candidates = pool.filter((c) => c.rarity === rarity);
  if (candidates.length === 0) throw new Error(`No characters of rarity ${rarity}`);
  const idx = Math.floor(rng() * candidates.length);
  return candidates[idx] as Character;
}

export function oddsAreValid(box: Box): boolean {
  const sum = RARITIES.reduce((a, r) => a + box.odds[r], 0);
  return Math.abs(sum - 100) < 1e-9 && RARITIES.every((r) => box.odds[r] >= 0);
}

/** Odds as the player sees them: rarity, percent, and rough "1 in N". */
export function describeOdds(box: Box): { rarity: Rarity; percent: number; oneIn: number | null }[] {
  return RARITIES.map((rarity) => {
    const percent = box.odds[rarity];
    return { rarity, percent, oneIn: percent > 0 ? Math.round(100 / percent) : null };
  });
}
