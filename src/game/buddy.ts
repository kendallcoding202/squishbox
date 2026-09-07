import { CHARACTER_BY_ID } from "../data/characters";
import type { Inventory } from "./state";

/**
 * The buddy: one dumpling a kid looks after.
 *
 * Deliberately not a tamagotchi. There is no hunger, no sadness, no health, and nothing
 * that gets worse while the app is closed — a six-year-old should never open this and find
 * that being away hurt someone. Every counter here only goes up.
 *
 * The return hook is the same shape a pet gives you, arrived at from the other side: instead
 * of a debt that accrues while you're gone, there is a small good thing waiting when you
 * come back. "Pip saved you a spot", never "Pip missed you".
 */

export interface BuddyState {
  characterId: string;
  /** When this dumpling was chosen. */
  since: number;
  /** Distinct days the kid has visited. Only ever increments. */
  visits: number;
  /** dayKey of the last visit, so a day counts once however many times the app is opened. */
  lastVisitDay: string | null;
  /** Index into MOMENTS of what it got up to, chosen on the first visit of a day. */
  momentIndex: number;
}

/** Unlocked purely by turning up. Never taken away, never expires. */
export interface Milestone {
  visits: number;
  label: string;
  /** What the kid actually sees change. */
  kind: "trick" | "accessory" | "voice";
}

export const MILESTONES: readonly Milestone[] = [
  { visits: 1, label: "settled in", kind: "trick" },
  { visits: 2, label: "learned to bounce", kind: "trick" },
  { visits: 3, label: "found a tiny hat", kind: "accessory" },
  { visits: 5, label: "worked out a somersault", kind: "trick" },
  { visits: 7, label: "invented a new squeak", kind: "voice" },
  { visits: 10, label: "learned to wobble in a circle", kind: "trick" },
  { visits: 14, label: "grew a little sprout", kind: "accessory" },
  { visits: 21, label: "can do a backflip", kind: "trick" },
];

/**
 * What the buddy got up to between visits. Every line is something *good* that happened,
 * or something waiting for the kid. None of them say the buddy was sad, lonely, hungry,
 * bored, or waiting too long, and none of them mention how long it has been.
 */
export const MOMENTS: readonly string[] = [
  "saved you the sunny spot",
  "practised a somersault",
  "made friends with a dust bunny",
  "arranged the crumbs into a little pile",
  "found a warm patch and sat in it",
  "has been humming to itself",
  "learned the squeakiest floorboard",
  "watched the steam curl around",
  "rolled all the way over, on purpose",
  "kept your seat warm",
  "counted the pleats. Twice",
  "discovered it can bounce a bit higher",
];

export function newBuddy(characterId: string, now: number): BuddyState {
  return { characterId, since: now, visits: 0, lastVisitDay: null, momentIndex: 0 };
}

/** Milestones reached so far. Derived from visits, so it can never regress. */
export function reached(b: BuddyState): Milestone[] {
  return MILESTONES.filter((m) => b.visits >= m.visits);
}

/** The next thing to look forward to, or null once they're all unlocked. */
export function nextMilestone(b: BuddyState): Milestone | null {
  return MILESTONES.find((m) => b.visits < m.visits) ?? null;
}

export function momentText(b: BuddyState): string {
  return MOMENTS[b.momentIndex % MOMENTS.length] as string;
}

/**
 * Count today's visit, if it hasn't been counted yet. Returns true when this is the first
 * visit of a new day, which is when the kid gets shown what the buddy got up to.
 *
 * `todayKey` is passed in rather than read from the clock so this stays pure, and so it can
 * use the same forward-only day the rest of the game runs on.
 */
export function recordVisit(b: BuddyState, todayKey: string, pick: number): boolean {
  if (b.lastVisitDay === todayKey) return false;
  b.lastVisitDay = todayKey;
  b.visits += 1;
  b.momentIndex = Math.abs(Math.floor(pick)) % MOMENTS.length;
  return true;
}

/** A buddy has to be one the kid actually owns; picking is never forced. */
export function canBeBuddy(inv: Inventory, characterId: string): boolean {
  return CHARACTER_BY_ID.has(characterId) && (inv[characterId] ?? 0) > 0;
}
