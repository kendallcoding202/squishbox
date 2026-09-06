import type { Rarity } from "./characters";

export interface Box {
  id: string;
  name: string;
  price: number;
  emoji: string;
  tagline: string;
  /** Percent chance per rarity. Must sum to 100. Shown to the player before purchase. */
  odds: Record<Rarity, number>;
}

export const BOXES: readonly Box[] = [
  {
    id: "steamer",
    name: "Steamer Basket",
    price: 10,
    emoji: "🥟",
    tagline: "Everyday dumplings. A rare one sometimes.",
    odds: { common: 62, uncommon: 26, rare: 9, epic: 2.5, legendary: 0.5 },
  },
  {
    id: "golden",
    name: "Golden Basket",
    price: 30,
    emoji: "🧺",
    tagline: "No commons guaranteed? No. But far fewer.",
    odds: { common: 30, uncommon: 38, rare: 22, epic: 8, legendary: 2 },
  },
  {
    id: "feast",
    name: "Feast Box",
    price: 80,
    emoji: "🎁",
    tagline: "Rare or better, every time.",
    odds: { common: 0, uncommon: 0, rare: 62, epic: 30, legendary: 8 },
  },
];

export const BOX_BY_ID: ReadonlyMap<string, Box> = new Map(BOXES.map((b) => [b.id, b]));
