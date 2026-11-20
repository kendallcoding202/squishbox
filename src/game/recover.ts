import { newState, readSave, type SaveState } from "./state";

/**
 * Choosing which copy of the save to start from.
 *
 * The collection used to live in exactly one place, the web view's local storage, and a
 * start-up that found nothing there began a new game and saved over whatever came back
 * later. A player lost a whole collection that way on an update. Now there is a second copy
 * kept by the phone itself, outside the web view, and this file decides between them.
 *
 * The rules, in order:
 *   1. Of the copies that can be read, the one written most recently wins (highest `rev`).
 *   2. On a tie the web view's own copy wins, then the phone's copy, then the snapshot.
 *   3. A copy that is there but cannot be read is never thrown away: it is handed back in
 *      `unreadable` so the caller can put it somewhere safe.
 *   4. Only when no copy can be read does a new game start.
 */

/** The raw text of each copy, or null where there is none. */
export interface Copies {
  /** The web view's local storage: the copy every build has always written. */
  local: string | null;
  /** The phone's own copy, written alongside every save. */
  vault: string | null;
  /** The save as it stood when this build first ran, kept until the next build replaces it. */
  snapshot: string | null;
}

export type Source = "local" | "vault" | "snapshot" | "fresh";

export interface StartPlan {
  state: SaveState;
  source: Source;
  /** Raw text of copies that exist and could not be read. Keep them; do not write over them. */
  unreadable: string[];
}

const ORDER: Exclude<Source, "fresh">[] = ["local", "vault", "snapshot"];

export function planStart(copies: Copies): StartPlan {
  const unreadable: string[] = [];
  let best: { state: SaveState; source: Exclude<Source, "fresh"> } | null = null;
  for (const source of ORDER) {
    const read = readSave(copies[source]);
    if (read.kind === "unreadable") {
      if (!unreadable.includes(read.raw)) unreadable.push(read.raw);
      continue;
    }
    if (read.kind !== "ok") continue;
    if (!best || read.state.rev > best.state.rev) best = { state: read.state, source };
  }
  return best ? { ...best, unreadable } : { state: newState(), source: "fresh", unreadable };
}

/** A snapshot is stored with the build that took it, so the next build knows to replace it. */
export interface Snapshot { build: string; raw: string }

export function parseSnapshot(text: string | null | undefined): Snapshot | null {
  if (!text) return null;
  try {
    const v = JSON.parse(text) as Partial<Snapshot> | null;
    if (v && typeof v.build === "string" && typeof v.raw === "string" && v.raw) return { build: v.build, raw: v.raw };
  } catch {
    /* not a snapshot */
  }
  return null;
}

/**
 * Should this build take a new snapshot? Yes when it has not taken one yet, and only of a
 * game somebody has actually started: a snapshot of an empty basket protects nothing and
 * would replace one that does.
 */
export function shouldSnapshot(existing: Snapshot | null, build: string, onboarded: boolean): boolean {
  if (!onboarded) return false;
  return !existing || existing.build !== build;
}
