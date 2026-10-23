import { describe, expect, it } from "vitest";
import { newBuddy, normalizeBuddy, type BuddyState } from "../src/game/buddy";
import { arrive, FINDS, found, nextFind, pickSpot, SPOTS, SPOT_BY_ID } from "../src/game/room";
import { mulberry32 } from "../src/game/rng";
import { loadState } from "../src/game/state";

const b = (over: Partial<BuddyState> = {}): BuddyState => ({ ...newBuddy("c01", 0), ...over });

describe("the room", () => {
  it("has every spot the screen positions furniture from", () => {
    // renderBuddy casts SPOT_BY_ID.get(id) — a renamed id would be undefined at runtime.
    for (const id of ["cushion", "bowl", "cup", "window", "plant", "toys"]) expect(SPOT_BY_ID.has(id), id).toBe(true);
    for (const s of SPOTS) expect(s.x, s.id).toBeGreaterThanOrEqual(0);
    for (const s of SPOTS) expect(s.x, s.id).toBeLessThanOrEqual(100);
  });

  it("never picks the spot it is already standing on, so it always moves", () => {
    const rng = mulberry32(5);
    for (const s of SPOTS) {
      const pet = b({ at: s.id });
      for (let i = 0; i < 200; i++) expect(pickSpot(pet, rng).id, s.id).not.toBe(s.id);
    }
  });

  it("notices a full bowl and heads over", () => {
    const rng = mulberry32(9);
    const count = (pet: BuddyState) => {
      let n = 0;
      for (let i = 0; i < 400; i++) if (pickSpot(pet, rng).id === "bowl") n += 1;
      return n;
    };
    const idle = count(b({ at: "cushion" }));
    const fed = count(b({ at: "cushion", bowl: true }));
    expect(fed).toBeGreaterThan(idle * 2);
  });
});

describe("exploring", () => {
  it("counts arrivals and remembers where it is", () => {
    const pet = b();
    arrive(pet, "window");
    expect(pet.at).toBe("window");
    expect(pet.wanders).toBe(1);
  });

  it("eats what was put out, and an empty bowl stays empty", () => {
    const pet = b({ bowl: true, cup: true });
    arrive(pet, "bowl");
    expect(pet.bowl).toBe(false);
    expect(pet.cup).toBe(true); // it only had the one thing
    arrive(pet, "bowl");
    expect(pet.bowl).toBe(false);
  });

  it("turns something up on schedule, one at a time, and never the same thing twice", () => {
    const pet = b();
    const got: string[] = [];
    for (let i = 0; i < FINDS[3]!.at; i++) {
      const f = arrive(pet, i % 2 ? "cushion" : "window");
      if (f) got.push(f.id);
    }
    expect(got).toEqual([FINDS[0]!.id, FINDS[1]!.id, FINDS[2]!.id, FINDS[3]!.id]);
    expect(new Set(pet.finds).size).toBe(pet.finds.length);
  });

  it("pays out everything owed to a buddy that somehow skipped ahead", () => {
    // Not a hypothetical: a wander banked while the tab was closing, or a hand-edited save.
    // Awarding strictly by exact count would lose a find for good.
    const pet = b({ wanders: FINDS[2]!.at });
    expect(arrive(pet, "cushion")?.id).toBe(FINDS[0]!.id);
    expect(arrive(pet, "window")?.id).toBe(FINDS[1]!.id);
    expect(arrive(pet, "cushion")?.id).toBe(FINDS[2]!.id);
  });

  it("reports what is still out there, then stops promising", () => {
    const pet = b();
    expect(nextFind(pet)?.find.id).toBe(FINDS[0]!.id);
    pet.finds = FINDS.map((f) => f.id);
    expect(nextFind(pet)).toBeNull();
    expect(found(pet).length).toBe(FINDS.length);
  });

  it("skips a find id it does not recognise instead of drawing a blank", () => {
    expect(found(b({ finds: ["pebble", "wat", "leaf"] })).map((f) => f.id)).toEqual(["pebble", "leaf"]);
  });

  it("never takes anything away, however long it runs", () => {
    // The whole point of this room: every counter only goes up. If this ever fails, some
    // kind of decay has been introduced and the buddy has become something you can fail.
    const pet = b();
    const rng = mulberry32(31);
    let lastWanders = 0;
    let lastFinds = 0;
    for (let i = 0; i < 500; i++) {
      arrive(pet, pickSpot(pet, rng).id);
      expect(pet.wanders).toBeGreaterThanOrEqual(lastWanders);
      expect(pet.finds.length).toBeGreaterThanOrEqual(lastFinds);
      lastWanders = pet.wanders;
      lastFinds = pet.finds.length;
    }
    expect(pet.finds.length).toBe(FINDS.length);
    expect(pet.visits).toBe(0); // wandering is not visiting; it cannot inflate the day count
  });
});

describe("buddies saved before the room existed", () => {
  const old = { characterId: "c01", since: 1000, visits: 4, lastVisitDay: "2026-10-01", momentIndex: 2 };

  it("gains the new fields instead of throwing on first render", () => {
    const n = normalizeBuddy(old)!;
    expect(n.wanders).toBe(0);
    expect(n.finds).toEqual([]);
    expect(n.at).toBeNull();
    expect(n.bowl).toBe(false);
    expect(n.cup).toBe(false);
    expect(n.visits).toBe(4); // and keeps everything it already had
    expect(n.lastVisitDay).toBe("2026-10-01");
  });

  it("replaces a present-but-wrong field rather than trusting it", () => {
    const n = normalizeBuddy({ ...old, finds: "nope", wanders: -5, at: 7, visits: Number.NaN } as never)!;
    expect(n.finds).toEqual([]);
    expect(n.wanders).toBe(0);
    expect(n.at).toBeNull();
    expect(n.visits).toBe(0);
  });

  it("reads a buddy with no usable character as no buddy at all", () => {
    expect(normalizeBuddy(null)).toBeNull();
    expect(normalizeBuddy({})).toBeNull();
    expect(normalizeBuddy({ characterId: "" })).toBeNull();
  });

  it("survives a real load of a real old save", () => {
    const save = { version: 1, inventory: { c01: 1 }, buddy: old };
    const loaded = loadState({ getItem: () => JSON.stringify(save) });
    expect(loaded.buddy?.characterId).toBe("c01");
    expect(loaded.buddy?.finds).toEqual([]);
    expect(loaded.buddy?.wanders).toBe(0);
    // And the room engine can be driven straight off it without blowing up.
    expect(() => arrive(loaded.buddy as BuddyState, "cushion")).not.toThrow();
  });

  it("drops a buddy whose dumpling this build does not have", () => {
    const save = { version: 1, inventory: { c01: 1 }, buddy: { ...old, characterId: "zz99" } };
    expect(loadState({ getItem: () => JSON.stringify(save) }).buddy).toBeNull();
  });
});
