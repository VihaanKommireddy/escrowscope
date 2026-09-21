// tools/contrast.mjs — works out the WCAG contrast of every color pair the page
// uses, in both themes, straight from the tokens in styles.css.
//
// Run it from the project folder:   node tools/contrast.mjs
// It prints a table and exits with an error if any pair is under its bar.
// tests/contrast.test.js runs the same check on every `npm test`.
//
// The bars (WCAG 2.1 AA):
//   text   4.5 : 1   ordinary words on their background
//   ui     3   : 1   large text, icons, focus rings, and the edge of a control
//
// This is a build tool, like stamp-sw.mjs. The page never loads it, and it only
// uses what comes with Node.

import { readFileSync, realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// ───────── reading the tokens ─────────

// "--name: value;" pairs inside one { … } block.
function tokensInBlock(blockText) {
  const tokens = {};
  const pattern = /(--[a-z0-9-]+)\s*:\s*([^;]+);/g;
  let match = pattern.exec(blockText);
  while (match !== null) {
    tokens[match[1]] = match[2].trim();
    match = pattern.exec(blockText);
  }
  return tokens;
}

// The text between the "{" at `openIndex` and its matching "}".
function blockAt(css, openIndex) {
  let depth = 0;
  for (let index = openIndex; index < css.length; index += 1) {
    if (css[index] === "{") depth += 1;
    if (css[index] === "}") {
      depth -= 1;
      if (depth === 0) return css.slice(openIndex + 1, index);
    }
  }
  return "";
}

// Returns { light: {…}, dark: {…} }. Dark = light with the dark block on top,
// which is exactly how the browser reads the two blocks.
export function readTokens(cssText) {
  const css = cssText.replace(/\/\*[\s\S]*?\*\//g, "");
  const rootIndex = css.indexOf(":root");
  const light = tokensInBlock(blockAt(css, css.indexOf("{", rootIndex)));
  const darkIndex = css.indexOf("@media (prefers-color-scheme: dark)");
  const darkMedia = blockAt(css, css.indexOf("{", darkIndex));
  const darkOnly = tokensInBlock(blockAt(darkMedia, darkMedia.indexOf("{")));
  return { light: light, dark: Object.assign({}, light, darkOnly) };
}

// ───────── the arithmetic (WCAG 2.1 relative luminance) ─────────

// "#RRGGBB" or "rgba(r, g, b, a)" → { r, g, b, a } with r, g, b from 0 to 255.
export function parseColor(text) {
  const hex = /^#([0-9a-f]{6})$/i.exec(text);
  if (hex) {
    const number = parseInt(hex[1], 16);
    return { r: (number >> 16) & 255, g: (number >> 8) & 255, b: number & 255, a: 1 };
  }
  const rgba = /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)$/i.exec(text);
  if (rgba) {
    return { r: Number(rgba[1]), g: Number(rgba[2]), b: Number(rgba[3]), a: rgba[4] === undefined ? 1 : Number(rgba[4]) };
  }
  throw new Error("contrast.mjs cannot read this color: " + text);
}

// A see-through color laid over a solid one.
export function over(top, under) {
  return {
    r: top.r * top.a + under.r * (1 - top.a),
    g: top.g * top.a + under.g * (1 - top.a),
    b: top.b * top.a + under.b * (1 - top.a),
    a: 1,
  };
}

function luminance(color) {
  const parts = [color.r, color.g, color.b].map(function (value) {
    const share = value / 255;
    return share <= 0.03928 ? share / 12.92 : Math.pow((share + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * parts[0] + 0.7152 * parts[1] + 0.0722 * parts[2];
}

export function contrast(first, second) {
  const a = luminance(first);
  const b = luminance(second);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

// ───────── the pairs the page really uses ─────────

// [foreground token, background token, "text" or "ui", where it is used]
// A background written as "a over b" is a see-through token laid over a solid one.
export const PAIRS = [
  // ordinary words on the three neutral backgrounds
  ["--ink", "--paper", "text", "body text on the page"],
  ["--ink", "--surface", "text", "text in inputs, tables, cards"],
  ["--ink", "--sunken", "text", "text in table headers and math blocks"],
  ["--ink-2", "--paper", "text", "secondary text, hints, ledes"],
  ["--ink-2", "--surface", "text", "secondary text in cards"],
  ["--ink-2", "--sunken", "text", "table header labels"],
  ["--ink-3", "--paper", "text", "footer, hero claims, inactive tabs"],
  ["--ink-3", "--surface", "text", "tiny labels in the hero preview"],
  ["--ink-3", "--sunken", "text", "muted text in a sunken well"],
  ["--accent", "--paper", "text", "links, eyebrows"],
  ["--punch", "--paper", "text", "the italic gold punchline in the headline"],
  ["--accent", "--surface", "text", "links and figures inside cards and chips"],
  ["--accent", "--sunken", "text", "links on a hovered row"],
  ["--accent-hover", "--paper", "text", "link hover"],
  ["--accent-hover", "--surface", "text", "link hover inside cards"],
  ["--ok-text", "--paper", "text", "green status words on the page"],
  ["--ok-text", "--surface", "text", "green status words in cards"],
  ["--warn-text", "--paper", "text", "amber words on the page"],
  ["--warn-text", "--surface", "text", "flag card labels"],
  ["--info-text", "--paper", "text", "blue information words"],
  ["--info-text", "--surface", "text", "blue information words in cards"],
  ["--danger-text", "--paper", "text", "error messages under a box"],
  ["--danger-text", "--surface", "text", "error messages in cards"],

  // the subtle pairs
  ["--accent-deep", "--accent-subtle", "text", "the REQUIRED tag, self-check tags"],
  ["--ink", "--accent-subtle", "text", "text on a navy tint"],
  ["--ok-deep", "--ok-subtle", "text", "MATCHES label, Matches chip"],
  ["--ink", "--ok-subtle", "text", "green verdict headline and body"],
  ["--warn-deep", "--warn-subtle", "text", "LOOK HERE label, Differs chip"],
  ["--ink", "--warn-subtle", "text", "amber verdict headline and body"],
  ["--info-deep", "--info-subtle", "text", "TOO CLOSE TO CALL label"],
  ["--ink", "--info-subtle", "text", "blue verdict headline and body, soft notes"],
  ["--danger-deep", "--danger-subtle", "text", "links in the error summary"],
  ["--ink", "--danger-subtle", "text", "error summary title"],

  // words and icons on solid fills
  ["--on-accent", "--accent", "text", "primary button, logo tile, box badges"],
  ["--on-accent", "--accent-hover", "text", "primary button, hovered"],
  ["--on-ok-mark", "--ok-mark", "ui", "the tick in the green verdict circle"],
  ["--on-warn-mark", "--warn-mark", "ui", "the flag in the amber verdict circle"],
  ["--on-info-mark", "--info-mark", "ui", "the icon in the blue verdict circle"],
  ["--on-danger", "--danger", "text", "the ! in the red error dot"],
  ["--pill-ink", "--pill-bg over --surface", "text", "the dark EXAMPLE pill, and the Pause pill while it is pressed"],
  // the landing page's big-figures band: a solid navy block (the same in both themes)
  ["--band-ink", "--band-bg", "text", "the ivory numerals, links and focus ring on the navy band"],
  ["--band-ink-2", "--band-bg", "text", "the words under each big figure"],
  ["--band-ink-3", "--band-bg", "text", "the small \"of\" and the $ sign in the band"],
  ["--ink", "--masthead-bg over --paper", "text", "the name in the sticky bar"],
  ["--ink-2", "--masthead-bg over --paper", "text", "links in the sticky bar"],

  // edges of controls, focus rings, marks (3:1)
  ["--border-strong", "--paper", "ui", "input and button edges against the page"],
  ["--border-strong", "--surface", "ui", "input edges against their own fill"],
  ["--border-strong", "--sunken", "ui", "edges inside a sunken well"],
  ["--focus", "--paper", "ui", "focus ring on the page"],
  ["--focus", "--surface", "ui", "focus ring on a card"],
  ["--focus", "--sunken", "ui", "focus ring in a sunken well"],
  ["--accent", "--paper", "ui", "the line under the chosen tab"],
  ["--ok-mark", "--ok-subtle", "ui", "green verdict circle and edge"],
  ["--warn-mark", "--warn-subtle", "ui", "amber verdict circle and edge"],
  ["--warn-mark", "--surface", "ui", "flag card edge, refund box edge"],
  ["--info-mark", "--info-subtle", "ui", "blue verdict circle and edge"],
  ["--danger", "--surface", "ui", "edge of a box with a mistake in it"],
  ["--danger", "--danger-subtle", "ui", "error summary edge"],
];

function resolve(tokens, spec) {
  const layers = spec.split(" over ").map(function (name) {
    const value = tokens[name.trim()];
    if (value === undefined) throw new Error("styles.css has no token called " + name);
    return parseColor(value);
  });
  let color = layers[layers.length - 1];
  for (let index = layers.length - 2; index >= 0; index -= 1) color = over(layers[index], color);
  return color;
}

// Returns one row per pair per theme: { theme, fg, bg, kind, where, ratio, bar, ok }.
export function checkAll(cssText) {
  const themes = readTokens(cssText);
  const rows = [];
  for (const theme of ["light", "dark"]) {
    for (const pair of PAIRS) {
      const ratio = contrast(resolve(themes[theme], pair[0]), resolve(themes[theme], pair[1]));
      const bar = pair[2] === "text" ? 4.5 : 3;
      rows.push({ theme: theme, fg: pair[0], bg: pair[1], kind: pair[2], where: pair[3], ratio: ratio, bar: bar, ok: ratio >= bar });
    }
  }
  return rows;
}

// ───────── run from the command line ─────────

function isMainModule() {
  if (!process.argv[1]) return false;
  try {
    return realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url));
  } catch (problem) {
    return false;
  }
}

if (isMainModule()) {
  const rows = checkAll(readFileSync(path.join(ROOT, "styles.css"), "utf8"));
  const themes = readTokens(readFileSync(path.join(ROOT, "styles.css"), "utf8"));
  console.log("| Foreground | Background | Bar | Light | Dark | Used for |");
  console.log("|---|---|---|---|---|---|");
  for (const pair of PAIRS) {
    const light = rows.find((row) => row.theme === "light" && row.fg === pair[0] && row.bg === pair[1] && row.where === pair[3]);
    const dark = rows.find((row) => row.theme === "dark" && row.fg === pair[0] && row.bg === pair[1] && row.where === pair[3]);
    const cell = (row) => row.ratio.toFixed(2) + (row.ok ? "" : " FAIL");
    console.log("| " + pair[0] + " | " + pair[1] + " | " + (pair[2] === "text" ? "4.5" : "3") + " | " + cell(light) + " | " + cell(dark) + " | " + pair[3] + " |");
  }
  const failures = rows.filter((row) => !row.ok);
  console.log("\n" + rows.length + " checks (" + PAIRS.length + " pairs x 2 themes), " + failures.length + " under the bar.");
  console.log("light --accent " + themes.light["--accent"] + ", dark --accent " + themes.dark["--accent"]);
  if (failures.length > 0) process.exit(1);
}
