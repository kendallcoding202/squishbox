import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { CHARACTER_BY_ID } from "../src/data/characters";
import { parseItem } from "../src/game/finishes";
import { loadState } from "../src/game/state";

/**
 * A save written by the real 1.3 release, not one made up to look like it.
 *
 * The fixture came out of the shipped 1.3 build (ca8c605) after it had been played in a
 * browser: boxes opened, a buddy chosen, something on the shelf, a nickname, Halloween
 * dumplings, finishes. Earlier upgrade checks used saves typed by hand, which only prove
 * that the loader copes with what its author imagined a save looks like.
 */
const raw = readFileSync(new URL("./fixtures/save-1.3-rich.json", import.meta.url), "utf8");
const before = JSON.parse(raw) as { inventory: Record<string, number>; coins: number; shelf: string[]; nicknames: Record<string, string>; buddy: { characterId: string } };

describe("updating from 1.3", () => {
  const after = loadState({ getItem: () => raw });

  it("keeps every dumpling, in every finish, in the same numbers", () => {
    expect(after.inventory).toEqual(before.inventory);
    expect(Object.values(after.inventory).reduce((a, b) => a + b, 0)).toBe(44);
  });

  it("keeps the coins, the shelf, the nickname and the buddy", () => {
    expect(after.coins).toBe(before.coins);
    expect(after.shelf).toEqual(before.shelf);
    expect(after.nicknames).toEqual(before.nicknames);
    expect(after.buddy?.characterId).toBe(before.buddy.characterId);
    expect(after.onboarded).toBe(true);
  });

  it("is a fixture this build can still draw in full", () => {
    // If a character in the fixture is ever removed, the loader would drop it, which is
    // exactly the loss this file exists to catch — so say so here rather than fail obscurely.
    for (const key of Object.keys(before.inventory)) {
      const parsed = parseItem(key);
      expect(parsed && CHARACTER_BY_ID.has(parsed.characterId), key).toBe(true);
    }
  });
});
