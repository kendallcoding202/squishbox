import type { Rarity } from "../data/characters";
import { haptic, squeak } from "./sound";

/**
 * Spring-based squish. While pressed, the dumpling squashes toward the finger and follows drags.
 * On release it springs back with a damped wobble. Pure transforms, no layout work, 60fps on iPad.
 */
export interface SquishOptions {
  size: number;
  rarity: Rarity;
  /** 0..11, picks the squeak pitch so each character sounds a little different. */
  voice: number;
  onPress?: () => void;
  /**
   * Take the whole gesture, including vertical drags. Only for a dumpling that is the
   * star of a modal; in a scrolling list it would eat the scroll, and a grid of them
   * leaves nowhere to start one.
   */
  fullSquish?: boolean;
  /** Inside a sideways-scrolling row, so a horizontal swipe must scroll rather than squish. */
  inHorizontalScroller?: boolean;
}

const STIFFNESS = 260;
const DAMPING = 11;

export function attachSquish(el: HTMLElement, opts: SquishOptions): void {
  el.style.transformOrigin = "50% 92%";
  // Leave the page's own scrolling to the browser; a press or an off-axis drag still squishes.
  // pan-y alone would trap a sideways swipe, which strands the end of a horizontal row.
  el.style.touchAction = opts.fullSquish ? "none" : opts.inHorizontalScroller ? "pan-x pan-y" : "pan-y";

  // Current and target deformation. sx/sy are scale, tx/ty translation in px, sk skew in degrees.
  const cur = { sx: 1, sy: 1, tx: 0, ty: 0, sk: 0 };
  const vel = { sx: 0, sy: 0, tx: 0, ty: 0, sk: 0 };
  const target = { sx: 1, sy: 1, tx: 0, ty: 0, sk: 0 };
  let pressed = false;
  let raf = 0;
  let last = 0;
  let startX = 0;
  let startY = 0;

  const apply = () => {
    el.style.transform = `translate(${cur.tx.toFixed(2)}px, ${cur.ty.toFixed(2)}px) skewX(${cur.sk.toFixed(2)}deg) scale(${cur.sx.toFixed(3)}, ${cur.sy.toFixed(3)})`;
  };

  const step = (now: number) => {
    const dt = Math.min(0.032, (now - last) / 1000 || 0.016);
    last = now;
    let settled = true;
    for (const k of Object.keys(cur) as (keyof typeof cur)[]) {
      const stiffness = pressed ? STIFFNESS * 2.2 : STIFFNESS;
      const damping = pressed ? DAMPING * 2 : DAMPING;
      const a = (target[k] - cur[k]) * stiffness - vel[k] * damping;
      vel[k] += a * dt;
      cur[k] += vel[k] * dt;
      if (Math.abs(vel[k]) > 0.002 || Math.abs(target[k] - cur[k]) > 0.002) settled = false;
    }
    apply();
    if (settled && !pressed) {
      Object.assign(cur, target);
      apply();
      raf = 0;
      return;
    }
    raf = requestAnimationFrame(step);
  };

  const kick = () => {
    if (!raf) { last = performance.now(); raf = requestAnimationFrame(step); }
  };

  const setPressTarget = (dx: number, dy: number) => {
    // dx, dy are drag offsets in units of the element size (-1..1 typical)
    const push = 1 + Math.min(0.6, Math.abs(dx) * 0.5);
    target.sx = 1.18 * push;
    target.sy = 0.8 - Math.min(0.25, Math.max(0, dy) * 0.5) + Math.min(0.15, Math.max(0, -dy) * 0.2);
    target.tx = dx * opts.size * 0.18;
    target.ty = Math.max(0, dy) * opts.size * 0.08;
    target.sk = -dx * 14;
  };

  el.addEventListener("pointerdown", (e) => {
    pressed = true;
    startX = e.clientX;
    startY = e.clientY;
    el.setPointerCapture?.(e.pointerId);
    setPressTarget(0, 0);
    vel.sy -= 2; // a little extra impact
    squeak(opts.voice, opts.rarity);
    haptic("light");
    opts.onPress?.();
    kick();
  });
  el.addEventListener("pointermove", (e) => {
    if (!pressed) return;
    const dx = Math.max(-1, Math.min(1, (e.clientX - startX) / opts.size));
    const dy = Math.max(-1, Math.min(1, (e.clientY - startY) / opts.size));
    setPressTarget(dx, dy);
    kick();
  });
  const release = () => {
    if (!pressed) return;
    pressed = false;
    Object.assign(target, { sx: 1, sy: 1, tx: 0, ty: 0, sk: 0 });
    vel.sy += 3.5; // overshoot upward for the boing
    vel.sx -= 2.5;
    kick();
  };
  el.addEventListener("pointerup", release);
  el.addEventListener("pointercancel", release);
  el.addEventListener("lostpointercapture", release);
}
