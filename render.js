// render.js — draws the results. It never does math and never writes its own
// math sentences: every verdict, flag, step, next step and letter line comes
// from the engine (through pipeline.js) and is placed on the page as plain text.
// This file only decides WHERE things go and adds short labels around them.

import { el, svgEl, clear } from "./dom.js";
import { formatCents, MONTH_NAMES } from "./engine/index.js";
import { renderBalanceChart, renderJumpBar } from "./chart.js";

function byId(id) {
  return document.getElementById(id);
}

function monthName(calendarMonth) {
  return MONTH_NAMES[calendarMonth - 1] || "";
}

// ─────────────────────────── icons ───────────────────────────
// Small line icons built as SVG nodes (no icon font, no images).

const ICON_PATHS = {
  check: ["M5 12.5l4.5 4.5L19 7.5"],
  info: ["M12 11v6", "M12 7.2v.1"],
  // A flag on a pole: "look here".
  flag: ["M6 21V4", "M6 5h11l-2.5 4 2.5 4H6"],
  // Up arrow: the payment rises.
  up: ["M12 19V6", "M6 11.5L12 5.5l6 6"],
  // Balance below zero.
  below: ["M4 9h16", "M12 11v8", "M7.5 15l4.5 4.5 4.5-4.5"],
  differs: ["M5 9h14", "M5 15h14", "M15 5L9 19"],
  // A level balance beam: "too close to call".
  scale: ["M12 5v14", "M5 8h14", "M8 19h8", "M5 8l-2 5h4z", "M19 8l-2 5h4z"],
};

function icon(name) {
  const paths = ICON_PATHS[name] || ICON_PATHS.info;
  const children = [];
  for (const d of paths) {
    children.push(svgEl("path", { attrs: { d: d } }));
  }
  return svgEl(
    "svg",
    {
      attrs: {
        viewBox: "0 0 24 24",
        fill: "none",
        stroke: "currentColor",
        "stroke-width": "2.6",
        "stroke-linecap": "round",
        "stroke-linejoin": "round",
        "aria-hidden": "true",
        focusable: "false",
      },
    },
    children
  );
}

// SPEC E3: when a result sits within $7 of a legal line (the $50 refund line, or
// one month's payment), the engine sets result.nearLine and softens its words.
// The page must then stay calm too: teal "info" styling, never the amber
// "refund required" look, and no refund date. The ONLY test is whether the
// engine set nearLine. "Near" is never worked out again here.
export function isTooCloseToCall(check) {
  if (!check.result) return false;
  const nearLine = check.result.nearLine;
  return nearLine !== null && nearLine !== undefined;
}

// The banner's look comes from the verdict the engine wrote (its tone), never
// from the classification string on its own.
function verdictTone(check) {
  if (isTooCloseToCall(check)) return "info";
  const tone = check.verdict.tone;
  if (tone === "clear" || tone === "flag") return tone;
  return "info";
}

// Which picture goes in the verdict circle. The words next to it carry the
// meaning; the picture only backs them up (never color or shape alone).
// Unknown classification strings fall through to a sensible default.
function verdictIconName(check) {
  const classification = String(check.result.classification || "");
  if (isTooCloseToCall(check)) return "scale";
  const tone = verdictTone(check);
  if (tone === "clear") return "check";
  if (tone === "info") return "info";
  if (check.comparison.flags.length > 0) return "flag";
  if (classification.startsWith("DEFICIENCY")) return "below";
  if (classification.startsWith("SHORTAGE")) return "up";
  return "flag";
}

// ─────────────────────────── verdict ───────────────────────────

// The one big dollar figure in the banner, with a two-or-three-word caption.
function verdictFigure(check) {
  const result = check.result;
  const flags = check.comparison.flags;

  if (flags.length > 0) {
    let biggest = 0;
    let isPerYear = false;
    for (const flag of flags) {
      const perYear = typeof flag.perYearCents === "number";
      const size = Math.abs(perYear ? flag.perYearCents : flag.amountCents || 0);
      if (size > biggest) {
        biggest = size;
        isPerYear = perYear;
      }
    }
    if (biggest > 0) {
      return { cents: biggest, caption: isPerYear ? "a year · biggest gap found" : "biggest gap found" };
    }
  }

  const classification = String(result.classification || "");
  if (classification.startsWith("SURPLUS")) {
    return { cents: result.surplusCents, caption: "surplus" };
  }
  if (classification.startsWith("DEFICIENCY")) {
    if (result.shortageCents > 0) {
      return { cents: result.deficiencyCents + result.shortageCents, caption: "deficiency + shortage" };
    }
    return { cents: result.deficiencyCents, caption: "deficiency" };
  }
  if (classification.startsWith("SHORTAGE")) {
    return { cents: result.shortageCents, caption: "shortage" };
  }
  return { cents: 0, caption: "no shortage, no surplus" };
}

function renderVerdict(check) {
  const verdict = check.verdict;
  const box = byId("verdict");
  const tone = verdictTone(check);
  let toneClass = "verdict--info";
  if (tone === "clear") toneClass = "verdict--clear";
  if (tone === "flag") toneClass = "verdict--flag";
  if (isTooCloseToCall(check)) toneClass = toneClass + " verdict--close";
  box.setAttribute("class", "verdict " + toneClass);

  const mark = byId("verdict-mark");
  clear(mark);
  mark.append(icon(verdictIconName(check)));

  byId("verdict-label").textContent = verdict.label;
  const heading = byId("verdict-heading");
  heading.textContent = verdict.headline;
  // A long headline gets a slightly smaller size so the banner stays compact.
  heading.classList.toggle("is-long", String(verdict.headline).length > 70);
  byId("verdict-body").textContent = verdict.body;

  const figure = verdictFigure(check);
  const figureBox = byId("verdict-figure");
  clear(figureBox);
  figureBox.append(
    el("span", { className: "verdict-figure-number", text: formatCents(figure.cents) }),
    el("span", { className: "verdict-figure-caption", text: figure.caption })
  );
}

// ─────────────────────────── refund clock + nudges ───────────────────────────

function renderRefundClock(check) {
  const box = byId("refund-clock");
  clear(box);
  if (!check.refund || isTooCloseToCall(check)) {
    box.hidden = true;
    return;
  }
  box.hidden = false;
  box.append(
    el("span", { className: "eyebrow", text: "Refund due by" }),
    el("span", { className: "refund-date", text: check.refund.display }),
    el("span", {
      className: "small muted",
      text: "30 days after the analysis date you typed. The rule: 12 CFR 1024.17(f)(2)(i).",
    })
  );
}

// Soft warnings from the engine ("this looks like a whole mortgage payment").
// fieldToId turns the engine's field name into the id of the box it is about.
function renderNudges(check, fieldToId) {
  const box = byId("nudges");
  clear(box);
  if (check.warnings.length === 0) {
    box.hidden = true;
    return;
  }
  box.hidden = false;
  const list = el("ul");
  for (const warning of check.warnings) {
    const item = el("li", { text: warning.message + " " });
    const targetId = fieldToId ? fieldToId(warning.field) : "";
    if (targetId) {
      item.append(el("a", { text: "Go to that box", attrs: { href: "#" + targetId } }));
    }
    list.append(item);
  }
  box.append(el("p", { className: "nudges-title", text: "Worth a second look before you rely on this" }), list);
}

// ─────────────────────────── the three numbers ───────────────────────────

function bigNumber(label, cents, note) {
  return el("div", { className: "big-number" }, [
    el("span", { className: "eyebrow", text: label }),
    el("span", { className: "big-number-figure", text: formatCents(cents) }),
    el("p", { className: "big-number-note", text: note }),
  ]);
}

function cushionNote(cushionMonths) {
  if (cushionMonths === 2) return "One sixth of the year’s bills. That is the same as 2 months of escrow payments.";
  if (cushionMonths === 1) return "One month of escrow payments, because a 1-month cushion was picked.";
  return "No cushion, because “no cushion” was picked.";
}

function renderThreeNumbers(check) {
  const result = check.result;
  const box = byId("three-numbers");
  clear(box);
  box.append(
    bigNumber(
      "Your bills for the year",
      result.annualDisbursementsCents,
      "Divided by 12, that is " + formatCents(result.baseMonthlyPaymentCents) + " a month."
    ),
    bigNumber("The most cushion the law allows", result.cushionCapCents, cushionNote(check.account.cushionMonths)),
    bigNumber(
      "Your lowest projected balance",
      result.lowPoint.projectedBalanceCents,
      "In " + monthName(result.lowPoint.calendarMonth) + ", by the federal math."
    )
  );
}

// ─────────────────────────── statement vs federal math ───────────────────────────

const STATUS_WORDS = {
  match: { text: "Matches", iconName: "check" },
  differs: { text: "Differs", iconName: "differs" },
  "over-limit": { text: "Over the limit", iconName: "flag" },
};

const FLAG_TAGS = {
  CUSHION_OVER_CAP: "Cushion above the limit",
  PAYMENT_ABOVE_MAX: "Payment above the federal math",
  AMOUNT_DIFFERS: "The amounts differ",
  KIND_DIFFERS: "A different conclusion",
  SPREAD_TOO_SHORT: "Repaid over too few months",
  LUMP_SUM_OFFERED: "A question to ask",
};

function moneyCell(cents) {
  const hasValue = typeof cents === "number";
  return el("td", { className: "num", text: hasValue ? formatCents(cents) : "—" });
}

function statusChip(status) {
  const words = STATUS_WORDS[status] || { text: String(status), iconName: "info" };
  return el("span", { className: "status status--" + status }, [icon(words.iconName), words.text]);
}

function renderCompare(check) {
  const comparison = check.comparison;
  const box = byId("compare-body");
  clear(box);

  if (!comparison.provided || comparison.rows.length === 0) {
    box.append(
      el("p", {
        className: "block-lede",
        text: "Nothing from your statement’s summary was typed in, so there is nothing to put side by side yet. Fill in Part 1 and Part 3 of the form and this table will compare your statement with the federal math, line by line.",
      })
    );
    return;
  }

  const head = el("thead", {}, [
    el("tr", {}, [
      el("th", { text: "Line", attrs: { scope: "col" } }),
      el("th", { className: "num", text: "Your statement says", attrs: { scope: "col" } }),
      el("th", { className: "num", text: "The federal math says", attrs: { scope: "col" } }),
      el("th", { className: "num", text: "Gap", attrs: { scope: "col" } }),
      el("th", { text: "Result", attrs: { scope: "col" } }),
    ]),
  ]);
  const body = el("tbody");
  for (const row of comparison.rows) {
    const rowHead = el("th", { attrs: { scope: "row" } }, [el("span", { className: "row-label", text: row.label })]);
    if (row.note) rowHead.append(el("span", { className: "row-note", text: row.note }));
    body.append(
      el("tr", {}, [
        rowHead,
        moneyCell(row.statementCents),
        moneyCell(row.federalCents),
        moneyCell(row.gapCents),
        el("td", {}, [statusChip(row.status)]),
      ])
    );
  }
  const table = el("table", { className: "data-table compare-table" }, [
    el("caption", { text: "Only the lines you typed are compared. Small rounding gaps count as a match." }),
    head,
    body,
  ]);
  box.append(
    el(
      "div",
      {
        className: "table-scroll",
        attrs: { tabindex: "0", role: "region", "aria-label": "Your statement compared with the federal math" },
      },
      [table]
    )
  );

  if (comparison.flags.length > 0) {
    const list = el("ul", { className: "flag-list" });
    for (const flag of comparison.flags) {
      const head = el("div", { className: "flag-card-head" }, [
        el("span", { className: "flag-card-tag", text: FLAG_TAGS[flag.kind] || "Look here" }),
      ]);
      if (typeof flag.amountCents === "number" && flag.amountCents !== 0) {
        head.append(el("span", { className: "flag-card-amount", text: formatCents(flag.amountCents) }));
      }
      const card = el("li", { className: "flag-card" }, [head, el("p", { text: flag.sentence })]);
      // Most flag sentences already end with their cite; only add it when missing.
      if (flag.cite && !String(flag.sentence).includes(flag.cite)) {
        card.append(el("p", { className: "cite", text: "Source: " + flag.cite }));
      }
      list.append(card);
    }
    box.append(list);
    box.append(
      el("p", {
        className: "block-note",
        text: "A gap is a question to ask, not proof of a mistake. Your servicer may have a newer tax bill or insurance premium than the numbers typed here.",
      })
    );
  }
}

// ─────────────────────────── chart + jump ───────────────────────────

function renderChartBlock(check) {
  const result = check.result;
  renderBalanceChart(byId("chart-body"), {
    startingBalanceCents: check.account.startingBalanceCents,
    table: result.table,
    cushionCapCents: result.cushionCapCents,
    lowPoint: result.lowPoint,
    surplusCents: result.surplusCents,
    shortageCents: result.shortageCents,
    deficiencyCents: result.deficiencyCents,
    servicerLine: check.servicerLine,
  });
}

function renderJumpBlock(check) {
  const section = byId("sec-jump");
  const box = byId("jump-body");
  if (!check.jump) {
    // Needs both the current and the new payment. Say so instead of hiding it,
    // because "why did it jump?" is the question most people arrive with.
    clear(box);
    box.append(
      el("p", {
        className: "block-lede",
        text: "Type both your current and your new monthly escrow payment in Part 1, and this section will split the change into its causes: bills going up, a shortage being repaid, and anything the math can’t explain.",
      })
    );
    section.setAttribute("class", "result-block is-empty");
    return;
  }
  section.setAttribute("class", "result-block");
  renderJumpBar(box, check.jump);
}

// ─────────────────────────── your lawful payment ───────────────────────────

function receiptRow(label, cents, isTotal) {
  return el("div", { className: isTotal ? "receipt-row is-total" : "receipt-row" }, [
    el("dt", { text: label }),
    el("dd", { text: formatCents(cents) }),
  ]);
}

function renderPayment(check) {
  const result = check.result;
  const payment = result.newMonthlyEscrowPayment;
  const box = byId("payment-body");
  clear(box);

  const hasShortage = payment.shortageSpreadOver12Cents > 0;
  // SPEC E2: when the borrower is not current the rule sets no deficiency
  // schedule. The engine then reports 0 months, and no schedule row is shown.
  const hasDeficiency = payment.deficiencySpreadCents > 0 && payment.deficiencySpreadMonths > 0;

  const spreadRows = el("dl", { className: "receipt-rows" });
  spreadRows.append(receiptRow("Base payment: the year’s bills ÷ 12", payment.baseMonthlyCents, false));
  if (hasShortage) {
    spreadRows.append(receiptRow("Shortage, spread over 12 months", payment.shortageSpreadOver12Cents, false));
  }
  if (hasDeficiency) {
    spreadRows.append(
      receiptRow(
        "Deficiency, spread over " + payment.deficiencySpreadMonths + " months",
        payment.deficiencySpreadCents,
        false
      )
    );
  }
  spreadRows.append(
    receiptRow("Monthly escrow payment", payment.monthlyEscrowWhileRepayingDeficiencyCents, true)
  );

  let firstTitle = "By the federal math";
  if (hasShortage || hasDeficiency) firstTitle = "If the amount owed is spread out";
  const receipts = el("div", { className: "receipts" }, [
    el("div", { className: "receipt" }, [el("h4", { className: "receipt-title", text: firstTitle }), spreadRows]),
  ]);

  if (hasDeficiency && payment.monthlyEscrowAfterDeficiencyRepaidCents !== payment.monthlyEscrowWhileRepayingDeficiencyCents) {
    receipts.append(
      el("div", { className: "receipt" }, [
        el("h4", { className: "receipt-title", text: "After the deficiency is repaid" }),
        el("dl", { className: "receipt-rows" }, [
          receiptRow("Monthly escrow payment", payment.monthlyEscrowAfterDeficiencyRepaidCents, true),
        ]),
      ])
    );
  }

  if (hasShortage || hasDeficiency) {
    receipts.append(
      el("div", { className: "receipt" }, [
        el("h4", { className: "receipt-title", text: "If you pay the amount owed in one lump sum" }),
        el("dl", { className: "receipt-rows" }, [
          receiptRow("Base payment: the year’s bills ÷ 12", payment.baseMonthlyCents, false),
          receiptRow("Monthly escrow payment", payment.baseMonthlyCents, true),
        ]),
      ])
    );
  }
  box.append(receipts);

  if (result.servicerOptions.length > 0) {
    const options = el("ul", { className: "tips options-list" });
    for (const option of result.servicerOptions) {
      options.append(el("li", { text: option }));
    }
    box.append(
      el("p", { className: "block-note", text: "What a servicer may do here (" + result.cite + "):" }),
      options
    );
  }
  box.append(
    el("p", {
      className: "block-note",
      text: "This is only the escrow part. Your principal and interest are separate and are not checked here.",
    })
  );
}

// ─────────────────────────── show the math ───────────────────────────

function renderSteps(check) {
  const box = byId("steps-body");
  // Keep whichever steps the visitor had open, so live edits don't slam them shut.
  const openBefore = [];
  for (const old of box.querySelectorAll("details.step")) {
    openBefore.push(old.open);
  }
  clear(box);

  check.steps.forEach(function (step, index) {
    // The engine titles its steps "Step 1. Add up next year's bills". The
    // "Step 1" part is shown as a small label and the rest as the title. The
    // words themselves are not changed.
    let numberText = "";
    let titleText = String(step.title);
    const dotAt = titleText.indexOf(". ");
    if (titleText.startsWith("Step ") && dotAt > 0 && dotAt < 10) {
      numberText = titleText.slice(0, dotAt);
      titleText = titleText.slice(dotAt + 2);
    }
    const summary = el("summary", {}, [
      el("span", { className: "step-number", text: numberText }),
      el("span", { className: "step-title", text: titleText }),
      el("span", { className: "step-toggle", attrs: { "aria-hidden": "true" } }, [
        el("span", { className: "step-toggle-open", text: "Show" }),
        el("span", { className: "step-toggle-close", text: "Hide" }),
      ]),
    ]);
    const body = el("div", { className: "step-body" }, [el("p", { text: step.plain })]);
    if (step.math) body.append(el("pre", { className: "step-math", text: step.math }));
    const citeLine = el("p", { className: "cite" }, ["Source: "]);
    if (step.url) {
      citeLine.append(el("a", { text: step.cite, attrs: { href: step.url, rel: "noopener noreferrer" } }));
    } else {
      citeLine.append(step.cite || "");
    }
    body.append(citeLine);

    const details = el("details", { className: "step" }, [summary, body]);
    if (openBefore[index] === true) details.open = true;
    box.append(details);
  });
}

// ─────────────────────────── what you can do next ───────────────────────────

function renderNext(check) {
  const box = byId("next-body");
  clear(box);
  const list = el("ol", { className: "next-list" });
  for (const step of check.next) {
    const item = el("li", { className: "next-item" }, [
      el("h4", { className: "next-title", text: step.title }),
      el("p", { className: "next-body", text: step.body }),
    ]);
    const links = el("p", { className: "next-links" });
    if (step.url) {
      links.append(el("a", { text: "Open the official page", attrs: { href: step.url, rel: "noopener noreferrer" } }));
    }
    if (step.phone) {
      links.append(el("span", { className: "num", text: "Phone: " + step.phone }));
    }
    if (links.childNodes.length > 0) item.append(links);
    list.append(item);
  }
  box.append(list);
}

// ─────────────────────────── letter + printed inputs ───────────────────────────

function renderLetter(check) {
  byId("letter-text").value = check.letter;
  byId("letter-print").textContent = check.letter;
}

function inputLine(label, value) {
  return el("div", { className: "receipt-row" }, [el("dt", { text: label }), el("dd", { text: value })]);
}

// Printed report only: what was typed, so a counselor can see the inputs.
function renderTypedNumbers(check) {
  const account = check.account;
  const statement = check.statement;
  const box = byId("inputs-body");
  clear(box);
  const list = el("dl", { className: "receipt-rows" });
  list.append(inputLine("Starting balance", formatCents(account.startingBalanceCents)));
  list.append(inputLine("First month", monthName(account.startMonth)));
  for (const row of check.result.table) {
    if (row.disbursementCents > 0) {
      list.append(inputLine("Bills paid in " + monthName(row.calendarMonth), formatCents(row.disbursementCents)));
    }
  }
  if (typeof statement.currentMonthlyEscrowCents === "number") {
    list.append(inputLine("Statement: current escrow payment", formatCents(statement.currentMonthlyEscrowCents)));
  }
  if (typeof statement.newMonthlyEscrowCents === "number") {
    list.append(inputLine("Statement: new escrow payment", formatCents(statement.newMonthlyEscrowCents)));
  }
  if (typeof statement.requiredMinimumBalanceCents === "number") {
    list.append(inputLine("Statement: required minimum balance", formatCents(statement.requiredMinimumBalanceCents)));
  }
  box.append(list);
}

// ─────────────────────────── public ───────────────────────────

// Draw everything for one successful check. `options.fieldToId` lets the
// nudges link back to the right box in the form.
export function renderResults(check, options) {
  const settings = options || {};
  renderVerdict(check);
  renderRefundClock(check);
  renderNudges(check, settings.fieldToId);
  renderThreeNumbers(check);
  renderCompare(check);
  renderChartBlock(check);
  renderJumpBlock(check);
  renderPayment(check);
  renderSteps(check);
  renderNext(check);
  renderLetter(check);
  renderTypedNumbers(check);
}

// Only the letter changes when the servicer name or loan number is typed.
export function renderLetterOnly(check) {
  renderLetter(check);
}

// The one line screen readers hear while numbers are being edited (SPEC D4).
export function announceVerdict(check) {
  const verdict = check.verdict;
  byId("verdict-live").textContent = "Updated. " + verdict.label + ". " + verdict.headline;
}

export function announceStale() {
  byId("verdict-live").textContent =
    "One of the boxes has a problem. The results shown are from your last valid numbers.";
}

// Mark the results as old (a box is broken) or fresh again.
export function setStale(isStale) {
  const results = byId("results");
  results.classList.toggle("is-stale", isStale);
  byId("stale-note").hidden = !isStale;
}

// A short flash on the verdict so sighted users notice it changed. The CSS
// only animates when the visitor has not asked for reduced motion.
export function flashVerdict() {
  const box = byId("verdict");
  box.classList.remove("just-updated");
  // Reading a layout property restarts the CSS animation.
  void box.offsetWidth;
  box.classList.add("just-updated");
}
