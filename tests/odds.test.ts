import { describe, expect, it } from "vitest";
import { BOXES } from "../src/data/boxes";
import { CHARACTERS, RARITIES } from "../src/data/characters";
import { describeOdds, oddsAreValid, rollBox } from "../src/game/odds";
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
    expect(d.find((x) => x.rarity === "legendary")?.oneIn).toBe(200);
    expect(d.find((x) => x.rarity === "common")?.oneIn).toBe(2);
  });
});
