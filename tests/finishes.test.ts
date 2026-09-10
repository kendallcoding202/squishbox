import { describe, expect, it } from "vitest";
import { BOXES } from "../src/data/boxes";
import { CHARACTERS, CHARACTER_BY_ID } from "../src/data/characters";
import {
  characterIdOf,
  describeFinishOdds,
  FINISHES,
  FINISH_INFO,
  finishOf,
  itemKey,
  parseItem,
  rollFinish,
  type Finish,
} from "../src/game/finishes";
import { mulberry32 } from "../src/game/rng";
import { plainOnly } from "../src/net/sync";
import { itemsValue } from "../src/game/trade";
import { loadState, newState, openBox, ownedCount, ownedInSeries, sellSpare, sellValue, displayName, setNickname, inventoryValue, totalItems } from "../src/game/state";

const day = new Date("2026-09-10T10:00:00");
const steamer = BOXES[0]!;

/** A save that survives a JSON round trip through the same code path the app uses on start. */
function reload(state: unknown) {
  const raw = JSON.stringify(state);
  return loadState({ getItem: () => raw });
}

describe("item keys", () => {
  it("every character id ends in a digit, so a trailing letter can only be a finish", () => {
    // The whole parse is built on this. A character id like "c1a" would silently read as a
    // glittery "c1" and quietly merge two different dumplings in one inventory slot.
    for (const c of CHARACTERS) expect(c.id, `character id ${c.id}`).toMatch(/[0-9]$/);
  });

  it("round-trips every finish for every character", () => {
    for (const c of CHARACTERS) {
      for (const f of FINISHES) {
        const key = itemKey(c.id, f);
        expect(parseItem(key)).toEqual({ characterId: c.id, finish: f });
        expect(characterIdOf(key)).toBe(c.id);
        expect(finishOf(key)).toBe(f);
      }
    }
  });

  it("keeps plain dumplings on their bare id, so saves written before finishes need no migration", () => {
    for (const c of CHARACTERS) expect(itemKey(c.id, "plain")).toBe(c.id);
  });

  it("stays inside the trading post's item id rules", () => {
    // server/index.ts validates every item id with /^[a-z0-9]{2,8}$/i in both cleanInventory
    // and cleanItems. A key that fails this is dropped from an inventory without a word, and
    // rejected with a 400 in a trade.
    for (const c of CHARACTERS) {
      for (const f of FINISHES) expect(itemKey(c.id, f)).toMatch(/^[a-z0-9]{2,8}$/i);
    }
  });

  it("rejects a key it cannot read rather than guessing", () => {
    expect(parseItem("c01#gold")).toBeNull();
    expect(parseItem("c01z")).toBeNull(); // z is not a finish
    expect(parseItem("")).toBeNull();
    expect(parseItem("x")).toBeNull(); // a suffix with no character in front of it
  });
});

describe("finishes in the collection", () => {
  it("counts the dumpling, not the wrapping, towards a series", () => {
    // Owning only the gold Taro still means you own Taro. If this counted keys instead of
    // characters, finishes would multiply the cost of an album and re-lock series 2.
    const s = newState();
    const c = CHARACTERS.find((x) => x.series === "s1")!;
    s.inventory[itemKey(c.id, "gold")] = 1;
    expect(ownedInSeries(s.inventory, "s1")).toBe(1);
    s.inventory[itemKey(c.id, "plain")] = 3;
    expect(ownedInSeries(s.inventory, "s1")).toBe(1); // same dumpling, still one
  });

  it("keeps a finish through a save and reload", () => {
    const s = newState();
    const c = CHARACTERS[0]!;
    s.inventory[itemKey(c.id, "rainbow")] = 2;
    s.shelf = [itemKey(c.id, "rainbow")];
    const back = reload(s);
    expect(back.inventory[itemKey(c.id, "rainbow")]).toBe(2);
    expect(back.shelf).toEqual([itemKey(c.id, "rainbow")]);
  });

  it("still drops an item whose character this build does not have", () => {
    const s = newState();
    s.inventory["zz99x"] = 4;
    s.inventory["zz99"] = 2;
    expect(Object.keys(reload(s).inventory)).toEqual([]);
  });

  it("shares one nickname across every finish of a dumpling", () => {
    const s = newState();
    const c = CHARACTERS[0]!;
    setNickname(s, c.id, "Wobbles");
    expect(displayName(s, itemKey(c.id, "gold"))).toBe("Wobbles");
    expect(displayName(s, c.id)).toBe("Wobbles");
  });
});

describe("what a finish is worth", () => {
  it("pays the rarity price times the finish multiplier", () => {
    const c = CHARACTERS.find((x) => x.rarity === "common")!;
    for (const f of FINISHES) {
      expect(sellValue(itemKey(c.id, f))).toBe(Math.round(2 * FINISH_INFO[f].value));
    }
  });

  it("sells a spare finish without touching the plain ones", () => {
    const s = newState();
    const c = CHARACTERS[0]!;
    const gold = itemKey(c.id, "gold");
    s.inventory[gold] = 2;
    s.inventory[c.id] = 1;
    const r = sellSpare(s, gold, day.getTime());
    expect(r.ok).toBe(true);
    expect(s.inventory[gold]).toBe(1);
    expect(s.inventory[c.id]).toBe(1);
  });

  it("never sells the last copy of a finish, even when a plain one is sitting there", () => {
    const s = newState();
    const c = CHARACTERS[0]!;
    s.inventory[itemKey(c.id, "gold")] = 1;
    s.inventory[c.id] = 5;
    expect(sellSpare(s, itemKey(c.id, "gold"), day.getTime()).ok).toBe(false);
  });

  it("values a finish above the plain one when judging a trade", () => {
    const c = CHARACTERS[0]!;
    expect(itemsValue([itemKey(c.id, "gold")])).toBeGreaterThan(itemsValue([c.id]));
  });

  it("leaves every box a coin sink", () => {
    // Finishes raise what a box gives back. If that ever passes the price, the shop turns
    // into a coin printer and the daily cap is the only thing left holding the game up.
    const expectedMultiplier = FINISHES.reduce((a, f) => a + (FINISH_INFO[f].weight / 100) * FINISH_INFO[f].value, 0);
    for (const box of BOXES) {
      const s = newState();
      s.coins = 1_000_000;
      s.parent.dailyBoxCap = 100000;
      s.unlockedSeries = ["s1", "s2"];
      const rng = mulberry32(7);
      let paid = 0;
      let back = 0;
      for (let i = 0; i < 4000; i++) {
        const r = openBox(s, box, rng, day);
        if (!r.ok) throw new Error(`could not open ${box.name}: ${r.reason}`);
        paid += box.price;
        back += sellValue(r.item);
      }
      expect(back / paid, `${box.name} return per coin spent`).toBeLessThan(1);
    }
    expect(expectedMultiplier).toBeCloseTo(1.19, 2);
  });
});

describe("rolling a finish", () => {
  it("lands near the published rates over a long run", () => {
    const rng = mulberry32(4242);
    const seen: Record<Finish, number> = { plain: 0, glitter: 0, rainbow: 0, gold: 0 };
    const n = 200_000;
    for (let i = 0; i < n; i++) seen[rollFinish(rng)]++;
    for (const row of describeFinishOdds()) {
      expect((seen[row.finish] / n) * 100, `${row.label} rate`).toBeCloseTo(row.percent, 0);
    }
  });

  it("publishes a table that adds up to 100", () => {
    const sum = describeFinishOdds().reduce((a, r) => a + r.percent, 0);
    expect(sum).toBeCloseTo(100, 6);
  });

  it("puts a finish on a dumpling from an ordinary box", () => {
    const s = newState();
    s.coins = 1_000_000;
    s.parent.dailyBoxCap = 100000;
    const rng = mulberry32(3);
    const finishes = new Set<Finish>();
    for (let i = 0; i < 3000; i++) {
      const r = openBox(s, steamer, rng, day);
      if (r.ok) finishes.add(r.finish);
    }
    expect(finishes.has("plain")).toBe(true);
    expect(finishes.has("glitter")).toBe(true);
    expect(finishes.has("gold")).toBe(true);
  });
});

describe("what leaves the device", () => {
  it("publishes only plain dumplings to the trading post", () => {
    // A build without finishes renders a friend's spares straight from this inventory and
    // throws on an item it cannot look up. Nothing with a finish may reach it.
    const c = CHARACTERS[0]!;
    const shared = plainOnly({ [c.id]: 2, [itemKey(c.id, "gold")]: 1, [itemKey(c.id, "glitter")]: 4 });
    expect(shared).toEqual({ [c.id]: 2 });
  });

  it("every published key is one an older build can already look up", () => {
    const inv: Record<string, number> = {};
    for (const c of CHARACTERS) for (const f of FINISHES) inv[itemKey(c.id, f)] = 1;
    for (const key of Object.keys(plainOnly(inv))) expect(CHARACTER_BY_ID.has(key)).toBe(true);
  });
});

describe("inventory value", () => {
  it("counts a gold dumpling as worth more than a plain one", () => {
    const c = CHARACTERS[0]!;
    expect(inventoryValue({ [itemKey(c.id, "gold")]: 1 })).toBeGreaterThan(inventoryValue({ [c.id]: 1 }));
  });
});

describe("counters that show a total", () => {
  it("counts different dumplings, not different finishes", () => {
    // The home header reads "N of 50 collected" against the character list. Counting item
    // keys instead put three finishes of one dumpling on the board as three collected.
    const c = CHARACTERS[0]!;
    const inv = { [c.id]: 1, [itemKey(c.id, "gold")]: 1, [itemKey(c.id, "glitter")]: 1 };
    expect(ownedCount(inv)).toBe(1);
    expect(totalItems(inv)).toBe(3); // the basket really does hold three
  });
});
