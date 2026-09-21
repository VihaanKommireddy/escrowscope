// preview.js — the small framed "sample result" in the hero.
//
// It is a PICTURE of the tool, and every number in it is real: when the page
// loads, an example goes through the very same path a visitor's numbers take
// (pipeline.runCheck, which calls the engine), and the self-check runs the
// engine against every worked case. Nothing below is typed in by hand, so the
// picture can never disagree with the calculator.
//
// Standing still, the picture shows example 2 ("They're holding too much").
// That is what a visitor gets with scripts half-loaded, with "reduce motion"
// switched on, or if the motion layer fails. When motion is allowed, motion.js
// asks this file for the other two examples as well and plays all three, one
// after another. This file only BUILDS and FILLS the picture; it never moves it.
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

// Which example the picture shows when it stands still (the second one: a
// surplus the rule says is refunded, so the banner, the cushion and the low
// point all have a story).
export const PREVIEW_EXAMPLE_INDEX = 1;

const SHORT_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function monthName(calendarMonth) {
  return MONTH_NAMES[calendarMonth - 1] || "";
}

// The self-check is the same for every example, so it runs once.
let selfCheckReport = null;
function selfCheck() {
  if (selfCheckReport === null) selfCheckReport = runSelfCheck(VECTORS);
  return selfCheckReport;
}

// Everything the picture shows for one example, as plain text. Pure (no DOM), so
// tests/preview.test.js can check each string against the engine in Node.
// `cents` sits next to every dollar figure: the motion layer counts up to it,
// and the last frame of the count is always formatCents(cents), the same string.
export function previewFacts(exampleIndex = PREVIEW_EXAMPLE_INDEX) {
  const example = EXAMPLES[exampleIndex];
  if (example === undefined) return null;
  const check = runCheck(exampleToValues(example));
  if (!check.ok) return null;
  const result = check.result;
  const report = selfCheck();

  let tone = "info";
  if (!isTooCloseToCall(check) && (check.verdict.tone === "clear" || check.verdict.tone === "flag")) {
    tone = check.verdict.tone;
  }

  return {
    exampleNumber: exampleIndex + 1,
    exampleTitle: example.title,
    tone: tone,
    label: check.verdict.label,
    headline: check.verdict.headline,
    numbers: [
      { label: "Your bills for the year", cents: result.annualDisbursementsCents, figure: formatCents(result.annualDisbursementsCents) },
      { label: "The most cushion the law allows", cents: result.cushionCapCents, figure: formatCents(result.cushionCapCents) },
      { label: "Your lowest projected balance", cents: result.lowPoint.projectedBalanceCents, figure: formatCents(result.lowPoint.projectedBalanceCents) },
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

// How long a line through these points is, in the chart's own units. The motion
// layer needs it to draw the line from left to right. Pure, so Node can test it.
export function polylineLength(points) {
  let length = 0;
  for (let index = 1; index < points.length; index += 1) {
    const dx = points[index][0] - points[index - 1][0];
    const dy = points[index][1] - points[index - 1][1];
    length += Math.sqrt(dx * dx + dy * dy);
  }
  return length;
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

  const spots = balances.map(function (cents, index) {
    return [x(index), y(cents)];
  });
  const points = spots.map(function (spot) {
    return fixed(spot[0]) + "," + fixed(spot[1]);
  });
  const floor = fixed(height - bottom);
  const areaPoints = [fixed(x(0)) + "," + floor].concat(points, [fixed(x(balances.length - 1)) + "," + floor]);
  const limitY = fixed(y(facts.cushionCapCents));

  const svg = svgEl("svg", {
    className: "preview-chart",
    attrs: { viewBox: "0 0 " + width + " " + height, width: width, height: height, focusable: "false" },
  });
  // The length of the line, handed to the stylesheet as a custom property (set
  // through the style OBJECT, which the page's policy allows; never a style
  // attribute string). Standing still, nothing reads it.
  svg.style.setProperty("--pc-len", String(Math.ceil(polylineLength(spots)) + 2));
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

const MARKS = { clear: "✓", flag: "!", info: "i" };

function verdictCard(facts) {
  return el("div", { className: "preview-verdict preview-verdict--" + facts.tone }, [
    el("span", { className: "preview-mark", text: MARKS[facts.tone] }),
    el("div", {}, [
      el("p", { className: "preview-label", text: facts.label }),
      el("p", { className: "preview-headline", text: facts.headline }),
    ]),
  ]);
}

// "preview-chip" is a stable name for the motion layer to find the chips by. It
// carries no styles of its own. The words and the figure are kept as two nodes,
// so another example's words can be put in without rebuilding the chip.
function chip(className, dotClass, words, figure) {
  const wordsNode = document.createTextNode(words);
  const figureNode = el("b", { text: figure });
  const children = [];
  if (dotClass) children.push(el("span", { className: "chip-dot " + dotClass }));
  children.push(wordsNode);
  if (figure) children.push(" · ", figureNode);
  const node = el("p", { className: "chip preview-chip " + className }, children);
  return { node: node, wordsNode: wordsNode, figureNode: figureNode };
}

// Build the picture inside `holder`, showing example 2, finished and still.
// Returns a small "stage" object the motion layer can drive, or null when the
// picture could not be built:
//   count              how many examples there are
//   facts(index)       previewFacts for that example (worked out once, then kept)
//   prepareAll()       add the verdict card and the chart of EVERY example, laid
//                      on top of each other, so the frame is always as tall as
//                      the tallest one and never changes height
//   show(index, opts)  make one example the one that shows, with all its words
//                      and final numbers. opts.counted: true writes "Example 1
//                      of 3" on the dark pill instead of plain "Example".
//   setNumbers(cents)  write three dollar figures (used while counting up)
export function initHeroPreview(holder) {
  if (!holder) return null;
  try {
    const factsByIndex = new Map();
    function factsFor(index) {
      if (!factsByIndex.has(index)) factsByIndex.set(index, previewFacts(index));
      return factsByIndex.get(index);
    }

    const first = factsFor(PREVIEW_EXAMPLE_INDEX);
    if (first === null) {
      holder.classList.add("preview-failed");
      return null;
    }
    clear(holder);
    holder.classList.remove("is-cycling", "is-playing", "is-leaving");

    const cards = new Map();
    const charts = new Map();
    // Both holders stack their children in one grid cell (styles.css). Standing
    // still there is one child in each, so nothing about the look changes.
    const verdicts = el("div", { className: "preview-verdicts" }, [
      // What the slot says while an example is still "being worked out". Only the
      // motion layer ever shows it.
      el("p", { className: "preview-working", text: "Checking the math" }),
    ]);
    const chartHolder = el("div", { className: "preview-charts" });

    function ensureBuilt(index) {
      if (cards.has(index)) return true;
      const facts = factsFor(index);
      if (facts === null) return false;
      const card = verdictCard(facts);
      const chart = previewChart(facts);
      cards.set(index, card);
      charts.set(index, chart);
      verdicts.append(card);
      chartHolder.append(chart);
      return true;
    }

    const numberNodes = [];
    const numbers = el("dl", { className: "preview-numbers" });
    for (const item of first.numbers) {
      const figureNode = el("dd", { text: item.figure });
      numberNodes.push(figureNode);
      numbers.append(el("div", { className: "preview-number" }, [el("dt", { text: item.label }), figureNode]));
    }

    const barTitle = el("span", { className: "preview-bar-title" });
    const frame = el("div", { className: "preview-frame" }, [
      // A browser-window top bar: three dots drawn in CSS, then what this is.
      el("div", { className: "preview-bar" }, [el("span", { className: "preview-dots" }), barTitle]),
      el("div", { className: "preview-body" }, [verdicts, numbers, chartHolder]),
    ]);

    const cushion = chip("chip--cushion", "chip-dot--warn", first.cushionChip.words, first.cushionChip.figure);
    const low = chip("chip--low", "chip-dot--accent", first.lowChip.words, first.lowChip.figure);
    const checks = chip("chip--checks", first.allChecksPassed ? "chip-dot--ok" : "chip-dot--warn", first.checksChip, "");
    // The dark pill: the word "Example", then (only while the picture plays)
    // which one of how many. Two pieces, so a very narrow phone can drop the word
    // and keep the count clear of the chip next to it.
    const pillCount = el("span", { className: "pill-count" });
    const pill = el("p", { className: "chip preview-chip chip--example" }, [el("span", { className: "pill-word", text: "Example" }), pillCount]);

    function setNumbers(centsList) {
      numberNodes.forEach(function (node, position) {
        node.textContent = formatCents(centsList[position]);
      });
    }

    function show(index, options) {
      if (!ensureBuilt(index)) return false;
      const facts = factsFor(index);
      for (const [position, card] of cards) card.classList.toggle("is-current", position === index);
      for (const [position, chart] of charts) chart.classList.toggle("is-current", position === index);
      barTitle.textContent = "The result · example " + facts.exampleNumber;
      numberNodes.forEach(function (node, position) {
        node.textContent = facts.numbers[position].figure;
      });
      cushion.wordsNode.textContent = facts.cushionChip.words;
      cushion.figureNode.textContent = facts.cushionChip.figure;
      low.wordsNode.textContent = facts.lowChip.words;
      low.figureNode.textContent = facts.lowChip.figure;
      const counted = Boolean(options && options.counted);
      pillCount.textContent = counted ? " " + facts.exampleNumber + " of " + EXAMPLES.length : "";
      pill.classList.toggle("is-counted", counted);
      return true;
    }

    function prepareAll() {
      let allBuilt = true;
      for (let index = 0; index < EXAMPLES.length; index += 1) {
        if (!ensureBuilt(index)) allBuilt = false;
      }
      return allBuilt;
    }

    show(PREVIEW_EXAMPLE_INDEX, { counted: false });
    holder.append(frame, cushion.node, low.node, checks.node, pill);

    return {
      holder: holder,
      count: EXAMPLES.length,
      facts: factsFor,
      prepareAll: prepareAll,
      show: show,
      setNumbers: setNumbers,
    };
  } catch (problem) {
    // The picture is optional. Leave the space empty rather than break the page,
    // and give back the room the stylesheet was keeping for it.
    clear(holder);
    holder.classList.add("preview-failed");
    return null;
  }
}
