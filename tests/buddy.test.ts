import { describe, expect, it } from "vitest";
import { decorations, hasOwnVoice, MILESTONES, MOMENTS, momentText, newBuddy, nextMilestone, reached, recordVisit, tricks } from "../src/game/buddy";
import { chooseBuddy, newState, setBuddyAside, visitBuddy } from "../src/game/state";

const day = (s: string) => new Date(`${s}T10:00:00`);
const owning = (id: string) => {
  const s = newState();
  s.inventory[id] = 1;
  return s;
};

describe("choosing a buddy", () => {
  it("only from dumplings the kid actually owns", () => {
    const s = newState();
    expect(chooseBuddy(s, "c01", day("2026-09-07"))).toBe(false);
    s.inventory.c01 = 1;
    expect(chooseBuddy(s, "c01", day("2026-09-07"))).toBe(true);
    expect(s.buddy?.characterId).toBe("c01");
  });

  it("refuses a dumpling that does not exist", () => {
    const s = owning("c01");
    expect(chooseBuddy(s, "not-a-dumpling", day("2026-09-07"))).toBe(false);
  });

  it("swapping buddy starts a fresh history and costs nothing", () => {
    const s = owning("c01");
    s.inventory.c02 = 1;
    chooseBuddy(s, "c01", day("2026-09-07"));
    visitBuddy(s, day("2026-09-07"), 0);
    expect(s.buddy?.visits).toBe(1);
    chooseBuddy(s, "c02", day("2026-09-08"));
    expect(s.buddy?.characterId).toBe("c02");
    expect(s.buddy?.visits).toBe(0);
    // the old buddy is still just a dumpling in the basket
    expect(s.inventory.c01).toBe(1);
  });

  it("can be set aside without losing the dumpling", () => {
    const s = owning("c01");
    chooseBuddy(s, "c01", day("2026-09-07"));
    setBuddyAside(s, day("2026-09-07"));
    expect(s.buddy).toBeNull();
    expect(s.inventory.c01).toBe(1);
  });
});

describe("visits only ever add up", () => {
  it("counts one visit per day however many times the app is opened", () => {
    const s = owning("c01");
    chooseBuddy(s, "c01", day("2026-09-07"));
    expect(visitBuddy(s, day("2026-09-07"), 0)).toBe(true);
    expect(visitBuddy(s, day("2026-09-07"), 1)).toBe(false);
    expect(visitBuddy(s, day("2026-09-07"), 2)).toBe(false);
    expect(s.buddy?.visits).toBe(1);
  });

  it("a new day is a new visit", () => {
    const s = owning("c01");
    chooseBuddy(s, "c01", day("2026-09-07"));
    visitBuddy(s, day("2026-09-07"), 0);
    expect(visitBuddy(s, day("2026-09-08"), 0)).toBe(true);
    expect(s.buddy?.visits).toBe(2);
  });

  it("a long gap costs nothing — this is the whole point", () => {
    const s = owning("c01");
    chooseBuddy(s, "c01", day("2026-09-07"));
    visitBuddy(s, day("2026-09-07"), 0);
    visitBuddy(s, day("2026-09-08"), 0);
    const before = s.buddy!.visits;
    // away for a month
    expect(visitBuddy(s, day("2026-10-08"), 0)).toBe(true);
    expect(s.buddy!.visits).toBe(before + 1); // went up, never down
  });

  it("winding the device clock back does not farm extra visits", () => {
    const s = owning("c01");
    chooseBuddy(s, "c01", day("2026-09-07"));
    visitBuddy(s, day("2026-09-08"), 0);
    const after = s.buddy!.visits;
    expect(visitBuddy(s, day("2026-09-07"), 0)).toBe(false);
    expect(visitBuddy(s, day("2026-09-06"), 0)).toBe(false);
    expect(s.buddy!.visits).toBe(after);
  });

  it("a buddy sold or traded away steps down quietly, without punishing anyone", () => {
    const s = owning("c01");
    chooseBuddy(s, "c01", day("2026-09-07"));
    delete s.inventory.c01;
    expect(visitBuddy(s, day("2026-09-08"), 0)).toBe(false);
    expect(s.buddy).toBeNull();
  });
});

describe("milestones", () => {
  it("unlock by turning up and are never taken back", () => {
    const b = newBuddy("c01", 0);
    expect(reached(b)).toHaveLength(0);
    for (let i = 0; i < 5; i++) recordVisit(b, `2026-09-${String(10 + i).padStart(2, "0")}`, i);
    const got = reached(b).length;
    expect(got).toBeGreaterThan(0);
    // a month away, then one more visit: nothing was lost
    recordVisit(b, "2026-10-20", 0);
    expect(reached(b).length).toBeGreaterThanOrEqual(got);
  });

  it("always names something to look forward to until they're all in", () => {
    const b = newBuddy("c01", 0);
    expect(nextMilestone(b)).not.toBeNull();
    b.visits = MILESTONES[MILESTONES.length - 1]!.visits;
    expect(nextMilestone(b)).toBeNull();
  });
});

describe("the copy never guilts a child", () => {
  // This is the design rule, kept as a test so it can't quietly drift later.
  const forbidden = [
    "miss", "missed", "lonely", "alone", "sad", "sadly", "hungry", "starv", "sick", "ill",
    "weak", "dying", "died", "dead", "neglect", "forgot", "forgotten", "abandon",
    "waiting for you", "where were you", "too long", "come back", "don't leave",
  ];

  it("no moment implies the buddy suffered while the app was closed", () => {
    for (const m of MOMENTS) {
      for (const word of forbidden) {
        expect(m.toLowerCase().includes(word), `"${m}" contains "${word}"`).toBe(false);
      }
    }
  });

  it("no milestone label implies decline", () => {
    for (const m of MILESTONES) {
      for (const word of forbidden) {
        expect(m.label.toLowerCase().includes(word), `"${m.label}" contains "${word}"`).toBe(false);
      }
    }
  });

  it("no trick button implies decline either", () => {
    // The room's buttons are the most-read copy in the feature; hold them to the same rule.
    for (const m of MILESTONES) {
      if (!m.button) continue;
      for (const word of forbidden) {
        expect(m.button.toLowerCase().includes(word), `"${m.button}" contains "${word}"`).toBe(false);
      }
    }
  });

  it("every moment is something that happened, not something owed", () => {
    expect(MOMENTS.length).toBeGreaterThan(6); // enough that it doesn't feel canned
    const b = newBuddy("c01", 0);
    for (let i = 0; i < MOMENTS.length + 3; i++) {
      recordVisit(b, `day-${i}`, i);
      expect(typeof momentText(b)).toBe("string");
      expect(momentText(b).length).toBeGreaterThan(0);
    }
  });
});

describe("the room", () => {
  const at = (visits: number) => {
    const b = newBuddy("c01", 0);
    b.visits = visits;
    return b;
  };

  it("every milestone has a stable id, and they are all distinct", () => {
    // The id keys a CSS animation (act-<id>) and a room decoration, so a duplicate or a
    // rename silently breaks the thing it drives.
    const ids = MILESTONES.map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^[a-z]+$/);
  });

  it("every trick has a button, and every accessory has a decoration", () => {
    for (const m of MILESTONES) {
      if (m.kind === "trick") expect(m.button, `${m.id} needs a button`).toBeTruthy();
      if (m.kind === "accessory") expect(m.decor, `${m.id} needs a decoration`).toBeTruthy();
    }
  });

  it("hands out nothing at all before the first visit", () => {
    const b = at(0);
    expect(tricks(b)).toHaveLength(0);
    expect(decorations(b)).toHaveLength(0);
    expect(hasOwnVoice(b)).toBe(false);
  });

  it("only ever gains tricks and decorations as visits climb", () => {
    let lastTricks = 0;
    let lastDecor = 0;
    for (let v = 0; v <= 25; v++) {
      const b = at(v);
      expect(tricks(b).length).toBeGreaterThanOrEqual(lastTricks);
      expect(decorations(b).length).toBeGreaterThanOrEqual(lastDecor);
      lastTricks = tricks(b).length;
      lastDecor = decorations(b).length;
    }
  });

  it("finds its own voice at seven visits and keeps it", () => {
    expect(hasOwnVoice(at(6))).toBe(false);
    expect(hasOwnVoice(at(7))).toBe(true);
    expect(hasOwnVoice(at(100))).toBe(true);
  });

  it("has something to play with from the very first visit", () => {
    // An empty room with no button to press would be a dead screen on day one.
    expect(tricks(at(1)).length).toBeGreaterThan(0);
  });

  it("tricks and decorations together never exceed what was reached", () => {
    const b = at(21);
    const kinds = tricks(b).length + decorations(b).length + (hasOwnVoice(b) ? 1 : 0);
    expect(kinds).toBe(reached(b).length);
  });
});
