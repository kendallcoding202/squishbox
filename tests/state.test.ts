import { describe, expect, it } from "vitest";
import { BOXES } from "../src/data/boxes";
import { mulberry32 } from "../src/game/rng";
import { claimDaily, DAILY_COINS, loadState, newState, openBox, saveState, STARTING_COINS, STREAK_BONUS } from "../src/game/state";

const day = (s: string) => new Date(`${s}T10:00:00`);

describe("daily coins", () => {
  it("grants once per calendar day", () => {
    const s = newState();
    expect(claimDaily(s, day("2026-09-06"))).toBe(DAILY_COINS);
    expect(claimDaily(s, day("2026-09-06"))).toBe(0);
    expect(s.coins).toBe(STARTING_COINS + DAILY_COINS);
  });

  it("builds a streak on consecutive days and resets after a gap", () => {
    const s = newState();
    claimDaily(s, day("2026-09-06"));
    expect(claimDaily(s, day("2026-09-07"))).toBe(DAILY_COINS + STREAK_BONUS);
    expect(s.streak).toBe(2);
    expect(claimDaily(s, day("2026-09-10"))).toBe(DAILY_COINS);
    expect(s.streak).toBe(1);
  });
});

describe("opening boxes", () => {
  const box = BOXES[0]!;

  it("refuses when coins are short", () => {
    const s = newState();
    s.coins = box.price - 1;
    expect(openBox(s, box, mulberry32(1), day("2026-09-06"))).toEqual({ ok: false, reason: "coins" });
  });

  it("charges, adds to inventory, flags new vs dupe", () => {
    const s = newState();
    s.coins = 1000;
    const r1 = openBox(s, box, mulberry32(7), day("2026-09-06"));
    expect(r1.ok && r1.isNew).toBe(true);
    expect(s.coins).toBe(1000 - box.price);
    expect(s.stats.boxesOpened).toBe(1);
    expect(s.log[0]?.kind).toBe("open");
  });

  it("enforces the parent's daily box cap and resets next day", () => {
    const s = newState();
    s.coins = 10000;
    s.parent.dailyBoxCap = 2;
    const rng = mulberry32(3);
    expect(openBox(s, box, rng, day("2026-09-06")).ok).toBe(true);
    expect(openBox(s, box, rng, day("2026-09-06")).ok).toBe(true);
    expect(openBox(s, box, rng, day("2026-09-06"))).toEqual({ ok: false, reason: "cap" });
    expect(openBox(s, box, rng, day("2026-09-07")).ok).toBe(true);
  });
});

describe("persistence", () => {
  it("round-trips through storage and survives garbage", () => {
    const mem = new Map<string, string>();
    const storage = { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v) };
    const s = newState("Kid");
    s.coins = 123;
    saveState(storage, s);
    expect(loadState(storage).coins).toBe(123);
    expect(loadState(storage).playerName).toBe("Kid");
    mem.set("squishbox.save.v1", "{not json");
    expect(loadState(storage).coins).toBe(STARTING_COINS);
    expect(loadState(null).coins).toBe(STARTING_COINS);
  });
});

describe("loadState survives a damaged save", () => {
  // A spread only fills in missing keys, so a present-but-wrong-typed field used to go
  // straight through and throw on the first render: a blank screen with the Parent
  // corner (and its reset) unreachable.
  const load = (save: string) => loadState({ getItem: () => save });
  const base = {
    version: 1, coins: 50, inventory: {}, shelf: [], nicknames: {}, log: [],
    boxesToday: { day: "2026-09-06", count: 0 }, rewardsClaimed: [], celebrated: [], pity: 0,
  };
  const withField = (patch: Record<string, unknown>) => JSON.stringify({ ...base, ...patch });

  it("replaces wrong-typed collections with the defaults", () => {
    expect(load(withField({ inventory: null })).inventory).toEqual({});
    expect(load(withField({ inventory: "nope" })).inventory).toEqual({});
    expect(load(withField({ shelf: null })).shelf).toEqual([]);
    expect(load(withField({ log: null })).log).toEqual([]);
    expect(load(withField({ nicknames: 7 })).nicknames).toEqual({});
    expect(load(withField({ rewardsClaimed: null })).rewardsClaimed).toEqual([]);
    expect(load(withField({ boxesToday: null })).boxesToday.count).toBe(0);
  });

  it("replaces non-numeric coins rather than letting them turn into NaN", () => {
    expect(load(withField({ coins: "abc" })).coins).toBe(STARTING_COINS);
    expect(load(withField({ coins: null })).coins).toBe(STARTING_COINS);
  });

  it("keeps a daily box cap that would otherwise block every box forever", () => {
    expect(load(withField({ parent: { dailyBoxCap: null } })).parent.dailyBoxCap).toBeGreaterThan(0);
    expect(load(withField({ parent: { dailyBoxCap: 0 } })).parent.dailyBoxCap).toBeGreaterThan(0);
  });

  it("still keeps good values", () => {
    const s = load(withField({ coins: 123, inventory: { c01: 2 } }));
    expect(s.coins).toBe(123);
    expect(s.inventory).toEqual({ c01: 2 });
  });
});

describe("online trading is off until a grown-up turns it on", () => {
  it("defaults to off so nothing leaves the device", () => {
    expect(newState().parent.onlineTrading).toBe(false);
  });
});

describe("a failed save is reported, not swallowed", () => {
  it("returns false when storage refuses the write", () => {
    const full = { setItem: () => { throw new DOMException("QuotaExceededError"); } };
    expect(saveState(full, newState())).toBe(false);
  });

  it("returns false when there is no storage at all", () => {
    expect(saveState(null, newState())).toBe(false);
  });

  it("returns true on a normal write", () => {
    const mem = new Map<string, string>();
    expect(saveState({ setItem: (k: string, v: string) => { mem.set(k, v); } }, newState())).toBe(true);
    expect(mem.size).toBe(1);
  });
});

describe("a save naming dumplings this build doesn't have", () => {
  const load = (o: object) => loadState({ getItem: () => JSON.stringify(o) });
  const base = { version: 1, coins: 50, shelf: [], nicknames: {}, log: [],
    boxesToday: { day: "2026-09-06", count: 0 }, rewardsClaimed: [], celebrated: [], pity: 0 };

  it("drops unknown ids instead of crashing the Trade screen on .rarity", () => {
    const s = load({ ...base, inventory: { c01: 2, notARealDumpling: 3 } });
    expect(s.inventory.c01).toBe(2);
    expect(s.inventory.notARealDumpling).toBeUndefined();
  });

  it("drops non-positive and non-numeric counts", () => {
    const s = load({ ...base, inventory: { c01: 0, c02: -3, c03: "lots", c04: 1 } });
    expect(Object.keys(s.inventory)).toEqual(["c04"]);
  });

  it("drops unknown ids from the shelf too", () => {
    const s = load({ ...base, inventory: { c01: 1 }, shelf: ["c01", "ghost"] });
    expect(s.shelf).toEqual(["c01"]);
  });
});

describe("winding the device clock back does not buy another day", () => {
  const day = (s: string) => new Date(`${s}T10:00:00`);

  it("refuses a repeat daily claim after the clock goes backwards", () => {
    const s = newState();
    expect(claimDaily(s, day("2026-09-06"))).toBe(DAILY_COINS);
    expect(claimDaily(s, day("2026-09-07"))).toBeGreaterThan(0);
    // Settings is two taps away: this used to hand out another day's coins, over and over.
    expect(claimDaily(s, day("2026-09-06"))).toBe(0);
    expect(claimDaily(s, day("2026-09-05"))).toBe(0);
    // and going forward again from the real day still works
    expect(claimDaily(s, day("2026-09-08"))).toBeGreaterThan(0);
  });

  it("does not hand back a fresh box allowance", () => {
    const s = newState();
    s.coins = 100000;
    s.parent.dailyBoxCap = 3;
    const box = BOXES[0]!;
    for (let i = 0; i < 3; i++) expect(openBox(s, box, mulberry32(i + 1), day("2026-09-06")).ok).toBe(true);
    expect(openBox(s, box, mulberry32(9), day("2026-09-06"))).toEqual({ ok: false, reason: "cap" });
    // wind back a day: the cap a parent set must still hold
    expect(openBox(s, box, mulberry32(10), day("2026-09-05"))).toEqual({ ok: false, reason: "cap" });
    // a genuine new day still refills it
    expect(openBox(s, box, mulberry32(11), day("2026-09-07")).ok).toBe(true);
  });

  it("leaves an honest forward-moving clock alone", () => {
    const s = newState();
    expect(claimDaily(s, day("2026-09-06"))).toBe(DAILY_COINS);
    expect(claimDaily(s, day("2026-09-07"))).toBe(DAILY_COINS + STREAK_BONUS);
    expect(s.streak).toBe(2);
  });
});
