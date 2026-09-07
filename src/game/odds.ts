import { charactersInSeries, RARITIES, type Character, type Rarity } from "../data/characters";
import type { Box } from "../data/boxes";
import { pickWeighted, type Rng } from "./rng";

/** Roll one box: pick a rarity by the published odds, then a uniform character of that rarity from the box's series. */
export function rollBox(box: Box, rng: Rng, pool: readonly Character[] = charactersInSeries(box.series)): Character {
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

/** Lucky meter: the PITY_AT-th box since the last Rare-or-better is forced to Rare or better. */
export const PITY_AT = 10;

const RARE_PLUS: readonly Rarity[] = ["rare", "epic", "legendary"];

/**
 * What a player actually pulls over time, which is not the weight table.
 *
 * The lucky meter forces Rare+ on the PITY_AT-th box since the last one, so every Rare+
 * rate sits above its printed weight and the two common tiers sit below. Printing the raw
 * table understated legendary by a third (1 in 200 on the card, 1 in 144 in the hand), and
 * the odds a kid is shown before opening a box are the one number that has to be true.
 *
 * Exactly one Rare+ lands per cycle, so its long-run rate is 1 / (expected cycle length).
 * A cycle ends at box k (k < PITY_AT) with probability q^(k-1)·p, or runs to the forced
 * PITY_AT-th box with probability q^(PITY_AT-1). Which Rare+ tier lands is unchanged:
 * both the natural and the forced roll pick among them in the same proportions.
 */
export function effectiveOdds(box: Box): Record<Rarity, number> {
  const rarePlus = RARE_PLUS.reduce((a, r) => a + box.odds[r], 0);
  const lowSum = RARITIES.reduce((a, r) => a + (RARE_PLUS.includes(r) ? 0 : box.odds[r]), 0);
  // Nothing to force towards, or nothing to force away from: the table is already the truth.
  if (rarePlus <= 0 || lowSum <= 0) return { ...box.odds };

  const p = rarePlus / 100;
  const q = 1 - p;
  let cycle = PITY_AT * Math.pow(q, PITY_AT - 1);
  for (let k = 1; k < PITY_AT; k++) cycle += k * Math.pow(q, k - 1) * p;
  const rarePlusRate = 1 / cycle;

  const out = {} as Record<Rarity, number>;
  for (const r of RARITIES) {
    out[r] = RARE_PLUS.includes(r)
      ? rarePlusRate * (box.odds[r] / rarePlus) * 100
      : (1 - rarePlusRate) * (box.odds[r] / lowSum) * 100;
  }
  return out;
}

/**
 * Odds as the player sees them: rarity, percent, and rough "1 in N". Includes the lucky meter.
 * Rounded, because this goes straight onto the box card — the raw figure is 0.6930016304589148.
 */
export function describeOdds(box: Box): { rarity: Rarity; percent: number; oneIn: number | null }[] {
  const eff = effectiveOdds(box);
  return RARITIES.map((rarity) => {
    const exact = eff[rarity] ?? 0;
    return {
      rarity,
      percent: Math.round(exact * 100) / 100,
      oneIn: exact > 0 ? Math.round(100 / exact) : null, // from the exact figure, so 1-in-N stays true
    };
  });
}
