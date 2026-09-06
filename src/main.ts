import "./style.css";
import { clear, h } from "./ui/dom";
import { onCollectionRerender, renderCollection } from "./ui/screens/collection";
import { renderHome } from "./ui/screens/home";
import { lockParents, onParentsRerender, renderParents } from "./ui/screens/parents";
import { onTradeRerender, renderTrade } from "./ui/screens/trade";
import { store } from "./ui/store";

type Tab = "home" | "collection" | "trade" | "parents";
const TABS: { id: Tab; label: string; ico: string; render: () => HTMLElement }[] = [
  { id: "home", label: "Shop", ico: "🥟", render: renderHome },
  { id: "collection", label: "Collection", ico: "🧺", render: renderCollection },
  { id: "trade", label: "Trade", ico: "🤝", render: renderTrade },
  { id: "parents", label: "Parents", ico: "🔒", render: renderParents },
];

const app = document.getElementById("app") as HTMLElement;
let current: Tab = (location.hash.slice(1) as Tab) || "home";
if (!TABS.some((t) => t.id === current)) current = "home";

function render(): void {
  const tab = TABS.find((t) => t.id === current) ?? TABS[0]!;
  const scrollY = window.scrollY;
  clear(app);
  app.appendChild(tab.render());
  app.appendChild(h("nav", { class: "nav", "aria-label": "Main" }, h("div", { class: "nav-inner" },
    ...TABS.map((t) => h("button", { class: t.id === current ? "on" : "", "aria-current": t.id === current ? "page" : null, onclick: () => go(t.id) }, h("span", { class: "ico" }, t.ico), t.label)),
  )));
  window.scrollTo(0, scrollY);
}

function go(tab: Tab): void {
  if (tab !== "parents") lockParents();
  current = tab;
  history.replaceState(null, "", `#${tab}`);
  window.scrollTo(0, 0);
  render();
}

store.subscribe(render);
onCollectionRerender(render);
onTradeRerender(render);
onParentsRerender(render);
window.addEventListener("hashchange", () => { const t = location.hash.slice(1) as Tab; if (TABS.some((x) => x.id === t) && t !== current) go(t); });
render();
