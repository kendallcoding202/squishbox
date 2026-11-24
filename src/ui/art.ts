// The painted art. Every picture lives in src/art/ and is found here by name, so the bundler
// fingerprints each file and a new build never shows a cached old picture.
//
// Each lookup returns null when there is no picture, and every caller falls back to what it
// drew before (the SVG dumpling, the emoji prop, the gradient room). A dumpling added to the
// game before its art is made still shows up; tests/art.test.ts makes sure that is never
// what ships.

const pick = (files: Record<string, string>) => {
  const byName = new Map<string, string>();
  for (const [path, url] of Object.entries(files)) byName.set(path.slice(path.lastIndexOf("/") + 1, -".webp".length), url);
  return (name: string): string | null => byName.get(name) ?? null;
};

export const dumplingArt = pick(import.meta.glob("../art/dumplings/*.webp", { eager: true, query: "?url", import: "default" }));
export const propArt = pick(import.meta.glob("../art/props/*.webp", { eager: true, query: "?url", import: "default" }));
export const boxArt = pick(import.meta.glob("../art/boxes/*.webp", { eager: true, query: "?url", import: "default" }));
export const roomArt = pick(import.meta.glob("../art/rooms/*.webp", { eager: true, query: "?url", import: "default" }));

/** An <img> that is only a picture: not draggable, not selectable, not read out. */
export function artImg(url: string, cls: string): HTMLImageElement {
  const img = document.createElement("img");
  img.src = url;
  img.alt = "";
  img.className = cls;
  img.draggable = false;
  img.decoding = "async";
  return img;
}
