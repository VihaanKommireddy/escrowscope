// pipeline.js — the seam between the form and the engine. NO DOM in this file.
//
// app.js reads the form into a plain object of strings ("values"), hands it to
// runCheck(), and draws whatever comes back. Because nothing here touches the
// page, Node can test the exact path the page uses (tests/pipeline.test.js).
//
//   exampleToValues(example) → values     what an example button types into the form
//   readInputs(values)       → { errors, account, statement, details }
//   runCheck(values)         → everything the results view needs, or a list of errors
//
// "values" holds strings exactly as typed. Dollars are turned into whole cents
// by the engine's parseDollars, and calendar months are turned into escrow-year
// months, in readInputs and nowhere else.

import * as engine from "./engine/index.js";

// The preset list for "what is this bill?" (SPEC B2).
export const BILL_KINDS = [
  { value: "property-tax", label: "Property tax" },
  { value: "homeowners-insurance", label: "Homeowners insurance" },
  { value: "flood-insurance", label: "Flood insurance" },
  { value: "mortgage-insurance", label: "Mortgage insurance (PMI or MIP)" },
  { value: "other", label: "Other bill" },
];

export const MAX_BILL_ROWS = 24;

// The longest name a bill may have. ONE limit, used for the name box on the
// form, for names read from a numbers file, and by the engine's own validation.
// (The engine owns the number; 60 is only a fallback if it is ever missing.)
export const MAX_BILL_NAME_LENGTH =
  typeof engine.MAX_BILL_LABEL_LENGTH === "number" ? engine.MAX_BILL_LABEL_LENGTH : 60;

const CLAIMED_KINDS = ["shortage", "surplus", "deficiency", "none"];

// ─────────────────────────── values ───────────────────────────

export function emptyBill(kind) {
  return { kind: kind || "property-tax", name: "", amount: "", month: "" };
}

// A blank form: two bill rows, because almost every statement has property tax
// and homeowners insurance on it (research doc 03, "Smart defaults").
export function emptyValues() {
  return {
    currentPayment: "",
    newPayment: "",
    startingBalance: "",
    balanceNegative: "",
    startMonth: "",
    requiredMinimum: "",
    claimedKind: "",
    claimedAmount: "",
    spreadMonths: "12",
    lumpSumOffered: "",
    analysisDate: "",
    bills: [emptyBill("property-tax"), emptyBill("homeowners-insurance")],
    cushionMonths: "2",
    behind: "",
    // Typed locally for the letter only. Never saved, never put in a file.
    servicerName: "",
    loanNumber: "",
    letterDate: "",
  };
}

// 112500 → "1,125.00" (what a person would type: no dollar sign, no minus).
function centsToTyped(cents) {
  return engine.formatCents(Math.abs(cents)).replace("$", "");
}

function kindForLabel(label) {
  const wanted = String(label).trim().toLowerCase();
  for (const kind of BILL_KINDS) {
    if (kind.value !== "other" && kind.label.toLowerCase() === wanted) return kind.value;
  }
  return "other";
}

function labelForBill(bill) {
  if (bill.kind === "other") {
    const name = String(bill.name || "").trim();
    return name === "" ? "Other bill" : name;
  }
  for (const kind of BILL_KINDS) {
    if (kind.value === bill.kind) return kind.label;
  }
  return "Other bill";
}

// What an example button puts in the form: dollar strings and CALENDAR months.
export function exampleToValues(example) {
  const values = emptyValues();
  const account = example.account;
  const statement = example.statement || {};
  const details = example.details || {};

  values.startMonth = String(account.startMonth);
  values.startingBalance = centsToTyped(account.startingBalanceCents);
  values.balanceNegative = account.startingBalanceCents < 0 ? "yes" : "";
  values.cushionMonths = String(account.cushionMonths);
  values.behind = account.borrowerCurrent === false ? "yes" : "";

  values.bills = [];
  for (const bill of account.disbursements) {
    const kind = kindForLabel(bill.label);
    values.bills.push({
      kind: kind,
      name: kind === "other" ? String(bill.label) : "",
      amount: centsToTyped(bill.amountCents),
      month: String(engine.escrowToCalendarMonth(bill.month, account.startMonth)),
    });
  }

  if (typeof statement.currentMonthlyEscrowCents === "number") {
    values.currentPayment = centsToTyped(statement.currentMonthlyEscrowCents);
  }
  if (typeof statement.newMonthlyEscrowCents === "number") {
    values.newPayment = centsToTyped(statement.newMonthlyEscrowCents);
  }
  if (typeof statement.requiredMinimumBalanceCents === "number") {
    values.requiredMinimum = centsToTyped(statement.requiredMinimumBalanceCents);
  }
  if (typeof statement.claimedKind === "string") {
    values.claimedKind = statement.claimedKind;
  }
  if (typeof statement.claimedAmountCents === "number") {
    values.claimedAmount = centsToTyped(statement.claimedAmountCents);
  }
  if (typeof statement.shortageSpreadMonths === "number") {
    values.spreadMonths = String(statement.shortageSpreadMonths);
  }
  if (statement.lumpSumOfferedOnStatement === true) values.lumpSumOffered = "yes";
  if (statement.lumpSumOfferedOnStatement === false) values.lumpSumOffered = "no";

  if (typeof details.analysisDate === "string") {
    values.analysisDate = details.analysisDate;
  }
  return values;
}

// ─────────────────────────── reading ───────────────────────────

// "7" → 7, but only for plain whole numbers. Anything else → null.
function parseWholeNumber(text) {
  const trimmed = String(text === undefined || text === null ? "" : text).trim();
  if (trimmed === "" || trimmed.length > 3) return null;
  for (const character of trimmed) {
    if (character < "0" || character > "9") return null;
  }
  return Number(trimmed);
}

function isBlank(text) {
  return String(text === undefined || text === null ? "" : text).trim() === "";
}

// Optional money box: blank → nothing, good → cents, bad → an error.
function readOptionalMoney(text, field, errors) {
  if (isBlank(text)) return undefined;
  const parsed = engine.parseDollars(String(text));
  if (!parsed.ok) {
    errors.push({ field: field, message: parsed.problem });
    return undefined;
  }
  return parsed.cents;
}

export function readInputs(values) {
  const errors = [];
  const source = values || {};

  // — the account (what the federal math needs) —
  const startMonth = parseWholeNumber(source.startMonth);
  const startMonthIsGood = startMonth !== null && startMonth >= 1 && startMonth <= 12;
  if (!startMonthIsGood) {
    errors.push({ field: "startMonth", message: "Pick the first month of the 12 months." });
  }

  let startingBalanceCents;
  if (isBlank(source.startingBalance)) {
    errors.push({
      field: "startingBalanceCents",
      message: "Type your escrow balance at the start of the next 12 months.",
    });
  } else {
    // The "below zero" tick box is for phones, whose number pad has no minus key.
    // The minus sign is added to the TEXT, so the engine's own parser decides the
    // sign and this file never negates a number (SPEC E5: no negative zero).
    let typedBalance = String(source.startingBalance).trim();
    const alreadySigned =
      typedBalance.startsWith("-") || typedBalance.startsWith("\u2212") || typedBalance.startsWith("(");
    if (source.balanceNegative === "yes" && !alreadySigned) typedBalance = "-" + typedBalance;
    const parsed = engine.parseDollars(typedBalance);
    if (parsed.ok) {
      startingBalanceCents = parsed.cents;
    } else {
      errors.push({ field: "startingBalanceCents", message: parsed.problem });
    }
  }

  const cushionMonths = parseWholeNumber(isBlank(source.cushionMonths) ? "2" : source.cushionMonths);
  if (cushionMonths === null || cushionMonths > 2) {
    errors.push({ field: "cushionMonths", message: "Pick a cushion of 2 months, 1 month, or none." });
  }

  const bills = Array.isArray(source.bills) ? source.bills : [];
  const disbursements = [];
  if (bills.length === 0) {
    errors.push({
      field: "disbursements",
      message: "Add at least one bill. Most statements list property tax and homeowners insurance.",
    });
  }
  for (let index = 0; index < bills.length; index++) {
    const bill = bills[index] || {};
    const prefix = "disbursements." + index;
    const entry = { label: labelForBill(bill), month: undefined, amountCents: undefined };

    // One limit for a bill's name, wherever the name came from (typed or loaded).
    if (entry.label.length > MAX_BILL_NAME_LENGTH) {
      errors.push({
        field: prefix + ".label",
        message: "That name is too long. Keep it to " + MAX_BILL_NAME_LENGTH + " characters or fewer.",
      });
    }

    if (isBlank(bill.amount)) {
      errors.push({ field: prefix + ".amountCents", message: "Type this bill’s amount, or remove the row." });
    } else {
      const parsed = engine.parseDollars(String(bill.amount));
      if (parsed.ok) entry.amountCents = parsed.cents;
      else errors.push({ field: prefix + ".amountCents", message: parsed.problem });
    }

    const calendarMonth = parseWholeNumber(bill.month);
    if (calendarMonth === null || calendarMonth < 1 || calendarMonth > 12) {
      errors.push({ field: prefix + ".month", message: "Pick the month this bill gets paid." });
    } else if (startMonthIsGood) {
      // The user picks calendar months; the engine counts from the first of the next 12 months.
      entry.month = engine.calendarToEscrowMonth(calendarMonth, startMonth);
    }
    disbursements.push(entry);
  }

  const account = {
    startMonth: startMonthIsGood ? startMonth : undefined,
    startingBalanceCents: startingBalanceCents,
    cushionMonths: cushionMonths === null ? undefined : cushionMonths,
    borrowerCurrent: source.behind !== "yes",
    disbursements: disbursements,
  };

  // — the statement (comparison only; every box optional) —
  const statement = {};
  const current = readOptionalMoney(source.currentPayment, "statement.currentMonthlyEscrowCents", errors);
  if (current !== undefined) statement.currentMonthlyEscrowCents = current;
  const next = readOptionalMoney(source.newPayment, "statement.newMonthlyEscrowCents", errors);
  if (next !== undefined) statement.newMonthlyEscrowCents = next;
  const minimum = readOptionalMoney(source.requiredMinimum, "statement.requiredMinimumBalanceCents", errors);
  if (minimum !== undefined) statement.requiredMinimumBalanceCents = minimum;

  const claimedKind = isBlank(source.claimedKind) ? "" : String(source.claimedKind).trim();
  if (claimedKind !== "") {
    if (!CLAIMED_KINDS.includes(claimedKind)) {
      errors.push({ field: "statement.claimedKind", message: "Pick what the statement says from the list." });
    } else {
      statement.claimedKind = claimedKind;
      if (claimedKind !== "none") {
        const amount = readOptionalMoney(source.claimedAmount, "statement.claimedAmountCents", errors);
        if (amount !== undefined) statement.claimedAmountCents = amount;
      }
      if (claimedKind === "shortage" || claimedKind === "deficiency") {
        if (!isBlank(source.spreadMonths)) {
          const months = parseWholeNumber(source.spreadMonths);
          if (months === null || months < 1 || months > engine.MAX_SPREAD_MONTHS) {
            errors.push({
              field: "statement.shortageSpreadMonths",
              message: "Type the number of months as a whole number from 1 to " + engine.MAX_SPREAD_MONTHS + ". Most statements use 12.",
            });
          } else {
            statement.shortageSpreadMonths = months;
          }
        }
      }
      if (claimedKind === "shortage") {
        if (source.lumpSumOffered === "yes") statement.lumpSumOfferedOnStatement = true;
        if (source.lumpSumOffered === "no") statement.lumpSumOfferedOnStatement = false;
      }
    }
  }

  // — details (the refund clock and the letter) —
  const details = {};
  if (!isBlank(source.analysisDate)) {
    const typedDate = String(source.analysisDate).trim();
    if (typeof engine.refundDeadline === "function") {
      const checked = engine.refundDeadline(typedDate);
      if (checked.ok) details.analysisDate = typedDate;
      else errors.push({ field: "details.analysisDate", message: checked.problem });
    } else {
      details.analysisDate = typedDate;
    }
  }
  if (!isBlank(source.servicerName)) details.servicerName = String(source.servicerName).trim();
  if (!isBlank(source.loanNumber)) details.loanNumber = String(source.loanNumber).trim();
  if (!isBlank(source.letterDate)) details.date = String(source.letterDate).trim();

  return { errors: errors, account: account, statement: statement, details: details };
}

// ─────────────────────────── checking ───────────────────────────

function failure(errors, warnings, inputs) {
  return {
    ok: false,
    errors: errors,
    warnings: warnings,
    account: inputs ? inputs.account : null,
    statement: inputs ? inputs.statement : null,
    details: inputs ? inputs.details : null,
    result: null,
    comparison: null,
    verdict: null,
    steps: [],
    jump: null,
    next: [],
    servicerLine: null,
    refund: null,
    letter: "",
    letterKind: "",
  };
}

// readInputs → validate → analyze → compare → explain. Never throws: a surprise
// inside the engine comes back as one plain error instead of a broken page.
export function runCheck(values) {
  let inputs = null;
  try {
    inputs = readInputs(values);
    if (inputs.errors.length > 0) return failure(inputs.errors, [], inputs);

    const accountCheck = engine.validateAccount(inputs.account);
    let statementCheck = { errors: [], warnings: [] };
    if (typeof engine.validateStatement === "function") {
      statementCheck = engine.validateStatement(inputs.statement, inputs.account);
    }
    const errors = accountCheck.errors.concat(statementCheck.errors);
    const warnings = accountCheck.warnings.concat(statementCheck.warnings);
    if (errors.length > 0) return failure(errors, warnings, inputs);

    const result = engine.analyze(inputs.account);
    const comparison = engine.compareWithStatement(result, inputs.statement);
    const verdict = engine.explainVerdict(result, comparison);
    const steps = engine.explainSteps(result);
    const jump = engine.explainJump(result, inputs.statement);
    const next = engine.nextSteps(result, comparison);

    let servicerLine = null;
    if (typeof engine.explainServicerLine === "function") {
      servicerLine = engine.explainServicerLine(result, inputs.account, inputs.statement);
    }

    // The refund clock (SPEC D8): only when a refund is required and a date was typed.
    let refund = null;
    if (
      typeof engine.refundDeadline === "function" &&
      result.classification === "SURPLUS_REFUND_REQUIRED" &&
      !result.nearLine && // SPEC E3: no refund date when it is too close to call
      typeof inputs.details.analysisDate === "string"
    ) {
      const deadline = engine.refundDeadline(inputs.details.analysisDate);
      if (deadline.ok) refund = deadline;
    }

    const letter = engine.buildLetter(result, comparison, inputs.details);

    // Which kind of letter the engine wrote: "NOTICE_OF_ERROR" only when the
    // numbers point at a specific problem, otherwise "REQUEST_FOR_INFORMATION".
    // The letter panel's title comes from this, so it never calls a plain
    // "please explain" letter a notice of error.
    let letterKind = "";
    if (typeof engine.letterKind === "function") {
      letterKind = engine.letterKind(result, comparison);
    }

    // Gentle "did you mean…?" notes from the comparison (for example: the number
    // typed as the required minimum looks like the lowest projected balance).
    // They join the other soft warnings, so they show under their own box.
    if (Array.isArray(comparison.nudges)) {
      for (const nudge of comparison.nudges) {
        if (nudge && typeof nudge.message === "string" && nudge.message !== "") {
          warnings.push({ field: typeof nudge.field === "string" ? nudge.field : "", message: nudge.message });
        }
      }
    }

    return {
      ok: true,
      errors: [],
      warnings: warnings,
      account: inputs.account,
      statement: inputs.statement,
      details: inputs.details,
      result: result,
      comparison: comparison,
      verdict: verdict,
      steps: steps,
      jump: jump,
      next: next,
      servicerLine: servicerLine,
      refund: refund,
      letter: letter,
      letterKind: letterKind,
    };
  } catch (problem) {
    const message =
      "Something unexpected went wrong while checking these numbers. Nothing was sent anywhere. Please check each box and try again.";
    return failure([{ field: "", message: message }], [], inputs);
  }
}

// SPEC E3: when a result sits within $7 of a legal line (the $50 refund line, or
// one month's payment), the engine sets result.nearLine and softens its words.
// The page must then stay calm too: teal "info" styling, never the amber
// "refund required" look, and no refund date. The ONLY test is whether the
// engine set nearLine. "Near" is never worked out again here.
// (It lives in this file, not render.js, so the landing page's small preview can
// ask the question without loading the whole results drawer.)
export function isTooCloseToCall(check) {
  if (!check || !check.result) return false;
  const nearLine = check.result.nearLine;
  return nearLine !== null && nearLine !== undefined;
}

// Is this dollar amount probably still being typed? While someone types 1,234
// the box passes through "1," and "1,2", which are not valid amounts YET. Live
// what-if uses this to stay quiet for a moment instead of flashing an error.
// It only ever delays a message: pressing "Check the math" still checks everything.
export function looksUnfinished(text) {
  const typed = String(text === undefined || text === null ? "" : text).trim();
  if (typed === "") return false;
  const last = typed[typed.length - 1];
  if (last === "," || last === "." || last === "-" || last === "\u2212" || last === "$" || last === "(") return true;

  // A comma group that is still short: "1,2" or "12,34" (before any decimal point).
  const whole = typed.split(".")[0];
  const groups = whole.split(",");
  if (groups.length > 1) {
    const lastGroup = groups[groups.length - 1];
    let allDigits = lastGroup.length > 0;
    for (const character of lastGroup) {
      if (character < "0" || character > "9") allDigits = false;
    }
    if (allDigits && lastGroup.length < 3) return true;
  }
  return false;
}

// The live "Total for the year" under the bills. Rows that are blank or not a
// positive amount yet are skipped, so the total never shows nonsense mid-typing.
export function billsTotal(values) {
  const bills = values && Array.isArray(values.bills) ? values.bills : [];
  let cents = 0;
  let counted = 0;
  for (const bill of bills) {
    if (!bill || isBlank(bill.amount)) continue;
    const parsed = engine.parseDollars(String(bill.amount));
    if (parsed.ok && parsed.cents > 0) {
      cents = cents + parsed.cents;
      counted = counted + 1;
    }
  }
  return { cents: cents, counted: counted, text: engine.formatCents(cents) };
}

// ─────────────────── D7: keep your numbers in a file ───────────────────
//
// The file is written by the visitor's own browser to the visitor's own device.
// Reading one back treats it as UNTRUSTED: only known keys are copied, every
// value is forced to a short string, and the result then goes through
// readInputs + the engine's validation like anything typed by hand.

export const FILE_KIND = "escrowscope-numbers";
export const FILE_VERSION = 1;
export const MAX_FILE_CHARACTERS = 100000;

const MAX_TEXT_LENGTH = 120;

// Keys that are saved. The servicer name and loan number are deliberately left
// out: the page promises they are never stored.
const SAVED_KEYS = [
  "currentPayment",
  "newPayment",
  "startingBalance",
  "balanceNegative",
  "startMonth",
  "requiredMinimum",
  "claimedKind",
  "claimedAmount",
  "spreadMonths",
  "lumpSumOffered",
  "analysisDate",
  "cushionMonths",
  "behind",
];

function shortText(value) {
  if (typeof value !== "string" && typeof value !== "number") return "";
  return String(value).slice(0, MAX_TEXT_LENGTH);
}

export function valuesToFileText(values) {
  const saved = {};
  for (const key of SAVED_KEYS) {
    saved[key] = shortText(values[key]);
  }
  saved.bills = [];
  const bills = Array.isArray(values.bills) ? values.bills : [];
  for (const bill of bills.slice(0, MAX_BILL_ROWS)) {
    saved.bills.push({
      kind: shortText(bill.kind),
      name: shortText(bill.name),
      amount: shortText(bill.amount),
      month: shortText(bill.month),
    });
  }
  const file = {
    kind: FILE_KIND,
    version: FILE_VERSION,
    note: "Saved by EscrowScope on your own device. It holds only the numbers you typed.",
    values: saved,
  };
  return JSON.stringify(file, null, 2) + "\n";
}

export function fileTextToValues(text) {
  const notOurs = {
    ok: false,
    problem: "That file is not an EscrowScope numbers file. Pick a file you saved with “Download my numbers”.",
  };
  if (typeof text !== "string" || text.length > MAX_FILE_CHARACTERS) return notOurs;

  let file;
  try {
    file = JSON.parse(text);
  } catch (problem) {
    return notOurs;
  }
  if (file === null || typeof file !== "object" || Array.isArray(file)) return notOurs;
  if (file.kind !== FILE_KIND || file.version !== FILE_VERSION) return notOurs;
  const saved = file.values;
  if (saved === null || typeof saved !== "object" || Array.isArray(saved)) return notOurs;

  const values = emptyValues();
  for (const key of SAVED_KEYS) {
    if (Object.prototype.hasOwnProperty.call(saved, key)) values[key] = shortText(saved[key]);
  }
  if (Array.isArray(saved.bills)) {
    values.bills = [];
    for (const bill of saved.bills.slice(0, MAX_BILL_ROWS)) {
      if (bill === null || typeof bill !== "object") continue;
      values.bills.push({
        kind: shortText(bill.kind),
        name: shortText(bill.name).slice(0, MAX_BILL_NAME_LENGTH),
        amount: shortText(bill.amount),
        month: shortText(bill.month),
      });
    }
  }
  return { ok: true, values: values };
}
