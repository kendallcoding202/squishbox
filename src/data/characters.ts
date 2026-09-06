export type Rarity = "common" | "uncommon" | "rare" | "epic" | "legendary";

export const RARITIES: readonly Rarity[] = ["common", "uncommon", "rare", "epic", "legendary"];

export const RARITY_INFO: Record<Rarity, { label: string; color: string; glow: string; value: number }> = {
  common: { label: "Common", color: "#8a9bb0", glow: "#c9d3de", value: 1 },
  uncommon: { label: "Uncommon", color: "#4caf7a", glow: "#a9e6c4", value: 3 },
  rare: { label: "Rare", color: "#3f8ce8", glow: "#a8ccff", value: 10 },
  epic: { label: "Epic", color: "#a355e8", glow: "#dcbcff", value: 35 },
  legendary: { label: "Legendary", color: "#f2a900", glow: "#ffe08a", value: 150 },
};

export type Face = "smile" | "happy" | "sleepy" | "wow" | "cat" | "wink";
export type Hat = "none" | "bow" | "sprout" | "crown" | "beanie" | "glasses" | "halo" | "star" | "chef" | "flower";
export type Shape = "round" | "tall" | "wide" | "bun";
export type Pattern = "none" | "speckle" | "stripe" | "swirl" | "hearts" | "dots";

export type SeriesId = "s1" | "s2";

export interface Series {
  id: SeriesId;
  name: string;
  tagline: string;
  /** How many distinct dumplings of the previous series unlock this one. 0 = always open. */
  unlockAt: number;
  unlockFrom: SeriesId | null;
}

export const SERIES: readonly Series[] = [
  { id: "s1", name: "Steamer Pals", tagline: "The originals.", unlockAt: 0, unlockFrom: null },
  { id: "s2", name: "Dim Sum Crew", tagline: "Shumai, har gow, buns and rolls.", unlockAt: 15, unlockFrom: "s1" },
];

export const SERIES_BY_ID: ReadonlyMap<SeriesId, Series> = new Map(SERIES.map((x) => [x.id, x]));

export interface Character {
  id: string;
  name: string;
  rarity: Rarity;
  series: SeriesId;
  body: string;   // fill color
  blush: string;
  face: Face;
  hat: Hat;
  pleats: number; // 3..7
  shape: Shape;
  pattern: Pattern;
  flavor: string;
}

const S: SeriesId = "s1";
const D: SeriesId = "s2";

/** Series 1: thirty dumplings. Art is procedural SVG, see ui/dumpling.ts. */
export const CHARACTERS: readonly Character[] = [
  // Commons (12)
  { id: "c01", name: "Bao", rarity: "common", series: S, body: "#f6efe4", blush: "#f4b8b8", face: "smile", hat: "none", pleats: 5, shape: "round", pattern: "none", flavor: "The original. Plain, warm, reliable." },
  { id: "c02", name: "Pip", rarity: "common", series: S, body: "#f9e7c9", blush: "#f0a9a9", face: "happy", hat: "none", pleats: 4, shape: "wide", pattern: "none", flavor: "Small but very round." },
  { id: "c03", name: "Dough", rarity: "common", series: S, body: "#efe6d6", blush: "#f2b3b3", face: "sleepy", hat: "none", pleats: 5, shape: "bun", pattern: "none", flavor: "Always napping in the steamer." },
  { id: "c04", name: "Mochi", rarity: "common", series: S, body: "#fbe3ec", blush: "#f39ab4", face: "smile", hat: "none", pleats: 6, shape: "tall", pattern: "none", flavor: "Extra squishy. Bounces twice." },
  { id: "c05", name: "Peapod", rarity: "common", series: S, body: "#dff0d3", blush: "#a9d59a", face: "happy", hat: "none", pleats: 4, shape: "tall", pattern: "none", flavor: "Green and a little shy." },
  { id: "c06", name: "Butter", rarity: "common", series: S, body: "#fff2b8", blush: "#f5c76c", face: "smile", hat: "none", pleats: 5, shape: "wide", pattern: "none", flavor: "Melts if you hug too long." },
  { id: "c07", name: "Blueberry", rarity: "common", series: S, body: "#d6e2fb", blush: "#a9bff0", face: "wink", hat: "none", pleats: 5, shape: "round", pattern: "dots", flavor: "Sweet, and a bit of a show-off." },
  { id: "c08", name: "Pudding", rarity: "common", series: S, body: "#f5dcc0", blush: "#e9a67f", face: "sleepy", hat: "none", pleats: 3, shape: "bun", pattern: "none", flavor: "Wobbles when it laughs." },
  { id: "c09", name: "Snowball", rarity: "common", series: S, body: "#ffffff", blush: "#e3edf7", face: "happy", hat: "none", pleats: 6, shape: "round", pattern: "none", flavor: "Cold hands, warm heart." },
  { id: "c10", name: "Sesame", rarity: "common", series: S, body: "#e9dccb", blush: "#c9a98b", face: "smile", hat: "none", pleats: 5, shape: "round", pattern: "speckle", flavor: "Speckled and proud of it." },
  { id: "c11", name: "Lychee", rarity: "common", series: S, body: "#fde6e0", blush: "#f7a8a0", face: "wow", hat: "none", pleats: 4, shape: "tall", pattern: "none", flavor: "Surprised by everything." },
  { id: "c12", name: "Taro", rarity: "common", series: S, body: "#e6d9f2", blush: "#c9a9e6", face: "smile", hat: "none", pleats: 5, shape: "round", pattern: "swirl", flavor: "Purple on the inside too." },
  // Uncommons (8)
  { id: "u01", name: "Bowtie Bao", rarity: "uncommon", series: S, body: "#f6efe4", blush: "#f4b8b8", face: "happy", hat: "bow", pleats: 5, shape: "round", pattern: "none", flavor: "Dressed up for dinner." },
  { id: "u02", name: "Sprout", rarity: "uncommon", series: S, body: "#e6f3d5", blush: "#b8dba0", face: "smile", hat: "sprout", pleats: 5, shape: "tall", pattern: "none", flavor: "Growing a tiny leaf." },
  { id: "u03", name: "Kit", rarity: "uncommon", series: S, body: "#fbe7cf", blush: "#f3b48f", face: "cat", hat: "none", pleats: 5, shape: "wide", pattern: "none", flavor: "Purrs when steamed." },
  { id: "u04", name: "Nerdle", rarity: "uncommon", series: S, body: "#eef0f4", blush: "#c5cbd6", face: "smile", hat: "glasses", pleats: 6, shape: "bun", pattern: "none", flavor: "Reads the recipe. Every time." },
  { id: "u05", name: "Beanie", rarity: "uncommon", series: S, body: "#fbe3ec", blush: "#f39ab4", face: "wink", hat: "beanie", pleats: 4, shape: "round", pattern: "none", flavor: "Never takes the hat off." },
  { id: "u06", name: "Chili", rarity: "uncommon", series: S, body: "#ffd2c2", blush: "#ff8f6b", face: "wow", hat: "none", pleats: 6, shape: "tall", pattern: "stripe", flavor: "Spicy. Handle with mittens." },
  { id: "u07", name: "Matcha", rarity: "uncommon", series: S, body: "#cfe5c3", blush: "#8fc07f", face: "sleepy", hat: "sprout", pleats: 5, shape: "bun", pattern: "none", flavor: "Calm and a little bitter." },
  { id: "u08", name: "Cocoa", rarity: "uncommon", series: S, body: "#d9b99b", blush: "#b48a66", face: "happy", hat: "bow", pleats: 5, shape: "wide", pattern: "hearts", flavor: "Best friends with Snowball." },
  // Rares (6)
  { id: "r01", name: "Star Bao", rarity: "rare", series: S, body: "#fff6d1", blush: "#ffd27a", face: "happy", hat: "star", pleats: 6, shape: "round", pattern: "dots", flavor: "Fell out of the sky, landed in the basket." },
  { id: "r02", name: "Mintie", rarity: "rare", series: S, body: "#d3f4ec", blush: "#7fd6be", face: "wink", hat: "bow", pleats: 6, shape: "tall", pattern: "stripe", flavor: "Fresh. Very fresh." },
  { id: "r03", name: "Duke", rarity: "rare", series: S, body: "#e9e1f7", blush: "#c4aeea", face: "smile", hat: "glasses", pleats: 7, shape: "bun", pattern: "none", flavor: "Owns a very small castle." },
  { id: "r04", name: "Kit-Kat", rarity: "rare", series: S, body: "#ffe3ef", blush: "#ff9fc4", face: "cat", hat: "beanie", pleats: 5, shape: "wide", pattern: "none", flavor: "Two cats in one dumpling." },
  { id: "r05", name: "Sunny", rarity: "rare", series: S, body: "#ffe8a3", blush: "#ffb84a", face: "happy", hat: "sprout", pleats: 6, shape: "round", pattern: "none", flavor: "Wakes up before everyone." },
  { id: "r06", name: "Pebble", rarity: "rare", series: S, body: "#dfe5ea", blush: "#aab7c4", face: "sleepy", hat: "halo", pleats: 4, shape: "wide", pattern: "speckle", flavor: "Ancient. Very heavy for a dumpling." },
  // Epics (3)
  { id: "e01", name: "Royal Bao", rarity: "epic", series: S, body: "#fff1c9", blush: "#f7c56a", face: "smile", hat: "crown", pleats: 7, shape: "bun", pattern: "none", flavor: "Rules the whole steamer." },
  { id: "e02", name: "Nimbus", rarity: "epic", series: S, body: "#e6f4ff", blush: "#9fcfff", face: "happy", hat: "halo", pleats: 6, shape: "round", pattern: "dots", flavor: "Floats. Nobody knows how." },
  { id: "e03", name: "Ember", rarity: "epic", series: S, body: "#ffcfb0", blush: "#ff7a45", face: "wow", hat: "star", pleats: 7, shape: "tall", pattern: "swirl", flavor: "Glows in the dark. Slightly warm." },
  // Legendary (1)
  { id: "l01", name: "Golden Dumpling", rarity: "legendary", series: S, body: "#ffd85e", blush: "#ffb300", face: "wink", hat: "crown", pleats: 7, shape: "round", pattern: "speckle", flavor: "One in the basket. Maybe." },

  // ---- Series 2: Dim Sum Crew (20) ----
  // Commons (8)
  { id: "2c01", name: "Shu", rarity: "common", series: D, body: "#ffd98a", blush: "#ffb35c", face: "happy", hat: "none", pleats: 3, shape: "wide", pattern: "dots", flavor: "A shumai with a sunny top." },
  { id: "2c02", name: "Gow", rarity: "common", series: D, body: "#fbe9ee", blush: "#f5b3c4", face: "smile", hat: "none", pleats: 6, shape: "round", pattern: "none", flavor: "So translucent you can almost see the shrimp." },
  { id: "2c03", name: "Bunbun", rarity: "common", series: D, body: "#fffaf3", blush: "#f4b8b8", face: "sleepy", hat: "none", pleats: 4, shape: "bun", pattern: "swirl", flavor: "Fluffy. Contains a secret." },
  { id: "2c04", name: "Rolly", rarity: "common", series: D, body: "#f7f4ee", blush: "#e4d3c3", face: "wink", hat: "none", pleats: 3, shape: "tall", pattern: "stripe", flavor: "A rice roll that rolls everywhere." },
  { id: "2c05", name: "Sticky", rarity: "common", series: D, body: "#cfe2b9", blush: "#a3c98a", face: "smile", hat: "none", pleats: 5, shape: "bun", pattern: "none", flavor: "Wrapped in a lotus leaf. Very cozy." },
  { id: "2c06", name: "Tarta", rarity: "common", series: D, body: "#ffe6a0", blush: "#f5c76c", face: "happy", hat: "none", pleats: 4, shape: "wide", pattern: "none", flavor: "An egg tart who wandered into the wrong basket." },
  { id: "2c07", name: "Wonnie", rarity: "common", series: D, body: "#f3ecdf", blush: "#e9c9b1", face: "wow", hat: "none", pleats: 5, shape: "tall", pattern: "none", flavor: "A wonton, always a little surprised." },
  { id: "2c08", name: "Sizzle", rarity: "common", series: D, body: "#f0c98a", blush: "#d99a56", face: "smile", hat: "none", pleats: 5, shape: "wide", pattern: "speckle", flavor: "Golden on the bottom. Crispy laugh." },
  // Uncommons (6)
  { id: "2u01", name: "Chef Shu", rarity: "uncommon", series: D, body: "#ffd98a", blush: "#ffb35c", face: "happy", hat: "chef", pleats: 3, shape: "wide", pattern: "dots", flavor: "Runs the kitchen. Tastes everything." },
  { id: "2u02", name: "Lotus", rarity: "uncommon", series: D, body: "#fde1ec", blush: "#f59bbd", face: "smile", hat: "flower", pleats: 6, shape: "round", pattern: "none", flavor: "Blooms when steamed." },
  { id: "2u03", name: "Bamboo", rarity: "uncommon", series: D, body: "#d9efc4", blush: "#9fce82", face: "sleepy", hat: "sprout", pleats: 5, shape: "tall", pattern: "stripe", flavor: "Lives in the steamer basket itself." },
  { id: "2u04", name: "Crispy", rarity: "uncommon", series: D, body: "#f4d38e", blush: "#e0a24d", face: "wink", hat: "none", pleats: 5, shape: "bun", pattern: "speckle", flavor: "Sesame all over. Crunches when squished." },
  { id: "2u05", name: "Pearl", rarity: "uncommon", series: D, body: "#ffffff", blush: "#dfe7f2", face: "happy", hat: "bow", pleats: 6, shape: "round", pattern: "dots", flavor: "Found at the bottom of a teacup." },
  { id: "2u06", name: "Nori", rarity: "uncommon", series: D, body: "#8fb08a", blush: "#5f8a5a", face: "smile", hat: "glasses", pleats: 4, shape: "bun", pattern: "none", flavor: "Reads the menu out loud." },
  // Rares (4)
  { id: "2r01", name: "Dragon Bun", rarity: "rare", series: D, body: "#ff9f9f", blush: "#ff5c5c", face: "wow", hat: "crown", pleats: 6, shape: "bun", pattern: "hearts", flavor: "Roars a tiny roar." },
  { id: "2r02", name: "Jade", rarity: "rare", series: D, body: "#bfeedd", blush: "#6fd1ad", face: "wink", hat: "star", pleats: 6, shape: "round", pattern: "swirl", flavor: "Cool to the touch. Very lucky." },
  { id: "2r03", name: "Moon", rarity: "rare", series: D, body: "#dde6f7", blush: "#aebfe6", face: "sleepy", hat: "halo", pleats: 7, shape: "round", pattern: "dots", flavor: "Only opens at night. Allegedly." },
  { id: "2r04", name: "Tiger", rarity: "rare", series: D, body: "#ffc073", blush: "#ff8a3d", face: "cat", hat: "beanie", pleats: 5, shape: "wide", pattern: "stripe", flavor: "Stripes on the outside, shrimp on the inside." },
  // Epic (1)
  { id: "2e01", name: "Emperor Gow", rarity: "epic", series: D, body: "#ffe1b8", blush: "#f7a36a", face: "smile", hat: "crown", pleats: 7, shape: "round", pattern: "hearts", flavor: "Sits on a cushion of ginger." },
  // Legendary (1)
  { id: "2l01", name: "Jade Dragon", rarity: "legendary", series: D, body: "#8fe0c4", blush: "#3fbf92", face: "wink", hat: "flower", pleats: 7, shape: "tall", pattern: "swirl", flavor: "Steam curls into a dragon when it opens." },
];

export const CHARACTER_BY_ID: ReadonlyMap<string, Character> = new Map(CHARACTERS.map((c) => [c.id, c]));

export function charactersOfRarity(r: Rarity): Character[] {
  return CHARACTERS.filter((c) => c.rarity === r);
}

export function charactersInSeries(id: SeriesId): Character[] {
  return CHARACTERS.filter((c) => c.series === id);
}
