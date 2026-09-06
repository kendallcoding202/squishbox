import type { Rarity, SeriesId } from "./characters";

export interface Box {
  id: string;
  name: string;
  price: number;
  emoji: string;
  tagline: string;
  series: SeriesId;
  /** Percent chance per rarity. Must sum to 100. Shown to the player before purchase. */
  odds: Record<Rarity, number>;
}

export const BOXES: readonly Box[] = [
  {
    id: "steamer",
    name: "Steamer Basket",
    price: 10,
    emoji: "🥟",
    series: "s1",
    tagline: "Everyday dumplings. A rare one sometimes.",
    odds: { common: 62, uncommon: 26, rare: 9, epic: 2.5, legendary: 0.5 },
  },
  {
    id: "golden",
    name: "Golden Basket",
    price: 30,
    emoji: "🧺",
    series: "s1",
    tagline: "No commons guaranteed? No. But far fewer.",
    odds: { common: 30, uncommon: 38, rare: 22, epic: 8, legendary: 2 },
  },
  {
    id: "feast",
    name: "Feast Box",
    price: 80,
    emoji: "🎁",
    series: "s1",
    tagline: "Rare or better, every time.",
    odds: { common: 0, uncommon: 0, rare: 62, epic: 30, legendary: 8 },
  },
  {
    id: "bamboo",
    name: "Bamboo Steamer",
    price: 12,
    emoji: "🎋",
    series: "s2",
    tagline: "The Dim Sum Crew, fresh from the cart.",
    odds: { common: 58, uncommon: 28, rare: 11, epic: 2.5, legendary: 0.5 },
  },
  {
    id: "jade",
    name: "Jade Box",
    price: 40,
    emoji: "🫖",
    series: "s2",
    tagline: "Mostly uncommon and up.",
    odds: { common: 20, uncommon: 42, rare: 26, epic: 9, legendary: 3 },
  },
];

export function boxesInSeries(id: SeriesId): Box[] {
  return BOXES.filter((b) => b.series === id);
}

export const BOX_BY_ID: ReadonlyMap<string, Box> = new Map(BOXES.map((b) => [b.id, b]));
