// guide.js — the "Where do I find this?" statement guide (SPEC D2).
//
// What it draws: a made-up sample escrow statement, built only from HTML and
// CSS. Numbered regions sit on the numbers the form asks for.
//  - Wide screens: the whole sample sheet sits in a side panel. Clicking a
//    region jumps to its box in the form. Focusing a box highlights its region.
//  - Narrow screens: the panel is hidden by guide.css, and every box in the
//    form gets a small "Where is this on my statement?" disclosure instead.
//
// Every dollar figure on the sample comes from one of the built-in examples
// (examples.js), so the guide can never disagree with the example buttons.
//
// The guide is an extra. Each form field's helper text already lists the names
// servicers use, so nothing here is needed to use the form.

import { el, clear } from "./dom.js";
import { formatCents, MONTH_NAMES, escrowToCalendarMonth, analyze } from "./engine/index.js";

// The nine regions, in the order the form asks for them. `key` is fixed:
// index.html uses the same keys in data-guide-region. `number` is the number a
// region has when ALL nine boxes are on the page. One box (the pay-in-full
// question) is only shown for a shortage, so the numbers people actually see
// come from numberVisibleRegions() below: 1, 2, 3… with no gaps, the same on
// the form and on the sample statement.
// `lookFor` = names real servicers use (research doc 03, sections 1.5 and 5).
// `where`   = one plain sentence about where that number usually sits.
export const GUIDE_REGIONS = [
  {
    key: "current-payment",
    number: 1,
    name: "Current escrow payment",
    lookFor: ["Escrow Deposit", "Current Escrow Payment", "Current Monthly Escrow Deposit", "Escrow Portion"],
    where: "It is usually one line inside the “Current Monthly Mortgage Payment” box near the top. Use the escrow line, not the total.",
  },
  {
    key: "new-payment",
    number: 2,
    name: "New escrow payment",
    lookFor: ["New Escrow Payment", "Escrow Deposit"],
    where: "It is usually the escrow line inside the “New Monthly Mortgage Payment” box. Use the escrow line, not the total. If a “Shortage Installment” has its own line, add it to the “Unadjusted Escrow Payment”.",
  },
  {
    key: "starting-balance",
    number: 3,
    name: "Starting balance",
    lookFor: ["Beginning Balance", "Anticipated Beginning Balance", "Starting Balance", "Escrow Account Balance"],
    where: "It is usually the first row of the table that lists the next 12 months.",
  },
  {
    key: "start-month",
    number: 4,
    name: "First month of the 12 months",
    lookFor: ["Effective [date]", "New Payment Effective [date]"],
    where: "It is the first month in the table that lists the next 12 months. It is usually the month the new payment starts.",
  },
  {
    key: "required-minimum",
    number: 5,
    name: "Required minimum balance",
    lookFor: ["Required Minimum Balance", "Minimum Balance", "Target Balance", "Cushion", "Two-Month Reserve"],
    where: "It is usually in the summary. On some statements it is only highlighted in the 12-month table, not named.",
  },
  {
    key: "claimed",
    number: 6,
    name: "Shortage, surplus, or deficiency",
    lookFor: ["Escrow Shortage", "Shortage Amount", "Surplus", "Overage", "Deficiency", "Shortage Installment"],
    where: "It is usually in the “Escrow Account Summary”, with a line about how it gets paid back or refunded.",
  },
  {
    key: "lump-sum",
    number: 7,
    name: "Pay-in-full option",
    lookFor: ["Escrow Shortage Coupon"],
    where: "It is often a tear-off coupon, or a line that offers to take the whole shortage now.",
    // In the form, box 7 only appears once box 6 says there is a shortage.
    revealedBy: "claimed",
    hiddenNote: "That box only shows up in the form after you say the statement shows a shortage. Here is that question.",
  },
  {
    key: "analysis-date",
    number: 8,
    name: "Date of the analysis",
    lookFor: ["Analysis Date", "Statement Date"],
    where: "It is usually printed near the top of the first page, close to your loan number. The rule does not require it, so some statements leave it out.",
  },
  {
    key: "bills",
    number: 9,
    name: "Bills for the next 12 months",
    lookFor: [
      "Expected Escrow Payment for the Next 12 Months",
      "Anticipated Disbursements",
      "What We Expect to Pay Out",
      "Escrow Trend",
    ],
    where: "It is a list or table of each tax and insurance bill, with the month it gets paid.",
  },
];

// Filler that is NOT part of the escrow math. A real statement shows the whole
// mortgage payment, so the sample needs a principal-and-interest line to teach
// "use the escrow line, not the total". The totals are added up from it.
const SAMPLE_PRINCIPAL_AND_INTEREST_CENTS = 120000;
const SAMPLE_SERVICER_NAME = "Sample Mortgage Servicing";
const SAMPLE_LOAN_NUMBER = "000-SAMPLE";
const PLACEHOLDER_DATE = "MM/DD/YYYY";
const NOT_SHOWN = "not shown";

// How long the "you landed here" outline stays on a form box after a jump.
const JUMP_HIGHLIGHT_MS = 1600;

// ───────────────────────── Small helpers ─────────────────────────

function findRegion(key) {
  for (const region of GUIDE_REGIONS) {
    if (region.key === key) return region;
  }
  return null;
}

// ───────────────────────── Numbering the boxes ─────────────────────────

// Give every box that is on the page a number: 1, 2, 3… with no gaps.
// `hiddenKeys` lists the boxes that are NOT on the page right now. They get no
// number at all. Returns a plain object: { "current-payment": 1, … }.
// No DOM here, so tests/shell.test.js can check it in Node.
export function numberVisibleRegions(hiddenKeys) {
  const hidden = Array.isArray(hiddenKeys) ? hiddenKeys : [];
  const numbers = {};
  let next = 1;
  for (const region of GUIDE_REGIONS) {
    if (hidden.includes(region.key)) continue;
    numbers[region.key] = next;
    next = next + 1;
  }
  return numbers;
}

// Which boxes are hidden in the form right now (a `hidden` attribute on the
// box or on something around it)?
function hiddenRegionKeys(form) {
  const keys = [];
  for (const region of GUIDE_REGIONS) {
    const wrapper = form.querySelector('[data-guide-region="' + region.key + '"]');
    if (wrapper && wrapper.closest("[hidden]")) keys.push(region.key);
  }
  return keys;
}

// Write the numbers onto the page: the badge next to each form label, the badge
// on each region of the sample statement, and the region's spoken name. A region
// whose box is hidden is taken off the sample too, so the two always agree.
// Only text and the `hidden` attribute change here. No style attributes.
export function renumberBoxes({ panel, form }) {
  if (!form) return;
  const numbers = numberVisibleRegions(hiddenRegionKeys(form));

  for (const region of GUIDE_REGIONS) {
    const number = numbers[region.key];
    const isShown = number !== undefined;
    const numberText = isShown ? String(number) : "";

    const wrapper = form.querySelector('[data-guide-region="' + region.key + '"]');
    if (wrapper) {
      for (const badgeNode of wrapper.querySelectorAll(".field-badge, .guide-region-static .guide-badge")) {
        badgeNode.textContent = numberText;
      }
    }

    if (!panel) continue;
    const button = panel.querySelector('.guide-region[data-region="' + region.key + '"]');
    if (!button) continue;
    const holder = button.closest(".guide-coupon") || button;
    holder.hidden = !isShown;
    // The badge is part of the button's spoken name, so changing its text
    // renames the button too. Nothing else to keep in step.
    const badgeNode = button.querySelector(".guide-badge");
    if (badgeNode) badgeNode.textContent = numberText;
  }
}

// Money from the example, or a plain "not shown" when the example has no value.
function moneyText(cents) {
  if (Number.isInteger(cents)) return formatCents(cents);
  return NOT_SHOWN;
}

// calendarMonth is 1..12. MONTH_NAMES starts at index 0 with "January".
function monthName(calendarMonth) {
  const name = MONTH_NAMES[calendarMonth - 1];
  return name === undefined ? "" : name;
}

// "2026-09-01" → "September 1, 2026". Split by hand so no Date object (and no
// time zone surprise) is involved.
function analysisDateText(isoDate) {
  if (typeof isoDate !== "string") return PLACEHOLDER_DATE;
  const parts = isoDate.split("-");
  if (parts.length !== 3) return PLACEHOLDER_DATE;
  const year = Number(parts[0]);
  const month = Number(parts[1]);
  const day = Number(parts[2]);
  const looksRight =
    Number.isInteger(year) && Number.isInteger(month) && Number.isInteger(day) &&
    month >= 1 && month <= 12 && day >= 1 && day <= 31;
  if (!looksRight) return PLACEHOLDER_DATE;
  return monthName(month) + " " + day + ", " + year;
}

// The example's bills in the order they happen, with calendar month names.
function billsForDisplay(example) {
  const account = example.account;
  const sorted = account.disbursements.slice();
  sorted.sort(function byEscrowMonth(a, b) {
    return a.month - b.month;
  });
  const rows = [];
  for (const bill of sorted) {
    const calendarMonth = escrowToCalendarMonth(bill.month, account.startMonth);
    rows.push({
      month: monthName(calendarMonth),
      label: bill.label,
      amount: moneyText(bill.amountCents),
    });
  }
  return rows;
}

function prefersReducedMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

// ───────────────────────── Drawing pieces ─────────────────────────

// `view` says what we are drawing:
//   { mode: "panel", example, buttons: {}, onRegionClick }  → the full sheet, regions are buttons
//   { mode: "snippet", example, onlyKey }                    → a small piece, only `onlyKey` is marked

// A snippet shows its own region plus, sometimes, a neighbor drawn as plain
// text so the eye knows where on the paper it is. Everything else is left out
// to keep the snippet short on a phone.
const SNIPPET_NEIGHBORS = {
  "required-minimum": ["low-point-line"],
  "starting-balance": ["start-month"],
  "start-month": ["starting-balance"],
  "lump-sum": ["claimed"],
};

function isDrawn(view, key) {
  if (view.mode === "panel") return true;
  if (key === view.onlyKey) return true;
  const neighbors = SNIPPET_NEIGHBORS[view.onlyKey] || [];
  return neighbors.includes(key);
}

function badge(number) {
  return el("span", { className: "guide-badge", text: number, attrs: { "aria-hidden": "true" } });
}

// One numbered region.
//  - valueText is the spoken value ("$400.00").
//  - bodyChildren are the spans that make up the visible statement text.
// Returns null when a snippet leaves this region out (el() skips null children).
function makeRegion(view, key, valueText, bodyChildren) {
  if (!isDrawn(view, key)) return null;
  const region = findRegion(key);
  const body = el("span", { className: "guide-region-body" }, bodyChildren);

  if (view.mode === "panel") {
    const button = el(
      "button",
      {
        className: "guide-region",
        attrs: {
          type: "button",
          "data-region": key,
        },
      },
      [
        // No aria-label: the button's spoken name is built from what is printed
        // on it (the number, then the statement words), so it always STARTS with
        // the visible text. People who use voice control can say what they see
        // (WCAG 2.5.3, Label in Name). The hidden words after it add the form's
        // own name for the box and say what the button does.
        el("span", { className: "guide-badge", text: region.number }),
        body,
        el("span", { className: "visually-hidden", text: ". " + region.name + ". Go to this box in the form." }),
        // Shown by CSS only while this region is the active one. Text, not just
        // color, so the highlight works for people who cannot see the teal.
        el("span", { className: "guide-here", text: "You are here", attrs: { "aria-hidden": "true" } }),
      ]
    );
    button.addEventListener("click", function handleRegionClick() {
      view.onRegionClick(key);
    });
    view.buttons[key] = button;
    return button;
  }

  // Snippet: the one region this disclosure is about gets the marked look.
  if (key === view.onlyKey) {
    return el("span", { className: "guide-region guide-region-static" }, [
      el("span", { className: "guide-badge", text: region.number }),
      body,
    ]);
  }

  // Snippet: every other region is drawn as plain statement text for context.
  return el("span", { className: "guide-plain" }, [body]);
}

// A label on the left, a value on the right. Used inside and outside regions.
function labelSpan(text) {
  return el("span", { className: "guide-label", text: text });
}

function valueSpan(text) {
  return el("span", { className: "guide-value num", text: text });
}

function plainLine(label, value, extraClass) {
  const className = extraClass ? "guide-line " + extraClass : "guide-line";
  return el("div", { className: className }, [labelSpan(label), valueSpan(value)]);
}

function sectionHead(text) {
  return el("p", { className: "guide-head", text: text });
}

// Top strip: who sent it, the date (region 8) and a fake loan number.
function buildLetterhead(view) {
  const dateText = analysisDateText(view.example.details && view.example.details.analysisDate);
  const spokenDate = dateText === PLACEHOLDER_DATE ? "left blank on this sample" : dateText;

  return el("div", { className: "guide-letterhead" }, [
    el("div", { className: "guide-letterhead-top" }, [
      el("div", { className: "guide-letterhead-name" }, [
        el("span", { className: "guide-servicer", text: SAMPLE_SERVICER_NAME }),
        el("span", { className: "guide-doc-title", text: "Annual Escrow Account Statement" }),
      ]),
      el("span", { className: "guide-stamp", text: "Sample: not a real statement" }),
    ]),
    makeRegion(view, "analysis-date", spokenDate, [labelSpan("Analysis date"), valueSpan(dateText)]),
    plainLine("Loan number", SAMPLE_LOAN_NUMBER, "guide-line-indent"),
  ]);
}

// "Your monthly payment": current vs. new. Only the escrow lines are regions.
// `columns` is ["current", "new"] on the full sheet and just one of them in a
// snippet, so the snippet stays readable on a phone.
function buildPaymentSection(view, columns) {
  const statement = view.example.statement;
  const showCurrent = columns.includes("current");
  const showNew = columns.includes("new");

  function totalText(escrowCents) {
    if (!Number.isInteger(escrowCents)) return NOT_SHOWN;
    return formatCents(SAMPLE_PRINCIPAL_AND_INTEREST_CENTS + escrowCents);
  }

  const principalText = formatCents(SAMPLE_PRINCIPAL_AND_INTEREST_CENTS);
  const currentText = moneyText(statement.currentMonthlyEscrowCents);
  const newText = moneyText(statement.newMonthlyEscrowCents);

  // The grid is filled row by row: label cell, then one cell per column shown.
  const cells = [];

  cells.push(el("span", { className: "guide-pay-corner" }));
  if (showCurrent) cells.push(el("span", { className: "guide-pay-colhead", text: "Current" }));
  if (showNew) cells.push(el("span", { className: "guide-pay-colhead", text: "New" }));

  cells.push(el("span", { className: "guide-pay-label", text: "Principal & interest" }));
  if (showCurrent) cells.push(el("span", { className: "guide-pay-value num", text: principalText }));
  if (showNew) cells.push(el("span", { className: "guide-pay-value num", text: principalText }));

  cells.push(el("span", { className: "guide-pay-label guide-pay-label-escrow", text: "Escrow" }));
  if (showCurrent) cells.push(makeRegion(view, "current-payment", currentText, [valueSpan(currentText)]));
  if (showNew) cells.push(makeRegion(view, "new-payment", newText, [valueSpan(newText)]));

  cells.push(el("span", { className: "guide-pay-label guide-pay-total", text: "Total payment" }));
  if (showCurrent) {
    cells.push(el("span", { className: "guide-pay-value guide-pay-total num", text: totalText(statement.currentMonthlyEscrowCents) }));
  }
  if (showNew) {
    cells.push(el("span", { className: "guide-pay-value guide-pay-total num", text: totalText(statement.newMonthlyEscrowCents) }));
  }

  const gridClass = showCurrent && showNew ? "guide-pay guide-pay-two" : "guide-pay guide-pay-one";
  const children = [sectionHead("Your monthly payment"), el("div", { className: gridClass }, cells)];

  if (showNew) {
    const firstMonth = monthName(view.example.account.startMonth);
    children.push(el("p", { className: "guide-note", text: "New payment effective " + firstMonth + " 1." }));
  }
  return el("div", { className: "guide-section" }, children);
}

// "Escrow account summary": required minimum (5), the shortage or surplus and
// how it is repaid (6), and where a pay-in-full coupon sits (7).
function buildSummarySection(view) {
  const statement = view.example.statement;
  const kind = statement.claimedKind;
  const amountText = moneyText(statement.claimedAmountCents);
  const spread = statement.shortageSpreadMonths;
  const owesMoney = kind === "shortage" || kind === "deficiency";

  let story = "Your escrow account is on target for the next 12 months.";
  let claimedLabel = "Escrow shortage or surplus";
  let repayLine = "";
  let spokenClaim = amountText;

  if (kind === "shortage") {
    story = "Your lowest projected balance for the next 12 months is below the required minimum balance. That means your account has a shortage.";
    claimedLabel = "Escrow shortage";
  } else if (kind === "deficiency") {
    story = "Your escrow balance is below zero. That means your account has a deficiency.";
    claimedLabel = "Escrow deficiency";
  } else if (kind === "surplus") {
    story = "Your lowest projected balance for the next 12 months is above the required minimum balance. That means your account has a surplus.";
    claimedLabel = "Escrow surplus";
    repayLine = "Your refund check is enclosed.";
  }

  if (owesMoney) {
    spokenClaim = kind + " of " + amountText;
    if (Number.isInteger(spread) && spread > 1) {
      repayLine = "Spread over " + spread + " months and included in your new payment.";
      spokenClaim = spokenClaim + ", spread over " + spread + " months";
    } else if (spread === 1) {
      repayLine = "Due in one payment.";
      spokenClaim = spokenClaim + ", due in one payment";
    }
  } else if (kind === "surplus") {
    spokenClaim = "surplus of " + amountText;
  }

  const minimumText = moneyText(statement.requiredMinimumBalanceCents);

  // People often copy the LOWEST PROJECTED BALANCE into the "required minimum"
  // box by mistake. Real statements print both, close together, so the sample
  // does too: the low point as a plain, struck-through-looking line with the
  // words "not this one", and the required minimum as the numbered region.
  // The low point is worked out by the engine from the same example, so it
  // always agrees with the example button.
  let lowPointLine = null;
  if (view.mode === "panel" || isDrawn(view, "low-point-line")) {
    let lowPointText = NOT_SHOWN;
    try {
      lowPointText = moneyText(analyze(view.example.account).lowPoint.projectedBalanceCents);
    } catch (problem) {
      lowPointText = NOT_SHOWN;
    }
    lowPointLine = el("div", { className: "guide-not-this" }, [
      el("span", { className: "guide-not-this-line" }, [labelSpan("Lowest projected balance"), valueSpan(lowPointText)]),
      el("span", { className: "guide-not-this-tag", text: "Not this one. The form does not ask for it." }),
    ]);
  }

  const claimedBody = [labelSpan(claimedLabel), valueSpan(amountText)];
  if (repayLine !== "") {
    claimedBody.push(el("span", { className: "guide-sub", text: repayLine }));
  }

  // Region 7. The sample only prints a coupon when the example says the
  // statement offers one. Otherwise it marks the spot where one would be.
  let couponBody;
  let spokenCoupon;
  if (owesMoney && statement.lumpSumOfferedOnStatement === true) {
    couponBody = [
      el("span", { className: "guide-coupon-tear", text: "Shortage coupon: detach here" }),
      labelSpan("Option: pay the " + kind + " in full"),
      valueSpan(amountText),
    ];
    spokenCoupon = "coupon to pay the " + kind + " of " + amountText + " in full";
  } else {
    couponBody = [
      el("span", { className: "guide-coupon-tear", text: "Pay-in-full coupon" }),
      el("span", {
        className: "guide-sub guide-coupon-empty",
        text: "This sample has no coupon. When a statement offers to take the whole shortage at once, the coupon is printed here.",
      }),
    ];
    spokenCoupon = "this sample has none, but this is where a coupon would be printed";
  }

  // The coupon sits under a dashed "tear here" line of its own.
  const couponRegion = makeRegion(view, "lump-sum", spokenCoupon, couponBody);
  const coupon = couponRegion ? el("div", { className: "guide-coupon" }, [couponRegion]) : null;

  return el("div", { className: "guide-section" }, [
    sectionHead("Escrow account summary"),
    el("p", { className: "guide-story", text: story }),
    lowPointLine,
    makeRegion(view, "required-minimum", minimumText, [labelSpan("Required minimum balance"), valueSpan(minimumText)]),
    makeRegion(view, "claimed", spokenClaim, claimedBody),
    coupon,
  ]);
}

// One row of the 12-month table: month, what happens, amount.
function activityCells(month, activity, amount) {
  return [
    el("span", { className: "guide-cell guide-cell-month", text: month }),
    el("span", { className: "guide-cell guide-cell-activity", text: activity }),
    el("span", { className: "guide-cell guide-cell-amount num", text: amount }),
  ];
}

// "Projected escrow activity": starting balance (3), first month (4), bills (9).
function buildActivitySection(view) {
  const account = view.example.account;
  const startText = moneyText(account.startingBalanceCents);
  const firstMonth = monthName(account.startMonth);
  const bills = billsForDisplay(view.example);

  // All the bill rows live inside ONE region, because the form asks for them
  // as one list.
  const billRows = [];
  const spokenBills = [];
  for (const bill of bills) {
    billRows.push(el("span", { className: "guide-row" }, activityCells(bill.month, bill.label, bill.amount)));
    spokenBills.push(bill.label + ", " + bill.month + ", " + bill.amount);
  }

  return el("div", { className: "guide-section" }, [
    sectionHead("Projected escrow activity for the next 12 months"),
    el("div", { className: "guide-table" }, [
      el("div", { className: "guide-row guide-row-head" }, activityCells("Month", "Activity", "Amount")),
      makeRegion(view, "starting-balance", startText, [
        el("span", { className: "guide-row" }, activityCells("", "Starting balance", startText)),
      ]),
      makeRegion(view, "start-month", firstMonth, [
        el("span", { className: "guide-row guide-row-first" }, activityCells(firstMonth, "First month of the new 12 months", "")),
      ]),
      makeRegion(view, "bills", spokenBills.join("; "), billRows),
    ]),
    isDrawn(view, "bills")
      ? el("p", { className: "guide-note", text: "Months with no bill are left out of this sample." })
      : null,
  ]);
}

// ───────────────────────── The wide-screen panel ─────────────────────────

// `status` is a one-line message area ("Box 7 only shows up after…").
function buildPanel(panel, view, status) {
  clear(panel);
  panel.classList.add("guide-panel");
  // index.html already names the <aside>. Only add a name if it has none.
  if (!panel.hasAttribute("aria-label") && !panel.hasAttribute("aria-labelledby")) {
    panel.setAttribute("aria-label", "Sample escrow statement: where to find each number");
  }

  const sheet = el("div", { className: "guide-sheet" }, [
    el("span", { className: "guide-watermark", text: "Sample", attrs: { "aria-hidden": "true" } }),
    buildLetterhead(view),
    buildPaymentSection(view, ["current", "new"]),
    buildSummarySection(view),
    buildActivitySection(view),
  ]);

  // The sheet can be taller than the window, so it scrolls inside this box.
  // The region buttons inside it are focusable, so a keyboard can scroll it.
  const scrollBox = el("div", { className: "guide-scroll" }, [sheet]);

  panel.append(
    el("span", { className: "eyebrow", text: "Sample statement" }),
    el("h3", { className: "guide-title", text: "Where do I find this?" }),
    el("p", {
      className: "guide-intro",
      text: "A sample statement. Yours will look different, but the same numbers are on it. Click a number to jump to its box in the form.",
    }),
    status,
    scrollBox
  );

  return scrollBox;
}

// If the panel scrolls, move it just enough to show `node`. We change
// scrollTop ourselves so that only the panel moves, never the whole page.
function keepVisibleInside(scrollBox, node) {
  if (scrollBox.scrollHeight <= scrollBox.clientHeight) return;
  const margin = 16;
  const boxRect = scrollBox.getBoundingClientRect();
  const nodeRect = node.getBoundingClientRect();
  if (nodeRect.top < boxRect.top + margin) {
    scrollBox.scrollTop = scrollBox.scrollTop - (boxRect.top + margin - nodeRect.top);
  } else if (nodeRect.bottom > boxRect.bottom - margin) {
    scrollBox.scrollTop = scrollBox.scrollTop + (nodeRect.bottom - (boxRect.bottom - margin));
  }
}

// Mark one region as "you are here" (or none, when key is null).
function setActiveRegion(buttons, scrollBox, key) {
  for (const buttonKey of Object.keys(buttons)) {
    const button = buttons[buttonKey];
    if (buttonKey === key) {
      button.classList.add("is-active");
      button.setAttribute("aria-current", "true");
      if (scrollBox) keepVisibleInside(scrollBox, button);
    } else {
      button.classList.remove("is-active");
      button.removeAttribute("aria-current");
    }
  }
}

// ───────────────────────── Jumping to a form box ─────────────────────────

// Which control should get focus for this wrapper?
function findFocusTarget(wrapper) {
  const focusId = wrapper.getAttribute("data-guide-focus");
  if (focusId) {
    const byId = document.getElementById(focusId);
    if (byId) return byId;
  }
  // No id given (the bills list: rows come and go), so look again every time.
  const controls = wrapper.querySelectorAll("input, select, textarea, button");
  for (const control of controls) {
    if (control.disabled) continue;
    if (control.type === "hidden") continue;
    return control;
  }
  return null;
}

// A control inside a closed <details> cannot be seen or focused. Open them.
function openClosedDetails(node) {
  let parent = node.parentElement;
  while (parent) {
    if (parent.tagName === "DETAILS" && !parent.open) {
      parent.open = true;
    }
    parent = parent.parentElement;
  }
}

// True when the control takes up no space on the page (a `hidden` ancestor).
function isNotShown(node) {
  return node.getClientRects().length === 0;
}

// The form on check.html shows one step at a time. initGuide can be handed a
// `reveal(node)` function that brings the right step forward before a box in it
// takes focus. Without one, nothing extra happens.
let revealBox = null;

// Returns true if focus really moved to the box for `key`.
function focusFormBox(form, key) {
  const wrapper = form.querySelector('[data-guide-region="' + key + '"]');
  if (!wrapper) return false;
  const target = findFocusTarget(wrapper);
  if (!target) return false;
  openClosedDetails(target);
  if (typeof revealBox === "function") revealBox(target);
  if (isNotShown(target)) return false;

  // Focus first without scrolling, then scroll on our own terms.
  // "auto" would follow the page's CSS, which may be smooth, so people who ask
  // for less motion get "instant" by name.
  target.focus({ preventScroll: true });
  target.scrollIntoView({ block: "center", behavior: prefersReducedMotion() ? "instant" : "smooth" });

  // A checkbox or a drop-down focused by script after a mouse click may not
  // show a focus ring, so outline the whole box for a moment as well.
  wrapper.classList.add("guide-jump");
  window.setTimeout(function removeJumpHighlight() {
    wrapper.classList.remove("guide-jump");
  }, JUMP_HIGHLIGHT_MS);
  return true;
}

function goToFormBox(form, status, key) {
  status.textContent = "";
  if (focusFormBox(form, key)) return;

  // The box is not on the page right now. Some boxes only appear after another
  // answer, so go to the box that reveals it and say why.
  const region = findRegion(key);
  if (region && region.revealedBy && focusFormBox(form, region.revealedBy)) {
    status.textContent = region.hiddenNote;
    return;
  }
  status.textContent = "That box is not in the form right now.";
}

// ───────────────────────── Narrow screens: one disclosure per box ─────────────────────────

function buildSnippetSection(view) {
  const key = view.onlyKey;
  if (key === "analysis-date") return buildLetterhead(view);
  if (key === "current-payment") return buildPaymentSection(view, ["current"]);
  if (key === "new-payment") return buildPaymentSection(view, ["new"]);
  if (key === "required-minimum" || key === "claimed" || key === "lump-sum") return buildSummarySection(view);
  return buildActivitySection(view);
}

function lookForSentence(region) {
  const quoted = [];
  for (const name of region.lookFor) {
    quoted.push("“" + name + "”");
  }
  return quoted.join(", ") + ". " + region.where;
}

function buildWhereDisclosure(region, example) {
  const view = { mode: "snippet", example: example, onlyKey: region.key };
  return el("details", { className: "where" }, [
    el("summary", { className: "where-summary" }, [
      "Where is this on my statement?",
      // Nine summaries with the same words are hard to tell apart in a screen
      // reader's list of controls, so each one also says which box it is for.
      el("span", { className: "visually-hidden", text: " (" + region.name + ")" }),
    ]),
    el("div", { className: "where-body" }, [
      el("div", { className: "guide-sheet guide-sheet-snippet" }, [
        el("span", { className: "guide-stamp guide-stamp-small", text: "Sample" }),
        buildSnippetSection(view),
      ]),
      el("p", { className: "where-hint" }, [
        el("strong", { text: "Look for: " }),
        lookForSentence(region),
      ]),
    ]),
  ]);
}

function fillSlots(form, example) {
  const slots = form.querySelectorAll("[data-guide-slot]");
  for (const slot of slots) {
    const wrapper = slot.closest("[data-guide-region]");
    if (!wrapper) continue;
    const region = findRegion(wrapper.getAttribute("data-guide-region"));
    if (!region) continue;
    clear(slot);
    slot.append(buildWhereDisclosure(region, example));
  }
}

// ───────────────────────── Start-up ─────────────────────────

export function initGuide({ panel, form, example, reveal }) {
  if (!example || !example.account || !example.statement) return;
  revealBox = typeof reveal === "function" ? reveal : null;

  // key → the region's button on the sample sheet. Filled in by buildPanel.
  const buttons = {};
  let scrollBox = null;

  if (panel) {
    const status = el("p", { className: "guide-status", attrs: { role: "status" } });
    const view = {
      mode: "panel",
      example: example,
      buttons: buttons,
      onRegionClick: function handleRegionClick(key) {
        if (form) goToFormBox(form, status, key);
      },
    };
    scrollBox = buildPanel(panel, view, status);
  }

  if (!form) return;

  fillSlots(form, example);

  // One listener on the whole form, so bill rows that are added or removed
  // later need no extra wiring.
  form.addEventListener("focusin", function handleFocusIn(event) {
    const wrapper = event.target.closest("[data-guide-region]");
    const key = wrapper ? wrapper.getAttribute("data-guide-region") : null;
    setActiveRegion(buttons, scrollBox, key);
  });

  // When focus leaves the form, nobody is "here" any more.
  form.addEventListener("focusout", function handleFocusOut(event) {
    const goingTo = event.relatedTarget;
    if (goingTo && form.contains(goingTo)) return;
    setActiveRegion(buttons, scrollBox, null);
  });

  // Number the boxes that are on the page right now (see renumberBoxes).
  renumberBoxes({ panel: panel, form: form });
}
