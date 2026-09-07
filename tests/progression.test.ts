import { describe, expect, it } from "vitest";
import { BOXES } from "../src/data/boxes";
import { CHARACTER_BY_ID, charactersInSeries } from "../src/data/characters";
import { mulberry32 } from "../src/game/rng";
import { applyDelivery, claimReward, loadState, luckyNext, newState, openBox, PITY_AT, REWARDS, rewardStatus, SELL_VALUE, sellSpare, setNickname, displayName } from "../src/game/state";

const day = new Date("2026-09-06T10:00:00");
const steamer = BOXES[0]!;

describe("lucky meter", () => {
  it("forces Rare or better on the PITY_AT-th box and then resets", () => {
    const s = newState();
    s.coins = 100000;
    s.parent.dailyBoxCap = 1000;
    const rng = mulberry32(99);
    let forced = 0;
    for (let i = 0; i < 400; i++) {
      const wasLucky = luckyNext(s);
      const r = openBox(s, steamer, rng, day);
      expect(r.ok).toBe(true);
      if (!r.ok) continue;
      expect(r.lucky).toBe(wasLucky);
      const rarity = CHARACTER_BY_ID.get(r.characterId)!.rarity;
      if (wasLucky) {
        forced++;
        expect(["rare", "epic", "legendary"]).toContain(rarity);
        expect(s.pity).toBe(0);
      }
      expect(s.pity).toBeLessThan(PITY_AT);
    }
    expect(forced).toBeGreaterThan(0);
  });

  it("never goes more than PITY_AT boxes without a Rare+", () => {
    const s = newState();
    s.coins = 100000;
    s.parent.dailyBoxCap = 1000;
    const rng = mulberry32(5);
    let gap = 0;
    for (let i = 0; i < 300; i++) {
      const r = openBox(s, steamer, rng, day);
      if (!r.ok) throw new Error("unexpected");
      const rarity = CHARACTER_BY_ID.get(r.characterId)!.rarity;
      gap = ["rare", "epic", "legendary"].includes(rarity) ? 0 : gap + 1;
      expect(gap).toBeLessThan(PITY_AT);
    }
  });
});

describe("steam pot", () => {
  it("sells only spares, pays by rarity, and keeps the last copy", () => {
    const s = newState();
    s.inventory = { c01: 3, r01: 1 };
    const before = s.coins;
    expect(sellSpare(s, "r01", 1)).toEqual({ ok: false });
    expect(sellSpare(s, "c01", 1)).toEqual({ ok: true, coins: SELL_VALUE.common });
    expect(sellSpare(s, "c01", 1)).toEqual({ ok: true, coins: SELL_VALUE.common });
    expect(sellSpare(s, "c01", 1)).toEqual({ ok: false });
    expect(s.inventory.c01).toBe(1);
    expect(s.coins).toBe(before + 2 * SELL_VALUE.common);
    expect(s.stats.coinsFromSales).toBe(2 * SELL_VALUE.common);
    expect(s.log[0]?.kind).toBe("sell");
  });
});

describe("album rewards", () => {
  it("unlock when a set is complete and can be claimed once", () => {
    const s = newState();
    const commons = charactersInSeries("s1").filter((c) => c.rarity === "common");
    const r = REWARDS.find((x) => x.id === "set-common")!;
    expect(rewardStatus(s, r)).toBe("locked");
    for (const c of commons.slice(0, -1)) s.inventory[c.id] = 1;
    expect(rewardStatus(s, r)).toBe("locked");
    expect(claimReward(s, r.id, 1)).toBe(0);
    s.inventory[commons[commons.length - 1]!.id] = 1;
    expect(rewardStatus(s, r)).toBe("ready");
    const coins = s.coins;
    expect(claimReward(s, r.id, 1)).toBe(r.coins);
    expect(s.coins).toBe(coins + r.coins);
    expect(rewardStatus(s, r)).toBe("claimed");
    expect(claimReward(s, r.id, 1)).toBe(0);
  });

  it("series 1 album reward requires all 30 Steamer Pals", () => {
    const s = newState();
    const r = REWARDS.find((x) => x.id === "album")!;
    const s1 = charactersInSeries("s1");
    for (const c of s1) s.inventory[c.id] = 1;
    expect(rewardStatus(s, r)).toBe("ready");
    expect(r.progress(s.inventory)).toEqual([s1.length, s1.length]);
    expect(s1.length).toBe(30);
  });
});

describe("nicknames", () => {
  it("sanitizes, caps length, and clears on empty", () => {
    const s = newState();
    expect(setNickname(s, "c01", "  Sir <b>Bao</b> the   Great!!! ")).toBe("Sir bBaob th");
    expect(displayName(s, "c01")).toBe("Sir bBaob th");
    expect(setNickname(s, "c01", "   ")).toBe("");
    expect(displayName(s, "c01")).toBe("Bao");
    expect(setNickname(s, "c01", "Émilie 2")).toBe("Émilie 2");
  });
});

describe("save migration", () => {
  it("fills new fields into an older save", () => {
    const old = { version: 1, coins: 77, inventory: { c01: 1 }, stats: { boxesOpened: 3 }, parent: { pin: "1234" } };
    const mem = new Map([["squishbox.save.v1", JSON.stringify(old)]]);
    const s = loadState({ getItem: (k: string) => mem.get(k) ?? null });
    expect(s.coins).toBe(77);
    expect(s.pity).toBe(0);
    expect(s.settings.sound).toBe(true);
    expect(s.stats.boxesOpened).toBe(3);
    expect(s.stats.coinsFromSales).toBe(0);
    expect(s.parent.pin).toBe("1234");
    expect(s.parent.dailyBoxCap).toBe(10);
    expect(s.nicknames).toEqual({});
  });
});

describe("friend trade deliveries", () => {
  it("moves items, keeps the last copy, ignores unknown ids, and logs", () => {
    const s = newState();
    s.inventory = { c01: 2, c02: 1 };
    applyDelivery(s, { partnerName: "Ada", give: ["c01", "c02"], get: ["r01", "zzz"] }, 5);
    expect(s.inventory).toEqual({ c01: 1, c02: 1, r01: 1 });
    expect(s.stats.tradesCompleted).toBe(1);
    expect(s.log[0]?.text).toContain("Ada");
  });
  it("a save that never chose gets online trading off, and no net identity", () => {
    // Fail closed: a save with no stated preference must not start talking to the
    // trading post. Only a grown-up turning it on in the Parent corner does that.
    const mem = new Map([["squishbox.save.v1", JSON.stringify({ version: 1, parent: { pin: null } })]]);
    const s = loadState({ getItem: (k: string) => mem.get(k) ?? null });
    expect(s.parent.onlineTrading).toBe(false);
    expect(s.net).toBeNull();
  });

  it("keeps a grown-up's explicit choice to allow online trading", () => {
    const mem = new Map([["squishbox.save.v1", JSON.stringify({ version: 1, parent: { pin: null, onlineTrading: true } })]]);
    const s = loadState({ getItem: (k: string) => mem.get(k) ?? null });
    expect(s.parent.onlineTrading).toBe(true);
  });
});
