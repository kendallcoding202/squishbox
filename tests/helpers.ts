import type { Box } from "../src/data/boxes";
import { seasonOf } from "../src/data/characters";

/**
 * A date on which a given box can actually be bought.
 *
 * Sweeps over every box have to get past the series gate, and owning everything does not
 * open a seasonal series — only the calendar does. Picking one hard-coded "in season" date
 * stops working the moment a second season lands in a different month, as the Halloween and
 * Christmas sets promptly proved, so derive it from the box's own window instead.
 */
export function buyableOn(box: Box): Date {
  const season = seasonOf(box.series);
  if (!season) return new Date("2026-09-10T10:00:00");
  return new Date(2026, season.from.month - 1, season.from.day, 10, 0, 0);
}
