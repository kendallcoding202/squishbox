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
export type Hat = "none" | "bow" | "sprout" | "crown" | "beanie" | "glasses" | "halo" | "star";
export type Shape = "round" | "tall" | "wide" | "bun";
export type Pattern = "none" | "speckle" | "stripe" | "swirl" | "hearts" | "dots";

export interface Character {
  id: string;
  name: string;
  rarity: Rarity;
  series: string;
  body: string;   // fill color
  blush: string;
  face: Face;
  hat: Hat;
  pleats: number; // 3..7
  shape: Shape;
  pattern: Pattern;
  flavor: string;
}

const S = "Steamer Pals";

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
];

export const CHARACTER_BY_ID: ReadonlyMap<string, Character> = new Map(CHARACTERS.map((c) => [c.id, c]));

export function charactersOfRarity(r: Rarity): Character[] {
  return CHARACTERS.filter((c) => c.rarity === r);
}
