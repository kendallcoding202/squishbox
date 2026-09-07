import { describe, expect, it } from "vitest";
import { MILESTONES, MOMENTS, momentText, newBuddy, nextMilestone, reached, recordVisit } from "../src/game/buddy";
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
