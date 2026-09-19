// chart.js — the two pictures on the results page.
//
//   renderBalanceChart(container, data)   the month-by-month balance chart,
//                                         followed by the same numbers as a table
//   renderJumpBar(container, jump)        the "Why did it jump?" stacked bar
//
// Both are safe to call again and again with new numbers (the live what-if does
// exactly that): each call throws away what it drew before and draws fresh.
//
// Rules this file follows:
//   - Every node is built with el() / svgEl() from dom.js, so text only ever
//     goes onto the page as plain text.
//   - No inline styling. Colors live in chart.css as classes. Positions are SVG
//     attributes (x, y, points, d ...), which the page's security policy allows.
//   - All the math wording (labels, sentences, notes) comes from the engine and
//     is shown as-is. The only words written here are axis labels, legend
//     names, table headers, and the hidden title/description of each picture.
//
// Why we draw at the box's real pixel width: a picture with one fixed size
// shrinks its text along with everything else, so on a phone the labels would
// turn into specks. Instead we measure the box, draw for that exact width, and
// draw again whenever the box changes size. Text stays 11px or bigger.

import { el, svgEl, clear, scrollRegion } from "./dom.js";
import { formatCents, MONTH_NAMES } from "./engine/index.js";

// ───────────────────────── 1. Shared helpers ─────────────────────────

// If the box is hidden when we draw (width 0), we draw at this width. The size
// watcher below redraws at the true width the moment the box shows up.
const FALLBACK_WIDTH = 640;

// Below this the layout has nothing left to give, so we stop shrinking it.
const SMALLEST_DRAW_WIDTH = 240;

// What we remember about each box we have drawn into. A WeakMap forgets a box
// by itself once the page drops that box, so nothing piles up over time.
const balanceChartStates = new WeakMap();
const jumpBarStates = new WeakMap();

// Patterns and titles inside an SVG are found by id, and ids must be unique on
// the page. Each box gets its own number to build its ids from.
let nextIdNumber = 1;

function getState(states, container) {
  let state = states.get(container);
  if (!state) {
    state = {
      container: container,
      idNumber: nextIdNumber,
      holder: null,        // the element the SVG sits in (rebuilt on every render)
      data: null,          // the latest numbers we were given
      drawnWidth: 0,       // the width the SVG on screen was drawn for
      isWatching: false,   // true once the size watcher is set up
      hasDrawnBefore: false,
      redrawIsQueued: false,
    };
    nextIdNumber += 1;
    states.set(container, state);
  }
  return state;
}

function measureWidth(holder) {
  const width = Math.floor(holder.clientWidth);
  if (!width) return FALLBACK_WIDTH;
  if (width < SMALLEST_DRAW_WIDTH) return SMALLEST_DRAW_WIDTH;
  return width;
}

// Note the width we just drew for. If the box was hidden (width 0) we drew a
// stand-in, so we note -1: that matches no real width, and the size watcher
// below will redraw the moment the box shows up.
function rememberDrawnWidth(state, width) {
  state.drawnWidth = state.holder.clientWidth ? width : -1;
  state.hasDrawnBefore = true;
}

// Redraw when the box changes width. Set up once per box, however many times
// the render function is called.
function watchWidth(state, redraw) {
  if (state.isWatching) return;
  state.isWatching = true;

  function handleSizeChange() {
    if (state.redrawIsQueued) return;
    state.redrawIsQueued = true;
    // Wait for the next frame: changing the page in the middle of a size
    // report makes browsers complain, and this also folds a burst of reports
    // (dragging a window edge) into one redraw.
    window.requestAnimationFrame(function () {
      state.redrawIsQueued = false;
      if (!state.holder || !state.holder.isConnected) return;
      // Hidden right now (width 0): nothing to gain from drawing. We get
      // another size report when the box comes back.
      if (!state.holder.clientWidth) return;
      if (measureWidth(state.holder) !== state.drawnWidth) redraw(state);
    });
  }

  if (typeof ResizeObserver === "function") {
    const observer = new ResizeObserver(handleSizeChange);
    observer.observe(state.container);
  } else {
    window.addEventListener("resize", handleSizeChange);
  }
}

// Anything that is not a real number is treated as 0, so a missing field can
// never turn into "NaN" on screen or a broken shape.
function safeCents(value) {
  if (typeof value !== "number" || !Number.isFinite(value)) return 0;
  return value;
}

function monthName(calendarMonth) {
  return MONTH_NAMES[calendarMonth - 1] || "";
}

function shortMonthName(calendarMonth) {
  return monthName(calendarMonth).slice(0, 3);
}

// Axis ticks are always whole dollars, so we let the engine's formatCents write
// the figure (sign, commas and all) and only drop the ".00" to save room.
// Money strings are never built by hand in this file.
function formatAxisDollars(cents) {
  const text = formatCents(cents);
  if (text.endsWith(".00")) return text.slice(0, text.length - 3);
  return text;
}

// We cannot measure text before it is on screen (and the results area may be
// hidden when we draw), so we estimate. In a monospace font each character is
// about 0.6 of the font size wide. Ordinary text is narrower than that, so this
// guess errs on the wide side, which only makes labels keep a bit more distance.
function estimateTextWidth(text, fontSize) {
  return Math.ceil(String(text).length * fontSize * 0.62);
}

// Lines look crisp when a 1px stroke sits on a half pixel.
function crisp(position) {
  return Math.round(position) + 0.5;
}

// ── Label placement ──
// A label can sit in a few spots around the thing it names. We score every
// spot by how much it would cover other things (lines, markers, other labels)
// and keep the spot that covers the least.

function overlapArea(a, b) {
  const overlapWidth = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
  const overlapHeight = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
  if (overlapWidth <= 0 || overlapHeight <= 0) return 0;
  return overlapWidth * overlapHeight;
}

function pickBestSpot(candidates, obstacles) {
  let best = candidates[0];
  let bestScore = Infinity;
  for (const candidate of candidates) {
    // A spot may start with a handicap (extraScore) when it is a last resort.
    let score = candidate.extraScore || 0;
    for (const obstacle of obstacles) {
      score += overlapArea(candidate, obstacle) * obstacle.weight;
      // A far-away spot is joined to its point by a thin leader line; that
      // line should not cut through things either.
      if (candidate.leaderBox) score += overlapArea(candidate.leaderBox, obstacle) * obstacle.weight;
    }
    if (score < bestScore) {
      best = candidate;
      bestScore = score;
    }
  }
  best.score = bestScore; // lets the caller skip a label that has no clear spot
  return best;
}

// Where the text starts, given which way it is anchored inside its box.
function anchorX(box) {
  if (box.anchor === "middle") return box.x + box.width / 2;
  if (box.anchor === "end") return box.x + box.width;
  return box.x;
}

// Slide a box until it fits inside the bounds, sideways and up/down.
function keepInside(box, bounds) {
  if (box.x + box.width > bounds.right) box.x = bounds.right - box.width;
  if (box.x < bounds.left) box.x = bounds.left;
  if (box.y + box.height > bounds.bottom) box.y = bounds.bottom - box.height;
  if (box.y < bounds.top) box.y = bounds.top;
  return box;
}

// Turn a drawn line into a row of small boxes, so labels can avoid it. The
// boxes are wider than the line itself, so labels also keep a little distance.
function addLineObstacles(obstacles, points, weight) {
  for (let i = 1; i < points.length; i += 1) {
    const from = points[i - 1];
    const to = points[i];
    const length = Math.hypot(to.x - from.x, to.y - from.y);
    const steps = Math.max(1, Math.ceil(length / 6));
    for (let step = 0; step <= steps; step += 1) {
      const x = from.x + ((to.x - from.x) * step) / steps;
      const y = from.y + ((to.y - from.y) * step) / steps;
      obstacles.push({ x: x - 7, y: y - 7, width: 14, height: 14, weight: weight });
    }
  }
}

// A diamond (a square standing on its corner) as a list of corner points.
function diamondPoints(x, y, radius) {
  return [
    x + "," + (y - radius),
    x + radius + "," + y,
    x + "," + (y + radius),
    x - radius + "," + y,
  ].join(" ");
}

// ───────────────────────── 2. The balance chart ─────────────────────────

export function renderBalanceChart(container, data) {
  const state = getState(balanceChartStates, container);
  state.data = data;

  clear(container);
  // Nothing sensible to draw without the 12 rows and the low point.
  if (!data || !data.lowPoint || !Array.isArray(data.table) || data.table.length === 0) return;

  const holder = el("div", { className: "balance-chart__plot" });
  state.holder = holder;

  const figure = el("figure", { className: "balance-chart__figure" }, [
    holder,
    buildBalanceLegend(state),
    buildServicerWords(data.servicerLine),
  ]);

  const root = el("div", { className: "balance-chart" }, [figure, buildBalanceTable(data)]);

  // The box has to be on the page before we can measure how wide it is.
  container.append(root);

  drawBalanceSvg(state);
  watchWidth(state, drawBalanceSvg);
}

function drawBalanceSvg(state) {
  const width = measureWidth(state.holder);
  const built = buildBalanceSvg(state, width);
  clear(state.holder);
  state.holder.append(built.svg);
  drawLabels(built.svg, state.data, built.scene);
  rememberDrawnWidth(state, width);
}

// ── Scales and layout ──

// Every dollar figure the chart must be able to show. Zero is always in the
// list, so the zero line is always inside the picture.
function collectBalanceValues(data) {
  const values = [0, safeCents(data.startingBalanceCents), safeCents(data.cushionCapCents)];
  for (const row of data.table) values.push(safeCents(row.projectedBalanceCents));
  if (data.servicerLine && Array.isArray(data.servicerLine.balancesCents)) {
    for (const cents of data.servicerLine.balancesCents) values.push(safeCents(cents));
  }
  return values;
}

// Pick round gridline values: steps of 1, 2, 2.5 or 5 times a power of ten,
// and the smallest such step that needs five gridlines or fewer.
function buildYAxis(valuesCents) {
  let lowest = 0;
  let highest = 0;
  for (const value of valuesCents) {
    if (value < lowest) lowest = value;
    if (value > highest) highest = value;
  }
  // Everything is exactly zero: give the flat line $100 of room to sit in.
  if (highest === lowest) highest = lowest + 10000;

  const multipliers = [1, 2, 2.5, 5];
  let magnitude = 100; // start with $1 steps
  while (magnitude < 1e15) {
    for (const multiplier of multipliers) {
      // 2.5 x $1 would be $2.50, and axis labels are whole dollars: skip it.
      if (multiplier === 2.5 && magnitude < 1000) continue;
      const step = multiplier * magnitude;
      const min = Math.floor(lowest / step) * step;
      let max = Math.ceil(highest / step) * step;
      const lineCount = (max - min) / step + 1;
      if (lineCount <= 5) {
        if (lineCount < 3) max += step; // two lines look bare: add one more
        const ticks = [];
        for (let tick = min; tick <= max; tick += step) ticks.push(tick);
        return { minCents: min, maxCents: max, ticks: ticks };
      }
    }
    magnitude *= 10;
  }
  return { minCents: lowest, maxCents: highest, ticks: [lowest, highest] };
}

function chooseBalanceLayout(width, data) {
  const isNarrow = width < 480;
  const isWide = width >= 760;
  const fontSize = isNarrow ? 11 : 12;
  const yAxis = buildYAxis(collectBalanceValues(data));

  // The left margin is just wide enough for the longest dollar label.
  let longestLabel = 0;
  for (const tick of yAxis.ticks) {
    longestLabel = Math.max(longestLabel, estimateTextWidth(formatAxisDollars(tick), fontSize));
  }

  let height = 340;
  if (isNarrow) height = 280;
  if (isWide) height = 400;

  const layout = {
    width: width,
    height: height,
    isNarrow: isNarrow,
    fontSize: fontSize,
    markerRadius: isNarrow ? 2.5 : 3.5,
    ringRadius: isNarrow ? 7 : 9,
    plotLeft: longestLabel + 12,
    plotRight: width - (isNarrow ? 12 : 28),
    plotTop: 30,
    plotBottom: height - 34,
    minCents: yAxis.minCents,
    maxCents: yAxis.maxCents,
    ticks: yAxis.ticks,
    // A second low-point label only fits when there is room to spare.
    labelServicerLowPoint: width >= 560,
  };
  // 13 points across: "Start" plus the 12 months, so 12 gaps.
  layout.slotWidth = (layout.plotRight - layout.plotLeft) / Math.max(1, data.table.length);

  // The dollar scale normally runs all the way down to the month names. When
  // balances go below zero, the lowest point can land right on that bottom
  // edge, leaving no room for its label. In that case the scale stops a little
  // higher up (scaleBottom) and the freed strip is kept for the label.
  layout.scaleBottom = layout.plotBottom;
  if (yAxis.minCents < 0) {
    const roomForLabel = fontSize * 2 + 8 + layout.ringRadius + 8;
    const lowestY = yOfCents(layout, lowestOf(collectBalanceValues(data)));
    const room = layout.plotBottom - lowestY;
    if (room < roomForLabel) layout.scaleBottom = layout.plotBottom - (roomForLabel - room);
  }
  return layout;
}

function lowestOf(values) {
  let lowest = values[0];
  for (const value of values) {
    if (value < lowest) lowest = value;
  }
  return lowest;
}

function xOfIndex(layout, index) {
  return layout.plotLeft + index * layout.slotWidth;
}

function yOfCents(layout, cents) {
  const share = (layout.maxCents - cents) / (layout.maxCents - layout.minCents);
  // scaleBottom is not set yet while the layout is still being worked out.
  const bottom = layout.scaleBottom || layout.plotBottom;
  return layout.plotTop + share * (bottom - layout.plotTop);
}

// Index 0 is the starting balance; 1..12 are the month-end balances.
function buildPoints(layout, startCents, balancesCents) {
  const points = [{ index: 0, cents: startCents, x: xOfIndex(layout, 0), y: yOfCents(layout, startCents) }];
  for (let i = 0; i < balancesCents.length; i += 1) {
    const cents = safeCents(balancesCents[i]);
    points.push({ index: i + 1, cents: cents, x: xOfIndex(layout, i + 1), y: yOfCents(layout, cents) });
  }
  return points;
}

function pointsAttribute(points) {
  const parts = [];
  for (const point of points) parts.push(point.x.toFixed(1) + "," + point.y.toFixed(1));
  return parts.join(" ");
}

// ── The SVG itself ──

function buildBalanceSvg(state, width) {
  const data = state.data;
  const line = data.servicerLine;
  const layout = chooseBalanceLayout(width, data);
  const ids = balanceIds(state);

  const startCents = safeCents(data.startingBalanceCents);
  const federalBalances = [];
  for (const row of data.table) federalBalances.push(row.projectedBalanceCents);
  const federalPoints = buildPoints(layout, startCents, federalBalances);
  const servicerPoints = line ? buildPoints(layout, startCents, line.balancesCents || []) : [];

  const federalLow = federalPoints[data.lowPoint.month] || federalPoints[federalPoints.length - 1];
  const servicerLow = line && line.lowPoint ? servicerPoints[line.lowPoint.month] : null;
  const capY = yOfCents(layout, safeCents(data.cushionCapCents));

  const svg = svgEl("svg", {
    // "is-first-draw": the soft fade-in only plays the first time, never while
    // someone types. "is-narrow": slightly thinner lines on a phone-sized chart.
    className: "balance-chart__svg" + (state.hasDrawnBefore ? "" : " is-first-draw") + (layout.isNarrow ? " is-narrow" : ""),
    attrs: {
      role: "img",
      "aria-labelledby": ids.title + " " + ids.desc,
      width: layout.width,
      height: layout.height,
      viewBox: "0 0 " + layout.width + " " + layout.height,
      focusable: "false",
    },
  }, [
    svgEl("title", { text: "Escrow balance at the end of each month", attrs: { id: ids.title } }),
    svgEl("desc", { text: describeBalanceChart(data), attrs: { id: ids.desc } }),
    svgEl("defs", {}, [buildHatchPattern(ids.hatch, "chart-hatch-line", 45)]),
    drawGridlines(layout),
    drawArea(layout, federalPoints),
    drawSurplusBand(layout, data, ids.hatch),
    drawXAxis(layout, data),
    drawZeroLine(layout),
    drawCushionRule(layout, capY),
    svgEl("g", { className: "chart-series" }, [
      svgEl("polyline", { className: "chart-line chart-line--federal", attrs: { points: pointsAttribute(federalPoints) } }),
      line ? svgEl("polyline", { className: "chart-line chart-line--servicer", attrs: { points: pointsAttribute(servicerPoints) } }) : null,
      drawFederalMarkers(layout, federalPoints),
      line ? drawServicerMarkers(layout, servicerPoints) : null,
      line && servicerLow ? drawGapBracket(layout, line, servicerLow, capY) : null,
      svgEl("circle", { className: "chart-ring chart-ring--federal", attrs: { cx: federalLow.x, cy: federalLow.y, r: layout.ringRadius } }),
      servicerLow ? svgEl("polygon", { className: "chart-ring chart-ring--servicer", attrs: { points: diamondPoints(servicerLow.x, servicerLow.y, layout.ringRadius + 2) } }) : null,
    ]),
  ]);

  // What drawLabels needs to know about the picture it is labelling.
  const scene = {
    layout: layout,
    federalPoints: federalPoints,
    servicerPoints: servicerPoints,
    federalLow: federalLow,
    servicerLow: servicerLow,
    capY: capY,
  };
  return { svg: svg, scene: scene };
}

function balanceIds(state) {
  return {
    title: "balance-chart-title-" + state.idNumber,
    desc: "balance-chart-desc-" + state.idNumber,
    hatch: "balance-chart-hatch-" + state.idNumber,
  };
}

// One sentence or two, built from the numbers, for people who cannot see the
// picture. The full month-by-month numbers are in the table right after it.
function describeBalanceChart(data) {
  const low = data.lowPoint;
  let text = "A line chart of 12 month-end balances. By the federal math the balance is lowest in " +
    monthName(low.calendarMonth) + ", at " + formatCents(low.projectedBalanceCents) +
    ". The legal cushion limit is " + formatCents(data.cushionCapCents) + ".";
  const line = data.servicerLine;
  if (line && line.lowPoint) {
    text += " With your servicer's payment the balance is lowest in " +
      monthName(line.lowPoint.calendarMonth) + ", at " + formatCents(line.lowPoint.balanceCents) + ".";
  }
  text += " The same numbers are in the table that follows.";
  return text;
}

// A tile of slanted lines. Painted over a plain tint, it gives an area a
// texture you can tell apart without relying on color.
function buildHatchPattern(id, lineClassName, angle) {
  return svgEl("pattern", {
    attrs: { id: id, patternUnits: "userSpaceOnUse", width: 6, height: 6, patternTransform: "rotate(" + angle + ")" },
  }, [
    svgEl("line", { className: lineClassName, attrs: { x1: 0, y1: 0, x2: 0, y2: 6 } }),
  ]);
}

function drawGridlines(layout) {
  const group = svgEl("g", { attrs: { "aria-hidden": "true" } });
  for (const tick of layout.ticks) {
    const y = crisp(yOfCents(layout, tick));
    group.append(
      svgEl("line", { className: "chart-grid", attrs: { x1: layout.plotLeft, x2: layout.plotRight, y1: y, y2: y } }),
      svgEl("text", {
        className: "chart-tick-label num",
        text: formatAxisDollars(tick),
        attrs: { x: layout.plotLeft - 8, y: y, dy: "0.32em", "text-anchor": "end", "font-size": layout.fontSize },
      })
    );
  }
  return group;
}

// A faint wash between the federal line and zero. It makes "how much money is
// in the account" read as a quantity, and shows at a glance when it dips
// below zero.
function drawArea(layout, points) {
  const zeroY = yOfCents(layout, 0);
  let path = "M" + points[0].x.toFixed(1) + "," + zeroY.toFixed(1);
  for (const point of points) path += " L" + point.x.toFixed(1) + "," + point.y.toFixed(1);
  path += " L" + points[points.length - 1].x.toFixed(1) + "," + zeroY.toFixed(1) + " Z";
  return svgEl("path", { className: "chart-area", attrs: { d: path, "aria-hidden": "true" } });
}

// When even the lowest month stays above the legal cushion limit, the slab
// between the two is money held above the limit all year. Tint it and hatch it.
function hasSurplusBand(data) {
  return safeCents(data.lowPoint.projectedBalanceCents) > safeCents(data.cushionCapCents);
}

function drawSurplusBand(layout, data, hatchId) {
  if (!hasSurplusBand(data)) return null;
  const lowCents = safeCents(data.lowPoint.projectedBalanceCents);
  const capCents = safeCents(data.cushionCapCents);

  const top = yOfCents(layout, lowCents);
  const bottom = yOfCents(layout, capCents);
  const attrs = {
    x: layout.plotLeft,
    y: top,
    width: layout.plotRight - layout.plotLeft,
    height: Math.max(1, bottom - top),
  };
  return svgEl("g", { attrs: { "aria-hidden": "true" } }, [
    svgEl("rect", { className: "chart-band", attrs: attrs }),
    // The pattern is pointed at with an attribute (not from the stylesheet),
    // because a stylesheet would look for the id inside the CSS file.
    svgEl("rect", { attrs: Object.assign({ fill: "url(#" + hatchId + ")" }, attrs) }),
    svgEl("line", { className: "chart-band-edge", attrs: { x1: layout.plotLeft, x2: layout.plotRight, y1: crisp(top), y2: crisp(top) } }),
  ]);
}

function drawZeroLine(layout) {
  const y = crisp(yOfCents(layout, 0));
  return svgEl("line", { className: "chart-zero", attrs: { x1: layout.plotLeft, x2: layout.plotRight, y1: y, y2: y, "aria-hidden": "true" } });
}

function drawCushionRule(layout, capY) {
  const y = crisp(capY);
  return svgEl("line", { className: "chart-cushion", attrs: { x1: layout.plotLeft, x2: layout.plotRight, y1: y, y2: y, "aria-hidden": "true" } });
}

// Month names along the bottom, with a small tick for every month (the ruler
// look). When the slots get tight we name every second or third month.
function drawXAxis(layout, data) {
  const group = svgEl("g", { attrs: { "aria-hidden": "true" } });
  const labelWidth = estimateTextWidth("Mmm", layout.fontSize);
  let labelEvery = 1;
  if (layout.slotWidth < labelWidth + 14) labelEvery = 2;
  if (layout.slotWidth * 2 < labelWidth + 8) labelEvery = 3;

  const bottom = layout.plotBottom;
  // The ticks hang from the bottom edge. Give them a faint line to hang from
  // (when zero is at the bottom, the zero line is drawn over this one).
  group.append(svgEl("line", {
    className: "chart-grid",
    attrs: { x1: layout.plotLeft, x2: layout.plotRight, y1: crisp(bottom), y2: crisp(bottom) },
  }));
  for (let index = 0; index <= data.table.length; index += 1) {
    const x = crisp(xOfIndex(layout, index));
    const hasLabel = index % labelEvery === 0;
    group.append(svgEl("line", {
      className: "chart-axis-tick",
      attrs: { x1: x, x2: x, y1: bottom + 1, y2: bottom + (hasLabel ? 7 : 4) },
    }));
    if (!hasLabel) continue;
    const text = index === 0 ? "Start" : shortMonthName(data.table[index - 1].calendarMonth);
    group.append(svgEl("text", {
      className: "chart-tick-label",
      text: text,
      attrs: { x: x, y: bottom + 21, "text-anchor": "middle", "font-size": layout.fontSize },
    }));
  }
  return group;
}

// Federal math: round markers. The shared "Start" point gets one too.
function drawFederalMarkers(layout, points) {
  const group = svgEl("g", { attrs: { "aria-hidden": "true" } });
  for (const point of points) {
    group.append(svgEl("circle", { className: "chart-marker chart-marker--federal", attrs: { cx: point.x, cy: point.y, r: layout.markerRadius } }));
  }
  return group;
}

// Servicer's payment: diamond markers, so the two lines differ by shape and
// by dash pattern, not only by color.
function drawServicerMarkers(layout, points) {
  const group = svgEl("g", { attrs: { "aria-hidden": "true" } });
  for (const point of points) {
    if (point.index === 0) continue; // both lines share the starting balance
    group.append(svgEl("polygon", { className: "chart-marker chart-marker--servicer", attrs: { points: diamondPoints(point.x, point.y, layout.markerRadius + 1.5) } }));
  }
  return group;
}

function bracketX(layout, servicerLow) {
  const offset = layout.ringRadius + 7;
  if (servicerLow.x + offset + 6 > layout.plotRight) return servicerLow.x - offset;
  return servicerLow.x + offset;
}

// A caliper-style bracket from the cushion limit up to the servicer line's
// lowest month: the gap the engine's "held above the legal cushion" words
// (shown under the chart) are talking about.
function hasGapBracket(layout, line, servicerLow, capY) {
  if (!line || !servicerLow) return false;
  // On a phone-sized chart the bracket has no room for its number and only
  // adds clutter; the engine's words under the chart carry the figure.
  if (layout.isNarrow) return false;
  if (safeCents(line.aboveCushionCents) <= 0) return false;
  return capY - servicerLow.y >= 8; // anything smaller is too small to draw cleanly
}

function drawGapBracket(layout, line, servicerLow, capY) {
  if (!hasGapBracket(layout, line, servicerLow, capY)) return null;
  const top = servicerLow.y;
  const bottom = capY;
  // Stand just beside the point, so the bracket does not run through a marker
  // of the other line in the same month.
  const x = crisp(bracketX(layout, servicerLow));
  return svgEl("g", { attrs: { "aria-hidden": "true" } }, [
    svgEl("line", { className: "chart-bracket", attrs: { x1: x, x2: x, y1: top, y2: bottom } }),
    svgEl("line", { className: "chart-bracket", attrs: { x1: x - 4, x2: x + 4, y1: crisp(top), y2: crisp(top) } }),
    svgEl("line", { className: "chart-bracket", attrs: { x1: x - 4, x2: x + 4, y1: crisp(bottom), y2: crisp(bottom) } }),
  ]);
}

// ── Labels inside the chart ──
// These are added last, after the SVG is on the page, because only then can
// the browser tell us how wide each piece of text really is.

function drawLabels(svg, data, scene) {
  const layout = scene.layout;
  const federalLow = scene.federalLow;
  const servicerLow = scene.servicerLow;
  const capY = scene.capY;
  const line = data.servicerLine;
  const group = svgEl("g", { attrs: { "aria-hidden": "true" } });
  svg.append(group);

  // Labels may use the right-hand margin, but never the dollar labels' gutter
  // on the left or the month names along the bottom.
  const bounds = { left: layout.plotLeft + 4, right: layout.width - 2, top: 2, bottom: layout.plotBottom - 3 };

  // Everything a label should try not to sit on.
  const obstacles = [];
  addLineObstacles(obstacles, scene.federalPoints, 4);
  addLineObstacles(obstacles, scene.servicerPoints, 4);
  obstacles.push({ x: layout.plotLeft, y: capY - 3, width: layout.plotRight - layout.plotLeft, height: 6, weight: 4 });
  // The hatched band is a soft obstacle: a label may sit on it if it must,
  // but plain paper reads better.
  if (hasSurplusBand(data)) {
    const bandTop = yOfCents(layout, safeCents(data.lowPoint.projectedBalanceCents));
    obstacles.push({ x: layout.plotLeft, y: bandTop, width: layout.plotRight - layout.plotLeft, height: capY - bandTop, weight: 0.05 });
  }
  obstacles.push(ringObstacle(layout, federalLow));
  if (servicerLow) {
    obstacles.push(ringObstacle(layout, servicerLow));
    if (hasGapBracket(layout, line, servicerLow, capY)) {
      obstacles.push({ x: bracketX(layout, servicerLow) - 6, y: servicerLow.y - 2, width: 12, height: Math.max(0, capY - servicerLow.y) + 4, weight: 6 });
    }
  }

  // 1. The federal low point.
  const lowMonth = layout.isNarrow ? shortMonthName(data.lowPoint.calendarMonth) : monthName(data.lowPoint.calendarMonth);
  placePointLabel(group, layout, bounds, obstacles, federalLow, {
    title: line ? "Lowest, federal math" : "Lowest month",
    words: lowMonth,
    number: formatCents(data.lowPoint.projectedBalanceCents),
  });

  // 2. The servicer line's low point (only when there is room for it; the
  //    marker is always drawn, and the number is in the table either way).
  if (servicerLow && layout.labelServicerLowPoint) {
    placePointLabel(group, layout, bounds, obstacles, servicerLow, {
      title: "Lowest, your servicer's payment",
      words: monthName(line.lowPoint.calendarMonth),
      number: formatCents(line.lowPoint.balanceCents),
    });
  }

  // 3. The dollars the bracket measures. This is the engine's own figure
  //    (aboveCushionCents), the same one its words under the chart use.
  if (hasGapBracket(layout, line, servicerLow, capY)) {
    placeGapLabel(group, layout, bounds, obstacles, line, servicerLow, capY);
  }

  // 4. The cushion rule's own label, at whichever end has the most room.
  placeCushionLabel(group, layout, bounds, obstacles, data, capY);
}

function ringObstacle(layout, point) {
  const reach = layout.ringRadius + 3;
  return { x: point.x - reach, y: point.y - reach, width: reach * 2, height: reach * 2, weight: 8 };
}

// Ask the browser how wide a label really is, by putting a throwaway copy of
// it into the picture for a moment. While the picture is hidden the browser
// cannot say (it answers 0), and we fall back to our own estimate.
function measureLabelWidth(group, probe, fallbackWidth) {
  group.append(probe);
  let width = 0;
  try {
    width = probe.getBBox().width;
  } catch (error) {
    width = 0;
  }
  probe.remove();
  if (!width) return fallbackWidth;
  return Math.ceil(width) + 4; // + room for the soft outline around the letters
}

// A two-line label: a small grey title, then "Month $1,234.00" in bold.
function buildPointLabelText(fontSize, words, x, y, anchor) {
  return svgEl("text", { className: "chart-label", attrs: { "text-anchor": anchor, "font-size": fontSize } }, [
    svgEl("tspan", { className: "chart-label__title", text: words.title, attrs: { x: x, y: y + fontSize } }),
    svgEl("tspan", { className: "chart-label__value", attrs: { x: x, y: y + fontSize * 2 + 5, "font-size": fontSize + 1 } }, [
      words.words + " ",
      svgEl("tspan", { className: "num", text: words.number }),
    ]),
  ]);
}

function placePointLabel(group, layout, bounds, obstacles, point, words) {
  const fontSize = layout.fontSize;
  const estimate = Math.max(
    estimateTextWidth(words.title, fontSize) * 0.9,
    estimateTextWidth(words.words + " " + words.number, fontSize + 1)
  );
  const width = measureLabelWidth(group, buildPointLabelText(fontSize, words, 0, 0, "start"), estimate);
  const height = fontSize * 2 + 8;
  const gap = layout.ringRadius + 5;
  const reach = layout.ringRadius + 1;

  // Spots to try. Straight under the point comes first (a low point is a dip,
  // so the space under it is usually empty), then straight over it, then the
  // same two pushed off to one side. Each step further away costs a little
  // (extraScore), so the nearest clear spot wins. A spot that is not right
  // next to the point gets a thin leader line.
  const candidates = [];
  for (let step = 0; step < 8; step += 1) {
    const distance = gap + step * 28;
    const under = point.y + distance;
    const over = point.y - distance - height;
    const cost = step * 60;
    candidates.push(
      { anchor: "middle", x: point.x - width / 2, y: under, extraScore: cost },
      { anchor: "middle", x: point.x - width / 2, y: over, extraScore: cost },
      { anchor: "start", x: point.x - 12, y: under, extraScore: cost + 20 },
      { anchor: "end", x: point.x + 12 - width, y: under, extraScore: cost + 20 },
      { anchor: "start", x: point.x - 12, y: over, extraScore: cost + 20 },
      { anchor: "end", x: point.x + 12 - width, y: over, extraScore: cost + 20 }
    );
  }
  // Beside the point: a fair choice when under and over are both taken.
  candidates.push(
    { anchor: "start", x: point.x + gap, y: point.y + 2, extraScore: 40, isBeside: true },
    { anchor: "end", x: point.x - gap - width, y: point.y + 2, extraScore: 40, isBeside: true },
    { anchor: "start", x: point.x + gap, y: point.y - height - 2, extraScore: 40, isBeside: true },
    { anchor: "end", x: point.x - gap - width, y: point.y - height - 2, extraScore: 40, isBeside: true }
  );
  for (const candidate of candidates) {
    candidate.width = width;
    candidate.height = height;
    keepInside(candidate, bounds);
    if (!candidate.isBeside) candidate.leaderBox = leaderBoxFor(point, candidate, reach);
  }
  const box = pickBestSpot(candidates, obstacles);

  if (box.leaderBox) {
    const x = crisp(point.x);
    group.append(svgEl("line", {
      className: "chart-leader",
      attrs: { x1: x, x2: x, y1: box.leaderBox.y, y2: box.leaderBox.y + box.leaderBox.height },
    }));
  }
  group.append(buildPointLabelText(fontSize, words, anchorX(box), box.y, box.anchor));
  addLabelObstacles(obstacles, box);
}

// The thin line that joins a point to a label sitting some way under or over
// it. Returns null when the label is close enough not to need one.
function leaderBoxFor(point, box, reach) {
  const ringBottom = point.y + reach;
  const ringTop = point.y - reach;
  if (box.y > ringBottom + 8) {
    return { x: point.x - 3, y: ringBottom, width: 6, height: box.y - 1 - ringBottom };
  }
  if (box.y + box.height < ringTop - 8) {
    const labelBottom = box.y + box.height + 1;
    return { x: point.x - 3, y: labelBottom, width: 6, height: ringTop - labelBottom };
  }
  return null;
}

// Once a label has its spot, later labels must keep clear of it (with a little
// breathing room) and of its leader line.
function addLabelObstacles(obstacles, box) {
  obstacles.push({ x: box.x - 6, y: box.y - 6, width: box.width + 12, height: box.height + 12, weight: 8 });
  if (box.leaderBox) obstacles.push(Object.assign({ weight: 8 }, box.leaderBox));
}

function buildGapLabelText(fontSize, text, x, y, anchor) {
  return svgEl("text", {
    className: "chart-label chart-label--gap num",
    text: text,
    attrs: { x: x, y: y + fontSize, "text-anchor": anchor, "font-size": fontSize },
  });
}

function placeGapLabel(group, layout, bounds, obstacles, line, servicerLow, capY) {
  const fontSize = layout.fontSize;
  const text = formatCents(line.aboveCushionCents);
  const width = measureLabelWidth(group, buildGapLabelText(fontSize, text, 0, 0, "start"), estimateTextWidth(text, fontSize));
  const height = fontSize + 4;
  const x = bracketX(layout, servicerLow);
  const y = (servicerLow.y + capY) / 2 - height / 2;

  const candidates = [
    { anchor: "start", x: x + 8, y: y },
    { anchor: "end", x: x - 8 - width, y: y },
  ];
  for (const candidate of candidates) {
    candidate.width = width;
    candidate.height = height;
    keepInside(candidate, bounds);
  }
  const box = pickBestSpot(candidates, obstacles);
  // No clear spot beside the bracket: leave the number to the words under
  // the chart rather than print it on top of a line.
  if (box.score > 300) return;
  group.append(buildGapLabelText(fontSize, text, anchorX(box), box.y, box.anchor));
  addLabelObstacles(obstacles, box);
}

// The label on the cushion rule. numberText may be left out (see below).
function buildCushionLabelText(fontSize, words, numberText, x, y, anchor) {
  return svgEl("text", {
    className: "chart-label chart-label--cushion",
    attrs: { x: x, y: y + fontSize, "text-anchor": anchor, "font-size": fontSize },
  }, [
    numberText ? words + " " : words,
    numberText ? svgEl("tspan", { className: "num", text: numberText }) : null,
  ]);
}

// Find the best spot along the rule for a cushion label with these words.
function findCushionSpot(group, layout, bounds, obstacles, words, numberText, capY) {
  const fontSize = layout.fontSize;
  const estimate = estimateTextWidth(words + " " + (numberText || ""), fontSize);
  const width = measureLabelWidth(group, buildCushionLabelText(fontSize, words, numberText, 0, 0, "start"), estimate);
  const height = fontSize + 4;
  const left = layout.plotLeft + 6;
  const right = layout.plotRight - 4 - width;
  const middle = (layout.plotLeft + layout.plotRight) / 2 - width / 2;

  const candidates = [
    { anchor: "end", x: right, y: capY - 5 - height },
    { anchor: "start", x: left, y: capY - 5 - height },
    { anchor: "end", x: right, y: capY + 5 },
    { anchor: "start", x: left, y: capY + 5 },
    { anchor: "middle", x: middle, y: capY - 5 - height },
    { anchor: "middle", x: middle, y: capY + 5 },
  ];
  for (const candidate of candidates) {
    candidate.width = width;
    candidate.height = height;
    keepInside(candidate, bounds);
  }
  return pickBestSpot(candidates, obstacles);
}

// The cushion rule's label goes wherever along the rule it covers nothing.
// On a small, busy chart the full label may not fit anywhere. Then we try
// shorter wordings, and if even the shortest would sit on a line we leave the
// label out: the legend right under the chart names the dashed rule and gives
// its dollar figure, so nothing is lost.
function placeCushionLabel(group, layout, bounds, obstacles, data, capY) {
  const tooCrowded = 150;
  const wordings = [
    { words: "Legal cushion limit", numberText: formatCents(data.cushionCapCents) },
    { words: "Legal cushion limit", numberText: null },
    { words: "Cushion limit", numberText: null },
  ];
  for (const wording of wordings) {
    const box = findCushionSpot(group, layout, bounds, obstacles, wording.words, wording.numberText, capY);
    if (box.score <= tooCrowded) {
      group.append(buildCushionLabelText(layout.fontSize, wording.words, wording.numberText, anchorX(box), box.y, box.anchor));
      return;
    }
  }
}

// ── Legend (plain HTML under the chart, with the same line samples) ──

function buildBalanceLegend(state) {
  const data = state.data;
  const line = data.servicerLine;
  const ids = balanceIds(state);
  const list = el("ul", { className: "chart-legend" });

  list.append(legendItem(sampleSvg([
    svgEl("line", { className: "chart-line chart-line--federal", attrs: { x1: 1, x2: 40, y1: 7, y2: 7 } }),
    svgEl("circle", { className: "chart-marker chart-marker--federal", attrs: { cx: 20.5, cy: 7, r: 3.5 } }),
  ]), "Federal math", null));

  if (line) {
    list.append(legendItem(sampleSvg([
      svgEl("line", { className: "chart-line chart-line--servicer", attrs: { x1: 1, x2: 40, y1: 7, y2: 7 } }),
      svgEl("polygon", { className: "chart-marker chart-marker--servicer", attrs: { points: diamondPoints(20.5, 7, 5) } }),
    ]), "Your servicer's payment", null));
  }

  list.append(legendItem(sampleSvg([
    svgEl("line", { className: "chart-cushion", attrs: { x1: 1, x2: 40, y1: 7.5, y2: 7.5 } }),
  ]), "Legal cushion limit", formatCents(data.cushionCapCents)));

  list.append(legendItem(sampleSvg([
    svgEl("circle", { className: "chart-ring chart-ring--federal", attrs: { cx: line ? 11 : 20.5, cy: 7, r: 5.5 } }),
    svgEl("circle", { className: "chart-marker chart-marker--federal", attrs: { cx: line ? 11 : 20.5, cy: 7, r: 2.5 } }),
    line ? svgEl("polygon", { className: "chart-ring chart-ring--servicer", attrs: { points: diamondPoints(30, 7, 6) } }) : null,
    line ? svgEl("polygon", { className: "chart-marker chart-marker--servicer", attrs: { points: diamondPoints(30, 7, 3) } }) : null,
  ]), "Lowest month", null));

  // The hatched band is only drawn when the lowest month sits above the limit.
  // Its dollar figure is the engine's own surplus number, never worked out here.
  if (hasSurplusBand(data)) {
    const surplusCents = safeCents(data.surplusCents);
    list.append(legendItem(sampleSvg([
      svgEl("rect", { className: "chart-band", attrs: { x: 1, y: 1, width: 39, height: 12 } }),
      svgEl("rect", { attrs: { x: 1, y: 1, width: 39, height: 12, fill: "url(#" + ids.hatch + ")" } }),
    ]), line ? "Held above the cushion limit, federal math" : "Held above the cushion limit", surplusCents > 0 ? formatCents(surplusCents) : null));
  }
  return list;
}

function sampleSvg(children) {
  return svgEl("svg", {
    className: "chart-legend__sample",
    attrs: { width: 41, height: 14, viewBox: "0 0 41 14", "aria-hidden": "true", focusable: "false" },
  }, children);
}

function legendItem(sample, name, amountText) {
  return el("li", { className: "chart-legend__item" }, [
    sample,
    el("span", {}, [
      name,
      amountText ? " " : null,
      amountText ? el("span", { className: "num", text: amountText }) : null,
    ]),
  ]);
}

// The engine's own words about the servicer line: the short label (the
// "held above the legal cushion" figure) and the sentence that explains it.
function buildServicerWords(line) {
  if (!line) return null;
  const hasLabel = Boolean(line.label);
  const hasSentence = Boolean(line.sentence);
  if (!hasLabel && !hasSentence) return null;
  return el("figcaption", { className: "chart-servicer" }, [
    hasLabel ? el("p", { className: "chart-servicer__label" }, [
      sampleSvg([
        svgEl("line", { className: "chart-line chart-line--servicer", attrs: { x1: 1, x2: 40, y1: 7, y2: 7 } }),
        svgEl("polygon", { className: "chart-marker chart-marker--servicer", attrs: { points: diamondPoints(20.5, 7, 5) } }),
      ]),
      el("span", { text: line.label }),
    ]) : null,
    hasSentence ? el("p", { className: "chart-servicer__sentence", text: line.sentence }) : null,
  ]);
}

// ── The same numbers as a real table ──

function buildBalanceTable(data) {
  const line = data.servicerLine;
  const startText = formatCents(safeCents(data.startingBalanceCents));

  const headRow = el("tr", {}, [
    el("th", { text: "Month", attrs: { scope: "col" } }),
    el("th", { className: "balance-table__numhead", text: "Paid in", attrs: { scope: "col" } }),
    el("th", { className: "balance-table__numhead", text: "Bills paid out", attrs: { scope: "col" } }),
    el("th", { className: "balance-table__numhead", text: "Balance by the federal math", attrs: { scope: "col" } }),
    line ? el("th", { className: "balance-table__numhead", text: "Balance with your servicer's payment", attrs: { scope: "col" } }) : null,
  ]);

  const body = el("tbody");
  body.append(el("tr", {}, [
    el("th", { text: "Starting balance", attrs: { scope: "row" } }),
    el("td", { className: "num" }),
    el("td", { className: "num" }),
    el("td", { className: "num", text: startText }),
    line ? el("td", { className: "num", text: startText }) : null,
  ]));

  for (let i = 0; i < data.table.length; i += 1) {
    const row = data.table[i];
    const isFederalLow = row.month === data.lowPoint.month;
    const isServicerLow = Boolean(line && line.lowPoint && row.month === line.lowPoint.month);
    const servicerCents = line && Array.isArray(line.balancesCents) ? line.balancesCents[i] : 0;

    body.append(el("tr", { className: isFederalLow || isServicerLow ? "is-low-month" : "" }, [
      el("th", { text: monthName(row.calendarMonth), attrs: { scope: "row" } }),
      el("td", { className: "num", text: formatCents(safeCents(row.depositCents)) }),
      el("td", { className: "num", text: formatCents(safeCents(row.disbursementCents)) }),
      balanceCell(row.projectedBalanceCents, isFederalLow),
      line ? balanceCell(servicerCents, isServicerLow) : null,
    ]));
  }

  // Kept short on purpose: on a phone the table scrolls sideways inside its
  // box, and a long caption would be cut off at the box's edge.
  const caption = el("caption", { text: "The chart's numbers, month by month" });

  const table = el("table", { className: "data-table balance-table" }, [
    caption,
    el("thead", {}, [headRow]),
    body,
  ]);

  return scrollRegion("Your escrow balance month by month, as a table", [table]);
}

// A balance cell. The lowest month is marked with words, not only a tint.
function balanceCell(cents, isLowest) {
  return el("td", { className: "num" }, [
    formatCents(safeCents(cents)),
    isLowest ? el("span", { className: "balance-table__tag", text: "lowest month" }) : null,
  ]);
}

// ───────────────────────── 3. The "why did it jump?" bar ─────────────────────────

// Each part of the jump keeps the same texture for as long as it keeps its
// place in the engine's list, so a block does not change its look while
// someone is typing.
// ("cross" is a fourth texture, kept for the part the math cannot explain.)
const PART_TEXTURES = ["forward", "dots", "back"];

export function renderJumpBar(container, jump) {
  const state = getState(jumpBarStates, container);
  state.data = jump;

  clear(container);
  if (!jump) return;

  // The print stylesheet hides ".jump-bar" (the picture) and keeps the text list.
  const holder = el("div", { className: "jump-bar" });
  state.holder = holder;

  const root = el("div", { className: "jump" }, [
    buildJumpHeader(jump),
    holder,
    buildJumpKey(state),
    jump.note ? el("p", { className: "jump__note", text: jump.note }) : null,
  ]);
  container.append(root);

  drawJumpSvg(state);
  watchWidth(state, drawJumpSvg);
}

function drawJumpSvg(state) {
  const width = measureWidth(state.holder);
  const svg = buildJumpSvg(state, width);
  clear(state.holder);
  state.holder.append(svg);
  rememberDrawnWidth(state, width);
}

function jumpParts(jump) {
  return Array.isArray(jump.parts) ? jump.parts : [];
}

// The engine's word for "we could not explain this bit" gets the amber
// look-here texture; every other part takes the next texture in the list.
function textureForPart(part, position) {
  const key = String(part.key || "").toLowerCase();
  if (key.includes("unexplained") || key.includes("remainder")) return "cross";
  return PART_TEXTURES[position % PART_TEXTURES.length];
}

function jumpPatternId(state, texture) {
  return "jump-" + texture + "-" + state.idNumber;
}

function buildJumpHeader(jump) {
  return el("p", { className: "jump__header" }, [
    el("span", { className: "jump__figure" }, [
      el("span", { className: "jump__caption", text: "Old payment" }),
      el("span", { className: "jump__amount num", text: formatCents(safeCents(jump.oldCents)) }),
    ]),
    el("span", { className: "jump__arrow", text: "→", attrs: { "aria-hidden": "true" } }),
    el("span", { className: "visually-hidden", text: " changed to " }),
    el("span", { className: "jump__figure" }, [
      el("span", { className: "jump__caption", text: "New payment" }),
      el("span", { className: "jump__amount num", text: formatCents(safeCents(jump.newCents)) }),
    ]),
  ]);
}

// The blocks of the bar: the old payment first, then one block for every part
// that ADDS to the payment. A part that lowers the payment cannot be a block
// (a block cannot have a negative width), so it only appears in the key.
function buildJumpBlocks(jump) {
  const blocks = [];
  const oldCents = Math.max(0, safeCents(jump.oldCents));
  if (oldCents > 0) blocks.push({ texture: "old", cents: oldCents });

  const parts = jumpParts(jump);
  for (let i = 0; i < parts.length; i += 1) {
    const cents = safeCents(parts[i].cents);
    if (cents > 0) blocks.push({ texture: textureForPart(parts[i], i), cents: cents });
  }
  return blocks;
}

function buildJumpSvg(state, width) {
  const jump = state.data;
  const oldCents = Math.max(0, safeCents(jump.oldCents));
  const newCents = Math.max(0, safeCents(jump.newCents));
  const blocks = buildJumpBlocks(jump);

  let stackedCents = 0;
  for (const block of blocks) stackedCents += block.cents;
  // The bar's full length stands for the biggest figure we need to show.
  // Never zero, so we never divide by zero.
  const fullCents = Math.max(stackedCents, oldCents, newCents, 1);

  const barTop = 22;
  const barHeight = 24;
  const height = barTop + barHeight + 24;
  const ids = { title: "jump-title-" + state.idNumber, desc: "jump-desc-" + state.idNumber };

  const svg = svgEl("svg", {
    className: "jump__svg",
    attrs: {
      role: "img",
      "aria-labelledby": ids.title + " " + ids.desc,
      width: width,
      height: height,
      viewBox: "0 0 " + width + " " + height,
      focusable: "false",
    },
  }, [
    svgEl("title", { text: "How the payment changed", attrs: { id: ids.title } }),
    svgEl("desc", {
      text: "A bar showing the payment going from " + formatCents(oldCents) + " to " + formatCents(newCents) +
        ". Each part is listed with its amount right after the bar.",
      attrs: { id: ids.desc },
    }),
    buildJumpPatterns(state),
    svgEl("rect", { className: "jump-track", attrs: { x: 0, y: barTop, width: width, height: barHeight } }),
  ]);

  // Blocks, left to right, with a 2px gap of background between neighbors.
  const widths = fitBlockWidths(blocks, width, fullCents);
  let x = 0;
  for (let i = 0; i < blocks.length; i += 1) {
    const blockWidth = Math.max(1, widths[i] - 2);
    svg.append(drawJumpBlock(state, blocks[i].texture, x, barTop, blockWidth, barHeight));
    x += widths[i];
  }

  // Two markers: where the old payment ends (named above the bar) and where
  // the new payment ends (named under it). They can never bump into each other.
  svg.append(drawJumpMarker(width, (oldCents / fullCents) * width, barTop, barHeight, "Old", formatCents(oldCents), true));
  svg.append(drawJumpMarker(width, (newCents / fullCents) * width, barTop, barHeight, "New", formatCents(newCents), false));
  return svg;
}

// Turn cents into pixel widths. A very small part would vanish (under 1px),
// so every block gets at least 4px and the widest block gives up the difference.
function fitBlockWidths(blocks, width, fullCents) {
  const widths = [];
  let widestIndex = 0;
  let borrowed = 0;
  for (let i = 0; i < blocks.length; i += 1) {
    let blockWidth = (blocks[i].cents / fullCents) * width;
    if (blockWidth < 4) {
      borrowed += 4 - blockWidth;
      blockWidth = 4;
    }
    widths.push(blockWidth);
    if (blockWidth > widths[widestIndex]) widestIndex = i;
  }
  if (widths.length > 0 && widths[widestIndex] - borrowed > 4) widths[widestIndex] -= borrowed;
  return widths;
}

function buildJumpPatterns(state) {
  return svgEl("defs", {}, [
    buildHatchPattern(jumpPatternId(state, "forward"), "jump-pattern-line", 45),
    buildHatchPattern(jumpPatternId(state, "back"), "jump-pattern-line", -45),
    svgEl("pattern", { attrs: { id: jumpPatternId(state, "dots"), patternUnits: "userSpaceOnUse", width: 6, height: 6 } }, [
      svgEl("circle", { className: "jump-pattern-dot", attrs: { cx: 3, cy: 3, r: 1.2 } }),
    ]),
    svgEl("pattern", { attrs: { id: jumpPatternId(state, "cross"), patternUnits: "userSpaceOnUse", width: 6, height: 6, patternTransform: "rotate(45)" } }, [
      svgEl("line", { className: "jump-pattern-line jump-pattern-line--on-mark", attrs: { x1: 0, y1: 0, x2: 0, y2: 6 } }),
      svgEl("line", { className: "jump-pattern-line jump-pattern-line--on-mark", attrs: { x1: 0, y1: 0, x2: 6, y2: 0 } }),
    ]),
  ]);
}

// One block = a plain colored rectangle, plus (for every part that is not the
// old payment) the same rectangle again filled with its texture.
function drawJumpBlock(state, texture, x, y, width, height) {
  const attrs = { x: x.toFixed(1), y: y, width: width.toFixed(1), height: height };
  const group = svgEl("g", { attrs: { "aria-hidden": "true" } }, [
    svgEl("rect", { className: "jump-block jump-block--" + texture, attrs: attrs }),
  ]);
  if (texture !== "old") {
    group.append(svgEl("rect", { attrs: Object.assign({ fill: "url(#" + jumpPatternId(state, texture) + ")" }, attrs) }));
  }
  return group;
}

function drawJumpMarker(width, x, barTop, barHeight, name, amountText, isAbove) {
  const lineX = Math.min(width - 0.5, Math.max(0.5, crisp(x - 1)));
  // Text grows away from the nearest edge, so it never runs off the picture.
  const anchor = x > width / 2 ? "end" : "start";
  const textX = anchor === "end" ? Math.min(width, x) : Math.max(0, x);
  const y1 = isAbove ? barTop - 6 : barTop + barHeight;
  const y2 = isAbove ? barTop : barTop + barHeight + 6;
  const textY = isAbove ? barTop - 9 : barTop + barHeight + 19;

  return svgEl("g", { attrs: { "aria-hidden": "true" } }, [
    svgEl("line", { className: "jump-marker", attrs: { x1: lineX, x2: lineX, y1: y1, y2: y2 } }),
    svgEl("text", { className: "jump-marker-label", attrs: { x: textX, y: textY, "text-anchor": anchor, "font-size": 12 } }, [
      name + " ",
      svgEl("tspan", { className: "num", text: amountText }),
    ]),
  ]);
}

// ── The key under the bar: every part, its dollars, the engine's sentence ──
// Amounts are printed by formatCents exactly as the engine gave them (it writes
// a real minus sign for a drop). We never flip a sign here.

function buildJumpKey(state) {
  const jump = state.data;
  const list = el("ul", { className: "jump__parts" });

  list.append(el("li", { className: "jump-part" }, [
    jumpSwatch(state, "old"),
    el("div", { className: "jump-part__text" }, [
      el("p", { className: "jump-part__head" }, [
        el("span", { className: "jump-part__label", text: "Old payment" }),
        el("span", { className: "jump-part__amount num", text: formatCents(safeCents(jump.oldCents)) }),
      ]),
    ]),
  ]));

  const parts = jumpParts(jump);
  for (let i = 0; i < parts.length; i += 1) {
    const part = parts[i];
    const cents = safeCents(part.cents);

    let swatch = jumpSwatch(state, "none");
    if (cents > 0) swatch = jumpSwatch(state, textureForPart(part, i));
    if (cents < 0) swatch = jumpSwatch(state, "minus");

    list.append(el("li", { className: "jump-part" }, [
      swatch,
      el("div", { className: "jump-part__text" }, [
        el("p", { className: "jump-part__head" }, [
          el("span", { className: "jump-part__label", text: part.label }),
          el("span", { className: "jump-part__amount num", text: formatCents(cents) }),
        ]),
        part.sentence ? el("p", { className: "jump-part__sentence", text: part.sentence }) : null,
        cents < 0 ? el("p", { className: "jump-part__aside", text: "This lowers the payment, so it has no block in the bar." }) : null,
      ]),
    ]));
  }
  return list;
}

// The little square in the key that matches a block in the bar.
//   "old"    plain fill          "minus"  an empty box with a minus sign
//   "none"   an empty box        anything else = that texture
function jumpSwatch(state, texture) {
  const box = { x: 1, y: 1, width: 16, height: 16 };
  const children = [];
  if (texture === "none" || texture === "minus") {
    children.push(svgEl("rect", { className: "jump-swatch-empty", attrs: box }));
    if (texture === "minus") {
      children.push(svgEl("line", { className: "jump-swatch-minus", attrs: { x1: 5, x2: 13, y1: 9, y2: 9 } }));
    }
  } else {
    children.push(svgEl("rect", { className: "jump-block jump-block--" + texture, attrs: box }));
    if (texture !== "old") {
      children.push(svgEl("rect", { attrs: Object.assign({ fill: "url(#" + jumpPatternId(state, texture) + ")" }, box) }));
    }
  }
  return svgEl("svg", {
    className: "jump-part__swatch",
    attrs: { width: 18, height: 18, viewBox: "0 0 18 18", "aria-hidden": "true", focusable: "false" },
  }, children);
}
