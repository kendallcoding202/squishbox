import { describe, expect, it } from "vitest";
import { boxesInSeries } from "../src/data/boxes";
import {
  CHARACTERS, CORE_CHARACTERS, SERIES_BY_ID, charactersInSeries, seasonDaysLeft, seasonOf, seasonOpen,
  type Season,
} from "../src/data/characters";
import { BOTS, botPool } from "../src/game/bots";
import { mulberry32 } from "../src/game/rng";
import { claimReward, latchUnlocks, newState, openBox, ownedCoreCount, ownedInSeries, rewardsForSeries, rewardStatus, seriesUnlocked, takeNewUnlocks } from "../src/game/state";

const halloween = SERIES_BY_ID.get("s3")!.season as Season;
const on = (iso: string) => new Date(`${iso}T12:00:00`);

describe("season windows", () => {
  it("is open from the first day through the last, inclusive", () => {
    expect(seasonOpen(halloween, on("2026-10-17"))).toBe(false);
    expect(seasonOpen(halloween, on("2026-10-18"))).toBe(true);
    expect(seasonOpen(halloween, on("2026-10-31"))).toBe(true);
    expect(seasonOpen(halloween, on("2026-11-01"))).toBe(true); // "until November 1st" includes it
    expect(seasonOpen(halloween, on("2026-11-02"))).toBe(false);
  });

  it("comes back the next year rather than being gone for good", () => {
    for (const y of [2026, 2027, 2031]) expect(seasonOpen(halloween, on(`${y}-10-25`)), String(y)).toBe(true);
    expect(seasonOpen(halloween, on("2027-06-01"))).toBe(false);
  });

  it("handles a window that wraps the new year", () => {
    const winter: Season = { from: { month: 12, day: 20 }, to: { month: 1, day: 5 }, returns: "Back in December." };
    expect(seasonOpen(winter, on("2026-12-19"))).toBe(false);
    expect(seasonOpen(winter, on("2026-12-25"))).toBe(true);
    expect(seasonOpen(winter, on("2027-01-01"))).toBe(true);
    expect(seasonOpen(winter, on("2027-01-05"))).toBe(true);
    expect(seasonOpen(winter, on("2027-01-06"))).toBe(false);
  });

  it("counts the days left including today, and zero once shut", () => {
    expect(seasonDaysLeft(halloween, on("2026-11-01"))).toBe(1);
    expect(seasonDaysLeft(halloween, on("2026-10-31"))).toBe(2);
    expect(seasonDaysLeft(halloween, on("2026-10-22"))).toBe(11);
    expect(seasonDaysLeft(halloween, on("2026-11-02"))).toBe(0);
  });
});

describe("the Haunted Steamer", () => {
  it("has eight dumplings, its own two boxes, and sits outside the headline count", () => {
    expect(charactersInSeries("s3").length).toBe(8);
    expect(boxesInSeries("s3").length).toBe(2);
    expect(CORE_CHARACTERS.length).toBe(50);
    expect(CORE_CHARACTERS.some((c) => c.series === "s3")).toBe(false);
    expect(CHARACTERS.length).toBe(58);
  });

  it("opens and shuts on the date, not on what you own", () => {
    const s = newState();
    expect(seriesUnlocked(s, "s3", on("2026-10-25"))).toBe(true);
    expect(seriesUnlocked(s, "s3", on("2026-11-02"))).toBe(false);
    // Owning the whole set does not hold the window open.
    for (const c of charactersInSeries("s3")) s.inventory[c.id] = 1;
    expect(seriesUnlocked(s, "s3", on("2026-11-02"))).toBe(false);
  });

  it("never latches into the save, however many times it is opened", () => {
    const s = newState();
    for (let i = 0; i < 5; i++) latchUnlocks(s);
    expect(s.unlockedSeries).not.toContain("s3");
    expect(takeNewUnlocks(s)).not.toContain("s3"); // and it never steals the unlock modal
  });

  it("sells its boxes only inside the window", () => {
    const s = newState();
    s.coins = 1000;
    const bag = boxesInSeries("s3")[0]!;
    expect(openBox(s, bag, mulberry32(1), on("2026-10-05"))).toEqual({ ok: false, reason: "locked" });
    expect(openBox(s, bag, mulberry32(1), on("2026-11-02"))).toEqual({ ok: false, reason: "locked" });
    const r = openBox(s, bag, mulberry32(1), on("2026-10-25"));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.characterId.startsWith("3")).toBe(true);
  });

  it("lets a kid keep what they caught after the window shuts", () => {
    const s = newState();
    s.coins = 1000;
    const bag = boxesInSeries("s3")[0]!;
    for (let i = 0; i < 4; i++) openBox(s, bag, mulberry32(i + 1), on("2026-10-25"));
    const caught = ownedInSeries(s.inventory, "s3");
    expect(caught).toBeGreaterThan(0);
    latchUnlocks(s);
    // November: the shop is shut but the basket is untouched.
    expect(seriesUnlocked(s, "s3", on("2026-11-05"))).toBe(false);
    expect(ownedInSeries(s.inventory, "s3")).toBe(caught);
    // And they never count toward the fifty the album is sized for.
    expect(ownedCoreCount(s.inventory)).toBe(0);
  });

  it("brings a neighbor who only knocks during the run, and counts his set correctly", () => {
    const nox = BOTS.find((b) => b.requiresSeries === "s3")!;
    const s = newState();
    expect(seriesUnlocked(s, nox.requiresSeries!, on("2026-10-25"))).toBe(true);
    expect(seriesUnlocked(s, nox.requiresSeries!, on("2026-12-01"))).toBe(false);
    expect(botPool(nox)).toBe(8); // not 58: he can only ever hold spooky ones
    expect(botPool(BOTS.find((b) => b.id === "mika")!)).toBe(30);
    expect(botPool(BOTS.find((b) => b.id === "lin")!)).toBe(20);
  });

  it("pays out once for the whole set, and goes on waiting between Halloweens", () => {
    const rewards = rewardsForSeries("s3");
    expect(rewards.map((r) => r.id)).toEqual(["s3-album"]); // one goal, not six near-identical ones
    const album = rewards[0]!;
    const s = newState();
    expect(album.progress(s.inventory)).toEqual([0, 8]);
    for (const c of charactersInSeries("s3").slice(0, 7)) s.inventory[c.id] = 1;
    expect(rewardStatus(s, album)).toBe("locked"); // still waiting on the last one, next October
    s.inventory[charactersInSeries("s3")[7]!.id] = 1;
    expect(rewardStatus(s, album)).toBe("ready");
    expect(claimReward(s, album.id, Date.now())).toBe(250);
    expect(claimReward(s, album.id, Date.now())).toBe(0); // never twice
  });

  it("is the only seasonal series, and the others are earned not dated", () => {
    expect(seasonOf("s1")).toBeNull();
    expect(seasonOf("s2")).toBeNull();
    expect(seasonOf("s3")).not.toBeNull();
  });
});
