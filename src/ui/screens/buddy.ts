import { CHARACTER_BY_ID, type Character } from "../../data/characters";
import { decorations, hasOwnVoice, momentText, nextMilestone, reached, tricks, type BuddyState, type Milestone } from "../../game/buddy";
import {
  arrive, found, giftFor, giftReady, HOME_PLACE, nextFind, openPlaces, pickSpot, PLACES, placeOf, placeProgress,
  placeUnlocked, SPOT_BY_ID, spotsIn, type Find, type Lane, type Spot,
} from "../../game/room";
import { systemRng } from "../../game/rng";
import { dayKey, displayName, effectiveNow, ownedCount, takeBuddyGift } from "../../game/state";
import { confetti, h, hearts, onTap, toast } from "../dom";
import { dumplingEl } from "../dumpling";
import { coin, haptic, squeak, success } from "../sound";
import { store } from "../store";

/**
 * The buddy's room.
 *
 * Everything here is a toy, never a chore. Food and drink are unlimited and free, nothing
 * can be neglected, run down or missed, and nothing at all happens while the app is closed —
 * see the note at the top of game/buddy.ts, which is the rule this screen exists to serve.
 *
 * What makes it a room rather than a button panel is that the buddy acts on its own: it
 * chooses somewhere to go, walks there, does something when it arrives, has a look around,
 * and goes somewhere else. The kid watches, sends it places, and puts food out. The old
 * screen had it pinned to centre stage until a button was pressed, which is exactly why it
 * felt like operating a machine.
 *
 * The loop runs on setTimeout and writes through store.persist(), NOT store.update():
 * update() notifies listeners, the router's listener re-renders the whole screen, and the
 * room would be rebuilt from scratch every few seconds in the middle of its own animation.
 * persist() saves without notifying, so the loop moves the room in place.
 */

/**
 * One animation at a time, so a fast tapper can't stack five into a mess.
 *
 * Ambient animations — what the buddy does when it arrives somewhere — can be cut short,
 * because a kid who taps the plant while it happens to be napping must not have the tap
 * silently swallowed. A trick cannot: interrupting a backflip halfway just looks broken.
 */
let acting: { cls: string; kind: "ambient" | "trick"; timer: number; actor: HTMLElement } | null = null;
/** The wander loop's pending step. Cleared whenever the screen is rebuilt or left. */
let timer = 0;

/** Stop the room. Called when leaving the tab, hiding the app, or rebuilding the screen. */
export function pauseBuddyLife(): void {
  clearTimeout(timer);
  timer = 0;
}

function play(actor: HTMLElement, cls: string, ms: number, kind: "ambient" | "trick", then?: () => void): void {
  if (acting) return;
  const handle = window.setTimeout(() => {
    actor.classList.remove(cls);
    acting = null;
    then?.();
  }, ms);
  acting = { cls, kind, timer: handle, actor };
  actor.classList.add(cls);
}

/**
 * Clear an ambient animation so something the kid asked for can happen now. Returns false
 * when a trick is mid-flight, which is the one thing worth waiting out.
 */
function interrupt(): boolean {
  if (!acting) return true;
  if (acting.kind === "trick") return false;
  clearTimeout(acting.timer);
  acting.actor.classList.remove(acting.cls);
  acting = null;
  return true;
}

/** Roughly the buddy's head, so hearts rise out of it instead of from behind its middle. */
function headOf(el: HTMLElement): [number, number] {
  const r = el.getBoundingClientRect();
  return [r.left + r.width / 2, r.top + r.height * 0.3];
}

/** A squeak keyed off the character, so each dumpling sounds like itself. */
function voiceOf(id: string): number {
  return (id.charCodeAt(1) * 7 + id.charCodeAt(2)) % 12;
}

export function renderBuddy(): HTMLElement {
  const s = store.state;
  pauseBuddyLife(); // a rebuild must never leave a second loop running

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

  // The narrowing from the guard above does not reach the hoisted functions further down,
  // so bind both with an explicit type.
  const bud: BuddyState = b;
  const chr: Character = c;

  const name = displayName(s, c.id);
  const art = dumplingEl(c, 132, { idle: true, fullSquish: true });
  const actor = h("div", { class: "buddy-actor" }, art);
  const stage = h("div", { class: "buddy-stage" }, actor);

  // ---- the scene, drawn from the place the buddy is in ----
  // Every prop is positioned from its own spot, so the furniture and the engine cannot drift
  // apart, and adding a place is a matter of adding spots rather than writing a screen.
  const here = placeOf(bud);
  const spots = spotsIn(here.id);

  const props = spots
    .filter((spot) => spot.seat || spot.glyph)
    .map((spot) => {
      const seat = spot.seat === true;
      const el = h("div", {
        class: `prop ${spot.id}${seat ? " seat" : ""}${spot.lane === "back" ? " back" : ""}`,
        style: `left:${spot.propX ?? spot.x}%`,
        role: "button", tabindex: "0",
        "aria-label": spot.fillable
          ? `${spot.fillable === "bowl" ? "Bowl. Tap to put some food out." : "Cup. Tap to pour a drink."}`
          : `${spot.id}. Tap to send ${name} over.`,
      }, seat ? null : spot.glyph);
      return { spot, el };
    });
  const propEl = (id: string): HTMLElement | null => props.find((pr) => pr.spot.id === id)?.el ?? null;

  const decor = decorations(bud);
  const finds = found(bud);
  const shelfItems = [
    ...decor.map((m) => h("span", { class: "decor", title: m.label }, m.decor ?? "")),
    ...finds.map((f) => h("span", { class: "decor", title: f.label }, f.glyph)),
  ];
  // The shelf lives at home: wherever it finds things, they end up on the shelf in its room.
  const shelf = h("div", { class: "room-shelf" }, ...shelfItems);

  const floor = h("div", { class: "room-floor" }, ...props.map((pr) => pr.el), stage);
  const room = h("div", { class: `room place-${here.id}` },
    h("div", { class: "room-wall" },
      here.id === "room"
        ? h("div", { class: "window", style: `left:${(SPOT_BY_ID.get("window") as Spot).x}%` }, h("i", { class: "sun" }), h("i", { class: "cloud" }))
        : null,
      here.id === "room" && shelfItems.length ? shelf : null,
    ),
    floor,
  );

  // ---- the line under the room, updated in place by the loop ----
  const says = h("p", { class: "muted small buddy-says", "aria-live": "polite" },
    `${name} ${momentText(bud)}.`);
  const tell = (text: string): void => { says.textContent = text; };
  const spotLine = (spot: Spot): string => `${spot.says.replace("{name}", name)}.`;

  // ---- movement ----
  /** Put the buddy at a spot. Walk duration scales with distance so it reads as walking. */
  function moveTo(spot: Spot, onArrive: () => void): void {
    const from = Number.parseFloat(stage.style.left || "50");
    const ms = Math.round(400 + Math.abs(spot.x - from) * 14);
    stage.style.transition = `left ${ms}ms ease-in-out, bottom ${ms}ms ease-in-out, transform ${ms}ms ease-in-out`;
    stage.style.left = `${spot.x}%`;
    stage.classList.toggle("far", spot.lane === "back");
    stage.classList.add("walking");
    timer = window.setTimeout(() => {
      stage.classList.remove("walking");
      onArrive();
    }, ms);
  }

  /** Arriving: bank the wander, play what happens here, then line up the next one. */
  function settle(spot: Spot): void {
    // Whether it is about to have a proper meal has to be read before arrive(), which is
    // what empties the bowl. Without this, filling the bowl and the buddy finding it empty
    // look exactly the same, and putting food out stops meaning anything.
    const helpingItself = (spot.fillable === "bowl" && bud.bowl) || (spot.fillable === "cup" && bud.cup);
    const find = arrive(bud, spot.id);
    if (spot.fillable === "bowl") {
      const el = propEl(spot.id);
      if (el) el.textContent = bud.bowl ? "\u{1F95F}" : spot.glyph;
    }
    store.persist(); // never update(): see the note at the top of this file
    tell(helpingItself ? `${name} is tucking in. Thank you!` : spotLine(spot));
    play(actor, `act-${spot.act}`, spot.actMs, "ambient", () => {
      if (helpingItself) {
        const [hx, hy] = headOf(actor);
        hearts(hx, hy, 5);
        squeak(voiceOf(chr.id), chr.rarity);
      }
      if (find) {
        const [x, y] = headOf(actor);
        hearts(x, y, 6);
        coin();
        haptic("success");
        // The shelf hangs at home, so only touch it when that is where we are — a find made
        // in the garden used to nail the shelf to the garden wall. Away from home the find
        // still lands in state and shows on the list below; it is on the shelf next time
        // the kid comes back in.
        if (here.id === HOME_PLACE.id) {
          // Only in the room once there is something to put on it, so the very first find
          // has to hang the shelf as well as fill it.
          if (!shelf.isConnected) room.querySelector(".room-wall")?.appendChild(shelf);
          shelf.appendChild(h("span", { class: "decor pop", title: find.label }, find.glyph));
        }
        refreshFinds();
        tell(`${name} found ${find.label}!`);
        toast(`${name} found ${find.label}`);
      }
    });
    timer = window.setTimeout(wander, spot.actMs + 1400 + Math.floor(systemRng() * 1800));
  }

  /** Choose somewhere and go. The whole autonomous half of the screen is these three lines. */
  function wander(): void {
    const spot = pickSpot(bud, systemRng);
    tell(`${name} is off to have a look.`);
    moveTo(spot, () => settle(spot));
  }

  /** The kid points at a spot: drop whatever was planned and go there now. */
  function send(spot: Spot): void {
    if (!interrupt()) return;
    pauseBuddyLife();
    haptic("light");
    moveTo(spot, () => settle(spot));
  }

  /**
   * The bowl and the cup are FILLED rather than fired. The buddy comes over in its own time,
   * because pickSpot weights a full bowl heavily — that is the feeding loop, and the whole
   * difference between looking after something and pressing Feed. Everything else you tap
   * is a place to send it.
   */
  for (const { spot, el } of props) {
    if (!spot.fillable) {
      onTap(el, () => send(spot));
      continue;
    }
    const kind = spot.fillable;
    onTap(el, () => {
      if (bud[kind]) { tell(`There is already something there for ${name}.`); return; }
      bud[kind] = true;
      store.persist();
      if (kind === "bowl") el.textContent = "\u{1F95F}";
      el.classList.add("pop");
      setTimeout(() => el.classList.remove("pop"), 400);
      haptic("light");
      tell(kind === "bowl" ? `You put some food out. ${name} will be over.` : `You topped up the cup. ${name} will be over.`);
    });
  }

  // Tapping bare floor sends it to the nearest spot in whichever lane was tapped, so places
  // with nothing to stand on — the windowsill — are still somewhere a kid can point at.
  floor.addEventListener("pointerup", (e) => {
    const target = e.target as HTMLElement;
    if (target.closest(".prop") || target.closest(".buddy-stage")) return;
    const box = floor.getBoundingClientRect();
    const x = ((e.clientX - box.left) / box.width) * 100;
    const lane: Lane = e.clientY - box.top < box.height * 0.45 ? "back" : "front";
    const inLane = spots.filter((sp) => sp.lane === lane);
    const pool = inLane.length ? inLane : spots;
    const nearest = pool.reduce((best, sp) => (Math.abs(sp.x - x) < Math.abs(best.x - x) ? sp : best), pool[0] as Spot);
    send(nearest);
  });

  // Tap the buddy itself: it stops what it was doing and says hello. Squishing still works —
  // the squish lives on the dumpling and is the one gesture the room must not take over.
  onTap(stage, () => {
    if (!interrupt()) return;
    pauseBuddyLife();
    const [x, y] = headOf(actor);
    hearts(x, y);
    squeak(voiceOf(c.id), c.rarity);
    haptic("light");
    tell(`${name} is pleased to see you.`);
    play(actor, "act-wiggle", 600, "ambient");
    timer = window.setTimeout(wander, 1800);
  });

  // ---- tricks: still earned by turning up, now performed wherever it happens to be ----
  const doTrick = (m: Milestone): void => {
    if (!interrupt()) return;
    pauseBuddyLife();
    haptic("medium");
    const dur = m.id === "backflip" ? 1000 : m.id === "somersault" ? 900 : m.id === "wobble" ? 1200 : 700;
    tell(`${name} does a ${(m.button ?? m.label).toLowerCase()}!`);
    play(actor, `act-${m.id}`, dur, "trick", () => {
      const [x, y] = headOf(actor);
      hearts(x, y, 4);
      success();
    });
    if (hasOwnVoice(bud)) squeak(voiceOf(c.id) + 3, c.rarity);
    timer = window.setTimeout(wander, dur + 1200);
  };

  // Built as live nodes: a find landing mid-session used to leave this reading "Nothing yet"
  // under a shelf that visibly had something on it.
  const findLine = h("p", { class: "muted small" }, "");
  const findNext = h("p", { class: "muted small", style: "margin-top:6px" }, "");
  function refreshFinds(): void {
    const all = found(bud);
    findLine.textContent = all.length
      ? all.map((f) => `${f.glyph} ${f.label}`).join(" · ")
      : `Nothing yet. ${name} turns things up while exploring.`;
    const nf = nextFind(bud, here.id);
    findNext.textContent = nf
      ? `Something else to find ${here.id === "room" ? "in here" : `in ${here.name.toLowerCase()}`}, about ${nf.toGo} more ${nf.toGo === 1 ? "wander" : "wanders"} away.`
      : `${name} has found everything ${here.id === "room" ? "in this room" : `in ${here.name.toLowerCase()}`}.`;
  }
  refreshFinds();

  // ---- where to go ----
  // Tapping a place takes the buddy there; the scene always shows wherever the buddy is, so
  // there is never a view and a buddy in two different rooms to reconcile.
  const placeChips = h("div", { class: "chips", style: "padding-top:0;margin-bottom:8px" },
    ...PLACES.map((p) => {
      const open = placeUnlocked(bud, p.id);
      const current = open && p.id === here.id;
      const chip = h("button", {
        class: "chip" + (current ? " on" : ""),
        "aria-current": current ? "true" : null,
      }, `${open ? p.icon : "\u{1F512}"} ${p.name}`);
      onTap(chip, () => {
        if (!open) {
          const [have, need] = placeProgress(bud, p.id);
          toast(`${p.teaser} (${have} of ${need})`);
          return;
        }
        if (current) return;
        haptic("light");
        store.update((st) => { if (st.buddy) st.buddy.at = (spotsIn(p.id)[0] as Spot).id; });
        toast(`${name} trots off to ${p.name.toLowerCase()}.`);
      });
      return chip;
    }),
  );

  // ---- what it brought home ----
  // The pull that gets a kid into the room at all: something is waiting, and it is a gift
  // rather than a debt. Nothing builds up while they are away; at worst there is not one yet.
  const today = effectiveNow(s, new Date());
  const giftCard = ((): HTMLElement | null => {
    if (!giftReady(bud, dayKey(today))) return null;
    const gift = giftFor(bud, dayKey(today));
    const card = h("div", { class: "card gift-card" },
      h("div", { class: "row", style: "gap:12px;align-items:center" },
        h("div", { style: "font-size:34px;line-height:1" }, "\u{1F381}"),
        h("div", { class: "grow" },
          h("h3", null, `${name} went exploring`),
          h("p", { class: "muted small", style: "margin-top:2px" },
            `It was poking about ${gift.spot.whereabouts} and brought you back ${gift.coins} coins.`),
        ),
      ),
      h("button", { class: "btn block", style: "margin-top:12px", onclick: () => {
        let got = 0;
        // update(), not persist(): the coins have to reach the rest of the app, and the
        // re-render this causes restarts the room cleanly.
        store.update((st) => { got = takeBuddyGift(st, new Date()); });
        if (!got) return;
        coin();
        haptic("success");
        confetti(["#ffd23f", "#3fae7a", "#fff"], 50);
        toast(`+${got} coins from ${name}`);
      } }, `Take the ${gift.coins} coins`),
    );
    return card;
  })();

  const trickList = tricks(bud);
  const next = nextMilestone(bud);
  const done = reached(bud);

  // Start where it was left, then let it get on with it.
  const start = (bud.at && SPOT_BY_ID.get(bud.at)) || (spots[0] as Spot);
  stage.style.left = `${start.x}%`;
  stage.classList.toggle("far", start.lane === "back");
  timer = window.setTimeout(wander, 2800); // long enough to read what it got up to

  return h("div", { class: "screen buddy-screen" },
    h("div", { class: "topbar" },
      h("h1", null, name),
      h("span", { class: "pill" }, `${done.length + finds.length} collected`),
    ),
    giftCard,
    placeChips,
    h("p", { class: "muted small", style: "margin:-4px 0 8px" }, here.blurb),
    says,
    room,
    h("p", { class: "muted small", style: "margin-top:10px;text-align:center" },
      spots.some((sp) => sp.fillable)
        ? `Tap the bowl or the cup to put something out. Tap anywhere else to send ${name} over.`
        : `Tap anywhere in ${here.name.toLowerCase()} to send ${name} over.`),
    trickList.length
      ? h("div", { style: "margin-top:16px" },
          h("h2", null, "Tricks"),
          h("p", { class: "muted small", style: "margin-bottom:8px" }, "Learned by turning up. Tap one to watch."),
          h("div", { class: "trick-row" }, ...trickList.map((m) => h("button", { class: "chip trick", onclick: () => doTrick(m) }, m.button ?? m.label))))
      : null,
    h("div", { style: "margin-top:16px" },
      h("h2", null, "Things it has found"),
      findLine,
      findNext,
    ),
    next
      ? h("p", { class: "muted small", style: "margin-top:16px;text-align:center" },
          `A new trick in ${next.visits - bud.visits} more day${next.visits - bud.visits > 1 ? "s" : ""}.`)
      : h("p", { class: "muted small", style: "margin-top:16px;text-align:center" }, `${name} knows every trick there is.`),
    h("button", { class: "btn ghost block", style: "margin-top:18px", onclick: () => {
      toast("Change your buddy in the Collection.");
    } }, "Pick a different buddy"),
  );
}
