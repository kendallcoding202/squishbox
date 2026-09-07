import { log } from "../../game/state";
import { h, toast } from "../dom";
import { store } from "../store";

let unlocked = false;
let rerender: () => void = () => {};
export function onParentsRerender(fn: () => void): void { rerender = fn; }
export function lockParents(): void { unlocked = false; }

function pinForm(mode: "set" | "enter"): HTMLElement {
  const input = h("input", { type: "password", inputmode: "numeric", pattern: "[0-9]*", maxlength: 4, placeholder: "4-digit PIN", autocomplete: "off" }) as HTMLInputElement;
  const submit = () => {
    const v = input.value.trim();
    if (!/^\d{4}$/.test(v)) { toast("PIN must be 4 digits"); return; }
    if (mode === "set") {
      store.update((s) => { s.parent.pin = v; log(s, "parent", "Parent PIN set", Date.now()); });
      unlocked = true; toast("PIN saved");
    } else if (v === store.state.parent.pin) {
      unlocked = true;
    } else { toast("Wrong PIN"); input.value = ""; return; }
    rerender();
  };
  input.addEventListener("keydown", (e) => { if (e.key === "Enter") submit(); });
  return h("div", { class: "screen" },
    h("h1", null, "Parent corner"),
    h("div", { class: "card", style: "margin-top:12px" },
      h("h3", null, mode === "set" ? "Set a parent PIN" : "Enter parent PIN"),
      h("p", { class: "muted small", style: "margin:6px 0 12px" }, mode === "set" ? "Grown-ups only. This locks the settings and activity log." : "Ask a grown-up."),
      input,
      h("button", { class: "btn block", style: "margin-top:12px", onclick: submit }, mode === "set" ? "Save PIN" : "Unlock"),
    ),
  );
}

export function renderParents(): HTMLElement {
  const s = store.state;
  if (!s.parent.pin) return pinForm("set");
  if (!unlocked) return pinForm("enter");

  const stat = (n: number | string, label: string) => h("div", { class: "stat" }, h("b", null, String(n)), h("span", null, label));
  const fmt = (t: number) => new Date(t).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

  return h("div", { class: "screen" },
    h("div", { class: "topbar" }, h("h1", null, "Parent corner"), h("button", { class: "btn ghost sm", onclick: () => { unlocked = false; rerender(); } }, "Lock")),
    h("div", { class: "card" },
      h("h3", null, "About Squishbox"),
      h("p", { class: "muted small", style: "margin-top:6px" }, "There is no real money in Squishbox. Coins are free: once a day, from album goals, and from selling spare dumplings to the Steam Pot for coins. Every box shows its odds before opening, and a Rare or better is guaranteed every 10 boxes. Trades swap both sides at once and can't be changed after confirming. Trading with friends uses a basket code and a made-up basket name; the only things sent to the trading post are that name, an anonymous id, and the list of dumplings owned."),
    ),
    h("h2", null, "Activity"),
    h("div", { class: "stats" }, stat(s.stats.boxesOpened, "boxes opened"), stat(s.stats.coinsSpent, "coins spent"), stat(s.stats.coinsEarned, "coins earned"), stat(s.stats.coinsFromSales, "coins from selling spares"), stat(`${s.stats.tradesCompleted} / ${s.stats.tradesCompleted + s.stats.tradesDeclined}`, "trades done / tried"), stat(s.pity, "boxes since last Rare+")),
    h("h2", null, "Limits"),
    h("div", { class: "card" },
      h("div", { class: "row between" },
        h("div", { class: "grow" }, h("b", null, "Trading with neighbors"), h("div", { class: "muted small" }, "Turn off to hide the Trade tab's features")),
        h("button", { class: "toggle" + (s.parent.tradingEnabled ? " on" : ""), role: "switch", "aria-checked": String(s.parent.tradingEnabled), "aria-label": "Trading", onclick: () => store.update((st) => { st.parent.tradingEnabled = !st.parent.tradingEnabled; log(st, "parent", `Trading ${st.parent.tradingEnabled ? "on" : "off"}`, Date.now()); }) }),
      ),
      h("div", { class: "row between", style: "margin-top:14px" },
        h("div", { class: "grow" }, h("b", null, "Trading with friends online"), h("div", { class: "muted small" }, s.net ? `Basket code ${s.net.code}, name "${s.net.name}". Friends are added by code only; there is no search or chat.` : "Friends are added by code only; there is no search or chat.")),
        h("button", { class: "toggle" + (s.parent.onlineTrading ? " on" : ""), role: "switch", "aria-checked": String(s.parent.onlineTrading), "aria-label": "Online trading", onclick: () => store.update((st) => { st.parent.onlineTrading = !st.parent.onlineTrading; log(st, "parent", `Online trading ${st.parent.onlineTrading ? "on" : "off"}`, Date.now()); }) }),
      ),
      h("div", { class: "row between", style: "margin-top:14px" },
        h("div", { class: "grow" },
          h("h3", null, "My buddy"),
          h("p", { class: "muted small" }, "Looking after one dumpling. Nothing is sent anywhere, and it never gets sad or unwell if the app is closed."),
        ),
        h("button", { class: "toggle" + (s.parent.buddyEnabled ? " on" : ""), role: "switch", "aria-checked": String(s.parent.buddyEnabled), "aria-label": "Buddy", onclick: () => store.update((st) => { st.parent.buddyEnabled = !st.parent.buddyEnabled; log(st, "parent", `Buddy ${st.parent.buddyEnabled ? "on" : "off"}`, Date.now()); }) }),
      ),
      h("div", { class: "row between", style: "margin-top:14px" },
        h("div", { class: "grow" }, h("b", null, "Boxes per day"), h("div", { class: "muted small" }, "Slows down binge opening")),
        h("select", { style: "width:auto", onchange: (e: Event) => store.update((st) => { st.parent.dailyBoxCap = Number((e.target as HTMLSelectElement).value); log(st, "parent", `Daily box cap set to ${st.parent.dailyBoxCap}`, Date.now()); }) },
          ...[3, 5, 10, 20, 50].map((n) => h("option", { value: String(n), selected: s.parent.dailyBoxCap === n }, String(n)))),
      ),
    ),
    h("h2", null, "Log"),
    h("div", { class: "card" }, s.log.length === 0 ? h("p", { class: "muted small" }, "Nothing yet.") : h("ul", { class: "log" }, ...s.log.slice(0, 40).map((l) => h("li", null, h("time", null, fmt(l.t)), h("span", null, l.text))))),
    h("div", { style: "margin-top:20px" },
      h("button", { class: "btn ghost block", style: "color:var(--bad)", onclick: () => { if (window.confirm("Erase all progress, coins, dumplings and the PIN?")) { store.reset(); unlocked = false; toast("Reset"); rerender(); } } }, "Reset everything"),
    ),
  );
}
