type Child = Node | string | number | null | undefined | false | Child[];
type Props = Record<string, unknown> | null;

/** Tiny element builder. Strings become text nodes, so nothing is ever parsed as HTML. */
export function h<K extends keyof HTMLElementTagNameMap>(tag: K, props?: Props, ...children: Child[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (props) {
    for (const [k, v] of Object.entries(props)) {
      if (v == null || v === false) continue;
      if (k === "class") el.className = String(v);
      else if (k === "style") el.setAttribute("style", String(v));
      else if (k.startsWith("on") && typeof v === "function") el.addEventListener(k.slice(2).toLowerCase(), v as EventListener);
      else if (k === "dataset") Object.assign(el.dataset, v as Record<string, string>);
      else if (k in el && typeof v !== "string") (el as unknown as Record<string, unknown>)[k] = v;
      else el.setAttribute(k, String(v));
    }
  }
  append(el, children);
  return el;
}

function append(el: Node, children: Child[]): void {
  for (const c of children) {
    if (c == null || c === false) continue;
    if (Array.isArray(c)) append(el, c);
    else if (c instanceof Node) el.appendChild(c);
    else el.appendChild(document.createTextNode(String(c)));
  }
}

export function clear(el: Element): void {
  while (el.firstChild) el.removeChild(el.firstChild);
}

/**
 * A tap, not a squish. Dumplings squish on press and drag, so only a quick, still
 * pointer counts as "open this one". Enter and Space work too.
 */
export function onTap(el: HTMLElement, fn: () => void): void {
  let downAt = 0, downX = 0, downY = 0;
  el.addEventListener("pointerdown", (e) => { downAt = Date.now(); downX = e.clientX; downY = e.clientY; });
  el.addEventListener("pointerup", (e) => {
    if (Date.now() - downAt < 400 && Math.hypot(e.clientX - downX, e.clientY - downY) < 8) fn();
  });
  el.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); fn(); } });
}

let toastTimer = 0;
export function toast(text: string): void {
  document.querySelector(".toast")?.remove();
  const t = h("div", { class: "toast", role: "status" }, text);
  document.body.appendChild(t);
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => t.remove(), 1800);
}

export function overlay(content: HTMLElement, onClose?: () => void): HTMLElement {
  const ov = h("div", { class: "overlay" }, content);
  ov.addEventListener("click", (e) => {
    if (e.target === ov) { ov.remove(); onClose?.(); }
  });
  document.body.appendChild(ov);
  return ov;
}

export function confetti(colors: string[], n = 60): void {
  const wrap = h("div", { class: "confetti" });
  for (let i = 0; i < n; i++) {
    const p = h("i", {
      style: `left:${Math.random() * 100}%;background:${colors[i % colors.length]};animation-duration:${1.6 + Math.random() * 1.4}s;animation-delay:${Math.random() * 0.4}s;transform:rotate(${Math.random() * 360}deg)`,
    });
    wrap.appendChild(p);
  }
  document.body.appendChild(wrap);
  setTimeout(() => wrap.remove(), 3600);
}

/** Little hearts drifting up from a point. For tapping the buddy — pure delight, no state. */
export function hearts(x: number, y: number, n = 7): void {
  const wrap = h("div", { class: "hearts" });
  for (let i = 0; i < n; i++) {
    wrap.appendChild(h("i", {
      style: `left:${x}px;top:${y}px;--dx:${(Math.random() * 2 - 1) * 80}px;--r:${Math.random() * 50 - 25}deg;` +
        `animation-delay:${(i * 0.06).toFixed(2)}s;font-size:${(15 + Math.random() * 15).toFixed(0)}px`,
    }, "\u{1F49B}"));
  }
  document.body.appendChild(wrap);
  setTimeout(() => wrap.remove(), 2000);
}
