# Statement Anatomy & User Journey Research — EscrowScope

Research for the EscrowScope input form, help text, and results page. Written in plain language. Every claim below is sourced — sources are linked inline the first time they're used.

---

## 1. What a real annual escrow statement contains, and what servicers call each number

### 1.1 The federal floor: 12 CFR 1024.17(i)(1)

The rule (Regulation X, part of RESPA) doesn't dictate a layout — it dictates a checklist of things that must be on the statement. Quoting the current regulation from the [CFPB's official reg text](https://www.consumerfinance.gov/rules-policy/regulations/1024/17/) (mirrored at [eCFR 1024.17](https://www.ecfr.gov/current/title-12/chapter-X/part-1024/subpart-C/section-1024.17)):

> **(1) Contents of annual escrow account statement.** The annual escrow account statement shall provide an account history, reflecting the activity in the escrow account during the escrow account computation year, and a projection of the activity in the account for the next year... The annual escrow account statement must include, at a minimum, the following (the items in paragraphs (i)(1)(i) through (i)(1)(iv) must be clearly itemized):
> **(i)** The amount of the borrower's current monthly mortgage payment and the portion of the monthly payment going into the escrow account;
> **(ii)** The amount of the past year's monthly mortgage payment and the portion of the monthly payment that went into the escrow account;
> **(iii)** The total amount paid into the escrow account during the past computation year;
> **(iv)** The total amount paid out of the escrow account during the same period for taxes, insurance premiums, and other charges (as separately identified);
> **(v)** The balance in the escrow account at the end of the period;
> **(vi)** An explanation of how any surplus is being handled by the servicer;
> **(vii)** An explanation of how any shortage or deficiency is to be paid by the borrower; and
> **(viii)** If applicable, the reason(s) why the estimated low monthly balance was not reached...

The statement must go out within 30 days of the end of the "escrow account computation year" (a rolling 12-month cycle tied to the loan's first payment date, unless the servicer resets it with a short-year statement).

The regulation separately caps two things every statement is built around:
- **Aggregate accounting is mandatory** — every servicer must analyze the account as a whole, not item-by-item. 12 CFR 1024.17(d)(4).
- **The cushion is capped at 1/6 of estimated annual disbursements** — which is exactly **two months** of the base escrow payment. 12 CFR 1024.17(c)(5), (d)(2)(i)(C).
- **The "low point" (lowest projected monthly balance) must be ≤ 1/6 of annual disbursements** too — that's the same 2-month number, just applied at the account's low point instead of as an added buffer. 12 CFR 1024.17(d)(2)(ii).

### 1.2 What a real Chase statement looks like, label by label

Chase publishes an annotated sample statement, ["A Quick Guide to Understanding Your Annual Escrow Analysis"](https://www.chase.com/content/dam/chasecom/en/mortgage/documents/mortgage_escrow_statement.pdf) (read directly for this project). It labels the exact sections homeowners see:

| Chase's label | What it is |
|---|---|
| **Current Monthly Mortgage Payment** | This year's total payment, split into Principal & Interest / Escrow Deposit / Plus Amount Balance/Shortage |
| **New Monthly Mortgage Payment** | Next year's total payment, same split, with an effective date (e.g. "Effective 10/01/2012") |
| **Escrow Account Summary** | States whether the lowest projected balance in the next 12 months is above or below the required minimum balance — this is where "shortage" or "surplus" gets declared, with a one-line reason ("increases in property taxes and/or insurance", "reassessment", "due date changes") |
| **Escrow Shortage Coupon or Surplus Check** | If short: a payment coupon with **three explicit options** (pay it all now, pay part now, or don't pay anything and let it spread). If there's a surplus ≥ $50: an actual check stapled to the statement |
| **Escrow Account History** | Table of the last 12 months — Date / Activity / Estimated Amount / Actual Amount / Estimated Escrow Balance / Actual Escrow Balance, with an "E" flag where actual money hasn't posted yet |
| **Expected Escrow Activity for the Next 12 Months** | Same table shape, projected forward — this is where next year's "Starting Balance" and month-by-month deposits/withdrawals live |
| **Expected Escrow Payment for the Next 12 Months** | Two side-by-side tables — Tax items and Insurance items — each with Annual Expense and Anticipated Date(s) of Payment |

Chase's own FAQ on the same document states plainly: *"This minimum balance is typically equal to two months of escrow payments"* — confirming the cushion-cap arithmetic from the CFR in homeowner language.

### 1.3 Newrez's lettered breakdown (a second real layout)

Newrez's [Escrow Analysis guide](https://www.newrez.com/escrow-hub/escrow-analysis/) walks through its own annotated statement with lettered sections:

- **A. Escrow Trend** — "Summary of anticipated and actual annual disbursements from your escrow account," sourced from the insurance company and local tax authority.
- **C. Annual Escrow Account Breakdown – Projections for Coming Year** — "Payment to Escrow" (monthly deposit) and "What We Expect to Pay Out" (disbursements), with **the minimum balance highlighted**.
- **D. Anticipated Beginning Balance Calculation** — "What the escrow balance is expected to be at the beginning of this upcoming computation period."
- **F. New Escrow Payment Calculation** — broken into **Unadjusted Escrow Payment** (annual disbursements ÷ 12), **Surplus Reduction** (only if surplus < $50), **Shortage Installment** (added if short), and **New Escrow Payment** (the final number).

### 1.4 Confirming labels from other servicers

- **Wells Fargo**, [escrow accounts explainer](https://www.wellsfargo.com/mortgage/learn/escrow-accounts/): "your lender will perform what is called an **escrow analysis**... Your statement will also let you know if your monthly escrow payments will change for the coming year and whether there is a **shortage or surplus**." Confirms a **surplus refund is typical if the account is in good standing**.
- **Freedom Mortgage**, [What Is an Escrow Analysis?](https://www.freedommortgage.com/customer-center/articles/escrow-analysis): *"A surplus exists when... the lowest projected minimum balance exceeds the target minimum balance. If the projected surplus is $50 or greater, and your account is current, we will send you a check... If the surplus is less than $50, we will credit the amount."* Also: *"The minimum balance varies by state but will not be more than two months of your monthly escrow payment."*
- **U.S. Bank** and **LoanCare** (via its [MortgageQuestions.com](https://www.mortgagequestions.com/Escrow/Analysis) consumer portal) organize their help sites around the same three concepts — "Escrow Basics," "Escrow Analysis," and **"Escrow Shortage and Overage"** (LoanCare's word for surplus is literally "overage").

### 1.5 Label dictionary — the fields EscrowScope needs, and every name we found for each

| What the tool needs | Also called (seen across servicers/CFPB) | On every statement? |
|---|---|---|
| Projected/anticipated disbursements (amount + month, each escrow bill) | "Expected Escrow Payment for the Next 12 Months," "Anticipated Disbursements," "What We Expect to Pay Out," "Escrow Trend" | Yes — required by 1024.17(i) as the projection component |
| Projected beginning / current escrow balance | "Beginning Balance," "Anticipated Beginning Balance," "Escrow Account Balance," "Starting Balance" | Yes |
| Required/target/minimum balance (the cushion) | "Required Minimum Balance," "Minimum Balance," "Target Balance," "Cushion," "Two-Month Reserve" | Yes, though the number itself is sometimes only shown "highlighted" in a table, not labeled by name |
| Lowest projected balance ("low point") | "Lowest Projected Account Balance," "Lowest Monthly Balance," "Low Point" | Usually implied inside the "Escrow Account Summary" narrative rather than shown as its own line |
| Shortage / surplus / deficiency amount | "Escrow Shortage," "Shortage Amount," "Surplus," "Overage" (LoanCare), "Deficiency" (only if balance went negative) | Yes, required by 1024.17(i)(1)(vi)–(vii) |
| Current monthly escrow payment | "Current Monthly Escrow Deposit," "Current Escrow Payment," "Escrow Portion" of the mortgage payment | Yes, required by 1024.17(i)(1)(i) |
| New monthly escrow payment (+ split: base vs. shortage spread) | "New Escrow Payment," "New Monthly Mortgage Payment," "Unadjusted Escrow Payment" + "Shortage Installment" | Yes if payment is changing; the base/shortage split specifically is only shown by some servicers (Newrez shows it explicitly; Chase folds it into the coupon options) |
| Effective date | "Effective [date]," "New Payment Effective [date]" | Yes when payment changes |
| Escrow history (last year projected vs. actual) | "Escrow Account History," "Escrow Trend," "Account Activity" | Yes, required by 1024.17(i)(1)(ii)–(v) |

**Not on every statement:** the base/shortage payment split, an explicitly-labeled "low point" line, and a plain-English "cushion" label — these three are the ones EscrowScope's help text needs to work hardest to explain, because homeowners are least likely to see them spelled out on their own paper.

---

## 2. Where people get confused (with sources)

**Shortage vs. deficiency vs. surplus — these are three different, precisely defined things**, and CFPB's own compliance FAQ gives the cleanest three-line version (from the [Mortgage Servicing FAQs](https://www.consumerfinance.gov/compliance/compliance-resources/mortgage-resources/mortserv/mortgage-servicing-faqs/), an official Compliance Aid):
> *"A deficiency is the amount of a negative balance in an escrow account. A shortage is an amount by which a current escrow account balance falls short of the target balance... A surplus is an amount by which the current escrow account balance exceeds the target balance."* (12 CFR 1024.17(b))
In plain terms: a **shortage** means the account is positive but below where it should be; a **deficiency** means the account actually went negative (the servicer had to front the money); a **surplus** means there's more in there than needed. Most homeowners only ever see "shortage" — deficiency is rarer and usually means a bill came due before enough had been collected.

**"Why is there a cushion at all?"** Wells Fargo's own explainer answers this the way a person would ask it: the cushion "provide[s] a cushion for these fluctuations" — i.e., it exists so a sudden tax or insurance jump doesn't put the account at zero or negative. The regulation caps it at exactly 2 months so it can't become a slush fund (12 CFR 1024.17(c)(5)).

**Paying a shortage lump-sum vs. spread — and why the payment still goes up either way.** CNBC's 2026 coverage ([Mortgage escrow shortages rise](https://www.cnbc.com/2026/05/17/mortgage-escrow-shortages.html)) quotes a Bankrate CFP directly on this: *"If you have enough in your emergency fund to cover the shortfall all at once, that will be the simplest way to put it behind you... Paying over time can leave you layering shortage payments."* The key thing people miss: **even a full lump-sum payment of the shortage does not undo a real increase in taxes/insurance** — the *base* monthly escrow payment (the 1/12-of-annual-costs part) goes up separately whenever the underlying bills go up. Paying the shortage only kills the *extra* installment on top of that new, higher base. CNBC's example: the average 2026 shortfall of $2,157, spread over 12 months, adds **$179.75/month** — that's on top of whatever base increase already happened.

**First-year / new-construction underestimates.** For a home the tax assessor hasn't valued yet, the servicer is allowed to estimate using a comparable, already-assessed property nearby (12 CFR 1024.17(c)(7), confirmed by [nationwide reporting](https://www.foxbusiness.com/lifestyle/escrow-payments-rising-nationwide-homeownership-becomes-less-attainable) on new-build escrow shocks). Once the county actually assesses the finished house — often a year or two later — the real bill can be dramatically higher than the placeholder estimate, creating a shortage that looks alarming but is really just "the estimate was always temporary."

**Mid-year / interim analyses.** Regulation X's "escrow account computation year" doesn't have to be the calendar year — it runs from the loan's first payment date — and a servicer can issue a "short year statement" to reset it (12 CFR 1024.17(b), definitions). A statement that doesn't cover Jan–Dec, or that shows up mid-year after a rate/servicer change, is not necessarily wrong.

**Force-placed (lender-placed) insurance.** Per [12 CFR 1024.37](https://www.consumerfinance.gov/rules-policy/regulations/1024/37/), a servicer can only charge for force-placed insurance if it has "a reasonable basis" to believe the borrower let their own hazard insurance lapse — and it generally can't force-place insurance at all if it could simply pay the existing policy out of escrow instead. If a homeowner sees an unfamiliar, expensive insurance line item, this is the rule that governs whether it was even allowed.

**Escrow costs are genuinely rising nationwide right now (2024–2026), not just for this one household.** This matters for tone — a payment jump is often *not* a servicer error. [CNBC (May 2026)](https://www.cnbc.com/2026/05/17/mortgage-escrow-shortages.html) reports escrow costs are up **45% since 2019** (data: Cotality), with the average 2026 shortfall at $2,157. [Fox Business](https://www.foxbusiness.com/lifestyle/escrow-payments-rising-nationwide-homeownership-becomes-less-attainable) and [Scotsman Guide](https://www.scotsmanguide.com/news/rising-risks-of-spiking-escrows-keep-catching-borrowers-by-surprise/) both attribute this to home value increases pushing up property tax bills and homeowners-insurance premiums climbing sharply after severe-weather losses (up roughly 23% in 2024 alone per industry data cited in that reporting). About 80% of mortgage holders have an escrow account (Lereta data, cited by CNBC).

---

## 3. What a homeowner can actually do next, by outcome

All deadlines below are quoted or closely paraphrased from CFPB's own regulation text and its own published sample letter — sources linked.

### (a) Surplus ≥ $50 wasn't refunded
The rule: if the account is current, a surplus generally gets refunded — the ≥$50/credit-below-$50 threshold is confirmed on multiple servicer pages ([Freedom Mortgage](https://www.freedommortgage.com/customer-center/articles/escrow-analysis), Newrez) as flowing from 12 CFR 1024.17(f). If no refund arrived, first call the servicer (the number is on the statement). If that doesn't resolve it, send a **notice of error** under 12 CFR 1024.35 (template in section 4) — CFPB's own FAQ confirms servicers must explain surplus handling on every statement (1024.17(i)(1)(vi)).

### (b) Cushion used is more than 2 months (1/6)
This is a hard cap, not a guideline — 12 CFR 1024.17(c)(5) says the cushion "must be no greater than one-sixth (1/6) of the estimated total annual disbursements." If EscrowScope's math shows the servicer used more than that, it's worth a call first (ask them to point to the specific line where the cushion is calculated), and a notice of error if the call doesn't fix it.

### (c) The math looks right, but the payment still jumped
This is the most common real-world case, and it's not a compliance problem — it's underlying costs going up. Legitimate next steps, in order of effort:
- **Shop homeowners insurance.** Rate differences between carriers can be large; several 2025–2026 news pieces (Scotsman Guide, CNBC) point to this as the single biggest lever homeowners have.
- **Check for a homestead exemption / appeal the property tax assessment.** Most counties have a formal appeal window — this is a local/state process, not a servicer or CFPB one.
- **Ask about paying the shortage as a lump sum vs. letting it spread** — see section 2 above; either way the *base* payment increase is separate from this choice.
- **Ask whether escrow can be waived going forward** (not always available — depends on loan type, LTV, and investor/state rules; this is a question for the servicer, not something federal law guarantees).

### (d) Shortage/deficiency handled outside the allowed options
Per CFPB's official Compliance Aid FAQ (Escrow Accounts: Deficiencies, Shortages, and Surpluses), the *only* allowed options are:
- **Shortage < 1 month's escrow payment:** do nothing, repay within 30 days, or spread over at least 12 months.
- **Shortage ≥ 1 month's escrow payment:** do nothing, or spread over at least 12 months.
- **Deficiency < 1 month's escrow payment:** do nothing, repay within 30 days, or repay in 2+ equal monthly payments.
- **Deficiency ≥ 1 month's escrow payment:** do nothing, or repay in 2+ equal monthly payments.

If a statement demands a lump sum with no spread-out option and the amount is at or above a month's payment, or spreads a small shortage over *less* than 12 months, that's outside what's allowed — worth a notice of error.

### Escalation ladder (all outcomes)

1. **Call the servicer.** Ask specifically: "What's my low point, my required/minimum balance, and which specific line item caused the shortage?" Have your loan number ready.
2. **Send a written notice of error (12 CFR 1024.35).** Must include your name, info identifying your loan account, and the specific error you believe occurred — mailed to the servicer's *designated* error-resolution address (often different from the payment address; check your statement or the servicer's site). Per CFPB's own [sample letter](https://files.consumerfinance.gov/f/201401_cfpb_mortgage_request-error-resolution.doc): the servicer must **acknowledge within 5 business days**. Response deadlines (confirmed against the current [reg text](https://www.consumerfinance.gov/rules-policy/regulations/1024/35/), 1024.35(e)(3)): **7 business days** for an inaccurate payoff-balance error; before the foreclosure sale or **30 days**, whichever is earlier, for foreclosure-related errors; **30 business days** for everything else (escrow errors included), extendable by **15 more business days** if the servicer notifies you in writing before the first 30 days run out — so up to **45 business days** total for a typical escrow dispute.
3. **Send a request for information (12 CFR 1024.36)** if you just need documents/data rather than alleging an error — e.g., "send me the full escrow analysis worksheet." Deadlines ([reg text](https://www.consumerfinance.gov/rules-policy/regulations/1024/36/)): **10 business days** for who owns/services the loan; **30 business days** for everything else, extendable **+15 business days** with written notice. No fee can be charged for responding.
4. **File a CFPB complaint** at [consumerfinance.gov/complaint](https://www.consumerfinance.gov/complaint/) or by phone at **855-411-2372**. CFPB forwards it to the company and pushes for a response.
5. **Talk to a HUD-approved housing counselor** — free or low-cost, independent advice. Official finder: [consumerfinance.gov/find-a-housing-counselor](https://www.consumerfinance.gov/find-a-housing-counselor/) (pulls directly from HUD's approved-agency list) or call **888-995-HOPE (4673)**. CFPB explains what these counselors actually do at [What is a HUD-approved housing counseling agency?](https://www.consumerfinance.gov/ask-cfpb/what-is-a-hud-approved-housing-counselor-how-can-they-help-me-en-261/)

---

## 4. Model notice-of-error letter

CFPB itself publishes a sample letter for this exact purpose — ["Requesting your servicer correct errors" template](https://files.consumerfinance.gov/f/201401_cfpb_mortgage_request-error-resolution.doc) — including the required elements (name, loan-identifying info, description of the error) and the escalation info (CFPB complaint line, HUD counselor line). EscrowScope's version below is written fresh in our own words, shaped around escrow-specific fields, not copied from CFPB's text.

```
Date: {{today_date}}

To: {{servicer_name}}
    {{servicer_error_resolution_address}}

From: {{your_full_name}}
      {{your_street_address}}
      {{your_city_state_zip}}

Re: Error Resolution Notice under 12 C.F.R. § 1024.35
Mortgage Loan Number: {{loan_number}}

I am writing to ask you to correct what I believe is an error in the annual
escrow account statement you sent me, dated {{statement_date}}, for the
property at {{property_address}}.

Based on the numbers on that statement:
- My lowest projected escrow balance ("low point") was {{low_point}}.
- My required minimum balance (cushion) was {{cushion_amount}}, which I
  calculate to be {{cushion_months}} months of my escrow payment.
- Federal rule 12 CFR 1024.17(c)(5) caps the cushion at one-sixth (1/6) of
  my estimated annual escrow disbursements — {{cushion_cap}}.
- [Choose the one that applies:]
  - The surplus on my account was {{surplus}}, and I have not received a
    refund or credit for it.
  - The cushion used on my statement appears to be higher than the legal
    cap described above.
  - The shortage/deficiency repayment option I was given does not match
    the options allowed under 12 CFR 1024.17(f).

I am asking you to review this calculation and either confirm it is correct
and explain why, or correct the error and send me an updated statement.

This letter describes the arithmetic on my statement as I understand it —
it is not a legal conclusion, and I am not a lawyer. I understand you are
required to acknowledge this letter and investigate.

Please contact me at {{your_phone_or_email}} if you need more information.

Sincerely,
{{your_full_name}}
```

Framing note built into the letter on purpose: it says explicitly that it states arithmetic, not legal conclusions — this keeps EscrowScope from appearing to give legal advice, consistent with it being a free, plain-math tool rather than a law service.

---

## 5. Input-form recommendations

### Minimum fields for a trustworthy verdict (in statement order, under 2 minutes)

Ordered to match where these numbers physically appear on a typical statement (top → bottom, per the Chase/Newrez anatomy above), so a user can fill the form while looking at their paper statement without hunting back and forth.

| # | Plain-English label | Helper text (one line) | Also called... | Type |
|---|---|---|---|---|
| 1 | Current monthly escrow payment | The escrow part only — not your whole mortgage payment | "Escrow Deposit," "Current Escrow Payment," escrow portion of "Current Monthly Mortgage Payment" | $/month |
| 2 | New monthly escrow payment | What the statement says it's changing to | "New Escrow Payment," escrow portion of "New Monthly Mortgage Payment" | $/month |
| 3 | Current escrow account balance | The balance shown at the start of the new projection period | "Beginning Balance," "Anticipated Beginning Balance," "Starting Balance" | $ |
| 4 | Lowest projected balance (the "low point") | The lowest your balance is expected to drop to over the next 12 months | "Lowest Projected Account Balance," "Lowest Monthly Balance" | $ |
| 5 | Required minimum balance (the cushion) | The buffer your servicer says you need to keep in the account | "Required Minimum Balance," "Minimum Balance," "Target Balance," "Cushion" | $ |
| 6 | Shortage, deficiency, or surplus amount | Copy the number straight from your statement's summary | "Escrow Shortage," "Surplus," "Overage," "Deficiency" | $ (with a +/− toggle) |
| 7 | Projected annual disbursements (list) | Every bill your servicer plans to pay from escrow this year — property tax, homeowners insurance, flood insurance, PMI/MIP, etc. — with the month each is due | "Expected Escrow Payment for the Next 12 Months," "Anticipated Disbursements" | list of {item, $, month} |

**Optional "compare against my servicer" extras** (not needed for the core verdict, useful for double-checking servicer math or spotting a missed bill):
- Effective date of the new payment
- Base vs. shortage-spread split of the new payment (only if shown separately on the statement)
- Last year's projected vs. actual disbursements (escrow history), item by item

### Smart defaults
- Default the disbursement list to 2 rows (property tax + homeowners insurance) since those two are on nearly every statement; let users add rows for flood insurance, PMI/MIP, HOA, etc.
- Pre-fill the +/− toggle on field 6 based on the word the user just typed in nearby helper text ("shortage" → negative, "surplus" → positive) if we build a smart parser later — out of scope for v1 but worth flagging.

### Common entry mistakes to validate against
- **Typing the whole mortgage payment (P&I + escrow) instead of just the escrow portion** for fields 1–2 — this is the single most likely error, since "Current Monthly Mortgage Payment" is the bold headline number on the Chase-style layout, and the escrow portion is a smaller sub-line. Validate: if field 1 looks larger than the sum of annual disbursements ÷ 12 by a wide margin, flag it.
- **Entering monthly amounts where annual is expected**, or vice versa, in the disbursement list — validate with a sanity check (e.g., a monthly property tax bill of $50 or an annual one of $50,000 should both prompt a "does this look right?" nudge, not a hard block).
- **Forgetting an escrowed item** the servicer pays that isn't the two obvious ones — flood insurance, mortgage insurance (PMI/MIP), or a second insurance policy (e.g. windstorm) are the most commonly missed. Prompt for these explicitly rather than relying on an "other" catch-all.
- **Confusing the required minimum balance with the low point** — these are two different numbers that are supposed to be close to equal by design (the aggregate-analysis math sets the low point to land exactly on the cushion), so if a user enters the same number for both without checking, that's actually usually *correct* and not an error — but the form should ask for them separately so EscrowScope can independently verify they line up.

### Accessibility notes (finance form, general public)
- **Labels:** every field gets a persistent, visible `<label>`, not placeholder-only text — per [W3C WAI's Labeling Controls guidance](https://www.w3.org/WAI/tutorials/forms/labels/), placeholder text disappears once a user starts typing and is not a substitute for a real label.
- **Errors:** identify the specific field in the error message, describe the problem in plain words, and say how to fix it — per [WCAG 3.3.1 Error Identification](https://www.w3.org/WAI/WCAG22/Understanding/error-identification.html) and [3.3.2 Labels or Instructions](https://www.w3.org/WAI/WCAG22/Understanding/labels-or-instructions.html). State format restrictions (e.g., "numbers only, no $ sign needed") up front, not only after a failed submit.
- **Number inputs on mobile:** use `inputmode="decimal"` (or `type="number"` with care around spinner arrows) so phones show a numeric keypad automatically — this is standard, low-cost, and matches how [Chase's own escrow tools](https://www.chase.com/personal/mortgage/escrow/annual-analysis) are built for mobile use.
- **Reading level ~6th–8th grade:** short sentences, common words, define jargon the first time it's used (see glossary below), and avoid stacking two numbers-with-decimals next to each other in the same sentence. CFPB itself commits to plain-language consumer materials under the federal Plain Writing Act — see its [Plain Writing page](https://www.consumerfinance.gov/plain-writing/) and compliance reports — a useful model for tone.

---

## 6. Glossary (≤15 terms, plain words)

- **Escrow** — A savings-like account your mortgage company holds for you, used only to pay your property taxes and insurance when they're due.
- **Servicer** — The company that collects your mortgage payment and manages your escrow account. Not always the same company that originally loaned you the money.
- **Escrow analysis** — The yearly checkup your servicer does on your escrow account: did they collect the right amount last year, and how much do they need to collect next year?
- **Cushion** — A small safety buffer your servicer is allowed to keep in your escrow account, capped by law at 2 months' worth of escrow payments.
- **Low point** — The lowest your escrow balance is expected to drop to at any point in the next 12 months, based on your servicer's projections.
- **Shortage** — Your escrow account has money in it, but not as much as it's supposed to have.
- **Deficiency** — Your escrow account actually went below zero — the servicer had to pay a bill with money it didn't have yet.
- **Surplus** — Your escrow account has more money in it than it needs.
- **Disbursement** — A payment your servicer makes out of your escrow account, like a property tax bill or an insurance premium.
- **Computation year** — The 12-month cycle your servicer uses to review your escrow account. It usually starts on your loan's first payment date, not January 1.
- **RESPA** — Real Estate Settlement Procedures Act — the federal law that sets rules for how mortgage escrow accounts have to work.
- **Regulation X** — The specific federal rule (written by CFPB) that spells out RESPA's escrow requirements in detail. This is where "12 CFR 1024.17" comes from.
- **CFPB** — Consumer Financial Protection Bureau — the federal agency that writes and enforces these mortgage servicing rules, and takes consumer complaints.
- **Notice of error** — A written letter you send your servicer formally asking them to fix a specific mistake. It starts a legal clock they have to respond within.
- **HUD-approved housing counselor** — A trained advisor, approved by the Department of Housing and Urban Development, who gives free or low-cost, independent advice about your mortgage.

---

## Sources used

**Federal regulation / CFPB official:**
- [12 CFR § 1024.17 — Escrow accounts (CFPB reg text)](https://www.consumerfinance.gov/rules-policy/regulations/1024/17/) / [eCFR mirror](https://www.ecfr.gov/current/title-12/chapter-X/part-1024/subpart-C/section-1024.17)
- [12 CFR § 1024.35 — Error resolution procedures](https://www.consumerfinance.gov/rules-policy/regulations/1024/35/)
- [12 CFR § 1024.36 — Requests for information](https://www.consumerfinance.gov/rules-policy/regulations/1024/36/)
- [12 CFR § 1024.37 — Force-placed insurance](https://www.consumerfinance.gov/rules-policy/regulations/1024/37/)
- [CFPB Mortgage Servicing FAQs (Compliance Aid) — Escrow Accounts sections](https://www.consumerfinance.gov/compliance/compliance-resources/mortgage-resources/mortserv/mortgage-servicing-faqs/)
- [CFPB sample letter: "Requesting your servicer correct errors"](https://files.consumerfinance.gov/f/201401_cfpb_mortgage_request-error-resolution.doc)
- [CFPB — Submit a complaint](https://www.consumerfinance.gov/complaint/)
- [CFPB — Find a Housing Counselor](https://www.consumerfinance.gov/find-a-housing-counselor/)
- [CFPB — What is a HUD-approved housing counseling agency?](https://www.consumerfinance.gov/ask-cfpb/what-is-a-hud-approved-housing-counselor-how-can-they-help-me-en-261/)
- [CFPB — Plain Writing](https://www.consumerfinance.gov/plain-writing/)
- [HUD — Talk to a Housing Counselor](https://www.hud.gov/i_want_to/talk_to_a_housing_counselor)

**Major servicer guides (consumer-facing, no login required):**
- [Chase — "A Quick Guide to Understanding Your Annual Escrow Analysis" (PDF)](https://www.chase.com/content/dam/chasecom/en/mortgage/documents/mortgage_escrow_statement.pdf)
- [Chase — Reading your escrow statement](https://www.chase.com/digital/customer-service/helpful-tips/home-lending/reading-escrow-statements)
- [Chase — Annual Escrow Analysis FAQs](https://www.chase.com/personal/mortgage/escrow/annual-analysis)
- [Wells Fargo — What is an escrow account and how does it work?](https://www.wellsfargo.com/mortgage/learn/escrow-accounts/)
- [Newrez — Escrow Analysis guide](https://www.newrez.com/escrow-hub/escrow-analysis/)
- [Newrez — Escrow FAQs](https://www.newrez.com/blog/mortgage-101/escrow-faqs/)
- [Freedom Mortgage — What Is an Escrow Analysis?](https://www.freedommortgage.com/customer-center/articles/escrow-analysis)
- [LoanCare / MortgageQuestions.com — Escrow Analysis](https://www.mortgagequestions.com/Escrow/Analysis)
- [U.S. Bank — How do I view my mortgage and escrow analysis statements?](https://www.usbank.com/customer-service/knowledge-base/KB0216148.html)

**News (2024–2026 escrow-shock coverage):**
- [CNBC — "Mortgage escrow shortages rise: Why your payment is going up" (May 2026)](https://www.cnbc.com/2026/05/17/mortgage-escrow-shortages.html)
- [Fox Business — Escrow payments rising nationwide](https://www.foxbusiness.com/lifestyle/escrow-payments-rising-nationwide-homeownership-becomes-less-attainable)
- [Scotsman Guide — Rising risks of spiking escrows keep catching borrowers by surprise](https://www.scotsmanguide.com/news/rising-risks-of-spiking-escrows-keep-catching-borrowers-by-surprise/)

**Accessibility / plain-language standards:**
- [W3C WAI — Labeling Controls](https://www.w3.org/WAI/tutorials/forms/labels/)
- [W3C WAI — Understanding SC 3.3.1 Error Identification](https://www.w3.org/WAI/WCAG22/Understanding/error-identification.html)
- [W3C WAI — Understanding SC 3.3.2 Labels or Instructions](https://www.w3.org/WAI/WCAG22/Understanding/labels-or-instructions.html)

Not used / rejected: a general-purpose escrow calculator site (agentcalc.com) surfaced useful worked-example arithmetic but is not an official or servicer source, so nothing from it is cited as fact above — every regulatory claim it echoed was independently verified against the CFPB reg text before inclusion.
