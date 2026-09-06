import { describe, expect, it } from "vitest";
import { BOXES, boxesInSeries } from "../src/data/boxes";
import { CHARACTERS, RARITIES, SERIES, charactersInSeries } from "../src/data/characters";
import { rollBox } from "../src/game/odds";
import { mulberry32 } from "../src/game/rng";
import { newState, openBox, rewardsForSeries, rewardStatus, seriesUnlocked, seriesUnlockProgress, SHELF_MAX, takeNewUnlocks, toggleShelf } from "../src/game/state";

const day = new Date("2026-09-06T10:00:00");

describe("series data", () => {
  it("every series has every rarity so no box can fail to roll", () => {
    for (const s of SERIES) for (const r of RARITIES) expect(charactersInSeries(s.id).some((c) => c.rarity === r), `${s.id} ${r}`).toBe(true);
  });
  it("every character belongs to a known series and ids are unique", () => {
    const ids = new Set(SERIES.map((s) => s.id));
    for (const c of CHARACTERS) expect(ids.has(c.series), c.id).toBe(true);
    expect(new Set(CHARACTERS.map((c) => c.id)).size).toBe(CHARACTERS.length);
  });
  it("boxes only roll characters from their own series", () => {
    const rng = mulberry32(3);
    for (const box of BOXES) for (let i = 0; i < 300; i++) expect(rollBox(box, rng).series).toBe(box.series);
  });
  it("series 2 has 20 dumplings and its own boxes", () => {
    expect(charactersInSeries("s2").length).toBe(20);
    expect(boxesInSeries("s2").length).toBe(2);
  });
});

describe("series unlock", () => {
  it("series 1 is always open; series 2 opens at 15 distinct Steamer Pals", () => {
    const s = newState();
    expect(seriesUnlocked(s, "s1")).toBe(true);
    expect(seriesUnlocked(s, "s2")).toBe(false);
    const s1 = charactersInSeries("s1");
    for (const c of s1.slice(0, 14)) s.inventory[c.id] = 1;
    expect(seriesUnlocked(s, "s2")).toBe(false);
    expect(seriesUnlockProgress(s, "s2")).toEqual([14, 15]);
    s.inventory[s1[14]!.id] = 3; // spares don't count twice
    expect(seriesUnlocked(s, "s2")).toBe(true);
    expect(takeNewUnlocks(s)).toEqual(["s2"]);
    expect(takeNewUnlocks(s)).toEqual([]);
  });
  it("refuses to open a locked series box", () => {
    const s = newState();
    s.coins = 1000;
    const bamboo = boxesInSeries("s2")[0]!;
    expect(openBox(s, bamboo, mulberry32(1), day)).toEqual({ ok: false, reason: "locked" });
    for (const c of charactersInSeries("s1").slice(0, 15)) s.inventory[c.id] = 1;
    const r = openBox(s, bamboo, mulberry32(1), day);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.characterId.startsWith("2")).toBe(true);
  });
  it("series 2 rewards track only series 2", () => {
    const s = newState();
    for (const c of charactersInSeries("s1")) s.inventory[c.id] = 1;
    const album2 = rewardsForSeries("s2").find((r) => r.id === "s2-album")!;
    expect(rewardStatus(s, album2)).toBe("locked");
    expect(album2.progress(s.inventory)).toEqual([0, 20]);
    for (const c of charactersInSeries("s2")) s.inventory[c.id] = 1;
    expect(rewardStatus(s, album2)).toBe("ready");
  });
});

describe("shelf", () => {
  it("holds up to SHELF_MAX owned dumplings and toggles", () => {
    const s = newState();
    expect(toggleShelf(s, "c01")).toBe("not-owned");
    for (let i = 1; i <= 8; i++) s.inventory[`c${String(i).padStart(2, "0")}`] = 1;
    for (let i = 1; i <= SHELF_MAX; i++) expect(toggleShelf(s, `c${String(i).padStart(2, "0")}`)).toBe("added");
    expect(toggleShelf(s, "c07")).toBe("full");
    expect(toggleShelf(s, "c03")).toBe("removed");
    expect(toggleShelf(s, "c07")).toBe("added");
    expect(s.shelf).toEqual(["c01", "c02", "c04", "c05", "c06", "c07"]);
  });
});
