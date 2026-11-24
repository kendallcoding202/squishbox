import { existsSync, statSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { BOXES } from "../src/data/boxes";
import { CHARACTERS } from "../src/data/characters";
import { PLACES, SPOTS } from "../src/game/room";

// The game falls back to its old drawings when a picture is missing, which is right for a
// dumpling still being drawn and wrong for a release: one SVG dumpling in a basket of
// paintings looks broken. So everything the game can show must have its painting.
const art = (group: string, id: string): string => `src/art/${group}/${id}.webp`;
const missing = (group: string, ids: string[]): string[] => ids.filter((id) => !existsSync(art(group, id)));

describe("every picture the game shows is painted", () => {
  it("every dumpling", () => {
    expect(missing("dumplings", CHARACTERS.map((c) => c.id))).toEqual([]);
  });

  it("every basket in the shop", () => {
    expect(missing("boxes", BOXES.map((b) => b.id))).toEqual([]);
  });

  it("every place, and everything in it", () => {
    expect(missing("rooms", PLACES.map((p) => p.id))).toEqual([]);
    const props = SPOTS.filter((s) => s.glyph || s.seat).map((s) => s.id);
    const filled = SPOTS.filter((s) => s.fillable).map((s) => `${s.id}-full`);
    expect(missing("props", [...props, ...filled, "window"])).toEqual([]);
  });

  it("stays small enough for a phone", () => {
    for (const c of CHARACTERS) {
      const file = art("dumplings", c.id);
      if (existsSync(file)) expect(statSync(file).size, file).toBeLessThan(80_000);
    }
  });
});
