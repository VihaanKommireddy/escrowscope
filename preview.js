// preview.js — the small framed "sample result" in the hero.
//
// It is a PICTURE of the tool, and every number in it is real: when the page
// loads, example 2 ("They're holding too much") goes through the very same path
// a visitor's numbers take (pipeline.runCheck, which calls the engine), and the
// self-check runs the engine against every worked case. Nothing below is typed
// in by hand, so the picture can never disagree with the calculator.
//
// It is decoration for people who can see it. index.html marks the holder
// aria-hidden and gives screen readers one plain sentence instead, so nobody
// hears a verdict that is not theirs.
//
// If anything here fails, the picture is simply left out. The tool itself must
// never break because its illustration did.

import { el, svgEl, clear } from "./dom.js";
import { EXAMPLES } from "./examples.js";
import { exampleToValues, runCheck, isTooCloseToCall } from "./pipeline.js";
import { formatCents, MONTH_NAMES, VECTORS, runSelfCheck } from "./engine/index.js";

// Which example the picture shows (the second one: a surplus the rule says is
// refunded, so the banner, the cushion and the low point all have a story).
export const PREVIEW_EXAMPLE_INDEX = 1;

const SHORT_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function monthName(calendarMonth) {
  return MONTH_NAMES[calendarMonth - 1] || "";
}

// Everything the picture shows, as plain text. Pure (no DOM), so
// tests/preview.test.js can check each string against the engine in Node.
export function previewFacts() {
  const example = EXAMPLES[PREVIEW_EXAMPLE_INDEX];
  const check = runCheck(exampleToValues(example));
  if (!check.ok) return null;
  const result = check.result;
  const report = runSelfCheck(VECTORS);

  let tone = "info";
  if (!isTooCloseToCall(check) && (check.verdict.tone === "clear" || check.verdict.tone === "flag")) {
    tone = check.verdict.tone;
  }

  return {
    exampleTitle: example.title,
    tone: tone,
    label: check.verdict.label,
    headline: check.verdict.headline,
    numbers: [
      { label: "Your bills for the year", figure: formatCents(result.annualDisbursementsCents) },
      { label: "The most cushion the law allows", figure: formatCents(result.cushionCapCents) },
      { label: "Your lowest projected balance", figure: formatCents(result.lowPoint.projectedBalanceCents) },
    ],
    cushionChip: { words: "Cushion limit", figure: formatCents(result.cushionCapCents) },
    lowChip: {
      words: "Lowest month · " + monthName(result.lowPoint.calendarMonth),
      figure: formatCents(result.lowPoint.projectedBalanceCents),
    },
    checksChip: report.passed + " of " + report.total + " checks passed",
    allChecksPassed: report.total > 0 && report.passed === report.total,
    months: result.table.map(function (row) {
      return { calendarMonth: row.calendarMonth, balanceCents: row.projectedBalanceCents };
    }),
    cushionCapCents: result.cushionCapCents,
    lowMonthIndex: result.lowPoint.month - 1,
  };
}

// A small line chart of the 12 projected balances, with the cushion limit as a
// dashed line and the lowest month ringed. Drawn with SVG shapes only.
function previewChart(facts) {
  // The tall top margin is on purpose: the "lowest month" chip floats over the
  // top right of the chart, and the line must stay clear of it.
  const width = 520;
  const height = 176;
  const left = 8;
  const right = 8;
  const top = 46;
  const bottom = 24;
  const balances = facts.months.map(function (month) {
    return month.balanceCents;
  });
  const highest = Math.max.apply(null, balances.concat([facts.cushionCapCents]));
  const lowest = Math.min.apply(null, balances.concat([facts.cushionCapCents, 0]));
  const span = highest - lowest || 1;

  function x(index) {
    return left + (index * (width - left - right)) / (balances.length - 1);
  }
  function y(cents) {
    return top + ((highest - cents) * (height - top - bottom)) / span;
  }
  function fixed(value) {
    return value.toFixed(1);
  }

  const points = balances.map(function (cents, index) {
    return fixed(x(index)) + "," + fixed(y(cents));
  });
  const floor = fixed(height - bottom);
  const areaPoints = [fixed(x(0)) + "," + floor].concat(points, [fixed(x(balances.length - 1)) + "," + floor]);
  const limitY = fixed(y(facts.cushionCapCents));

  const svg = svgEl("svg", {
    className: "preview-chart",
    attrs: { viewBox: "0 0 " + width + " " + height, width: width, height: height, focusable: "false" },
  });
  svg.append(
    svgEl("line", { className: "pc-grid", attrs: { x1: left, y1: floor, x2: width - right, y2: floor } }),
    svgEl("polygon", { className: "pc-area", attrs: { points: areaPoints.join(" ") } }),
    svgEl("line", { className: "pc-limit", attrs: { x1: left, y1: limitY, x2: width - right, y2: limitY } }),
    svgEl("polyline", { className: "pc-line", attrs: { points: points.join(" ") } }),
    svgEl("circle", {
      className: "pc-low",
      attrs: { cx: fixed(x(facts.lowMonthIndex)), cy: fixed(y(balances[facts.lowMonthIndex])), r: 5 },
    })
  );
  // Month names under every other point, so they never crowd on a phone.
  facts.months.forEach(function (month, index) {
    if (index % 2 !== 0) return;
    let anchor = "middle";
    if (index === 0) anchor = "start";
    svg.append(
      svgEl("text", {
        text: SHORT_MONTHS[month.calendarMonth - 1] || "",
        attrs: { x: fixed(x(index)), y: height - 6, "text-anchor": anchor },
      })
    );
  });
  return svg;
}

// "preview-chip" is a stable name for the motion layer to find the chips by. It
// carries no styles of its own.
function chip(className, dotClass, words, figure) {
  const children = [];
  if (dotClass) children.push(el("span", { className: "chip-dot " + dotClass }));
  children.push(words);
  if (figure) children.push(" · ", el("b", { text: figure }));
  return el("p", { className: "chip preview-chip " + className }, children);
}

const MARKS = { clear: "✓", flag: "!", info: "i" };

export function initHeroPreview(holder) {
  if (!holder) return;
  try {
    const facts = previewFacts();
    if (facts === null) return;
    clear(holder);

    const numbers = el("dl", { className: "preview-numbers" });
    for (const item of facts.numbers) {
      numbers.append(el("div", { className: "preview-number" }, [el("dt", { text: item.label }), el("dd", { text: item.figure })]));
    }

    const frame = el("div", { className: "preview-frame" }, [
      el("div", { className: "preview-bar" }, [el("span", { text: "The result · example 2" })]),
      el("div", { className: "preview-body" }, [
        el("div", { className: "preview-verdict preview-verdict--" + facts.tone }, [
          el("span", { className: "preview-mark", text: MARKS[facts.tone] }),
          el("div", {}, [
            el("p", { className: "preview-label", text: facts.label }),
            el("p", { className: "preview-headline", text: facts.headline }),
          ]),
        ]),
        numbers,
        previewChart(facts),
      ]),
    ]);

    holder.append(
      frame,
      chip("chip--cushion", "chip-dot--warn", facts.cushionChip.words, facts.cushionChip.figure),
      chip("chip--low", "chip-dot--accent", facts.lowChip.words, facts.lowChip.figure),
      chip("chip--checks", facts.allChecksPassed ? "chip-dot--ok" : "chip-dot--warn", facts.checksChip, ""),
      el("p", { className: "chip preview-chip chip--example", text: "Example" })
    );
  } catch (problem) {
    // The picture is optional. Leave the space empty rather than break the page.
    clear(holder);
  }
}
