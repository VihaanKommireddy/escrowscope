// tests/contrast.test.js — every color pair the page uses clears WCAG 2.1 AA, in
// the light theme AND the dark theme.
//
// The colors live in ONE place: the two token blocks at the top of styles.css.
// tools/contrast.mjs reads them and does the arithmetic (WCAG relative
// luminance). This test fails if anyone changes a color and a pair drops under
// its bar: 4.5:1 for ordinary text, 3:1 for large text, icons, focus rings and
// the edges of controls.
//
// Run it from the project folder:   node --test tests/contrast.test.js
// To see the whole table:            node tools/contrast.mjs

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

import { PAIRS, checkAll, contrast, over, parseColor, readTokens } from "../tools/contrast.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const stylesCss = readFileSync(path.join(ROOT, "styles.css"), "utf8");

test("the contrast arithmetic is proven against known answers", () => {
  const black = parseColor("#000000");
  const white = parseColor("#FFFFFF");
  assert.equal(contrast(black, white).toFixed(2), "21.00");
  assert.equal(contrast(white, white).toFixed(2), "1.00");
  // #767676 on white is the classic "just passes AA" grey: 4.54:1.
  assert.equal(contrast(parseColor("#767676"), white).toFixed(2), "4.54");
  // Half-see-through black over white is mid grey.
  const mixed = over(parseColor("rgba(0, 0, 0, 0.5)"), white);
  assert.deepEqual([Math.round(mixed.r), Math.round(mixed.g), Math.round(mixed.b)], [128, 128, 128]);
  assert.throws(() => parseColor("teal"), /cannot read this color/);
});

test("styles.css defines every token the contrast pairs name, in both themes", () => {
  const themes = readTokens(stylesCss);
  for (const pair of PAIRS) {
    for (const spec of [pair[0], pair[1]]) {
      for (const name of spec.split(" over ")) {
        assert.ok(themes.light[name.trim()] !== undefined, "The light theme has no token called " + name);
        assert.ok(themes.dark[name.trim()] !== undefined, "The dark theme has no token called " + name);
      }
    }
  }
  // The dark theme must really be a different set of colors, not the light one twice.
  assert.notEqual(themes.dark["--paper"], themes.light["--paper"]);
  assert.notEqual(themes.dark["--accent"], themes.light["--accent"]);
});

test("the accent is authority navy, not green or gold (green already means \"matches\" and gold means \"look here\" on this page)", () => {
  const themes = readTokens(stylesCss);
  assert.equal(themes.light["--accent"].toUpperCase(), "#1D3A63");
  assert.notEqual(themes.light["--accent"].toUpperCase(), themes.light["--warn-mark"].toUpperCase());
  assert.notEqual(themes.light["--accent"].toUpperCase(), themes.light["--ok-mark"].toUpperCase());
});

test("every text and control color pair clears WCAG 2.1 AA in the light and the dark theme", () => {
  const rows = checkAll(stylesCss);
  assert.equal(rows.length, PAIRS.length * 2);
  const failures = rows
    .filter((row) => !row.ok)
    .map((row) => row.theme + ": " + row.fg + " on " + row.bg + " is " + row.ratio.toFixed(2) + ":1, needs " + row.bar + ":1 (" + row.where + ")");
  assert.deepEqual(failures, [], "These pairs are under the bar. Run `node tools/contrast.mjs` to see the whole table:\n" + failures.join("\n"));
});
