import { describe, expect, it } from "vitest";
import { BOTS, botAccepts, botProposal, seedBotInventory } from "../src/game/bots";
import { mulberry32 } from "../src/game/rng";
import { assess, canConfirm, confirm, COOLDOWN_MS, createTrade, decline, execute, setOffer } from "../src/game/trade";

const T0 = 1_000_000;

describe("trade engine", () => {
  it("clears both confirmations whenever either side changes the offer", () => {
    let t = createTrade("t1", "you", "mika", T0);
    t = setOffer(t, "a", ["c01"], T0);
    t = setOffer(t, "b", ["u02"], T0);
    t = confirm(t, "a", T0 + COOLDOWN_MS);
    expect(t.a.confirmed).toBe(true);
    t = setOffer(t, "b", ["c03"], T0 + COOLDOWN_MS + 1); // last-second swap
    expect(t.a.confirmed).toBe(false);
    expect(t.b.confirmed).toBe(false);
    expect(t.status).toBe("open");
  });

  it("blocks confirm during the cooldown after a change", () => {
    let t = createTrade("t2", "you", "mika", T0);
    t = setOffer(t, "a", ["c01"], T0);
    expect(canConfirm(t, T0 + 500).ok).toBe(false);
    expect(canConfirm(t, T0 + 500).waitMs).toBe(COOLDOWN_MS - 500);
    expect(() => confirm(t, "a", T0 + 500)).toThrow();
    expect(canConfirm(t, T0 + COOLDOWN_MS).ok).toBe(true);
  });

  it("refuses to confirm an empty trade", () => {
    const t = createTrade("t3", "you", "mika", T0);
    expect(canConfirm(t, T0 + COOLDOWN_MS).ok).toBe(false);
  });

  it("locks only when both sides confirm, then swaps atomically", () => {
    let t = createTrade("t4", "you", "mika", T0);
    t = setOffer(t, "a", ["c01", "c01"], T0);
    t = setOffer(t, "b", ["r01"], T0);
    t = confirm(t, "a", T0 + COOLDOWN_MS);
    expect(t.status).toBe("open");
    expect(() => execute(t, { c01: 2 }, { r01: 1 })).toThrow();
    t = confirm(t, "b", T0 + COOLDOWN_MS);
    expect(t.status).toBe("locked");
    const r = execute(t, { c01: 3, u01: 1 }, { r01: 1 });
    expect(r.invA).toEqual({ c01: 1, u01: 1, r01: 1 });
    expect(r.invB).toEqual({ c01: 2 });
    expect(r.trade.status).toBe("completed");
  });

  it("refuses to execute when a side no longer owns the items (no ghost items)", () => {
    let t = createTrade("t5", "you", "mika", T0);
    t = setOffer(t, "a", ["c01"], T0);
    t = setOffer(t, "b", ["r01"], T0);
    t = confirm(t, "a", T0 + COOLDOWN_MS);
    t = confirm(t, "b", T0 + COOLDOWN_MS);
    expect(() => execute(t, {}, { r01: 1 })).toThrow(/no longer has/);
    expect(() => execute(t, { c01: 1 }, {})).toThrow(/no longer has/);
  });

  it("cannot change or confirm a declined trade", () => {
    let t = createTrade("t6", "you", "mika", T0);
    t = setOffer(t, "a", ["c01"], T0);
    t = decline(t);
    expect(() => setOffer(t, "a", [], T0)).toThrow();
    expect(canConfirm(t, T0 + COOLDOWN_MS).ok).toBe(false);
  });

  it("warns about lopsided trades", () => {
    let t = createTrade("t7", "you", "mika", T0);
    t = setOffer(t, "a", ["l01"], T0); // legendary
    t = setOffer(t, "b", ["c01", "c02"], T0); // two commons
    const a = assess(t, "a");
    expect(a.verdict).toBe("bad");
    expect(a.warning).toBeTruthy();
    expect(assess(t, "b").verdict).toBe("great");
  });
});

describe("neighbor bots", () => {
  it("seed deterministic inventories", () => {
    for (const b of BOTS) {
      const inv = seedBotInventory(b);
      expect(inv).toEqual(seedBotInventory(b));
      expect(Object.keys(inv).length).toBeGreaterThan(0);
    }
  });

  it("accept fair trades and refuse bad ones, and never give away a last copy", () => {
    const bot = BOTS[0]!;
    let t = createTrade("b1", "you", bot.id, T0);
    t = setOffer(t, "a", ["r01"], T0);
    t = setOffer(t, "b", ["u01"], T0);
    expect(botAccepts(bot, t, "b", { u01: 2 })).toBe(true);
    expect(botAccepts(bot, t, "b", { u01: 1 })).toBe(false);
    t = setOffer(t, "a", ["c01"], T0);
    t = setOffer(t, "b", ["e01"], T0);
    expect(botAccepts(bot, t, "b", { e01: 5 })).toBe(false);
  });

  it("propose swaps of spare dupes at similar value, or nothing", () => {
    const bot = BOTS[0]!;
    const botInv = { c01: 3, u02: 2 };
    const p = botProposal(bot, botInv, { c05: 2 }, T0, mulberry32(1));
    expect(p).not.toBeNull();
    expect(p!.a.items).toEqual(["c05"]);
    expect(p!.b.items).toEqual(["c01"]);
    expect(botProposal(bot, botInv, { c05: 1 }, T0, mulberry32(1))).toBeNull();
  });
});
