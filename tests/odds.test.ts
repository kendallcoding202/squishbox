import { describe, expect, it } from "vitest";
import { BOXES } from "../src/data/boxes";
import { CHARACTERS, RARITIES } from "../src/data/characters";
import { describeOdds, oddsAreValid, rollBox } from "../src/game/odds";
import { newState, openBox } from "../src/game/state";
import { mulberry32 } from "../src/game/rng";

describe("box odds", () => {
  it("every box's published odds sum to 100", () => {
    for (const box of BOXES) expect(oddsAreValid(box), box.name).toBe(true);
  });

  it("every rarity has at least one character so no roll can fail", () => {
    for (const r of RARITIES) expect(CHARACTERS.some((c) => c.rarity === r), r).toBe(true);
  });

  it("character ids are unique", () => {
    expect(new Set(CHARACTERS.map((c) => c.id)).size).toBe(CHARACTERS.length);
  });

  it("observed pull rates match published odds within tolerance", () => {
    const rng = mulberry32(2026);
    const N = 40000;
    for (const box of BOXES) {
      const seen: Record<string, number> = {};
      for (let i = 0; i < N; i++) {
        const c = rollBox(box, rng);
        seen[c.rarity] = (seen[c.rarity] ?? 0) + 1;
      }
      for (const r of RARITIES) {
        const observed = ((seen[r] ?? 0) / N) * 100;
        expect(Math.abs(observed - box.odds[r]), `${box.name} ${r}`).toBeLessThan(0.8);
      }
    }
  });

  it("describes odds as 1-in-N for the shop", () => {
    const d = describeOdds(BOXES[0]!);
    // 1 in 144, not the 1 in 200 the raw 0.5% weight suggests: the lucky meter forces a
    // Rare+ every PITY_AT boxes, and a share of those forced pulls land on legendary.
    expect(d.find((x) => x.rarity === "legendary")?.oneIn).toBe(144);
    expect(d.find((x) => x.rarity === "common")?.oneIn).toBe(2);
  });
});

describe("published odds match what a player actually pulls", () => {
  // The lucky meter forces Rare+ every PITY_AT boxes, so the raw weight table is not what
  // comes out of openBox. The odds shown before a kid opens a box are the one number that
  // has to be true, so pin describeOdds to a real simulation of openBox, not to rollBox.
  it("describeOdds matches a full openBox simulation, lucky meter included", () => {
    const rng = mulberry32(99);
    const N = 60000;
    for (const box of BOXES) {
      const s = newState();
      s.parent.dailyBoxCap = Number.MAX_SAFE_INTEGER;
      s.coins = Number.MAX_SAFE_INTEGER;
      // Every series unlocked so no roll is refused.
      for (const c of CHARACTERS) s.inventory[c.id] = 1;
      const seen: Record<string, number> = {};
      let pulls = 0;
      for (let i = 0; i < N; i++) {
        const r = openBox(s, box, rng, new Date("2026-09-06T10:00:00"));
        if (!r.ok) continue;
        const c = CHARACTERS.find((x) => x.id === r.characterId);
        if (c) { seen[c.rarity] = (seen[c.rarity] ?? 0) + 1; pulls++; }
      }
      for (const { rarity, percent } of describeOdds(box)) {
        const actual = ((seen[rarity] ?? 0) / pulls) * 100;
        // Within 1 point, or 15% relative for the very thin tiers.
        const slack = Math.max(1, percent * 0.15);
        expect(Math.abs(actual - percent), `${box.name} ${rarity}: published ${percent.toFixed(2)}% vs actual ${actual.toFixed(2)}%`).toBeLessThan(slack);
      }
    }
  });

  it("the lucky meter lifts legendary above its raw weight", () => {
    const steamer = BOXES[0]!;
    const shown = describeOdds(steamer).find((r) => r.rarity === "legendary")!;
    // Raw weight is 0.5% (1 in 200); the meter makes the real rate meaningfully better.
    expect(shown.percent).toBeGreaterThan(steamer.odds.legendary);
    expect(shown.oneIn!).toBeLessThan(200);
  });
});
