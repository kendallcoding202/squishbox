import type { BuddyState } from "./buddy";
import type { Rng } from "./rng";

/**
 * The buddy's room, as data.
 *
 * This is the half of the buddy that makes it feel alive rather than operated: it goes
 * places and does things on its own, and the kid's part is to watch, to send it somewhere,
 * and to put food out. The screen draws itself from SPOTS and drives the clock; everything
 * here is pure so it can be tested without a browser.
 *
 * Read game/buddy.ts first. The rule there holds absolutely here too: nothing in this room
 * is a need. An empty bowl is an empty bowl, never hunger. Wandering off is not sulking.
 * Every counter only goes up, and nothing at all happens while the app is closed.
 */

export type Lane = "front" | "back";

/** A place the buddy can be, and what it does when it gets there. */
export interface Spot {
  id: string;
  /** Percent across the floor. The screen positions the buddy from this. */
  x: number;
  /** Front of the room or the back, which the screen draws smaller and higher up. */
  lane: Lane;
  /** Animation class suffix, `act-<act>`, played on arrival. */
  act: string;
  /** How long that animation runs, in ms. */
  actMs: number;
  /** Line shown under the room while the buddy is here. `{name}` is substituted. */
  says: string;
  /** Relative chance of being picked when choosing somewhere to go. */
  weight: number;
  /**
   * Where the furniture sits, when the buddy should stand beside a thing rather than on it.
   * Defaults to `x`. Without it the buddy parks squarely on top of the toy box and you
   * cannot see either of them.
   */
  propX?: number;
}

export const SPOTS: readonly Spot[] = [
  { id: "cushion", x: 50, lane: "front", act: "nap", actMs: 2600, says: "{name} is having a sit down", weight: 3 },
  { id: "bowl", x: 15, lane: "front", act: "nibble", actMs: 1600, says: "{name} is nosing around the bowl", weight: 2 },
  { id: "cup", x: 85, lane: "front", act: "sip", actMs: 1600, says: "{name} is having a sip", weight: 2 },
  { id: "window", x: 24, lane: "back", act: "gaze", actMs: 2400, says: "{name} is watching the clouds go by", weight: 3 },
  { id: "plant", x: 74, lane: "back", act: "sniff", actMs: 1800, says: "{name} is saying hello to the plant", weight: 2, propX: 88 },
  { id: "toys", x: 46, lane: "back", act: "dig", actMs: 1800, says: "{name} is rummaging in the toy box", weight: 2, propX: 60 },
];

export const SPOT_BY_ID: ReadonlyMap<string, Spot> = new Map(SPOTS.map((s) => [s.id, s]));

/**
 * Things the buddy turns up while exploring. Permanent, additive, never lost — the same
 * deal as milestones, earned by wandering instead of by turning up on separate days.
 *
 * The gaps widen on purpose. The first few come quickly so a kid sees straight away that
 * exploring does something; the last few are weeks of visits away. Nothing is time-gated,
 * so a kid who wants to watch for an hour may; what is forbidden is needing them to.
 */
export interface Find {
  id: string;
  glyph: string;
  label: string;
  /** Wanders needed before this turns up. */
  at: number;
}

export const FINDS: readonly Find[] = [
  { id: "pebble", glyph: "\u{1FAA8}", label: "a very smooth pebble", at: 3 },
  { id: "leaf", glyph: "\u{1F343}", label: "an excellent leaf", at: 7 },
  { id: "button", glyph: "\u{1F518}", label: "somebody's lost button", at: 12 },
  { id: "feather", glyph: "\u{1FAB6}", label: "one soft feather", at: 18 },
  { id: "shell", glyph: "\u{1F41A}", label: "a little shell", at: 26 },
  { id: "bell", glyph: "\u{1F514}", label: "a bell that still jingles", at: 36 },
  { id: "star", glyph: "⭐", label: "a paper star", at: 48 },
  { id: "ribbon", glyph: "\u{1F380}", label: "a silky ribbon", at: 62 },
  { id: "marble", glyph: "\u{1F52E}", label: "a marble with a swirl inside", at: 80 },
  { id: "key", glyph: "\u{1F5DD}️", label: "a tiny key to nothing at all", at: 100 },
  { id: "crown", glyph: "\u{1F451}", label: "a crown made of crumbs", at: 130 },
  { id: "map", glyph: "\u{1F5FA}️", label: "a map of this exact room", at: 170 },
];

export const FIND_BY_ID: ReadonlyMap<string, Find> = new Map(FINDS.map((f) => [f.id, f]));

/**
 * Where to go next. Never the spot it is already at, so it always actually moves, and a
 * filled bowl or cup pulls hard — that is the whole feeding loop: you put something out,
 * and it comes over in its own time rather than on a button press.
 */
export function pickSpot(b: BuddyState, rng: Rng): Spot {
  const options = SPOTS.filter((s) => s.id !== b.at);
  const weightOf = (s: Spot): number => {
    if (s.id === "bowl" && b.bowl) return s.weight + 10;
    if (s.id === "cup" && b.cup) return s.weight + 10;
    return s.weight;
  };
  const total = options.reduce((a, s) => a + weightOf(s), 0);
  let roll = rng() * total;
  for (const s of options) {
    roll -= weightOf(s);
    if (roll <= 0) return s;
  }
  return options[options.length - 1] as Spot;
}

/**
 * Count an arrival and hand back whatever it turned up, if anything.
 *
 * At most one find per arrival, and it awards the earliest one still outstanding rather
 * than the one matching the exact count, so a save that somehow skipped a number still
 * gets everything it is owed instead of losing a find for good.
 */
export function arrive(b: BuddyState, spotId: string): Find | null {
  b.at = spotId;
  b.wanders += 1;
  if (spotId === "bowl" && b.bowl) b.bowl = false;
  if (spotId === "cup" && b.cup) b.cup = false;
  const due = FINDS.find((f) => f.at <= b.wanders && !b.finds.includes(f.id));
  if (!due) return null;
  b.finds.push(due.id);
  return due;
}

/** Everything found so far, in the order it was found. Unknown ids are skipped. */
export function found(b: BuddyState): Find[] {
  return b.finds.map((id) => FIND_BY_ID.get(id)).filter(Boolean) as Find[];
}

/** The next thing out there and how many more wanders it needs, or null once all are found. */
export function nextFind(b: BuddyState): { find: Find; toGo: number } | null {
  const next = FINDS.find((f) => !b.finds.includes(f.id));
  if (!next) return null;
  return { find: next, toGo: Math.max(1, next.at - b.wanders) };
}
