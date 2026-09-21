# EscrowScope v1: the math, mapped to the law

This page is for someone checking whether the tool is honest. It answers four things:

1. Where does every number and every verdict come from, paragraph by paragraph?
2. Does the engine reproduce the example printed in the regulation itself?
3. What did the independent audit find, and how do you re-run it?
4. What does the tool deliberately not decide?

**Where the cites come from.** Every cite on this page is copied from `docs/research/01-reg-math.md` (61 quotes checked word for word against eCFR, the CFPB site and Cornell LII) or from `docs/verification/math-audit.md`. Where neither source has a cite, this page says "not sourced" instead of guessing. Page ranges are written with a hyphen here (8813-14).

**How to read the "Kind" column.** This matters more than anything else on the page.

| Kind | What it means | Weight |
|---|---|---|
| **REG** | Text of 12 CFR 1024.17 ("Regulation X"), or §§ 1024.35 and 1024.36 | Binding regulation |
| **APP E** | Appendix E to Part 1024, "Arithmetic Steps": the worked example printed in the regulation | Binding regulation |
| **HUD** | HUD Federal Register notices: 59 FR 53890 (Oct. 26, 1994) and 60 FR 8812 (Feb. 15, 1995). HUD wrote the rule and ran RESPA until 2011. | **Guidance, not regulation text.** The CFPB says these Public Guidance Documents "are not 'rules, regulations, or interpretations' of the Bureau". Strong evidence of what the rule means. Not the rule. |
| **CFPB FAQ** | CFPB Mortgage Servicing FAQs, escrow questions | Official CFPB compliance aid. Not regulation. |
| **CHOICE** | This project's own decision where the regulation is silent | Not law. Written down in the test vectors' `meta.choicesThatAreNotLaw` and in the code comments. |

The regulation and Appendix E never mention cents. Every number in Appendix E is a whole dollar. So every rounding rule below is a CHOICE.

---

## Part 1. Every number and verdict, mapped

### 1a. What `analyze(account)` computes

All of these live in `engine/analyze.js` unless the Function column says otherwise. Vector IDs refer to `docs/research/01-test-vectors.json`. All 30 vectors pin every field below (the engine must match every expected key and all 12 table rows), so the "Pinned by" column lists the vectors that were written to target that item.

| Output | Kind | Source | Function | Pinned by |
|---|---|---|---|---|
| `annualDisbursementsCents` (D) | REG | § 1024.17(d)(2)(i)(A): "one-twelfth of the estimated total annual escrow account disbursements" | `addUpBills` | all; TV01, TV02 |
| `baseMonthlyPaymentCents` (P = D ÷ 12) | REG | (c)(1)(ii): "a monthly sum equal to one-twelfth (1/12) of the total annual escrow payments"; (d)(2)(i)(A) | `divideRoundHalfUp(D, 12)` in `money.js` | all |
| P rounds to the nearest cent, halves up | CHOICE | reg silent | `divideRoundHalfUp` | TV15 ($5,000.00 ÷ 12 = $416.67), TV25 |
| The deposit used in the projection is computed, never typed | REG | (d)(2)(i)(A): the servicer "assumes that the borrower will make monthly payments equal to one-twelfth of the estimated total annual escrow account disbursements" | `analyze` | TV18 (what goes wrong otherwise: −$1,125 or −$25 against a true −$300) |
| `cushionCapCents` (C = D × cushionMonths ÷ 12) | REG | (c)(5): "The cushion must be no greater than one-sixth (1/6) of the estimated total annual disbursements from the escrow account" | `divideRoundDown(D × cushionMonths, 12)` | TV01 ($800), TV02 ($260) |
| A lower cushion (1 month or none) wins | REG | (c)(8): "If any such documents provide for lower cushion limits, then the terms of the loan documents apply"; (d)(2)(i)(C): "or a lesser amount specified by state law or the mortgage document" | `cushionMonths` input, default 2 | TV16 (1 month), TV17 and TV12 (zero) |
| C rounds **down** | CHOICE | reg silent. Reason: "no greater than" means a cap must never be rounded up past the limit. | `divideRoundDown` | TV15 ($833.33, never $833.34) |
| `table[].step1TrialBalanceCents` | REG + APP E | (d)(2)(i)(A) "a trial running balance"; Appendix E Step 1 | `stepOneTrialBalances` | TV02's printed Step 1 column, number for number |
| Bills in the same month are added; balances are month-end | REG + APP E | (b) target balance: "the estimated month end balance"; Appendix E's July row nets a payment and a bill | `billsForEachMonth` | TV14, TV21 |
| The table runs in whole cents using the rounded P | CHOICE | reg silent | `stepOneTrialBalances` | TV15 |
| `stepTwoAddCents` | REG + APP E | (d)(2)(i)(B): "adds to the first monthly balance an amount just sufficient to bring the lowest monthly trial balance to zero"; Appendix E Step 2 | `analyze` | TV02 ($780), TV01 ($400) |
| The Step 2 add is never below $0 | APP E + CHOICE | Appendix E Step 2: "Increase monthly balances to eliminate negative balances". The case only exists because of cent rounding, which is a CHOICE (SPEC E1). | `analyze` | TV25 |
| `requiredStartingBalanceCents` (add + cushion) | REG + APP E | (d)(2)(i)(C): "The servicer then adds to the monthly balances the permissible cushion"; Appendix E Step 3; the test in (d)(2)(ii): "the lowest monthly target balance for the account shall be less than or equal to one-sixth of the estimated total annual escrow account disbursements" | `analyze` | TV02 ($1,040), TV01 ($1,200) |
| `table[].targetBalanceCents` | REG + APP E | (b) "Target balance"; Appendix E Step 3 column | table loop | TV02's printed Step 3 column; TV03 and TV04 (HUD's printed columns) |
| `table[].projectedBalanceCents` | derived | real starting balance + Step 1 balance. Not a regulation term. It is what the account will do if the payment is exactly P. | table loop | all |
| `differenceCents`, `surplusCents`, `shortageCents` | REG | (b): surplus is "an amount by which the current escrow account balance exceeds the target balance"; shortage is "an amount by which a current escrow account balance falls short of the target balance at the time of escrow analysis". HUD's model statement says it the same way (Appendix I-8, 60 FR 8829). | `splitDifference` | TV03 (HUD's $230 surplus), TV01, TV09 |
| `deficiencyCents` | REG | (b): "Deficiency is the amount of a negative balance in an escrow account" | `splitDifference` | TV12 |
| A projected dip below $0 is a shortage, never a deficiency | HUD | 59 FR 53890 (1994): "This rule does not allow servicers to anticipate deficiencies and collect on a deficiency in advance." | `splitDifference` looks only at the real starting balance | TV19 |
| Deficiency first, then the remaining shortage from $0 up to the target | **HUD** | 60 FR 8812, 8813-14, clarification (l): "The servicer first computes the deficiency and then computes the remaining shortage"; worked example in Appendix M (60 FR 8837) | `splitDifference` | TV04 (HUD's own numbers), TV23 |
| `lowPoint` (value and month), searched over months 1 to 12 only | derived + CHOICE | The low point is how the target is built, not a term in (b). Leaving the starting row out of the search is a choice (research notes, open question Q10). | `findLowest` | all |
| A tie for the lowest month goes to the earliest month | CHOICE | reg silent | `findLowest` (strict `<`) | TV21 |
| `lowPoint.lowestTargetBalanceCents` | REG | (d)(2)(ii) "lowest monthly target balance". Read from the low month's row, not copied from the cap. | `analyze` | TV25 (20,007 cents, not 20,001) |
| Months in escrow-year order; `startMonth` | REG | (b): "Escrow account computation year is a 12-month period that a servicer establishes for the escrow account beginning with the borrower's initial payment date" | `escrowToCalendarMonth`, `calendarToEscrowMonth` in `money.js` | TV02 (July), TV03 and TV04 (September), TV13 (April) |
| `newMonthlyEscrowPayment`: base + shortage ÷ 12 + deficiency ÷ 2 | REG | (c)(1)(ii) allows "additional deposits to make up the shortage or eliminate the deficiency, subject to the limitations set forth in § 1024.17(f)"; (f)(3): "equal monthly payments over at least a 12-month period", so 12 is the fastest; (f)(4): "2 or more equal monthly payments", so 2 is the fastest | `buildNewMonthlyPayment` | TV04 ($1,975 then $775, HUD's printed figures), TV09, TV12 |
| The spreads round half up | CHOICE | reg silent | `divideRoundHalfUp` | TV10b ($479.99 ÷ 12 = $40.00), TV19 |
| No deficiency schedule when the borrower is not current | REG | (f)(4)(iii): the servicer "may recover the deficiency pursuant to the terms of the federally related mortgage loan documents" | `buildNewMonthlyPayment` (spread fields stay 0) | TV22, TV23 |
| The cushion is not part of the payment formula | APP E + REG | Appendix E prints the same $130 payment in Steps 1, 2 and 3; (d)(2)(i)(C): "net of any increases or decreases because of prior year shortages or surpluses" | by design | TV02 |
| `paymentJumpDecomposition` (only with `priorYear`) | derived | Exact algebra from research notes section 8. The notes say plainly the identity is derived, not quoted from the rule. | `buildPaymentJumpDecomposition` | TV18 |
| `projectWithPayment` | derived | Starting balance + (a given payment − bills). For drawing and comparing only. The verdict never uses it. | `projectWithPayment` | TV18's `whatGoesWrong`, checked in `tests/selfcheck.test.js` |

### 1b. The classifications

`classify` in `engine/analyze.js`. The cite strings below are exactly what the engine returns in `result.cite`.

| `classification` | Kind | Paragraph | Pinned by |
|---|---|---|---|
| `SURPLUS_REFUND_REQUIRED` | REG | (f)(2)(i): refund "within 30 days from the date of the analysis" if the surplus "is greater than or equal to 50 dollars ($50)" | TV01, TV03, TV06 (exactly $50.00), TV13, TV16, TV17, TV25, TV26, TV28, TV29 |
| `SURPLUS_UNDER_50` | REG | (f)(2)(i): "may refund such amount to the borrower, or credit such amount against the next year's escrow payments" | TV07 ($49.99), TV08, TV15 |
| `SURPLUS_BORROWER_NOT_CURRENT` | REG | (f)(2)(ii): "may retain the surplus in the escrow account pursuant to the terms of the federally related mortgage loan documents" | TV20 |
| `ON_TARGET` | REG | (d)(2) | TV02, TV05, TV21 |
| `SHORTAGE_LT_ONE_MONTH` | REG | (f)(3)(i): three courses of action | TV09, TV10b, TV14, TV18, TV24, TV27 |
| `SHORTAGE_GE_ONE_MONTH` | REG | (f)(3)(ii): two courses of action, no 30-day demand | TV10 (exactly one month), TV11, TV19 |
| `DEFICIENCY_LT_ONE_MONTH` | REG | (f)(4)(i) | TV12 |
| `DEFICIENCY_GE_ONE_MONTH` | REG | (f)(4)(ii) | no vector on its own. Pinned by the test "a deficiency of EXACTLY one month's payment is in the greater-or-equal tier, one cent less is not" in `tests/analyze.test.js`, and inside TV04. |
| `DEFICIENCY_BORROWER_NOT_CURRENT` | REG | (f)(4)(iii) | TV22 |
| `DEFICIENCY_*_AND_SHORTAGE_*` (combined forms) | REG + **HUD** | both paragraphs. The order (deficiency first) is HUD guidance, 60 FR 8812, 8813-14. | TV04 (GE + GE), TV23 (not current + GE). The other combinations are pinned by named tests in `tests/analyze.test.js`. |
| Shortage handling does not depend on "current" | REG | (f)(3) has no such condition. It exists only in (f)(2)(ii) and (f)(4)(iii). | TV24, and a property test over random accounts |
| "One month's escrow account payment" means the **new** base payment, D ÷ 12 | CHOICE | reg silent on old versus new (research notes, open question Q2) | TV10, TV10b |
| A borrower is "current" | REG | (f)(2)(ii): "A borrower is current if the servicer receives the borrower's payments within 30 days of the payment due date" | `borrowerCurrent` input, default true |

### 1c. "Too close to call" (`result.nearLine`)

| Item | Kind | Source | Function | Pinned by |
|---|---|---|---|---|
| The idea: soften the words when a figure is within $7.00 of the $50.00 line or of one month's payment | CHOICE | SPEC E3, from the math audit. Basis: HUD 60 FR 8812, clarification (a): "any dollar amount referenced in this rule may be rounded up or down to the nearest dollar". | `findNearLine`, `nearLineOrNull` | TV06, TV07, TV10, TV10b, TV26, TV27 |
| The band is inclusive (distance of 700 cents or less) | CHOICE | SPEC E3a | `nearLineOrNull` | TV28 (in at exactly $7.00), TV29 (out at $7.01) |
| `classification` stays cent-exact inside the band | CHOICE | SPEC E3 | `classify` is untouched by `nearLine` | TV06, TV07, TV10, TV10b unchanged |
| The $50 line and the deficiency line cannot be "near" for a borrower who is not current | REG | those lines decide nothing there: (f)(2)(ii), (f)(4)(iii) | `findNearLine` | `tests/analyze.test.js` |
| If a deficiency and a shortage are both in the band, the deficiency is reported | CHOICE | SPEC E3a | `findNearLine` | `tests/analyze.test.js`; the auditor's `bothNear` fuzz family |

### 1d. The comparison: rows, flags, tolerances

`compareWithStatement` in `engine/compare.js`. **The test vectors do not cover this file.** They pin `analyze` only. The flags are pinned by named tests in `tests/compare.test.js` and by the auditor's simulated servicers in `audit/stage2-compare-checks.mjs` (lawful ones must not be accused, unlawful ones must be caught).

| Item | Kind | Source | Pinned by |
|---|---|---|---|
| Everything is a ceiling. At or under a limit is fine. | REG | (d)(1): "The steps set forth in this section result in maximum limits. Servicers may use accounting procedures that result in lower target balances. In particular, servicers may use a cushion less than the permissible cushion or no cushion at all." | "a servicer using a smaller cushion is not flagged…" |
| `CUSHION_OVER_CAP` | REG | (c)(5). The cite becomes (c)(8) when the person chose a 1-month or zero cushion. | "CUSHION_OVER_CAP: a 3-month cushion is $600 over the $1,200 cap…" |
| `CUSHION_MAYBE_OVER_CAP` and the `MINIMUM_LOOKS_LIKE_LOW_POINT` nudge | CHOICE | This project's handling of one ambiguous input: the typed minimum is over the cap and also equals the federal low point. Three cases (mix-up, over the cap, cannot tell), decided by what else was typed. The limit itself is still (c)(5) or (c)(8). See Part 5. | the tests whose names start with "N1" in `tests/compare.test.js`, including the auditor's exact repro |
| `PAYMENT_ABOVE_MAX` | REG | The maximum is (c)(1)(ii) + (f)(3) + (f)(4), as in 1a. The flag carries the cite (c)(1)(ii). | "PAYMENT_ABOVE_MAX: $650 when the most the math supports is $600…" |
| The payment ceiling when the borrower is not current and there is a deficiency: bills ÷ 12 + shortage ÷ 12 + the **whole** deficiency, in any one month | REG + CHOICE | (f)(4)(iii) hands the schedule to the mortgage documents. Reading that as "no single month can collect more than the whole deficiency" is the auditor's reasoning (Stage 3, finding N2), adopted by the project. The regulation does not state a ceiling in those words. | `paymentCeiling` in `engine/analyze.js`; the tests whose names start with "N2" in `tests/compare.test.js` |
| `AMOUNT_DIFFERS`, `KIND_DIFFERS` | REG | (b) definitions + the (d)(2) method. Cite string: "12 CFR 1024.17(b) + 12 CFR 1024.17(d)(2)". | several named tests, including the TV19 case (a projected dip labeled "deficiency") |
| `SPREAD_TOO_SHORT` | REG | (f)(3)(i) and (f)(3)(ii): "over at least a 12-month period". A 1-month (30-day) demand is on the list only for a small shortage. | named tests; the auditor's "large shortage spread over 1 to 11 months" and "small shortage spread over 2 to 11 months" families |
| `LUMP_SUM_OFFERED` (always worded as a question) | REG + **CFPB FAQ** | (f)(3)(ii), plus the CFPB Mortgage Servicing FAQs, escrow section on deficiencies, shortages and surpluses, questions 4 to 6, last updated June 2, 2021: "The specified repayment options in Regulation X are exclusive. Therefore, a servicer cannot include in the annual escrow statement any options for repayment of shortages that are not specified in Regulation X, such as a lump sum payment option for a shortage that is equal to or more than one month's escrow payment." | named tests; the auditor confirmed the FAQ wording is there word for word |
| Balance tolerance: **$7.00** | CHOICE | Basis: HUD 60 FR 8812 clarification (a). 50 cents × 12 months + 50 cents on the cushion = $6.50, rounded up to $7.00. | "one cent past each tolerance is flagged"; the auditor's edge checks ($7.00 no flag, $7.01 flag) |
| Payment tolerance: **$1.00 for each separately rounded part** ($1, $2 or $3) | CHOICE | Math audit defect 1 (A1). Same HUD basis: a whole-dollar servicer rounds bills ÷ 12, shortage ÷ 12 and deficiency ÷ 2 separately. | the auditor's 20,000 simulated whole-dollar servicers: 0 accused |
| A surplus under $50 credited as 12 equal credits | CHOICE | reg silent on how the credit is spread (research notes, open question Q5) | named test |

### 1e. The refund clock, the letter, the next steps

| Item | Kind | Source | Function |
|---|---|---|---|
| Refund date = analysis date + 30 days | REG | § 1024.17(f)(2)(i): "within 30 days from the date of the analysis" | `refundDeadline` in `engine/dates.js` |
| Notice of error | REG | § 1024.35(a): a written notice that includes "the name of the borrower, information that enables the servicer to identify the borrower's mortgage loan account, and the error the borrower believes has occurred" | `buildLetter`, `letterKind` in `engine/letter.js` |
| Request for information | REG | § 1024.36(a) | `buildLetter`, `letterKind` |
| Which letter it is | CHOICE, built on REG | A notice of error only when a flag asserts a discrepancy, because § 1024.35(a) is for a notice that asserts an error (math audit defect 2). | `letterKind` |
| 5 business days to acknowledge | REG | § 1024.35(d); § 1024.36(c) | `nextSteps` in `engine/explain.js` |
| 30 business days to respond | REG | § 1024.35(e)(3)(i)(C); § 1024.36(d)(2)(i)(B) | `nextSteps` |
| 15 more business days if the servicer says so in writing first | REG | § 1024.35(e)(3)(ii); § 1024.36(d)(2)(ii) | `nextSteps` |
| No fee | REG | § 1024.35(h); § 1024.36(g)(1) | `nextSteps` |
| Use the address the servicer designates | REG | § 1024.35(c) | `nextSteps`, the letter's address line |
| Is an escrow miscalculation a covered "error"? | **not settled** | It is not named in § 1024.35(b). The closest fit is the catch-all (b)(11), "Any other error relating to the servicing of a borrower's mortgage loan". The research found no CFPB statement saying so in those words. The page says "can send", never "the law guarantees this is covered". | wording in `nextSteps` |
| CFPB complaint phone, 855-411-2372 | checked | Printed on the linked CFPB complaint page (confirmed by the auditor and the Build Chief). The housing counselor step carries no phone, because the linked page does not print one. | `nextSteps` |

---

## Part 2. The official Appendix E example, worked in full (TV02)

This is the example printed in the regulation itself: Appendix E to 12 CFR Part 1024, Part I. If the engine could not reproduce it, nothing else would matter.

**Assumptions, as printed:** $360 for school taxes disbursed on September 20. $1,200 for county property taxes: $500 disbursed on July 25 and $700 disbursed on December 10. Cushion: one-sixth of estimated annual disbursements. First payment: July 1.

So the escrow year runs July to June. In engine terms: `startMonth: 7`, bills in escrow months 1 (July, $500), 3 (September, $360) and 6 (December, $700). The vector sets the starting balance to $1,040.

**The numbers:**

- D = $500 + $360 + $700 = **$1,560**
- P = $1,560 ÷ 12 = **$130**
- C = $1,560 ÷ 6 = **$260**

| Month | Payment | Bills | Step 1 (from $0) | Step 2 (+ $780) | Step 3 (+ $260) |
|---|---:|---:|---:|---:|---:|
| Jun (start) | 0 | 0 | 0 | 780 | **1,040** |
| Jul | 130 | 500 | −370 | 410 | 670 |
| Aug | 130 | 0 | −240 | 540 | 800 |
| Sep | 130 | 360 | −470 | 310 | 570 |
| Oct | 130 | 0 | −340 | 440 | 700 |
| Nov | 130 | 0 | −210 | 570 | 830 |
| **Dec** | 130 | 700 | **−780** | **0** | **260** |
| Jan | 130 | 0 | −650 | 130 | 390 |
| Feb | 130 | 0 | −520 | 260 | 520 |
| Mar | 130 | 0 | −390 | 390 | 650 |
| Apr | 130 | 0 | −260 | 520 | 780 |
| May | 130 | 0 | −130 | 650 | 910 |
| Jun | 130 | 0 | 0 | 780 | 1,040 |

- **Step 1.** Start at $0. Add $130 a month, subtract bills in the month they are paid. The worst month is December at −$780.
- **Step 2.** Add $780 to every row so December is exactly $0.
- **Step 3.** Add the $260 cushion to every row. December is now $260, which is the cushion. The first row, **$1,040**, is the most the servicer may hold at the start of this escrow year.

Three things the example itself shows:

1. The payment is $130 in all three tables. The cushion never touches the monthly payment. It lives in the balance.
2. The official example is itself a year that does not start in January.
3. Deposits for the year equal bills for the year, so the last row equals the first row.

**What the engine returns for TV02:** D 156,000 cents, P 13,000, C 26,000, Step 2 add 78,000, required start 104,000, difference 0, low point $260 in escrow month 6 (December), classification `ON_TARGET`, cite `12 CFR 1024.17(d)(2)`.

**How it is checked.** The vector carries all three printed columns (13 numbers each: the starting row, then months 1 to 12). `runSelfCheck` rebuilds the same columns from the engine's result and compares them number for number. The auditor's `audit/check-vectors.mjs` goes one step further: it holds its own copy of the three columns, read from the official eCFR XML, and checks both the engine and the vector file against it.

One more guard. Appendix E also prints an older single-item example (each bill type gets its own account and cushion). That method is no longer allowed: (c)(4) says "All servicers must use the aggregate accounting method". With the same bills it would need $800 + $330 = $1,130 to start. `tests/vectors.test.js` has a test that the engine says $1,040, not $1,130.

---

## Part 3. The owner's hand-derived test case #1, worked in full (TV01)

Worked by hand from the regulation by Vihaan Kommireddy on 2026-07-24, before any code existed. The v0.1 engine matched it on its first run. The research agent later re-derived it with the regulation's method and got the same numbers.

**Inputs:** starting balance $1,500. Year starts in January. Cushion 2 months. Borrower current. Bills: property tax $1,800 in May, homeowners insurance $1,200 in July, property tax $1,800 in November.

- D = $1,800 + $1,200 + $1,800 = **$4,800**
- P = $4,800 ÷ 12 = **$400** ((c)(1)(ii))
- C = $4,800 ÷ 6 = **$800** ((c)(5))

| Month | Deposit | Bills | Step 1 (from $0) | Target (Step 3) | Projected (from $1,500) |
|---|---:|---:|---:|---:|---:|
| start | | | $0 | **$1,200** | $1,500 |
| Jan | $400 | $0 | $400 | $1,600 | $1,900 |
| Feb | $400 | $0 | $800 | $2,000 | $2,300 |
| Mar | $400 | $0 | $1,200 | $2,400 | $2,700 |
| Apr | $400 | $0 | $1,600 | $2,800 | $3,100 |
| May | $400 | $1,800 | $200 | $1,400 | $1,700 |
| Jun | $400 | $0 | $600 | $1,800 | $2,100 |
| Jul | $400 | $1,200 | −$200 | $1,000 | $1,300 |
| Aug | $400 | $0 | $200 | $1,400 | $1,700 |
| Sep | $400 | $0 | $600 | $1,800 | $2,100 |
| Oct | $400 | $0 | $1,000 | $2,200 | $2,500 |
| **Nov** | $400 | $1,800 | **−$400** | **$800** | **$1,100** |
| Dec | $400 | $0 | $0 | $1,200 | $1,500 |

- Lowest Step 1 month: November, −$400 (11 × $400 in, $4,800 out).
- Step 2 add: **$400** ((d)(2)(i)(B)).
- Required starting balance: $400 + $800 = **$1,200** ((d)(2)(i)(C)).
- Real balance − target: $1,500 − $1,200 = **+$300**. Surplus $300, shortage $0, deficiency $0 ((b)).
- The same answer the other way: projected low $1,100 − cushion $800 = $300.
- $300 is at least $50 and the borrower is current: **`SURPLUS_REFUND_REQUIRED`**, `12 CFR 1024.17(f)(2)(i)`. The servicer's option: refund the surplus within 30 days from the date of the analysis.
- The most the new monthly escrow payment can lawfully be: $400 (no shortage and no deficiency to add).
- `nearLine`: null. $300 is nowhere near the $50 line.

This case is built-in example 2 on the page ("They're holding too much"), with a statement that agrees and an analysis date of 2026-09-01, so the refund clock shows October 1, 2026. The banner is amber even though the statement matches, because SPEC C4 says the 30-day refund rule always surfaces. The letter for it is a request for information, not a notice of error: nothing on the statement is wrong, and the 30 days may not have run.

You can reproduce every number with one command. It is Exercise 2 in `docs/HOW-IT-WORKS.md`.

---

## Part 4. The independent audit

Full report: `docs/verification/math-audit.md`. Harness: `audit/`, with its own `README.md`.

**What made it independent.** The auditor was a separate agent. It wrote its oracle (a second implementation) from eCFR, the CFPB site, Cornell LII and HUD's Federal Register notices **before it was allowed to read `engine/`, `tests/` or `v0/`**. The oracle uses `BigInt` cents and finds the required starting balance by searching for the smallest opening balance that never lets the year drop below the cushion, instead of the usual "minus the minimum" formula. So it shares no code and no approach with the engine.

**The fuzzer was proved before it was trusted.** `audit/mock-engine.mjs` is a stand-in engine with 12 switchable planted bugs (a `>` where the law says `>=`, a cap rounded up, a second bill overwriting the first, negative zero, and so on). `prove-harness.mjs` shows the fuzzer passes two correct engines and catches all 12.

### Exact counts from the audit report

| Run | Cases | Threw | Disagree with oracle | Invariant failures |
|---|---:|---:|---:|---:|
| Mixed families, seeds 20260919, 1, 7, 424242, 987654321 × 20,000 | 100,000 | 0 | 0 | 0 |
| One family each × 5,000 (seed 31337): b50, bTier, bDef, tie, sameMonth, late, onTarget, near, bothNear, uniform | 50,000 | 0 | 0 | 0 |
| Extreme amounts: up to 100 bills of $10,000,000, balances of plus or minus $10,000,000 | 3,000 | 0 | 0 | not applicable |
| Test vectors: engine against vectors, and oracle against vectors | 30 + 30 | | 0 | |

**150,000 random accounts, zero disagreements in `analyze`.** Every case is five engine calls: the account, the same account with a random amount added to the balance (the difference must move by exactly that), shuffled bills (nothing but the `inputs` echo may change), a repeat call (same output), and a call that checks the input was not modified.

Code review of `engine/*.js` also came back clean: the only two `/` operators are inside the two division helpers; no `Math.round`, `toFixed`, `parseFloat` or `parseInt`; all 144 month conversions round-trip; every public function runs on deep-frozen inputs; no `Date`, `Math.random`, globals or I/O anywhere in `engine/`; `dates.js` matches JavaScript's UTC calendar on all 401,767 dates from 1900 to 2999; 152 single-field corruptions are each rejected by `validateAccount` and make `analyze` throw.

What it did find: 5 Stage 1 findings (all adopted as SPEC Part E), 15 Stage 2 defects (all in the comparison flags and the wording, none in `analyze`), and 5 Stage 3 findings, 2 of them wrong-answer misses. `docs/HOW-IT-WORKS.md` Part 7 tells that story. Part 5 below has the current status.

### How to re-run it

From the project folder. Node 18 or newer, no dependencies, nothing to install.

```
cd audit

node check-vectors.mjs
node check-vectors.mjs --engine

node fuzz.mjs --n 20000 --seed 20260919
node fuzz.mjs --n 5000 --seed 31337 --family bothNear

node prove-harness.mjs --n 5000

node stage2-code-checks.mjs
node stage2-compare-checks.mjs --n 20000
node stage3-reverify.mjs --n 20000
```

What you should see:

| Command | Expected last line |
|---|---|
| `node check-vectors.mjs` | `30 of 30 vectors match the oracle on every numeric field, classification, cite and all 12 table rows.` |
| `node check-vectors.mjs --engine` | `30 of 30 vectors match the engine on every numeric field, classification, cite and all 12 table rows.` |
| `node fuzz.mjs …` | `RESULT: PASS (engine agrees with the independent oracle on every case and holds every invariant)` |
| `node prove-harness.mjs --n 5000` | `HARNESS PROVEN: correct engines pass, every planted bug is caught.` |
| `node stage2-code-checks.mjs` | `ALL CODE CHECKS PASSED` |
| `node stage2-compare-checks.mjs --n 20000` | see the note below |
| `node stage3-reverify.mjs --n 20000` | see the note below |

Fuzzer exit codes: 0 clean, 1 math or invariant failure, 3 only `nearLine` conventions differ. Each 20,000-case run takes a few seconds.

**Note on the last two scripts. Read this before you run them.** They check `compareWithStatement` and the generated words against the rules as they stood when the auditor wrote them. Fix Order 3 then changed one of those rules on purpose (the low-point mix-up rule, finding N1), and a wording sweep renamed one phrase. So on the current engine they report failures that are deliberate disagreements, not regressions. The exact lines are in the re-run table below. `audit/` belongs to the independent auditor and nobody else edits it, so the scripts stay as they are until the auditor updates them, the same way it updated `stage2-compare-checks.mjs` during Stage 3. The math scripts (`check-vectors`, `fuzz`, `prove-harness`, `stage2-code-checks`) are not affected.

To repeat the full 150,000:

```
for s in 20260919 1 7 424242 987654321; do node fuzz.mjs --n 20000 --seed $s | tail -1; done
for f in b50 bTier bDef tie sameMonth late onTarget near bothNear uniform; do node fuzz.mjs --n 5000 --seed 31337 --family $f | tail -1; done
```

You should see `RESULT: PASS…` fifteen times.

### Re-run on 2026-09-19 while this page was being written

Engine at commit `3f67d12` (after Fix Order 3). Node v26.0.0. Every command above was run. Nothing here is copied from the audit report.

| Command | What came back |
|---|---|
| `node check-vectors.mjs` | 30 of 30 vectors match the oracle |
| `node check-vectors.mjs --engine` | 30 of 30 vectors match the engine |
| `node fuzz.mjs --n 20000` with seeds 20260919, 1, 7, 424242, 987654321 | 100,000 cases: 0 threw, 0 disagree with the oracle, 0 invariant failures. `RESULT: PASS` and exit code 0, five times. |
| `node fuzz.mjs --n 5000 --seed 31337 --family …` for all 10 families | 50,000 cases, all clean. `RESULT: PASS` ten times. |
| `node prove-harness.mjs --n 5000` | 2 correct engines pass, 12 of 12 planted bugs caught, 4 of 4 `nearLine` convention variants named. `HARNESS PROVEN`. |
| `node stage2-code-checks.mjs` | `ALL CODE CHECKS PASSED` |
| `node stage2-compare-checks.mjs --n 20000` | 62 checks ok, **1 hard check failed** (exit code 1) |
| `node stage3-reverify.mjs --n 20000` | 33 checks ok, **3 failed** (exit code 1) |
| `npm test` (from the project folder) | 636 tests, 635 pass, 1 fail. The one failure is "sw.js CACHE_NAME is up to date…": engine files changed after the last stamp. `node tools/stamp-sw.mjs` clears it, and the Build Chief does that at integration. |

**The 4 failing audit checks, each traced to its cause:**

| Script | The check that fails | Why |
|---|---|---|
| `stage2-compare-checks.mjs` | "B2: over-the-cap minimum that equals the federal low point -> one nudge, row "not-compared", no CUSHION_OVER_CAP…: MISSED all 5000" | It encodes the old mix-up rule (always a nudge). That rule is the one finding N1 showed was hiding real oversized cushions. With nothing else typed, the engine now raises `CUSHION_MAYBE_OVER_CAP` instead, in all 5,000 simulated statements. |
| `stage3-reverify.mjs` | "44 letters … appear exactly when a discrepancy flag fires" | One scenario of the 44, "nudge alone (B2)", expects no flags. The engine now returns `CUSHION_MAYBE_OVER_CAP` for it. The thing this check is about is still right for that scenario: the letter is a request for information, not a notice of error. |
| `stage3-reverify.mjs` | "A4: Step 2 now says the regular payment is one-twelfth…" | The script looks for the exact phrase "regular monthly payment is one-twelfth". The QA wording sweep (one name for one thing) changed it to "regular escrow payment each month is one-twelfth". The second half of the check, "shortage or deficiency can be added on top", still matches. The A4 fix itself is intact. |
| `stage3-reverify.mjs` | "an oversized cushion always draws either CUSHION_OVER_CAP or the nudge (never silence)" | There is now a third outcome, `CUSHION_MAYBE_OVER_CAP`. The script's own repro line shows it: flags `[CUSHION_MAYBE_OVER_CAP]`, overall "look-here", where it used to print "matches". |

So: the core math is re-confirmed on the final engine. The comparison rules changed after the auditor's last pass, and those changes have **not yet been re-verified by the independent auditor**. They are covered by the project's own tests (next part), which is a weaker kind of evidence, and this page says so.

---

## Part 5. Known limits, and what the tool deliberately does not decide

### What it does not decide

- **It is math, not legal advice.** It never tells anyone what they should do, never promises a refund, and the letter says "This letter states arithmetic, not legal conclusions."
- **A mismatch is not proof of a mistake.** The tool only knows the numbers typed in. The servicer may have a newer tax or insurance bill. Under (c)(7) a servicer that does not know next year's charge may estimate it from last year's, adjusted by up to the change in the CPI.
- **It does not decide whether an escrow miscalculation is a covered "error"** under § 1024.35(b). See 1e.
- **It says nothing about whether a homeowner can sue** over § 1024.17. The research notes mark that as not researched (case law, outside the approved source list).
- **It does not call a verdict inside the $7.00 band.** See 1c.

### What it does not model

- **Only the federal ceiling.** State law can be stricter (a lower cushion, interest on escrow). (c)(8) says lower limits win. There is a `cushionMonths` input but no state database.
- **Bills that come less often than yearly**, like a 3-year flood premium. (c)(9) handles those with 36 equal payments and a low point on a 3-year cycle. That is outside a 12-month engine.
- **Biweekly or other payment periods.** § 1024.17(a) says the requirements "shall be modified accordingly". The monthly table will not match.
- **Loans the rule does not cover.** It applies to escrow accounts on federally related mortgage loans (§ 1024.17(a), § 1024.2(b)), with exemptions in § 1024.5(b).
- **Last year's history.** The tool checks the projection for the coming year. It does not check whether last year's bills were paid on time or in the right amounts.
- **Voluntary prepayments.** HUD's 1995 clarification (f) says money you paid ahead voluntarily is not counted as surplus. The tool cannot know that about your balance.

### Where the sources themselves have limits

- **HUD's example statements** (Appendix I-8 and Appendix M, behind TV03 and TV04) exist only as scanned images. The auditor marked them "Not verified" against a machine-readable source. Their arithmetic is self-consistent and reproduces under the Appendix E method. A further correction was published at 60 FR 24734 (May 9, 1995), which the research did not pull.
- **Whether HUD's 1995 guidance is still "live".** The CFPB keeps the list and links the documents but says they are not Bureau rules or interpretations. The tool uses the guidance only where the regulation is silent (rounding, the deficiency-first split) and labels it every time.
- **Which balance is the "current escrow account balance".** Servicers usually run the analysis a month or two before year-end using assumed payments ((i)(1)). The tool asks for the balance the statement's projection starts from.

### Costs of this project's own choices

- **The payment tolerance lets small overages pass.** A payment that really is over the maximum by up to $2.00 a month (with a shortage) or $3.00 a month (with a deficiency and a shortage) is not flagged: at most $24 or $36 a year. The auditor measured this and judged the tolerances cannot be tightened much without accusing lawful whole-dollar statements. The money stays in the escrow account and comes back as a surplus at the next analysis.
- **"One month's payment" uses the new base payment.** If the old and new payments would put a shortage in different tiers, the tool picks the new one.
- **The page's behavior is not unit-tested in a browser.** Zero dependencies means no jsdom. `tests/shell.test.js` reads files as text, `tests/pipeline.test.js` runs the exact DOM-free path the page uses, and `tests/sw.test.js` runs the real service worker in `node:vm`. Focus handling, the live region, the error boundary and the framing guard are verified by real-browser runs recorded in `BUILD-LOG.md`. A green `npm test` does not by itself prove the page behaves.

### The auditor's Stage 3 findings, and where each one stands

Source: `docs/verification/math-audit.md` section 8, and `BUILD-LOG.md` rows 4.11 and 4.12. Status checked against the code on 2026-09-19.

| # | Finding | Status |
|---|---|---|
| N1 | Wrong answer (a miss). A statement with a cushion really over the cap could come out fully green, because the low-point mix-up rule treated it as a typing slip. For a servicer that over-cushions as a habit, that happened in 19,996 of 20,000 simulated accounts. | Fixed in commit `fa578c0`. Three cases decided by what else was typed (mix-up, over the cap, cannot tell). "Cannot tell" raises `CUSHION_MAYBE_OVER_CAP` and is never green. Pinned by the tests whose names start with "N1" in `tests/compare.test.js` (the auditor's exact repro is one of them) and by a property test in `tests/properties.test.js`. **Not yet re-verified by the independent auditor.** |
| N2 | Wrong answer (a miss). Borrower not current + any deficiency meant no upper limit on the payment: $5,000 a month against a $10 deficiency was a green match. | Fixed in commit `fa578c0`. Ceiling = bills ÷ 12 + shortage ÷ 12 + the whole deficiency, in any one month (`paymentCeiling`). Pinned by the tests whose names start with "N2" in `tests/compare.test.js` and `tests/explain.test.js`. **Not yet re-verified by the independent auditor.** |
| N3 | Misleading text. The headline said the statement "shows a surplus" even when the homeowner had typed no surplus. | Fixed in commit `3f67d12`. Tests whose names start with "N3" in `tests/explain.test.js`. |
| N4 | Cosmetic. In a notice of error, plain questions sat under "I believe the statement contains the error(s) described below". | Fixed in commit `3f67d12`. Questions get their own heading. Tests whose names start with "N4" in `tests/letter.test.js`. |
| N5 | Cosmetic. With no statement numbers typed, the letter still said "My numbers line up with the statement." | Fixed in commit `3f67d12`. Tests whose names start with "N5" in `tests/letter.test.js`. |

Limits that remain after those fixes:

- **The "cannot tell" case really cannot tell.** When the typed required minimum is over the cap, equals the federal low point, and nothing else typed settles it, the page shows amber with two-sided wording. A person who simply typed the wrong line sees a flag that is only about their typing. A person whose servicer really over-cushions sees the same flag, not the stronger `CUSHION_OVER_CAP`. Typing the statement's shortage or surplus figure usually settles it: a figure that matches the federal math means mix-up, and a figure that is off by about (typed minimum − cap) means the oversized cushion is real. A figure that is off by some other amount still cannot tell.
- **The measurements in `docs/verification/math-audit.md` section 8 ("B2, quantified") describe the old rule.** The new three-case rule has not been measured with the auditor's simulated-servicer method yet.
- **The not-current ceiling is loose by design.** It allows the whole deficiency in a single month, because (f)(4)(iii) leaves the schedule to mortgage documents this tool cannot see. A payment under that ceiling is "not checked above the base", which is not the same as "confirmed lawful". The row's note says so.
