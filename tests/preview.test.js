// tests/preview.test.js — the hero's "sample result" and the example tabs.
//
// The picture at the top of the page shows a verdict, three dollar figures, a
// cushion limit, a lowest month and a self-check count. A picture of a result
// that the calculator would not actually give would be a small lie at the very
// top of an honesty tool. So:
//   1. preview.js builds every string from the engine when the page loads, and
//      this file checks each one against the engine, worked out separately here;
//   2. index.html's hero contains no dollar figure at all (nothing hard-coded);
//   3. the picture is hidden from screen readers and described in one sentence.
//
// Run it from the project folder:   node --test tests/preview.test.js

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

import { EXAMPLES } from "../examples.js";
import { analyze, compareWithStatement, explainVerdict, formatCents, runSelfCheck, VECTORS } from "../engine/index.js";
import { previewFacts, PREVIEW_EXAMPLE_INDEX } from "../preview.js";
import { exampleToValues, runCheck } from "../pipeline.js";
import { numbersAt, numbersEndMs } from "../motion.js";
import { nextTabIndex } from "../tabs.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const indexHtml = readFileSync(path.join(ROOT, "index.html"), "utf8");

test("the hero preview shows example 2, and every string in it is what the engine gives for example 2", () => {
  assert.equal(PREVIEW_EXAMPLE_INDEX, 1);
  const example = EXAMPLES[PREVIEW_EXAMPLE_INDEX];
  assert.equal(example.id, "holding-too-much");

  // Worked out here straight from the engine, not through pipeline.js.
  const result = analyze(example.account);
  const verdict = explainVerdict(result, compareWithStatement(result, example.statement));

  const facts = previewFacts();
  assert.ok(facts !== null, "previewFacts() returned nothing: example 2 no longer passes the form's own checks.");
  assert.equal(facts.headline, verdict.headline);
  assert.equal(facts.label, verdict.label);
  assert.equal(facts.tone, verdict.tone);
  assert.deepEqual(
    facts.numbers.map((item) => item.figure),
    [formatCents(result.annualDisbursementsCents), formatCents(result.cushionCapCents), formatCents(result.lowPoint.projectedBalanceCents)]
  );
  assert.deepEqual(
    facts.months.map((month) => month.balanceCents),
    result.table.map((row) => row.projectedBalanceCents)
  );
  assert.equal(facts.lowMonthIndex, result.lowPoint.month - 1);
  assert.equal(facts.months[facts.lowMonthIndex].balanceCents, result.lowPoint.projectedBalanceCents, "The ringed point must be the lowest month.");

  // The figures a person reads off the picture today. If the example or the
  // engine changes, these change with it, and this line says so out loud.
  assert.equal(facts.cushionChip.words + " · " + facts.cushionChip.figure, "Cushion limit · $800.00");
  assert.equal(facts.lowChip.words + " · " + facts.lowChip.figure, "Lowest month · November · $1,100.00");
  assert.deepEqual(facts.numbers.map((item) => item.figure), ["$4,800.00", "$800.00", "$1,100.00"]);
});

// When motion is allowed the picture PLAYS: it works through all three examples,
// one after another (motion.js). So every example is held to the same rule as
// example 2 above: what the picture shows is what the calculator gives.
test("the playing preview: for EACH of the three examples, every string is what the engine gives, worked out here separately", () => {
  assert.equal(EXAMPLES.length, 3);
  assert.equal(previewFacts(EXAMPLES.length), null, "An example that does not exist shows nothing.");
  assert.equal(previewFacts(-1), null);
  assert.deepEqual(previewFacts(), previewFacts(PREVIEW_EXAMPLE_INDEX), "With no number given, it is still example 2.");

  EXAMPLES.forEach((example, index) => {
    const result = analyze(example.account);
    const verdict = explainVerdict(result, compareWithStatement(result, example.statement));
    const facts = previewFacts(index);
    assert.ok(facts !== null, "Example " + (index + 1) + " no longer passes the form's own checks.");
    assert.equal(facts.exampleNumber, index + 1);
    assert.equal(facts.headline, verdict.headline);
    assert.equal(facts.label, verdict.label);
    assert.equal(facts.tone, verdict.tone);
    assert.deepEqual(
      facts.numbers.map((item) => item.cents),
      [result.annualDisbursementsCents, result.cushionCapCents, result.lowPoint.projectedBalanceCents]
    );
    for (const item of facts.numbers) assert.equal(item.figure, formatCents(item.cents), "The figure and the cents it counts up to must be the same amount.");
    assert.equal(facts.cushionChip.figure, formatCents(result.cushionCapCents));
    assert.equal(facts.lowChip.figure, formatCents(result.lowPoint.projectedBalanceCents));
    assert.deepEqual(
      facts.months.map((month) => month.balanceCents),
      result.table.map((row) => row.projectedBalanceCents)
    );
    assert.equal(facts.months[facts.lowMonthIndex].balanceCents, result.lowPoint.projectedBalanceCents, "The ringed point must be the lowest month.");
  });
});

test("the playing preview: the numbers each example's count-up ENDS on are the ones runCheck gives, the same path check.html#example-N takes", () => {
  EXAMPLES.forEach((example, index) => {
    // The very call check.js makes when the tool opens with this example.
    const check = runCheck(exampleToValues(example));
    assert.ok(check.ok);
    const expected = [
      formatCents(check.result.annualDisbursementsCents),
      formatCents(check.result.cushionCapCents),
      formatCents(check.result.lowPoint.projectedBalanceCents),
    ];
    const facts = previewFacts(index);
    const finalCents = facts.numbers.map((item) => item.cents);
    assert.deepEqual(numbersAt(finalCents, numbersEndMs(3)).map(formatCents), expected, "Example " + (index + 1) + ": the count-up does not end on runCheck's figures.");
    assert.deepEqual(facts.numbers.map((item) => item.figure), expected);
    assert.equal(facts.headline, check.verdict.headline);
  });
  // What a person watching the loop sees today: green for the first, amber for the other two.
  assert.deepEqual([0, 1, 2].map((index) => previewFacts(index).tone), ["clear", "flag", "flag"]);
  assert.deepEqual([0, 1, 2].map((index) => previewFacts(index).numbers.map((item) => item.figure).join(" ")), [
    "$5,700.00 $950.00 $650.00",
    "$4,800.00 $800.00 $1,100.00",
    "$7,200.00 $1,200.00 $1,200.00",
  ]);
});

test("preview.js only builds and fills the picture: it starts no timers, asks for no frames, and leaves the moving to motion.js", () => {
  const source = readFileSync(path.join(ROOT, "preview.js"), "utf8").replace(/^\s*\/\/.*$/gm, "");
  assert.ok(!/setTimeout|setInterval|requestAnimationFrame|IntersectionObserver|matchMedia/.test(source));
  assert.ok(/show\(PREVIEW_EXAMPLE_INDEX, \{ counted: false \}\);/.test(source), "Standing still, the picture is example 2 with the plain \"Example\" pill.");
  assert.ok(/el\("span", \{ className: "preview-dots" \}\)/.test(source), "The frame has its browser-window top bar.");
});

test("the \"checks passed\" chip is counted, not written down: it comes from running the self-check", () => {
  const report = runSelfCheck(VECTORS);
  const facts = previewFacts();
  assert.equal(facts.checksChip, report.passed + " of " + report.total + " checks passed");
  assert.equal(facts.allChecksPassed, report.failed === 0 && report.total === VECTORS.length);
  const source = readFileSync(path.join(ROOT, "preview.js"), "utf8");
  assert.ok(!/\d+ of \d+ checks/.test(source), "preview.js must not contain a written-down count of checks.");
});

test("index.html hard-codes no result in the hero: no dollar figure, and the picture is hidden from screen readers and described instead", () => {
  const start = indexHtml.indexOf('<section class="hero"');
  const end = indexHtml.indexOf("</section>", start);
  assert.ok(start !== -1 && end !== -1, "index.html has no hero section.");
  const hero = indexHtml.slice(start, end).replace(/<!--[\s\S]*?-->/g, "");
  assert.ok(!/\$\s?\d/.test(hero), "The hero in index.html contains a dollar figure. Every number in the picture must come from preview.js.");
  assert.ok(/<div id="hero-preview"[^>]*aria-hidden="true"/.test(hero), 'The picture holder must be aria-hidden="true".');
  assert.ok(/<p class="visually-hidden">[^<]*example 2[^<]*not your result/.test(hero), "The hero needs the one-sentence description that says the picture is an example, not the visitor's result.");
  const holder = /<div id="hero-preview"[^>]*>([\s\S]*?)<\/div>/.exec(hero);
  assert.equal(holder[1].trim(), "", "The picture holder must be empty in index.html: preview.js fills it.");
});

test("example tabs: each example has a short tab name, and the arrow keys wrap round the row", () => {
  for (const example of EXAMPLES) {
    assert.ok(typeof example.tab === "string" && example.tab.trim() !== "", example.id + " has no tab name.");
  }
  const count = EXAMPLES.length;
  assert.equal(nextTabIndex(0, count, "ArrowRight"), 1);
  assert.equal(nextTabIndex(count - 1, count, "ArrowRight"), 0, "Right arrow on the last tab goes to the first.");
  assert.equal(nextTabIndex(0, count, "ArrowLeft"), count - 1, "Left arrow on the first tab goes to the last.");
  assert.equal(nextTabIndex(1, count, "Home"), 0);
  assert.equal(nextTabIndex(0, count, "End"), count - 1);
  assert.equal(nextTabIndex(1, count, "Enter"), 1, "Any other key leaves the choice alone.");
  assert.equal(nextTabIndex(7, count, "ArrowRight"), 0, "A position that does not exist falls back to the first tab.");
  assert.equal(nextTabIndex(0, 0, "ArrowRight"), 0);
});

// Until the site became four pages, these two links ran example 1 further down
// the same page (data-run-example). Now they are plain links to the tool, which
// opens with the example filled in: ./check.html#example-1. A plain link needs
// no script on THIS page; check.js reads the number on the other side, and
// tests/shell.test.js tests that reader (example-link.js).
test("the landing page's two \"Watch an example\" links are plain links to the tool and name a real example", () => {
  const links = [...indexHtml.matchAll(/<a [^>]*href="\.\/check\.html#example-(\d+)"[^>]*>Watch an example<\/a>/g)];
  assert.equal(links.length, 2, "Expected the hero link and the closing-section link.");
  for (const link of links) {
    assert.ok(EXAMPLES[Number(link[1]) - 1] !== undefined, "The link names an example that does not exist.");
    assert.ok(!/data-run-example/.test(link[0]), "The old same-page hook must be gone: nothing on the landing page listens for it.");
  }
  assert.ok(/id="examples-heading"/.test(indexHtml), "The landing page still shows the three examples.");
});
