import type { BuddyState } from "./buddy";
import type { Rng } from "./rng";

/**
 * The little world the buddy lives in, as data.
 *
 * This is the half of the buddy that makes it feel alive rather than operated: it goes
 * places and does things on its own, and the kid's part is to watch, to send it somewhere,
 * and to put food out. The screens draw themselves from PLACES and SPOTS and drive the
 * clock; everything here is pure so it can be tested without a browser.
 *
 * Read game/buddy.ts first. The rule there holds absolutely here too: nothing in this world
 * is a need. An empty bowl is an empty bowl, never hunger. Wandering off is not sulking.
 * Every counter only goes up, and nothing at all happens while the app is closed.
 */

export type Lane = "front" | "back";

/**
 * Somewhere the buddy can go: the room it lives in, and the places it can explore from
 * there. Each one is the same engine with different furniture, which is the whole reason
 * adding another is content rather than code.
 */
export interface Place {
  id: string;
  name: string;
  /** Shown on the chip that takes you there. */
  icon: string;
  /** One line about the place, under the chips. */
  blurb: string;
  /**
   * Finds needed in the PREVIOUS place before this one opens, 0 for the home room.
   * Finds are permanent, so this can never close again once it has opened.
   */
  opensAt: number;
  opensFrom: string | null;
  /** What it says when it is still shut. */
  teaser: string;
}

export const PLACES: readonly Place[] = [
  {
    id: "room", name: "The room", icon: "\u{1F3E0}", blurb: "Home. Everything it finds ends up on the shelf here.",
    opensAt: 0, opensFrom: null, teaser: "",
  },
  {
    id: "garden", name: "The garden", icon: "\u{1F33F}", blurb: "Out the back. Long grass, and something in the hedge.",
    opensAt: 3, opensFrom: "room", teaser: "There is a door to the garden. It opens once the room has been properly explored.",
  },
  {
    id: "kitchen", name: "The kitchen", icon: "\u{1FAD5}", blurb: "Warm, steamy, and full of crumbs.",
    opensAt: 3, opensFrom: "garden", teaser: "Something smells good through the kitchen door. The garden first.",
  },
];

export const PLACE_BY_ID: ReadonlyMap<string, Place> = new Map(PLACES.map((p) => [p.id, p]));
export const HOME_PLACE = PLACES[0] as Place;

/** A spot within a place, and what the buddy does when it gets there. */
export interface Spot {
  id: string;
  place: string;
  /** Percent across the floor. The screen positions the buddy from this. */
  x: number;
  /** Front of the floor or the back, which the screen draws smaller and higher up. */
  lane: Lane;
  /** Animation class suffix, `act-<act>`, played on arrival. */
  act: string;
  /** How long that animation runs, in ms. */
  actMs: number;
  /** Line shown under the scene while the buddy is here. `{name}` is substituted. */
  says: string;
  /** Relative chance of being picked when choosing somewhere to go. */
  weight: number;
  /**
   * Where the furniture sits, when the buddy should stand beside a thing rather than on it.
   * Defaults to `x`. Without it the buddy parks squarely on top of the toy box and you
   * cannot see either of them.
   */
  propX?: number;
  /** The prop drawn here. Empty means the scene draws it (a seat) or nothing at all (the window). */
  glyph: string;
  /** The thing it sits on. Drawn by the stylesheet rather than as a glyph. */
  seat?: boolean;
  /** As a place, for "was poking about {whereabouts}". */
  whereabouts: string;
  /** Tapping this sends the buddy over. The bowl and the cup are filled instead. */
  fillable?: "bowl" | "cup";
}

export const SPOTS: readonly Spot[] = [
  // ---- The room. Spot ids stay as they were so an existing save's `at` still resolves. ----
  { id: "cushion", place: "room", x: 50, lane: "front", act: "nap", actMs: 2600, says: "{name} is having a sit down", weight: 3, glyph: "", seat: true, whereabouts: "under the cushion" },
  { id: "bowl", place: "room", x: 15, lane: "front", act: "nibble", actMs: 1600, says: "{name} is nosing around the bowl", weight: 2, glyph: "\u{1F963}", whereabouts: "behind the bowl", fillable: "bowl" },
  { id: "cup", place: "room", x: 85, lane: "front", act: "sip", actMs: 1600, says: "{name} is having a sip", weight: 2, glyph: "\u{1F375}", whereabouts: "beside the cup", fillable: "cup" },
  { id: "window", place: "room", x: 24, lane: "back", act: "gaze", actMs: 2400, says: "{name} is watching the clouds go by", weight: 3, glyph: "", whereabouts: "on the windowsill" },
  { id: "plant", place: "room", x: 74, lane: "back", act: "sniff", actMs: 1800, says: "{name} is saying hello to the plant", weight: 2, propX: 88, glyph: "\u{1FAB4}", whereabouts: "in the plant pot" },
  { id: "toys", place: "room", x: 46, lane: "back", act: "dig", actMs: 1800, says: "{name} is rummaging in the toy box", weight: 2, propX: 60, glyph: "\u{1F9F8}", whereabouts: "at the bottom of the toy box" },

  // ---- The garden ----
  { id: "grass", place: "garden", x: 50, lane: "front", act: "nap", actMs: 2600, says: "{name} is lying in the long grass", weight: 3, glyph: "", seat: true, whereabouts: "in the long grass" },
  { id: "puddle", place: "garden", x: 16, lane: "front", act: "sip", actMs: 1800, says: "{name} is peering into the puddle", weight: 2, glyph: "\u{1F4A7}", whereabouts: "at the edge of the puddle" },
  { id: "flowers", place: "garden", x: 84, lane: "front", act: "sniff", actMs: 1800, says: "{name} is smelling the flowers", weight: 2, glyph: "\u{1F337}", whereabouts: "among the flowers" },
  { id: "hedge", place: "garden", x: 26, lane: "back", act: "dig", actMs: 2000, says: "{name} is poking about in the hedge", weight: 3, propX: 14, glyph: "\u{1F33F}", whereabouts: "deep in the hedge" },
  { id: "log", place: "garden", x: 56, lane: "back", act: "dig", actMs: 1800, says: "{name} is peering under the mossy log", weight: 2, propX: 68, glyph: "\u{1FAB5}", whereabouts: "under the mossy log" },
  { id: "tree", place: "garden", x: 86, lane: "back", act: "gaze", actMs: 2400, says: "{name} is looking up at the tree", weight: 2, propX: 94, glyph: "\u{1F333}", whereabouts: "under the tree" },

  // ---- The kitchen ----
  { id: "mat", place: "kitchen", x: 50, lane: "front", act: "nap", actMs: 2600, says: "{name} is curled up on the warm mat", weight: 3, glyph: "", seat: true, whereabouts: "under the mat" },
  { id: "crumbs", place: "kitchen", x: 18, lane: "front", act: "nibble", actMs: 1600, says: "{name} has found the crumbs", weight: 3, glyph: "\u{1F36A}", whereabouts: "in the crumbs" },
  { id: "teapot", place: "kitchen", x: 82, lane: "front", act: "sip", actMs: 1700, says: "{name} is sitting by the teapot", weight: 2, glyph: "\u{1FAD6}", whereabouts: "behind the teapot" },
  { id: "steamer", place: "kitchen", x: 28, lane: "back", act: "gaze", actMs: 2400, says: "{name} is watching the steamer puff", weight: 3, propX: 16, glyph: "\u2668\uFE0F", whereabouts: "in the steamer basket" },
  { id: "jar", place: "kitchen", x: 58, lane: "back", act: "sniff", actMs: 1800, says: "{name} is trying to open the jar", weight: 2, propX: 70, glyph: "\u{1FAD9}", whereabouts: "at the bottom of the jar" },
  { id: "shelf", place: "kitchen", x: 88, lane: "back", act: "dig", actMs: 1800, says: "{name} is rooting through the shelf", weight: 2, propX: 95, glyph: "\u{1F96B}", whereabouts: "on the top shelf" },
];

export const SPOT_BY_ID: ReadonlyMap<string, Spot> = new Map(SPOTS.map((s) => [s.id, s]));

export function spotsIn(placeId: string): Spot[] {
  return SPOTS.filter((s) => s.place === placeId);
}

/** Where the buddy is. Derived from the spot rather than stored, so the two cannot disagree. */
export function placeOf(b: BuddyState): Place {
  return (b.at && PLACE_BY_ID.get(SPOT_BY_ID.get(b.at)?.place ?? "")) || HOME_PLACE;
}

/**
 * Things the buddy turns up while exploring. Permanent, additive, never lost — the same
 * deal as milestones, earned by wandering instead of by turning up on separate days.
 *
 * Each belongs to a place, and it can only be turned up while the buddy is actually there.
 * That is what makes WHERE you send it matter: the odometer is shared, but the garden's
 * things are only in the garden.
 *
 * The gaps widen on purpose. The first few come quickly so a kid sees straight away that
 * exploring does something; the last are weeks of visits away. Nothing is time-gated, so a
 * kid who wants to watch for an hour may; what is forbidden is needing them to.
 */
export interface Find {
  id: string;
  place: string;
  glyph: string;
  label: string;
  /** Wanders needed before this turns up. */
  at: number;
}

export const FINDS: readonly Find[] = [
  // The room. These twelve ids predate places, so every one of them still exists and an
  // existing kid's shelf is untouched; six moved to the garden and the kitchen.
  { id: "pebble", place: "room", glyph: "\u{1FAA8}", label: "a very smooth pebble", at: 3 },
  { id: "button", place: "room", glyph: "\u{1F518}", label: "somebody's lost button", at: 7 },
  { id: "feather", place: "room", glyph: "\u{1FAB6}", label: "one soft feather", at: 12 },
  { id: "marble", place: "room", glyph: "\u{1F52E}", label: "a marble with a swirl inside", at: 20 },
  { id: "key", place: "room", glyph: "\u{1F5DD}️", label: "a tiny key to nothing at all", at: 30 },
  { id: "map", place: "room", glyph: "\u{1F5FA}️", label: "a map of this exact room", at: 44 },

  // The garden.
  { id: "leaf", place: "garden", glyph: "\u{1F343}", label: "an excellent leaf", at: 6 },
  { id: "acorn", place: "garden", glyph: "\u{1F330}", label: "one perfect acorn", at: 12 },
  { id: "shell", place: "garden", glyph: "\u{1F41A}", label: "a little shell, miles from the sea", at: 20 },
  { id: "clover", place: "garden", glyph: "\u{1F340}", label: "a four-leaf clover", at: 30 },
  { id: "snail", place: "garden", glyph: "\u{1F40C}", label: "a snail, who is fine and was put back", at: 42 },
  { id: "ribbon", place: "garden", glyph: "\u{1F380}", label: "a silky ribbon off the washing line", at: 58 },

  // The kitchen.
  { id: "sprinkle", place: "kitchen", glyph: "\u{1F9C1}", label: "one escaped sprinkle", at: 10 },
  { id: "spoon", place: "kitchen", glyph: "\u{1F944}", label: "the smallest spoon", at: 18 },
  { id: "bell", place: "kitchen", glyph: "\u{1F514}", label: "a bell that still jingles", at: 28 },
  { id: "star", place: "kitchen", glyph: "⭐", label: "a paper star off a cake box", at: 40 },
  { id: "lid", place: "kitchen", glyph: "\u{1FAD9}", label: "a jam jar lid", at: 54 },
  { id: "crown", place: "kitchen", glyph: "\u{1F451}", label: "a crown made of crumbs", at: 72 },
];

export const FIND_BY_ID: ReadonlyMap<string, Find> = new Map(FINDS.map((f) => [f.id, f]));

export function findsIn(placeId: string): Find[] {
  return FINDS.filter((f) => f.place === placeId);
}

/** How many of a place's things have been turned up. */
export function foundIn(b: BuddyState, placeId: string): number {
  return findsIn(placeId).filter((f) => b.finds.includes(f.id)).length;
}

/**
 * Is a place open? Derived from finds, which are permanent, so a place can never shut again.
 * Nothing here is taken away: see the rule at the top of this file.
 */
export function placeUnlocked(b: BuddyState, placeId: string): boolean {
  const p = PLACE_BY_ID.get(placeId);
  if (!p || !p.opensFrom) return true;
  return foundIn(b, p.opensFrom) >= p.opensAt;
}

export function openPlaces(b: BuddyState): Place[] {
  return PLACES.filter((p) => placeUnlocked(b, p.id));
}

/** Progress toward opening a place, as [have, need]. */
export function placeProgress(b: BuddyState, placeId: string): [number, number] {
  const p = PLACE_BY_ID.get(placeId);
  if (!p || !p.opensFrom) return [0, 0];
  return [Math.min(p.opensAt, foundIn(b, p.opensFrom)), p.opensAt];
}

/**
 * Where to go next, within the place the buddy is in. Never the spot it is already on, so
 * it always actually moves, and a filled bowl or cup pulls hard — that is the whole feeding
 * loop: you put something out, and it comes over in its own time rather than on a button.
 */
export function pickSpot(b: BuddyState, rng: Rng): Spot {
  const here = placeOf(b).id;
  const options = spotsIn(here).filter((s) => s.id !== b.at);
  const weightOf = (s: Spot): number => {
    if (s.fillable === "bowl" && b.bowl) return s.weight + 10;
    if (s.fillable === "cup" && b.cup) return s.weight + 10;
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
 * At most one find per arrival, from the place it is actually standing in, and it awards the
 * earliest one still outstanding rather than the one matching the exact count — so a save
 * that somehow skipped a number still gets everything it is owed instead of losing a find
 * for good.
 */
export function arrive(b: BuddyState, spotId: string): Find | null {
  const spot = SPOT_BY_ID.get(spotId);
  b.at = spotId;
  b.wanders += 1;
  if (spot?.fillable === "bowl" && b.bowl) b.bowl = false;
  if (spot?.fillable === "cup" && b.cup) b.cup = false;
  const due = FINDS.find((f) => f.place === spot?.place && f.at <= b.wanders && !b.finds.includes(f.id));
  if (!due) return null;
  b.finds.push(due.id);
  return due;
}

/** Everything found so far, in the order it was found. Unknown ids are skipped. */
export function found(b: BuddyState): Find[] {
  return b.finds.map((id) => FIND_BY_ID.get(id)).filter(Boolean) as Find[];
}

/**
 * The next thing out there in a given place and how many more wanders it needs, or null
 * once that place is cleared out.
 */
export function nextFind(b: BuddyState, placeId: string): { find: Find; toGo: number } | null {
  const next = findsIn(placeId).find((f) => !b.finds.includes(f.id));
  if (!next) return null;
  return { find: next, toGo: Math.max(1, next.at - b.wanders) };
}

// ---- what the buddy brings home ----

/**
 * The buddy goes exploring and comes back with something, once a day.
 *
 * This is the join between the two halves of the game. Before it, the world gave the
 * collection nothing and the collection gave the world nothing but a choice of face, so
 * finishing the day's boxes left a kid with a pet that was lovely and pointless. Coins are
 * the connection: they are what the collection runs on.
 *
 * Coins, specifically, and NOT a dumpling. A free dumpling would be an extra box a day that
 * slipped past the parent's box cap, and that cap is the one hard limit in this app. Coins
 * still have to pass through it.
 *
 * The amount is flat rather than random. A kids' app has no business running a variable
 * payout — that is the one reinforcement schedule that is genuinely a slot machine — and a
 * number a kid can predict is a number they can look forward to. The only thing that moves
 * it is how much the buddy has explored, which is the behaviour worth rewarding.
 */
export interface Gift {
  coins: number;
  /** Where it says it was, for the flavour line. */
  spot: Spot;
}

/**
 * A brand new buddy brings home enough for the cheapest basket, which matters because the
 * very first gift is the one that teaches a kid the room is worth visiting. A buddy that
 * has explored the whole world brings 48, still close to a full daily claim rather than
 * past it, so the buddy stays a second income instead of a replacement for turning up.
 */
export const GIFT_BASE = 12;
export const GIFT_PER_FIND = 2;

/** FNV-1a. Only used to pick a stable flavour spot from a day key. */
function hashOf(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/**
 * What is waiting on a given day. Derived from the day rather than stored, so it is the
 * same every time the screen renders — rolling it per render would let a kid reload until
 * the flavour changed, and would make the number flicker while they looked at it.
 *
 * The flavour is drawn from somewhere the buddy can actually get to, so it never claims to
 * have been rooting about in a kitchen it has not found yet.
 */
export function giftFor(b: BuddyState, dayKey: string): Gift {
  const reachable = openPlaces(b).flatMap((p) => spotsIn(p.id));
  const spot = reachable[hashOf(dayKey + b.characterId) % reachable.length] as Spot;
  return { coins: GIFT_BASE + b.finds.length * GIFT_PER_FIND, spot };
}

/** Is there something waiting? Nothing accrues while away: at worst there is nothing yet. */
export function giftReady(b: BuddyState, dayKey: string): boolean {
  return b.lastGiftDay !== dayKey;
}
