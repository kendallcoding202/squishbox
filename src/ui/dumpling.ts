import type { Character, Face, Hat, Pattern, Shape } from "../data/characters";
import { RARITY_INFO } from "../data/characters";
import { h } from "./dom";
import { attachSquish } from "./squish";

const NS = "http://www.w3.org/2000/svg";

function s(tag: string, attrs: Record<string, string | number>): SVGElement {
  const el = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
  return el;
}

function darken(hex: string, amt = 0.18): string {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.max(0, ((n >> 16) & 255) * (1 - amt));
  const g = Math.max(0, ((n >> 8) & 255) * (1 - amt));
  const b = Math.max(0, (n & 255) * (1 - amt));
  return `rgb(${r | 0},${g | 0},${b | 0})`;
}

function face(kind: Face, ink: string): SVGElement[] {
  const out: SVGElement[] = [];
  const eyeDot = (x: number) => s("circle", { cx: x, cy: 59, r: 3.4, fill: ink });
  const eyeHappy = (x: number) => s("path", { d: `M${x - 4} 60 q4 -6 8 0`, stroke: ink, "stroke-width": 3, "stroke-linecap": "round", fill: "none" });
  const eyeClosed = (x: number) => s("path", { d: `M${x - 4} 59 h8`, stroke: ink, "stroke-width": 3, "stroke-linecap": "round" });
  const eyeBig = (x: number) => [
    s("circle", { cx: x, cy: 59, r: 5.5, fill: ink }),
    s("circle", { cx: x + 2, cy: 57, r: 1.8, fill: "#fff" }),
  ];
  switch (kind) {
    case "smile":
      out.push(eyeDot(39), eyeDot(61), s("path", { d: "M44 70 q6 5 12 0", stroke: ink, "stroke-width": 3, "stroke-linecap": "round", fill: "none" }));
      break;
    case "happy":
      out.push(eyeHappy(39), eyeHappy(61), s("path", { d: "M42 68 q8 10 16 0 z", fill: ink }));
      break;
    case "sleepy":
      out.push(eyeClosed(39), eyeClosed(61), s("circle", { cx: 50, cy: 71, r: 2.4, fill: ink }));
      break;
    case "wow":
      out.push(...eyeBig(39), ...eyeBig(61), s("ellipse", { cx: 50, cy: 72, rx: 4, ry: 5, fill: ink }));
      break;
    case "cat":
      out.push(
        eyeHappy(39), eyeHappy(61),
        s("path", { d: "M44 68 q3 4 6 0 q3 4 6 0", stroke: ink, "stroke-width": 2.6, "stroke-linecap": "round", fill: "none" }),
        s("path", { d: "M22 64 h10 M22 70 h10 M68 64 h10 M68 70 h10", stroke: ink, "stroke-width": 2, "stroke-linecap": "round", opacity: 0.6 }),
      );
      break;
    case "wink":
      out.push(eyeDot(39), eyeHappy(61), s("path", { d: "M44 70 q8 6 14 -2", stroke: ink, "stroke-width": 3, "stroke-linecap": "round", fill: "none" }));
      break;
  }
  return out;
}

function hat(kind: Hat, body: string, ink: string): SVGElement[] {
  const edge = darken(body, 0.3);
  switch (kind) {
    case "none": return [];
    case "bow": return [
      s("path", { d: "M66 24 l-9 7 l9 7 z M76 24 l9 7 l-9 7 z", fill: "#ff6b8a", stroke: "#d64d6b", "stroke-width": 1.5, "stroke-linejoin": "round" }),
      s("circle", { cx: 71, cy: 31, r: 3.2, fill: "#d64d6b" }),
    ];
    case "sprout": return [
      s("path", { d: "M50 30 q0 -10 2 -14", stroke: "#5aa552", "stroke-width": 3, "stroke-linecap": "round", fill: "none" }),
      s("path", { d: "M52 18 q-10 -4 -10 6 q8 2 10 -6 z M52 18 q10 -6 10 4 q-8 4 -10 -4 z", fill: "#7cc46f", stroke: "#5aa552", "stroke-width": 1.5, "stroke-linejoin": "round" }),
    ];
    case "crown": return [
      s("path", { d: "M34 30 l4 -14 l8 9 l4 -12 l4 12 l8 -9 l4 14 z", fill: "#ffd23f", stroke: "#d9a400", "stroke-width": 2, "stroke-linejoin": "round" }),
      s("circle", { cx: 38, cy: 16, r: 2.4, fill: "#ff6b8a" }), s("circle", { cx: 50, cy: 13, r: 2.4, fill: "#6bb6ff" }), s("circle", { cx: 62, cy: 16, r: 2.4, fill: "#ff6b8a" }),
    ];
    case "beanie": return [
      s("path", { d: "M26 40 q24 -30 48 0 q-24 -6 -48 0 z", fill: "#ff8f5e", stroke: darken("#ff8f5e", 0.25), "stroke-width": 2 }),
      s("path", { d: "M26 40 q24 8 48 0", stroke: darken("#ff8f5e", 0.25), "stroke-width": 4, "stroke-linecap": "round", fill: "none" }),
      s("circle", { cx: 50, cy: 18, r: 4.5, fill: "#fff", stroke: darken("#ff8f5e", 0.25), "stroke-width": 1.5 }),
    ];
    case "glasses": return [
      s("circle", { cx: 39, cy: 59, r: 9, fill: "rgba(255,255,255,0.35)", stroke: ink, "stroke-width": 2.5 }),
      s("circle", { cx: 61, cy: 59, r: 9, fill: "rgba(255,255,255,0.35)", stroke: ink, "stroke-width": 2.5 }),
      s("path", { d: "M48 59 h4 M30 57 l-8 -3 M70 57 l8 -3", stroke: ink, "stroke-width": 2.5, "stroke-linecap": "round" }),
    ];
    case "halo": return [
      s("ellipse", { cx: 50, cy: 16, rx: 16, ry: 5, fill: "none", stroke: "#ffd23f", "stroke-width": 3.5 }),
      s("ellipse", { cx: 50, cy: 16, rx: 16, ry: 5, fill: "none", stroke: "#fff3b0", "stroke-width": 1.2 }),
    ];
    case "chef": return [
      s("path", { d: "M32 32 v-8 q0 -14 18 -12 q18 -2 18 12 v8 z", fill: "#fff", stroke: "#cfc8bd", "stroke-width": 2, "stroke-linejoin": "round" }),
      s("path", { d: "M30 14 q6 -10 14 -2 q6 -8 12 0 q8 -8 14 2", fill: "#fff", stroke: "#cfc8bd", "stroke-width": 2, "stroke-linejoin": "round" }),
      s("path", { d: "M32 32 h36", stroke: "#cfc8bd", "stroke-width": 2.5, "stroke-linecap": "round" }),
    ];
    case "flower": return [
      ...[0, 72, 144, 216, 288].map((a) => s("ellipse", { cx: 70, cy: 22, rx: 4.5, ry: 7, fill: "#ff8fb6", stroke: "#e2679a", "stroke-width": 1.2, transform: `rotate(${a} 70 28)` })),
      s("circle", { cx: 70, cy: 28, r: 4, fill: "#ffd23f", stroke: "#d9a400", "stroke-width": 1.2 }),
    ];
    case "star": return [
      s("path", { d: "M74 12 l3.5 7.5 l8 1 l-6 5.5 l1.5 8 l-7 -4 l-7 4 l1.5 -8 l-6 -5.5 l8 -1 z", fill: "#ffd23f", stroke: "#d9a400", "stroke-width": 1.5, "stroke-linejoin": "round" }),
      s("path", { d: "M74 12 l3.5 7.5 l8 1 l-6 5.5 l1.5 8 l-7 -4 l-7 4 l1.5 -8 l-6 -5.5 l8 -1 z", fill: "none", stroke: edge, "stroke-width": 0 }),
    ];
  }
}

/** Body outline per shape. All share the same face position so hats and faces line up. */
const SHAPES: Record<Shape, { d: string; top: number }> = {
  round: { d: "M16 62C16 42 31 32 50 30C69 32 84 42 84 62C84 80 69 88 50 88C31 88 16 80 16 62Z", top: 31 },
  tall: { d: "M21 60C21 36 34 27 50 25C66 27 79 36 79 60C79 82 67 90 50 90C33 90 21 82 21 60Z", top: 26 },
  wide: { d: "M9 64C9 46 28 35 50 33C72 35 91 46 91 64C91 80 74 88 50 88C26 88 9 80 9 64Z", top: 34 },
  bun: { d: "M15 66C15 44 31 31 50 30C69 31 85 44 85 66C85 80 78 86 50 86C22 86 15 80 15 66Z", top: 31 },
};

let clipSeq = 0;

function pattern(kind: Pattern, edge: string, clipId: string): SVGElement[] {
  const out: SVGElement[] = [];
  const g = s("g", { "clip-path": `url(#${clipId})`, opacity: 0.55 });
  switch (kind) {
    case "none": return out;
    case "speckle":
      for (const [x, y, r] of [[30, 50, 1.4], [44, 44, 1.2], [62, 47, 1.5], [72, 58, 1.2], [36, 76, 1.3], [58, 80, 1.4], [24, 66, 1.1], [70, 76, 1.2]] as const)
        g.appendChild(s("circle", { cx: x, cy: y, r, fill: edge }));
      break;
    case "dots":
      for (const [x, y] of [[26, 48], [74, 48], [22, 74], [78, 74], [50, 84]] as const)
        g.appendChild(s("circle", { cx: x, cy: y, r: 3.2, fill: "#fff", opacity: 0.9 }));
      break;
    case "stripe":
      for (const y of [46, 78]) g.appendChild(s("path", { d: `M8 ${y} Q50 ${y - 6} 92 ${y}`, stroke: edge, "stroke-width": 4, fill: "none", "stroke-linecap": "round" }));
      break;
    case "swirl":
      g.appendChild(s("path", { d: "M28 72 q4 -12 16 -8 q10 4 6 12 q-4 8 -12 4", stroke: edge, "stroke-width": 2.6, fill: "none", "stroke-linecap": "round" }));
      g.appendChild(s("path", { d: "M62 78 q4 -10 14 -6", stroke: edge, "stroke-width": 2.6, fill: "none", "stroke-linecap": "round" }));
      break;
    case "hearts":
      for (const [x, y] of [[26, 48], [74, 48], [50, 84]] as const)
        g.appendChild(s("path", { d: `M${x} ${y + 3} l-4 -4 a2.4 2.4 0 0 1 4 -3 a2.4 2.4 0 0 1 4 3 z`, fill: "#ff6b8a", opacity: 0.85 }));
      break;
  }
  out.push(g);
  return out;
}

/** Build the SVG for a character. Same character always draws the same. */
export function dumplingSvg(c: Character): SVGSVGElement {
  const svg = s("svg", { viewBox: "0 0 100 100", role: "img", "aria-label": c.name }) as SVGSVGElement;
  const ink = "#2b2118";
  const edge = darken(c.body, 0.22);
  const glow = RARITY_INFO[c.rarity].glow;
  const shape = SHAPES[c.shape] ?? SHAPES.round;
  const clipId = `dclip${++clipSeq}`;

  const defs = s("defs", {});
  const clip = s("clipPath", { id: clipId });
  clip.appendChild(s("path", { d: shape.d }));
  defs.appendChild(clip);
  svg.appendChild(defs);

  if (c.rarity === "epic" || c.rarity === "legendary") {
    svg.appendChild(s("ellipse", { cx: 50, cy: 62, rx: 46, ry: 38, fill: glow, opacity: 0.55 }));
  }
  svg.appendChild(s("ellipse", { cx: 50, cy: 90, rx: 30, ry: 5, fill: "rgba(0,0,0,0.08)" }));
  // body
  svg.appendChild(s("path", { d: shape.d, fill: c.body, stroke: edge, "stroke-width": 2.5 }));
  for (const el of pattern(c.pattern, edge, clipId)) svg.appendChild(el);
  // pleats fanning from the top knot
  const n = Math.max(3, Math.min(7, c.pleats));
  const top = shape.top;
  for (let i = 0; i < n; i++) {
    const t = n === 1 ? 0 : (i / (n - 1)) * 2 - 1; // -1..1
    const x2 = 50 + t * 20;
    const y2 = top + 8 + Math.abs(t) * 3;
    const cx = 50 + t * 6;
    svg.appendChild(s("path", { d: `M50 ${top} Q${cx} ${top + 2} ${x2} ${y2}`, stroke: edge, "stroke-width": 2.2, "stroke-linecap": "round", fill: "none", opacity: 0.85 }));
  }
  svg.appendChild(s("circle", { cx: 50, cy: top, r: 3, fill: edge }));
  // highlight + blush
  svg.appendChild(s("ellipse", { cx: 34, cy: 44, rx: 8, ry: 4, fill: "#fff", opacity: 0.55, transform: "rotate(-20 34 44)" }));
  svg.appendChild(s("ellipse", { cx: 29, cy: 67, rx: 5.5, ry: 3.2, fill: c.blush, opacity: 0.9 }));
  svg.appendChild(s("ellipse", { cx: 71, cy: 67, rx: 5.5, ry: 3.2, fill: c.blush, opacity: 0.9 }));
  for (const el of face(c.face, ink)) svg.appendChild(el);
  const hatGroup = s("g", { transform: `translate(0 ${top - 31})` });
  for (const el of hat(c.hat, c.body, ink)) hatGroup.appendChild(el);
  svg.appendChild(hatGroup);
  if (c.rarity === "legendary") {
    for (const [x, y] of [[14, 30], [88, 26], [90, 74], [10, 78]] as const) {
      svg.appendChild(s("path", { d: `M${x} ${y - 5} l1.5 3.5 l3.5 1.5 l-3.5 1.5 l-1.5 3.5 l-1.5 -3.5 l-3.5 -1.5 l3.5 -1.5 z`, fill: "#ffd23f" }));
    }
  }
  return svg;
}

/** A squishable dumpling: press and drag to squash, release for a springy wobble. */
export function dumplingEl(c: Character, size = 96, opts: { idle?: boolean; fullSquish?: boolean; inHorizontalScroller?: boolean } = {}): HTMLElement {
  const inner = h("div", { class: `dumpling-inner${opts.idle ? " idle" : ""}` }, dumplingSvg(c));
  const wrap = h("div", { class: "dumpling", style: `width:${size}px;height:${size}px` }, inner);
  attachSquish(wrap, {
    size, rarity: c.rarity, voice: (c.id.charCodeAt(1) * 7 + c.id.charCodeAt(2)) % 12,
    fullSquish: opts.fullSquish, inHorizontalScroller: opts.inHorizontalScroller,
  });
  return wrap;
}
