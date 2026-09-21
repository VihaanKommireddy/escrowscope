// render.js — draws the results. It never does math and never writes its own
// math sentences: every verdict, flag, step, next step and letter line comes
// from the engine (through pipeline.js) and is placed on the page as plain text.
// This file only decides WHERE things go and adds short labels around them.

import { el, svgEl, clear, scrollRegion } from "./dom.js";
import { formatCents, MONTH_NAMES } from "./engine/index.js";
import { renderBalanceChart, renderJumpBar } from "./chart.js";
import { isTooCloseToCall } from "./pipeline.js";

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
  // A plain dash: "not compared". Deliberately neither a tick nor a flag.
  dash: ["M6 12h12"],
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

// SPEC E3 ("too close to call") is decided in ONE place, pipeline.js. It is
// handed on from here so anything that used to ask render.js still can.
export { isTooCloseToCall };

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
    el("span", { className: "eyebrow", text: "If this surplus is right, the 30-day refund window ends" }),
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

// What each comparison result looks like. `look` picks the chip's style:
//   "match" = green tick, "flag" = amber mark, "neutral" = plain grey, no mark of either kind.
const STATUS_WORDS = {
  match: { text: "Matches", iconName: "check", look: "match" },
  differs: { text: "Differs", iconName: "differs", look: "flag" },
  "over-limit": { text: "Over the limit", iconName: "flag", look: "flag" },
  // The engine could not fairly compare this line (for example, the number typed
  // as the "required minimum" looks like the lowest projected balance instead).
  "not-compared": { text: "Not compared", iconName: "dash", look: "neutral" },
};

// A status this page has never heard of must never show up blank, and must
// never borrow the green tick. It gets the neutral look and plain words.
const UNKNOWN_STATUS = { text: "See the note on this line", iconName: "dash", look: "neutral" };

export function statusWords(status) {
  if (typeof status === "string" && Object.prototype.hasOwnProperty.call(STATUS_WORDS, status)) {
    return STATUS_WORDS[status];
  }
  return UNKNOWN_STATUS;
}

const FLAG_TAGS = {
  CUSHION_OVER_CAP: "Cushion above the limit",
  // The typed "required minimum" might be a real over-the-limit cushion, or it
  // might be the lowest projected balance copied into the wrong box. The engine
  // cannot tell which, so it asks the visitor to check the number.
  CUSHION_MAYBE_OVER_CAP: "Check this number",
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
  const words = statusWords(status);
  return el("span", { className: "status status--" + words.look }, [icon(words.iconName), words.text]);
}

// The small label on a flag card. A kind this page has never heard of still gets
// a full card: the default label, the amber mark, and the engine's own sentence.
export function flagTag(kind) {
  if (typeof kind === "string" && Object.prototype.hasOwnProperty.call(FLAG_TAGS, kind)) return FLAG_TAGS[kind];
  return "Look here";
}

function renderCompare(check, fieldToId) {
  const comparison = check.comparison;
  const box = byId("compare-body");
  clear(box);
  // The flag cards say WHAT was found, so check.html shows them on the Verdict
  // tab (in #flags-body), right under the three numbers. The table that backs
  // them up stays on the Compare tab. A page without that box gets the cards
  // under the table, as before.
  const flagsBox = byId("flags-body") || box;
  if (flagsBox !== box) clear(flagsBox);

  if (!comparison.provided || comparison.rows.length === 0) {
    box.append(
      el("p", {
        className: "block-lede",
        text: "Nothing from your statement’s summary was typed in, so there is nothing to put side by side yet. Fill in step 1 and step 3 of the form and this table will compare your statement with the federal math, line by line.",
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
  box.append(scrollRegion("Your statement compared with the federal math, as a table", [table]));

  if (comparison.flags.length > 0) {
    const list = el("ul", { className: "flag-list" });
    for (const flag of comparison.flags) {
      const head = el("div", { className: "flag-card-head" }, [
        el("span", { className: "flag-card-tag" }, [icon("flag"), flagTag(flag.kind)]),
      ]);
      if (typeof flag.amountCents === "number" && flag.amountCents !== 0) {
        head.append(el("span", { className: "flag-card-amount", text: formatCents(flag.amountCents) }));
      }
      const card = el("li", { className: "flag-card" }, [head, el("p", { text: flag.sentence })]);
      // Most flag sentences already end with their cite; only add it when missing.
      if (flag.cite && !String(flag.sentence).includes(flag.cite)) {
        card.append(el("p", { className: "cite", text: "Source: " + flag.cite }));
      }
      // Some flags name the box they are about: offer the same jump link the
      // error summary uses.
      const targetId = fieldToId && typeof flag.field === "string" ? fieldToId(flag.field) : "";
      if (targetId) {
        card.append(el("p", { className: "flag-card-jump" }, [el("a", { text: "Go to that box", attrs: { href: "#" + targetId } })]));
      }
      list.append(card);
    }
    flagsBox.append(list);
    flagsBox.append(
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
        text: "Type both your current and your new escrow payment in step 1 of the form, and this section will split the change into its causes: bills going up, a shortage being repaid, and anything the math can’t explain.",
      })
    );
    section.setAttribute("class", "result-block is-empty");
    return;
  }
  section.setAttribute("class", "result-block");
  renderJumpBar(box, check.jump);
}

// ─────────────────────────── the payment the federal math gives ───────────────────────────

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
  spreadRows.append(receiptRow("Escrow payment for the bills: the year’s bills ÷ 12", payment.baseMonthlyCents, false));
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
    receiptRow("Escrow payment each month", payment.monthlyEscrowWhileRepayingDeficiencyCents, true)
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
          receiptRow("Escrow payment each month", payment.monthlyEscrowAfterDeficiencyRepaidCents, true),
        ]),
      ])
    );
  }

  if (hasShortage || hasDeficiency) {
    receipts.append(
      el("div", { className: "receipt" }, [
        el("h4", { className: "receipt-title", text: "If you pay the amount owed in one lump sum" }),
        el("dl", { className: "receipt-rows" }, [
          receiptRow("Escrow payment for the bills: the year’s bills ÷ 12", payment.baseMonthlyCents, false),
          receiptRow("Escrow payment each month", payment.baseMonthlyCents, true),
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

// A phone number the engine sent with a next step → something a phone can dial.
// Returns the digits for a tel: link, or "" when the text is not a plain
// 10-digit US number (then it is shown as words only, never as a broken link).
export function dialableDigits(phone) {
  if (typeof phone !== "string") return "";
  let digits = "";
  for (const character of phone) {
    if (character >= "0" && character <= "9") digits = digits + character;
  }
  return digits.length === 10 ? digits : "";
}

function phoneNode(phone) {
  const digits = dialableDigits(phone);
  if (digits === "") return el("span", { className: "num", text: "Phone: " + phone });
  return el("a", { className: "num", text: "Call " + phone, attrs: { href: "tel:+1" + digits } });
}

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
    if (typeof step.url === "string" && step.url.trim() !== "") {
      links.append(el("a", { text: "Open the official page", attrs: { href: step.url, rel: "noopener noreferrer" } }));
    }
    // Most steps have no phone number. Only a real, non-empty one is shown.
    if (typeof step.phone === "string" && step.phone.trim() !== "") {
      links.append(phoneNode(step.phone));
    }
    if (links.childNodes.length > 0) item.append(links);
    list.append(item);
  }
  box.append(list);
}

// ─────────────────────────── letter ───────────────────────────

// The engine writes one of two kinds of letter (SPEC fix A2):
//   a NOTICE OF ERROR, only when the numbers point at a specific problem, or
//   a REQUEST FOR INFORMATION, which just asks the servicer to explain.
// The panel's title and first sentence follow the kind. If the kind is ever
// missing or new, the neutral wording is used: it never claims an error.
const LETTER_ENDING =
  " It states arithmetic, not legal conclusions. You can edit it right here: fill in the parts in [brackets], change anything you like, and decide for yourself whether to send it.";

export function letterPanelWords(letterKind) {
  if (letterKind === "NOTICE_OF_ERROR") {
    return {
      title: "A letter asking your servicer to look at a possible error",
      lede:
        "This letter is a “notice of error”: it points to specific numbers on your statement and asks your servicer to explain them or correct them. A gap is a question to ask, not proof of a mistake." +
        LETTER_ENDING,
    };
  }
  if (letterKind === "REQUEST_FOR_INFORMATION") {
    return {
      title: "A letter asking your servicer to explain",
      lede:
        "This letter is a “request for information”: it asks your servicer to explain its numbers or send the worksheet behind them. It does not say anything is wrong." +
        LETTER_ENDING,
    };
  }
  return {
    title: "A letter you can send",
    lede: "A calm, neutral letter asking your servicer to explain the calculation." + LETTER_ENDING,
  };
}

// `keepText` is true once the visitor has edited the letter: the title and the
// first sentence still follow the numbers, but their words are left alone.
function renderLetter(check, keepText) {
  const words = letterPanelWords(check.letterKind);
  byId("sec-letter-h").textContent = words.title;
  byId("letter-lede").textContent = words.lede;
  if (keepText) return;
  // The engine's letter goes in through .value only: it is text, never HTML.
  byId("letter-text").value = check.letter;
}

// ─────────────────────────── public ───────────────────────────

// Draw everything for one successful check.
//   options.fieldToId   lets the nudges link back to the right box in the form
//   options.keepLetter  true once the visitor has edited the letter themselves
// Every step runs inside its own try/catch, so one broken step can never leave
// the page half new and half old without saying so. Returns true only when
// EVERY step worked; the caller marks the results as out of date otherwise.
export function renderResults(check, options) {
  const settings = options || {};
  const steps = [
    function () { renderVerdict(check); },
    function () { renderRefundClock(check); },
    function () { renderNudges(check, settings.fieldToId); },
    function () { renderThreeNumbers(check); },
    function () { renderCompare(check, settings.fieldToId); },
    function () { renderChartBlock(check); },
    function () { renderJumpBlock(check); },
    function () { renderPayment(check); },
    function () { renderSteps(check); },
    function () { renderNext(check); },
    function () { renderLetter(check, settings.keepLetter === true); },
  ];
  let everyStepWorked = true;
  for (const step of steps) {
    try {
      step();
    } catch (problem) {
      everyStepWorked = false;
    }
  }
  byId("render-problem").hidden = everyStepWorked;
  return everyStepWorked;
}

// Only the letter changes when the servicer name or loan number is typed.
export function renderLetterOnly(check, keepText) {
  renderLetter(check, keepText === true);
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

// The verdict eases in (a short rise and fade) so sighted users notice it
// changed. The CSS only animates when the visitor has not asked for reduced
// motion.
export function flashVerdict() {
  const box = byId("verdict");
  box.classList.remove("just-updated");
  // Reading a layout property restarts the CSS animation.
  void box.offsetWidth;
  box.classList.add("just-updated");
}
