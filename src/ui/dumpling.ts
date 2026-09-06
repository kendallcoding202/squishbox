import type { Character, Face, Hat } from "../data/characters";
import { RARITY_INFO } from "../data/characters";
import { h } from "./dom";

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
    case "star": return [
      s("path", { d: "M74 12 l3.5 7.5 l8 1 l-6 5.5 l1.5 8 l-7 -4 l-7 4 l1.5 -8 l-6 -5.5 l8 -1 z", fill: "#ffd23f", stroke: "#d9a400", "stroke-width": 1.5, "stroke-linejoin": "round" }),
      s("path", { d: "M74 12 l3.5 7.5 l8 1 l-6 5.5 l1.5 8 l-7 -4 l-7 4 l1.5 -8 l-6 -5.5 l8 -1 z", fill: "none", stroke: edge, "stroke-width": 0 }),
    ];
  }
}

/** Build the SVG for a character. Same character always draws the same. */
export function dumplingSvg(c: Character): SVGSVGElement {
  const svg = s("svg", { viewBox: "0 0 100 100", role: "img", "aria-label": c.name }) as SVGSVGElement;
  const ink = "#2b2118";
  const edge = darken(c.body, 0.22);
  const glow = RARITY_INFO[c.rarity].glow;

  if (c.rarity === "epic" || c.rarity === "legendary") {
    svg.appendChild(s("ellipse", { cx: 50, cy: 62, rx: 44, ry: 36, fill: glow, opacity: 0.55 }));
  }
  svg.appendChild(s("ellipse", { cx: 50, cy: 90, rx: 30, ry: 5, fill: "rgba(0,0,0,0.08)" }));
  // body
  svg.appendChild(s("path", {
    d: "M16 62C16 42 31 32 50 30C69 32 84 42 84 62C84 80 69 88 50 88C31 88 16 80 16 62Z",
    fill: c.body, stroke: edge, "stroke-width": 2.5,
  }));
  // pleats fanning from the top knot
  const n = Math.max(3, Math.min(7, c.pleats));
  for (let i = 0; i < n; i++) {
    const t = n === 1 ? 0 : (i / (n - 1)) * 2 - 1; // -1..1
    const x2 = 50 + t * 20;
    const y2 = 39 + Math.abs(t) * 3;
    const cx = 50 + t * 6;
    svg.appendChild(s("path", { d: `M50 31 Q${cx} 33 ${x2} ${y2}`, stroke: edge, "stroke-width": 2.2, "stroke-linecap": "round", fill: "none", opacity: 0.85 }));
  }
  svg.appendChild(s("circle", { cx: 50, cy: 31, r: 3, fill: edge }));
  // highlight + blush
  svg.appendChild(s("ellipse", { cx: 34, cy: 44, rx: 8, ry: 4, fill: "#fff", opacity: 0.55, transform: "rotate(-20 34 44)" }));
  svg.appendChild(s("ellipse", { cx: 29, cy: 67, rx: 5.5, ry: 3.2, fill: c.blush, opacity: 0.9 }));
  svg.appendChild(s("ellipse", { cx: 71, cy: 67, rx: 5.5, ry: 3.2, fill: c.blush, opacity: 0.9 }));
  for (const el of face(c.face, ink)) svg.appendChild(el);
  for (const el of hat(c.hat, c.body, ink)) svg.appendChild(el);
  if (c.rarity === "legendary") {
    for (const [x, y] of [[14, 30], [88, 26], [90, 74], [10, 78]] as const) {
      svg.appendChild(s("path", { d: `M${x} ${y - 5} l1.5 3.5 l3.5 1.5 l-3.5 1.5 l-1.5 3.5 l-1.5 -3.5 l-3.5 -1.5 l3.5 -1.5 z`, fill: "#ffd23f" }));
    }
  }
  return svg;
}

/** A squishable dumpling: press to squash, release to boing. */
export function dumplingEl(c: Character, size = 96, opts: { idle?: boolean } = {}): HTMLElement {
  const wrap = h("div", { class: `dumpling${opts.idle ? " idle" : ""}`, style: `width:${size}px;height:${size}px` }, dumplingSvg(c));
  const down = () => { wrap.classList.remove("boing", "idle"); wrap.classList.add("squish"); };
  const up = () => {
    if (!wrap.classList.contains("squish")) return;
    wrap.classList.remove("squish");
    wrap.classList.add("boing");
    wrap.addEventListener("animationend", () => { wrap.classList.remove("boing"); if (opts.idle) wrap.classList.add("idle"); }, { once: true });
  };
  wrap.addEventListener("pointerdown", down);
  wrap.addEventListener("pointerup", up);
  wrap.addEventListener("pointercancel", up);
  wrap.addEventListener("pointerleave", up);
  return wrap;
}
