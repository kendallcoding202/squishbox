import type { Rarity } from "../data/characters";

/**
 * All sounds are synthesized with WebAudio, so there are no audio files to ship or load.
 * The context is created lazily on the first user gesture (iOS requires that).
 */
let ctx: AudioContext | null = null;
let enabled = true;
let unlocked = false;

export function setSoundEnabled(on: boolean): void { enabled = on; }
export function soundEnabled(): boolean { return enabled; }

function ac(): AudioContext | null {
  if (!enabled) return null;
  try {
    if (!ctx) ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    if (ctx.state === "suspended") void ctx.resume();
    return ctx;
  } catch { return null; }
}

/** Call once from a pointerdown listener on document so iOS lets audio play later. */
export function unlockAudio(): void {
  if (unlocked) return;
  unlocked = true;
  const c = ac();
  if (!c) return;
  const b = c.createBuffer(1, 1, 22050);
  const src = c.createBufferSource();
  src.buffer = b; src.connect(c.destination); src.start(0);
}

function tone(c: AudioContext, freq: number, t0: number, dur: number, type: OscillatorType, gain: number, endFreq?: number): void {
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t0);
  if (endFreq) o.frequency.exponentialRampToValueAtTime(endFreq, t0 + dur);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(gain, t0 + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g).connect(c.destination);
  o.start(t0); o.stop(t0 + dur + 0.02);
}

function noise(c: AudioContext, t0: number, dur: number, gain: number, hp = 800): void {
  const len = Math.floor(c.sampleRate * dur);
  const buf = c.createBuffer(1, len, c.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = c.createBufferSource(); src.buffer = buf;
  const f = c.createBiquadFilter(); f.type = "highpass"; f.frequency.value = hp;
  const g = c.createGain(); g.gain.value = gain;
  src.connect(f).connect(g).connect(c.destination);
  src.start(t0);
}

let lastSqueak = 0;
/** Short rubbery squeak. Pitch varies per character; bigger rarities are a touch lower and rounder. */
export function squeak(voice: number, rarity: Rarity): void {
  const c = ac(); if (!c) return;
  const now = c.currentTime;
  if (now - lastSqueak < 0.06) return;
  lastSqueak = now;
  const base = 520 + voice * 38 - ({ common: 0, uncommon: 20, rare: 40, epic: 70, legendary: 100 })[rarity];
  tone(c, base, now, 0.12, "triangle", 0.12, base * 1.6);
  tone(c, base * 2.01, now, 0.08, "sine", 0.04, base * 2.6);
}

export function pop(): void {
  const c = ac(); if (!c) return;
  const now = c.currentTime;
  noise(c, now, 0.08, 0.25, 1500);
  tone(c, 300, now, 0.14, "sine", 0.18, 90);
}

export function thud(intensity = 1): void {
  const c = ac(); if (!c) return;
  const now = c.currentTime;
  tone(c, 160, now, 0.16, "sine", 0.22 * intensity, 60);
  noise(c, now, 0.05, 0.08 * intensity, 400);
}

export function coin(): void {
  const c = ac(); if (!c) return;
  const now = c.currentTime;
  tone(c, 1245, now, 0.09, "square", 0.06);
  tone(c, 1660, now + 0.07, 0.16, "square", 0.06);
}

/** Reveal fanfare, longer and brighter with rarity. */
export function reveal(rarity: Rarity): void {
  const c = ac(); if (!c) return;
  const now = c.currentTime;
  const scales: Record<Rarity, number[]> = {
    common: [523, 659],
    uncommon: [523, 659, 784],
    rare: [523, 659, 784, 1047],
    epic: [523, 659, 784, 1047, 1319],
    legendary: [523, 659, 784, 1047, 1319, 1568, 2093],
  };
  const notes = scales[rarity];
  const gap = rarity === "legendary" ? 0.11 : 0.09;
  notes.forEach((f, i) => tone(c, f, now + i * gap, 0.22 + i * 0.02, i === notes.length - 1 ? "triangle" : "square", 0.07));
  if (rarity === "epic" || rarity === "legendary") {
    noise(c, now + notes.length * gap, 0.5, 0.06, 3000);
    tone(c, notes[notes.length - 1] as number, now + notes.length * gap, 0.7, "sine", 0.08);
  }
}

/**
 * Shaped noise. `noise` above is a one-shot highpass burst that decays instantly, which is
 * right for a pop but wrong for anything you are supposed to sit inside: a steamer hiss needs
 * a slow swell and a band, not a click.
 */
function hiss(c: AudioContext, t0: number, dur: number, gain: number, centre: number, q = 0.8): void {
  const len = Math.floor(c.sampleRate * dur);
  const buf = c.createBuffer(1, len, c.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  const src = c.createBufferSource(); src.buffer = buf;
  const f = c.createBiquadFilter(); f.type = "bandpass"; f.frequency.value = centre; f.Q.value = q;
  const g = c.createGain();
  // swell in, hold, fall away — the shape of a lid being lifted off a basket
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(gain, t0 + dur * 0.25);
  g.gain.exponentialRampToValueAtTime(gain * 0.6, t0 + dur * 0.6);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  src.connect(f).connect(g).connect(c.destination);
  src.start(t0); src.stop(t0 + dur + 0.02);
}

/**
 * Bamboo and paper. Each squish of the box gets a handful of tiny crackles at slightly
 * different pitches — the ear reads irregularity as a real material, and a single clean
 * burst reads as a UI blip.
 */
export function crinkle(step = 1): void {
  const c = ac(); if (!c) return;
  const now = c.currentTime;
  const grains = 5 + step * 2;
  for (let i = 0; i < grains; i++) {
    const t = now + Math.random() * 0.16;
    noise(c, t, 0.012 + Math.random() * 0.02, 0.05 + step * 0.015, 1800 + Math.random() * 2600);
  }
  // the basket itself flexing under the squish
  tone(c, 150 + step * 18, now, 0.09, "triangle", 0.03, 110 + step * 12);
}

/** The lid coming off: a woody knock, then steam escaping for a moment. */
export function lidLift(): void {
  const c = ac(); if (!c) return;
  const now = c.currentTime;
  tone(c, 210, now, 0.12, "triangle", 0.07, 130);
  noise(c, now, 0.05, 0.12, 900);
  hiss(c, now + 0.05, 0.9, 0.05, 2600, 0.7);
  hiss(c, now + 0.12, 0.7, 0.03, 5200, 1.2);
}

/** A finish catching the light, played just after the rarity chime. Bright, short, not a fanfare. */
export function shimmer(steps: number): void {
  const c = ac(); if (!c) return;
  const now = c.currentTime;
  const notes = [1568, 2093, 2637, 3136].slice(0, Math.max(2, steps));
  notes.forEach((f, i) => tone(c, f, now + i * 0.06, 0.3, "sine", 0.05));
  hiss(c, now, 0.5, 0.02, 7000, 2);
}

export function success(): void {
  const c = ac(); if (!c) return;
  const now = c.currentTime;
  [659, 784, 1047].forEach((f, i) => tone(c, f, now + i * 0.08, 0.2, "triangle", 0.08));
}

export function nope(): void {
  const c = ac(); if (!c) return;
  const now = c.currentTime;
  tone(c, 300, now, 0.16, "sawtooth", 0.05, 220);
  tone(c, 260, now + 0.16, 0.2, "sawtooth", 0.05, 180);
}

// ---- haptics: native via Capacitor when available, navigator.vibrate on Android web, silent elsewhere ----
type HapticsPlugin = { impact(o: { style: "LIGHT" | "MEDIUM" | "HEAVY" }): Promise<void>; notification(o: { type: "SUCCESS" | "WARNING" | "ERROR" }): Promise<void> };
let hapticsPlugin: HapticsPlugin | null | undefined;

async function loadHaptics(): Promise<HapticsPlugin | null> {
  if (hapticsPlugin !== undefined) return hapticsPlugin;
  try {
    const cap = (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor;
    if (!cap?.isNativePlatform?.()) { hapticsPlugin = null; return null; }
    const mod = await import("@capacitor/haptics");
    hapticsPlugin = mod.Haptics as unknown as HapticsPlugin;
  } catch { hapticsPlugin = null; }
  return hapticsPlugin;
}

export function haptic(kind: "light" | "medium" | "heavy" | "success"): void {
  void loadHaptics().then((hp) => {
    if (hp) {
      if (kind === "success") void hp.notification({ type: "SUCCESS" }).catch(() => {});
      else void hp.impact({ style: kind.toUpperCase() as "LIGHT" | "MEDIUM" | "HEAVY" }).catch(() => {});
    } else if (navigator.vibrate) {
      navigator.vibrate(kind === "light" ? 8 : kind === "medium" ? 15 : kind === "heavy" ? 25 : [10, 30, 10]);
    }
  });
}
