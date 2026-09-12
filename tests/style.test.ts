import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * Guards against two different components sharing a class name.
 *
 * This is written down because it shipped: the buddy room's little wall shelf and the home
 * screen's "My shelf" were both `.shelf`. The room's rule came later in the file, so it won
 * everywhere, and the home shelf left the page flow and drew itself in the top-right corner
 * of the whole app — over the title, with nothing under its heading.
 *
 * Rule: if the same bare class is styled by more than one top-level rule, those rules may add
 * to each other (padding, colours) but must not both set layout — that is the signature of two
 * unrelated components fighting over one name. Overrides inside @media are exempt: those are
 * the same component at a different size, which is the point.
 */

const LAYOUT_PROPS = new Set([
  "position", "top", "right", "bottom", "left", "inset", "display", "background", "background-image", "transform",
]);

interface Rule { selector: string; props: Set<string>; line: number }

/** Top-level rules only: anything nested in @media/@supports is skipped. */
function topLevelRules(css: string): Rule[] {
  const stripped = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const rules: Rule[] = [];
  let head = "";
  let depth = 0;
  let i = 0;
  const lineAt = (idx: number) => stripped.slice(0, idx).split("\n").length;
  while (i < stripped.length) {
    const ch = stripped[i];
    if (ch === "{") {
      const selector = head.trim();
      head = "";
      if (selector.startsWith("@")) { depth++; i++; continue; }
      let j = i + 1;
      let d = 1;
      while (j < stripped.length && d > 0) {
        if (stripped[j] === "{") d++;
        else if (stripped[j] === "}") d--;
        j++;
      }
      if (depth === 0) {
        const body = stripped.slice(i + 1, j - 1);
        const props = new Set(
          body.split(";").filter((p) => p.includes(":")).map((p) => (p.split(":")[0] ?? "").trim().toLowerCase()),
        );
        rules.push({ selector, props, line: lineAt(i) });
      }
      i = j;
      continue;
    }
    if (ch === "}") { if (depth > 0) depth--; head = ""; i++; continue; }
    head += ch;
    i++;
  }
  return rules;
}

describe("stylesheet", () => {
  const css = readFileSync(new URL("../src/style.css", import.meta.url), "utf8");
  const rules = topLevelRules(css);

  it("parses a sane number of top-level rules", () => {
    expect(rules.length).toBeGreaterThan(50);
    expect(rules.some((r) => r.selector === "body")).toBe(true);
  });

  it("no two top-level rules give the same bare class its layout", () => {
    const byClass = new Map<string, Rule[]>();
    for (const rule of rules) {
      for (const sel of rule.selector.split(",")) {
        const one = sel.trim();
        if (!/^\.[A-Za-z][\w-]*$/.test(one)) continue;
        if (!byClass.has(one)) byClass.set(one, []);
        (byClass.get(one) as Rule[]).push(rule);
      }
    }
    const clashes: string[] = [];
    for (const [cls, list] of byClass) {
      for (let a = 0; a < list.length; a++) {
        for (let b = a + 1; b < list.length; b++) {
          const ra = list[a] as Rule;
          const rb = list[b] as Rule;
          const shared = [...ra.props].filter((p) => LAYOUT_PROPS.has(p) && rb.props.has(p));
          if (shared.length) {
            clashes.push(`${cls}: lines ${ra.line} and ${rb.line} both set ${shared.join(", ")}`);
          }
        }
      }
    }
    expect(clashes, `two components are probably sharing a class name:\n${clashes.join("\n")}`).toEqual([]);
  });

  it("the buddy room's shelf and the home screen's shelf are different classes", () => {
    expect(css).toContain(".room-shelf {");
    const homeShelf = rules.filter((r) => r.selector === ".shelf");
    expect(homeShelf).toHaveLength(1);
    expect(homeShelf[0]?.props.has("position")).toBe(true);
  });
});
