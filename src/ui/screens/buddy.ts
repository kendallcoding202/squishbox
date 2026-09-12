import { CHARACTER_BY_ID } from "../../data/characters";
import { decorations, hasOwnVoice, momentText, nextMilestone, reached, tricks, type Milestone } from "../../game/buddy";
import { displayName, ownedCount } from "../../game/state";
import { h, hearts, onTap, toast } from "../dom";
import { dumplingEl } from "../dumpling";
import { haptic, squeak, success } from "../sound";
import { store } from "../store";

/**
 * The buddy's room.
 *
 * Everything here is a toy, never a chore. Feeding and drinks are unlimited and free, and
 * nothing on this screen can be neglected, run down, or missed — see the note at the top of
 * game/buddy.ts. The only thing that changes over time is that more becomes possible.
 */

/** One animation at a time, so a fast tapper can't stack five tricks into a mess. */
let busy = false;

function play(actor: HTMLElement, cls: string, ms: number, then?: () => void): void {
  if (busy) return;
  busy = true;
  actor.classList.add(cls);
  setTimeout(() => {
    actor.classList.remove(cls);
    busy = false;
    then?.();
  }, ms);
}

/** An item that arcs in from the side, meets the buddy, and disappears. */
function treat(stage: HTMLElement, glyph: string, cls: string): void {
  const el = h("div", { class: `treat ${cls}` }, glyph);
  stage.appendChild(el);
  setTimeout(() => el.remove(), 1200);
}

/** Roughly the buddy's head, so hearts rise out of it instead of from behind its middle. */
function headOf(el: HTMLElement): [number, number] {
  const r = el.getBoundingClientRect();
  return [r.left + r.width / 2, r.top + r.height * 0.3];
}

export function renderBuddy(): HTMLElement {
  const s = store.state;

  if (!s.parent.buddyEnabled) {
    return h("div", { class: "screen" },
      h("h1", null, "My buddy"),
      h("div", { class: "card", style: "margin-top:12px" },
        h("p", { class: "muted" }, "A grown-up has turned this off. It can be switched back on in the Parent corner."),
      ),
    );
  }

  const b = s.buddy;
  const c = b ? CHARACTER_BY_ID.get(b.characterId) : null;

  // No buddy yet: say how to get one rather than showing an empty room.
  if (!b || !c) {
    const has = ownedCount(s.inventory) > 0;
    return h("div", { class: "screen" },
      h("h1", null, "My buddy"),
      h("div", { class: "card", style: "margin-top:12px;text-align:center" },
        h("div", { style: "font-size:56px;line-height:1.2" }, "\u{1F3E0}"),
        h("h3", { style: "margin-top:8px" }, "The room is ready"),
        h("p", { class: "muted small", style: "margin-top:6px" }, has
          ? "Pick a dumpling to live here. Open your Collection, tap one, and choose “Make my buddy”."
          : "Open a basket first, then pick a dumpling to live here."),
      ),
    );
  }

  const name = displayName(s, c.id);
  const art = dumplingEl(c, 150, { idle: true, fullSquish: true });
  const actor = h("div", { class: "buddy-actor" }, art);
  const stage = h("div", { class: "buddy-stage" }, actor);

  // Tap the buddy: hearts, a squeak, a happy wiggle. Always available, always the same welcome.
  onTap(stage, () => {
    const [x, y] = headOf(actor);
    hearts(x, y);
    squeak((c.id.charCodeAt(1) * 7 + c.id.charCodeAt(2)) % 12, c.rarity);
    haptic("light");
    play(actor, "act-wiggle", 600);
  });

  const decor = decorations(b);
  const shelf = h("div", { class: "room-shelf" },
    ...decor.map((m) => h("span", { class: "decor", title: m.label }, m.decor ?? "")),
  );

  const room = h("div", { class: "room" },
    h("div", { class: "room-wall" },
      h("div", { class: "window" }, h("i", { class: "sun" }), h("i", { class: "cloud" })),
      decor.length ? shelf : null,
    ),
    h("div", { class: "room-floor" },
      h("div", { class: "cushion" }),
      stage,
      h("div", { class: "bowl" }, "\u{1F963}"),
      h("div", { class: "cup" }, "\u{1F375}"),
    ),
  );

  const feed = h("button", { class: "btn sm", onclick: () => {
    if (busy) return;
    treat(stage, "\u{1F95F}", "from-left");
    haptic("light");
    play(actor, "act-eat", 1100, () => {
      const [x, y] = headOf(actor);
      hearts(x, y, 5);
      squeak((c.id.charCodeAt(1) * 7 + c.id.charCodeAt(2)) % 12, c.rarity);
    });
  } }, "\u{1F95F} Feed");

  const drink = h("button", { class: "btn sm", onclick: () => {
    if (busy) return;
    treat(stage, "\u{1F375}", "from-right");
    haptic("light");
    play(actor, "act-drink", 1100, () => {
      const [x, y] = headOf(actor);
      hearts(x, y, 5);
    });
  } }, "\u{1F375} Drink");

  const doTrick = (m: Milestone) => {
    if (busy) return;
    haptic("medium");
    const dur = m.id === "backflip" ? 1000 : m.id === "somersault" ? 900 : m.id === "wobble" ? 1200 : 700;
    play(actor, `act-${m.id}`, dur, () => {
      const [x, y] = headOf(actor);
      hearts(x, y, 4);
      success();
    });
    if (hasOwnVoice(b)) squeak(((c.id.charCodeAt(1) * 7 + c.id.charCodeAt(2)) % 12) + 3, c.rarity);
  };

  const trickList = tricks(b);
  const trickRow = h("div", { class: "trick-row" },
    ...trickList.map((m) => h("button", { class: "chip trick", onclick: () => doTrick(m) }, m.button ?? m.label)),
  );

  const next = nextMilestone(b);
  const done = reached(b);

  return h("div", { class: "screen buddy-screen" },
    h("div", { class: "topbar" },
      h("h1", null, name),
      h("span", { class: "pill" }, `${done.length} learned`),
    ),
    h("p", { class: "muted small", style: "margin-bottom:10px" }, momentText(b) ? `${name} ${momentText(b)}.` : "Tap to say hello."),
    room,
    h("div", { class: "row", style: "gap:8px;justify-content:center;margin-top:14px" }, feed, drink),
    trickList.length
      ? h("div", { style: "margin-top:16px" },
          h("h2", null, "Tricks"),
          h("p", { class: "muted small", style: "margin-bottom:8px" }, "Learned by turning up. Tap one to watch."),
          trickRow)
      : null,
    next
      ? h("p", { class: "muted small", style: "margin-top:16px;text-align:center" },
          `Something new in ${next.visits - b.visits} more day${next.visits - b.visits > 1 ? "s" : ""}.`)
      : h("p", { class: "muted small", style: "margin-top:16px;text-align:center" }, `${name} knows every trick there is.`),
    h("button", { class: "btn ghost block", style: "margin-top:18px", onclick: () => {
      toast("Change your buddy in the Collection.");
    } }, "Pick a different buddy"),
  );
}
