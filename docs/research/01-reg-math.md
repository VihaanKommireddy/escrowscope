# EscrowScope — the law and the math (12 CFR § 1024.17)

Research date: **2026-09-19**. Written by the regulation-researcher agent for the reference build.
Companion file: `01-test-vectors.json` (22 worked cases, integer cents).

Reader note: this is written in plain language. Jargon gets explained the first time it shows up. Anything inside a quote block is copied word for word from the source and was machine-checked against at least two sources (see §1).

---

## 0. The short version

**What an escrow account is.** Your mortgage servicer (the company you send payments to) collects a bit extra every month, holds it, and pays your property tax and insurance bills for you. Once a year they have to re-do the math ("escrow account analysis") and mail you a statement.

**What federal law limits.** Three numbers:

1. Monthly escrow payment: at most **1/12** of the year's expected bills.
2. Cushion (extra padding they may hold): at most **1/6** of the year's expected bills (= 2 months of payments). Less if your mortgage documents or state law say less.
3. The account has to be tested **as a whole** ("aggregate analysis"), month by month, so that the **lowest** month-end balance of the coming year is no more than the cushion.

**How you check them.** Take next year's bills. Run a 12-month table. Find the starting balance that makes the lowest month land exactly on the cushion. That is the **target (required) starting balance**. Compare your real balance to it:

- real balance higher → **surplus** (≥ $50 must be refunded within 30 days)
- real balance lower → **shortage** (can be spread over 12+ months)
- real balance below zero → **deficiency** (the servicer fronted money; can be collected faster)

### Where the owner's current notes / engine are wrong or incomplete

| # | Issue | Fix |
|---|---|---|
| 1 | Notes cite the second cushion quote as "(d)(5)". There is no (d)(5). | It is **§ 1024.17(c)(5)**. |
| 2 | `engine.js` takes `monthlyDeposit` as an input and uses it in the projection. That only gives the right answer when the number typed equals exactly 1/12 of the bills. If a user types last year's payment, or the new payment that already includes a shortage add-on, the answer is wrong by hundreds of dollars (TV18: reports −$1,125.00 or −$25.00 when the truth is −$300.00). | The engine must **compute** the deposit as 1/12 of the bills itself. The statement's monthly payment becomes a number to *compare against*, never a number to project with. See §4.4. |
| 3 | No way to say "my mortgage only allows a 1-month cushion" or "no cushion". | Add `cushionMonths` (0, 1 or 2; default 2). § 1024.17(c)(8), (d)(2)(i)(C). |
| 4 | "surplus < 0 → shortage" is all the engine says. The law has two shortage tiers, two deficiency tiers, a "borrower must be current" condition, and different repayment clocks. | §5–§7. |
| 5 | An earlier agent-written draft defines deficiency as "a low point below zero". | Wrong. A deficiency is a **real negative balance today**, not a projected dip. A projected dip is just part of the shortage. § 1024.17(b); HUD 59 FR 53890. TV19 guards this. |
| 6 | Floating-point dollars (`total / 6` gives 833.3333…). | Integer cents with a written-down rounding rule. §9. |
| 7 | Notes say the test is "lowest month-end balance − cushion cap". That is *equivalent* to the law's test only under the condition in row 2. The law's own wording is "current balance vs. target balance". | Output both. §4.3. |

Test case #1 is still valid and still produces: total $4,800, cap $800, low $1,100 in November, surplus $300, refund required (TV01).

---

## 1. Sources, and how every quote was checked

Pulled 2026-09-19. No sign-ups, no paywalls, $0.

| What | Source A | Source B | Source C |
|---|---|---|---|
| § 1024.17 (full text) | eCFR, official: `https://www.ecfr.gov/current/title-12/chapter-X/part-1024/subpart-B/section-1024.17` (pulled through eCFR's own versioner API, text as of 2026-09-01; eCFR reports the section was last amended 2017-10-19) | CFPB: `https://www.consumerfinance.gov/rules-policy/regulations/1024/17/` | Cornell LII: `https://www.law.cornell.edu/cfr/text/12/1024.17` |
| Appendix E ("Arithmetic Steps") | eCFR: `https://www.ecfr.gov/current/title-12/chapter-X/part-1024/appendix-Appendix%20E%20to%20Part%201024` | CFPB: `https://www.consumerfinance.gov/rules-policy/regulations/1024/e/` | LII: `https://www.law.cornell.edu/cfr/text/12/appendix-E_to_part_1024` |
| Official interpretations (Supplement I) for § 1024.17 | eCFR Supplement I to Part 1024 | CFPB: `https://www.consumerfinance.gov/rules-policy/regulations/1024/interp-17/` | — |
| §§ 1024.35, 1024.36 | eCFR | CFPB `/1024/35/`, `/1024/36/` | LII `/cfr/text/12/1024.35`, `/1024.36` |
| §§ 1024.2, 1024.5, 1024.30, 1024.31, 1024.34 (scope) | eCFR (1024.2) | CFPB `/1024/2/`, `/5/`, `/30/`, `/31/`, `/34/` | — |
| CFPB Mortgage Servicing FAQs — Escrow Accounts (official CFPB compliance aid, escrow FAQs dated June 2, 2021 / April 12, 2023) | `https://www.consumerfinance.gov/compliance/compliance-resources/mortgage-resources/mortserv/mortgage-servicing-faqs/` | — | — |
| HUD final rule, Escrow Accounting Procedures, **59 FR 53890** (Oct. 26, 1994) — the rule that created this math | `https://www.govinfo.gov/content/pkg/FR-1994-10-26/html/94-26583.htm` | federalregister.gov record 94-26583 (citation check only) | — |
| HUD final rule + clarifications + example statements, **60 FR 8812** (Feb. 15, 1995) | `https://www.govinfo.gov/content/pkg/FR-1995-02-15/html/95-3683.htm` | CFPB-hosted copy: `https://files.consumerfinance.gov/f/documents/HUD_95-3683.pdf` | — |
| CFPB list of escrow Public Guidance Documents | `https://files.consumerfinance.gov/f/documents/cfpb_escrow-disclosure_public-guidance-documents_2021-06.pdf` | — | — |
| CFPB complaint portal | `https://www.consumerfinance.gov/complaint/` | — | — |

**How the checking worked.** I saved the plain text of each page and ran a script that looks for each quote, character for character (ignoring only line breaks and curly-vs-straight quote marks), in every source. Results: 60 quotes from § 1024.17 found in all three of eCFR + CFPB + LII, 0 misses. 16 quotes from §§ 1024.35/1024.36 found in all three, 0 misses. All 366 numbers in Appendix E are identical in eCFR, CFPB and LII. The HUD 1995 quotes were found in both the govinfo text and the CFPB-hosted PDF.

**One thing to know about weight.** The regulation text and Appendix E are binding law. The CFPB FAQs are official CFPB compliance guidance. The HUD 1994/1995 Federal Register material is from the agency that wrote the rule (HUD ran RESPA until 2011; CFPB then republished Regulation X as 12 CFR Part 1024 — the section's source note reads "76 FR 78981, Dec. 20, 2011"). CFPB says of the HUD example statements: "Public Guidance Documents are not 'rules, regulations, or interpretations' of the Bureau" (CFPB Public Guidance Documents list, citing 12 CFR § 1024.4(a)(2)). So treat HUD material as strong evidence of what the rule means, not as the rule itself. I label it every time I use it.

**Official interpretations are silent on the math.** CFPB's Supplement I has comments for § 1024.17 on exactly one topic: 17(k)(5), force-placed hazard insurance. Nothing on cushions, trial balances, surpluses or shortages. So the math lives entirely in § 1024.17(b)–(f) and Appendix E.

---

## 2. Definitions — § 1024.17(b), word for word

**Aggregate analysis** (checking the account as one pot, not bill by bill):
> "Aggregate (or) composite analysis, hereafter called aggregate analysis, means an accounting method a servicer uses in conducting an escrow account analysis by computing the sufficiency of escrow account funds by analyzing the account as a whole. Appendix E to this part sets forth examples of aggregate escrow account analyses."

**Annual escrow account statement:**
> "Annual escrow account statement means a statement containing all of the information set forth in § 1024.17(i). As noted in § 1024.17(i), a servicer shall submit an annual escrow account statement to the borrower within 30 calendar days of the end of the escrow account computation year, after conducting an escrow account analysis."

**Cushion or reserve** (the padding):
> "Cushion or reserve (hereafter cushion) means funds that a servicer may require a borrower to pay into an escrow account to cover unanticipated disbursements or disbursements made before the borrower's payments are available in the account, as limited by § 1024.17(c)."

**Deficiency** (the account is actually below zero):
> "Deficiency is the amount of a negative balance in an escrow account. As noted in § 1024.17(f), if a servicer advances funds for a borrower, then the servicer must perform an escrow account analysis before seeking repayment of the deficiency."

**Disbursement date** (the day the servicer really pays the bill):
> "Disbursement date means the date on which the servicer actually pays an escrow item from the escrow account."

**Escrow account analysis:**
> "Escrow account analysis means the accounting that a servicer conducts in the form of a trial running balance for an escrow account to: (1) Determine the appropriate target balances; (2) Compute the borrower's monthly payments for the next escrow account computation year and any deposits needed to establish or maintain the account; and (3) Determine whether shortages, surpluses or deficiencies exist."

**Escrow account computation year** (the escrow "year" — it does NOT have to be January to December):
> "Escrow account computation year is a 12-month period that a servicer establishes for the escrow account beginning with the borrower's initial payment date. The term includes each 12-month period thereafter, unless a servicer chooses to issue a short year statement under the conditions stated in § 1024.17(i)(4)."

**Escrow account item:**
> "Escrow account item or separate item means any separate expenditure category, such as 'taxes' or 'insurance', for which funds are collected in the escrow account for disbursement. An escrow account item with installment payments, such as local property taxes, remains one escrow account item regardless of multiple disbursement dates to the tax authority."

**Initial escrow account statement:**
> "Initial escrow account statement means the first disclosure statement that the servicer delivers to the borrower concerning the borrower's escrow account. The initial escrow account statement shall meet the requirements of § 1024.17(g) and be in substantially the format set forth in § 1024.17(h)."

**Installment payment:**
> "Installment payment means one of two or more payments payable on an escrow account item during an escrow account computation year. An example of an installment payment is where a jurisdiction bills quarterly for taxes."

**Penalty:**
> "Penalty means a late charge imposed by the payee for paying after the disbursement is due. It does not include any additional charge or fee imposed by the payee associated with choosing installment payments as opposed to annual payments or for choosing one installment plan over another."

**Pre-accrual** (making you pay in early, before the money is needed — banned, see §3):
> "Pre-accrual is a practice some servicers use to require borrowers to deposit funds, needed for disbursement and maintenance of a cushion, in the escrow account some period before the disbursement date. Pre-accrual is subject to the limitations of § 1024.17(c)."

**Shortage:**
> "Shortage means an amount by which a current escrow account balance falls short of the target balance at the time of escrow analysis."

**Surplus:**
> "Surplus means an amount by which the current escrow account balance exceeds the target balance for the account."

**Target balance** (what the balance *should* be at the end of a given month):
> "Target balance means the estimated month end balance in an escrow account that is just sufficient to cover the remaining disbursements from the escrow account in the escrow account computation year, taking into account the remaining scheduled periodic payments, and a cushion, if any."

**Trial running balance** (the 12-row table):
> "Trial running balance means the accounting process that derives the target balances over the course of an escrow account computation year. Section 1024.17(d) provides a description of the steps involved in performing a trial running balance."

Things to notice: surplus and shortage are both defined as **current balance compared with target balance**. Neither definition mentions a "low point". The low point is how you *build* the target (§4). And balances are **month-end** balances, so what day of the month a bill is paid does not matter to the math.

---

## 3. The limits — § 1024.17(c)

**At creation of the account, (c)(1)(i):**
> "At the time a servicer creates an escrow account for a borrower, the servicer may charge the borrower an amount sufficient to pay the charges respecting the mortgaged property, such as taxes and insurance, which are attributable to the period from the date such payment(s) were last paid until the initial payment date. The 'amount sufficient to pay' is computed so that the lowest month end target balance projected for the escrow account computation year is zero (-0-) (see Step 2 in appendix E to this part). In addition, the servicer may charge the borrower a cushion that shall be no greater than one-sixth (1/6) of the estimated total annual payments from the escrow account."

**During the life of the loan, (c)(1)(ii):**
> "Throughout the life of an escrow account, the servicer may charge the borrower a monthly sum equal to one-twelfth (1/12) of the total annual escrow payments which the servicer reasonably anticipates paying from the account. In addition, the servicer may add an amount to maintain a cushion no greater than one-sixth (1/6) of the estimated total annual payments from the account. However, if a servicer determines through an escrow account analysis that there is a shortage or deficiency, the servicer may require the borrower to pay additional deposits to make up the shortage or eliminate the deficiency, subject to the limitations set forth in § 1024.17(f)."

**Aggregate accounting is mandatory, (c)(4):**
> "All servicers must use the aggregate accounting method in conducting escrow account analyses."

**The cushion cap again, (c)(5)** (the owner's notes call this "(d)(5)" — it is (c)(5)):
> "The cushion must be no greater than one-sixth (1/6) of the estimated total annual disbursements from the escrow account."

**No pre-accrual, (c)(6):**
> "A servicer must not practice pre-accrual."

**How the servicer estimates next year's bills, (c)(7):**
> "If the servicer knows the charge for an escrow item in the next computation year, then the servicer shall use that amount in estimating disbursement amounts. If the charge is unknown to the servicer, the servicer may base the estimate on the preceding year's charge, or the preceding year's charge as modified by an amount not exceeding the most recent year's change in the national Consumer Price Index for all urban consumers (CPI, all items)."

**Where a LOWER cushion wins — this is the paragraph the task asked for, (c)(8):**
> "The servicer must examine the federally related mortgage loan documents to determine the applicable cushion for each escrow account. If any such documents provide for lower cushion limits, then the terms of the loan documents apply. Where the terms of any such documents allow greater payments to an escrow account than allowed by this section, then this section controls the applicable limits. … If such documents are silent on the escrow account limits and a servicer establishes an escrow account under other Federal or State law, then the limitations of this section apply unless applicable Federal or State law provides for a lower amount. If such documents provide for escrow accounts up to the RESPA limits, then the servicer may require the maximum amounts consistent with this section, unless an applicable Federal or State law sets a lesser amount."

The same idea shows up twice more inside the method itself: (d)(2)(i)(C) "or a lesser amount specified by state law or the mortgage document", and (d)(2)(ii) (quoted in §4). And the servicer is always free to hold less, (d)(1):
> "The steps set forth in this section result in maximum limits. Servicers may use accounting procedures that result in lower target balances. In particular, servicers may use a cushion less than the permissible cushion or no cushion at all. This section does not require the use of a cushion."

So everything EscrowScope computes is a **ceiling**. A servicer at or under the ceiling is fine. Only going over it is a problem.

**Bills that come less often than yearly, (c)(9):** for something like a 3-year flood premium, "the servicer shall collect the payments reflecting 36 equal monthly amounts." In two of the three years the account will not hit its low point, and the statement has to explain that. EscrowScope v1 should not try to model this; see §12 and §14.

---

## 4. The method — § 1024.17(d) and Appendix E

### 4.1 The steps, word for word — (d)(2)(i)

> "(A) The servicer first projects a trial balance for the account as a whole over the next computation year (a trial running balance). In doing so the servicer assumes that it will make estimated disbursements on or before the earlier of the deadline to take advantage of discounts, if available, or the deadline to avoid a penalty. The servicer does not use pre-accrual on these disbursement dates. The servicer also assumes that the borrower will make monthly payments equal to one-twelfth of the estimated total annual escrow account disbursements."

> "(B) The servicer then examines the monthly trial balances and adds to the first monthly balance an amount just sufficient to bring the lowest monthly trial balance to zero, and adjusts all other monthly balances accordingly."

> "(C) The servicer then adds to the monthly balances the permissible cushion. The cushion is two months of the borrower's escrow payments to the servicer or a lesser amount specified by state law or the mortgage document (net of any increases or decreases because of prior year shortages or surpluses, respectively)."

And the test, (d)(2)(ii):
> "Lowest monthly balance. Under aggregate analysis, the lowest monthly target balance for the account shall be less than or equal to one-sixth of the estimated total annual escrow account disbursements or a lesser amount specified by state law or the mortgage document. The target balances that the servicer derives using these steps yield the maximum limit for the escrow account. Appendix E to this part illustrates these steps."

Two details people miss:

- In (A), the deposit used in the projection is **not** whatever you happen to be paying. It is *defined* as 1/12 of the coming year's bills.
- In (C), "two months of the borrower's escrow payments … net of any increases or decreases because of prior year shortages or surpluses". In plain words: when you work out "two months of payments" for the cushion, use the plain 1/12 payment. Do not count a shortage add-on as part of it. So the cushion cap is always 2 × (bills ÷ 12) = bills ÷ 6.

### 4.2 Appendix E, Example I — OFFICIAL, in full

Appendix E is titled "Arithmetic Steps". Assumptions, copied:

> "$360 for school taxes disbursed on September 20"
> "$1,200 for county property taxes:" "$500 disbursed on July 25" "$700 disbursed on December 10"
> "Cushion: One-sixth of estimated annual disbursements"
> "Settlement: May 15"
> "First Payment: July 1"

Total bills = $1,560. Monthly payment = 1,560 ÷ 12 = **$130**. Cushion = 1,560 ÷ 6 = **$260**.

The appendix prints three tables ("Step 1—Initial Trial Balance", "Step 2—Adjusted Trial Balance [Increase monthly balances to eliminate negative balances]", "Step 3—Trial Balance With Cushion"). Here they are side by side. All numbers are as printed.

| Month | pmt | disb | Step 1 bal | Step 2 bal | Step 3 bal |
|---|---:|---:|---:|---:|---:|
| Jun (start) | 0 | 0 | 0 | 780 | 1040 |
| Jul | 130 | 500 | −370 | 410 | 670 |
| Aug | 130 | 0 | −240 | 540 | 800 |
| Sep | 130 | 360 | −470 | 310 | 570 |
| Oct | 130 | 0 | −340 | 440 | 700 |
| Nov | 130 | 0 | −210 | 570 | 830 |
| Dec | 130 | 700 | **−780** | **0** | **260** |
| Jan | 130 | 0 | −650 | 130 | 390 |
| Feb | 130 | 0 | −520 | 260 | 520 |
| Mar | 130 | 0 | −390 | 390 | 650 |
| Apr | 130 | 0 | −260 | 520 | 780 |
| May | 130 | 0 | −130 | 650 | 910 |
| Jun | 130 | 0 | 0 | 780 | 1040 |

What happened:

- **Step 1.** Pretend the account starts at $0. Add $130 a month, subtract bills in the month they are paid. The worst month is December at −$780.
- **Step 2.** Add $780 to every row so December becomes exactly $0.
- **Step 3.** Add the $260 cushion to every row. December is now $260 = the cushion. The first row, **$1,040**, is the most the servicer may hold at the start of this escrow year.
- The monthly payment is **$130 in all three tables**. The cushion never touches the monthly payment. It lives in the balance.
- The year runs July → June. The official example is itself a "year that doesn't start in January".
- Because deposits for the year equal bills for the year, the last row always equals the first row.

### 4.2b Appendix E, Example II — OFFICIAL, single-item analysis (historical; do NOT implement)

Same bills, but each bill type gets its own little account and its own cushion. This was the old way. It is no longer allowed ((c)(4): aggregate is required). I include it because the task asked for every Appendix E example and because it makes a good negative test: single-item needs $800 + $330 = **$1,130** to start, aggregate needs only **$1,040**. An engine that says $1,130 is doing it the banned way.

| Month | Taxes pmt | Taxes disb | S1 | S2 | S3 | School pmt | School disb | S1 | S2 | S3 |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Jun (start) | 0 | 0 | 0 | 600 | 800 | 0 | 0 | 0 | 270 | 330 |
| Jul | 100 | 500 | −400 | 200 | 400 | 30 | 0 | 30 | 300 | 360 |
| Aug | 100 | 0 | −300 | 300 | 500 | 30 | 0 | 60 | 330 | 390 |
| Sep | 100 | 0 | −200 | 400 | 600 | 30 | 360 | −270 | 0 | 60 |
| Oct | 100 | 0 | −100 | 500 | 700 | 30 | 0 | −240 | 30 | 90 |
| Nov | 100 | 0 | 0 | 600 | 800 | 30 | 0 | −210 | 60 | 120 |
| Dec | 100 | 700 | −600 | 0 | 200 | 30 | 0 | −180 | 90 | 150 |
| Jan | 100 | 0 | −500 | 100 | 300 | 30 | 0 | −150 | 120 | 180 |
| Feb | 100 | 0 | −400 | 200 | 400 | 30 | 0 | −120 | 150 | 210 |
| Mar | 100 | 0 | −300 | 300 | 500 | 30 | 0 | −90 | 180 | 240 |
| Apr | 100 | 0 | −200 | 400 | 600 | 30 | 0 | −60 | 210 | 270 |
| May | 100 | 0 | −100 | 500 | 700 | 30 | 0 | −30 | 240 | 300 |
| Jun | 100 | 0 | 0 | 600 | 800 | 30 | 0 | 0 | 270 | 330 |

### 4.3 The method as formulas

Let D = total bills for the coming year, d(m) = bills paid in month m (m = 1…12, in escrow-year order), B = the real balance at the start of the year.

```
P  = D / 12                               base monthly payment      (c)(1)(ii), (d)(2)(i)(A)
C  = D × cushionMonths / 12               cushion cap; cushionMonths = 2 unless docs/state law say less
T(0) = 0;  T(m) = T(m−1) + P − d(m)       Step 1 trial balance      Appendix E Step 1
A  = −min(T(1..12))   (never below 0)     Step 2 add                Appendix E Step 2
G(m) = T(m) + A + C                       target balance, month m   Appendix E Step 3
required start = G(0) = A + C
difference = B − G(0)      > 0 surplus,  < 0 shortage               (b) definitions
projected(m) = B + T(m)    what the account will really do
low point = min projected(1..12)
```

**How surplus is measured in a real annual statement.** HUD's own example statement for aggregate accounts (Appendix I-8, 60 FR 8829) says it in one line:

> "Your ending balance, from the last month of the account history, is $1,320. Your starting balance according to this analysis should be $1,090. This means you have a surplus of $230."

That is: **actual balance − required starting balance.** (TV03 reproduces that example to the dollar.)

### 4.4 The nuance: is "low point − cushion" the same as "actual − target"?

The owner's engine computes `surplus = lowest projected month-end balance − cushion cap`.

**When the deposit used equals exactly D/12: yes, identical.** Proof in three lines. projected(m) = B + T(m), so the low point = B + min T = B − A. Then low point − C = B − A − C = B − G(0). Same number. The checking script asserts this identity on every one of the 22 vectors (using each vector's own cushion) and it held on all of them.

**When the deposit typed in is NOT D/12: it breaks.** If the deposit is p instead of P, every row drifts by m × (p − P). By month 11 that is 11 × the error. TV18 shows both ways to get it wrong, using a real-life situation (bills went from $4,800 to $5,700; true shortage is $300.00):

| What the user typed as "monthly deposit" | Owner's engine says | Truth |
|---|---:|---:|
| last year's payment, $400.00 | **−$1,125.00** (shortage overstated by $825 = 11 months × $75) | −$300.00 |
| the new payment off the statement, $500.00 (it already contains a $25 shortage add-on) | **−$25.00** (shortage understated; the repayment got counted as ordinary deposits) | −$300.00 |
| (engine computes $475.00 itself) | −$300.00 | −$300.00 |

The first mistake would make EscrowScope tell a homeowner their servicer is *under*-collecting by a huge amount. The second could hide real over-collection. Neither is acceptable for a tool whose whole point is accuracy.

**Recommendation — what is an input and what is computed:**

| Thing | Input or computed? | Why |
|---|---|---|
| Each expected bill: label, amount, month paid | **Input** | From the statement's "projections for coming year" |
| Escrow year start month | **Input** | From the statement |
| Starting balance (the balance the projection starts from) | **Input** | From the statement. Can be negative. See §14 Q3 |
| Cushion months allowed (0 / 1 / 2) | **Input, default 2** | (c)(8): loan documents or state law can lower it |
| Is the borrower current? | **Input, default yes** | (f)(2)(ii), (f)(4)(iii) |
| Base monthly payment P = D/12 | **COMPUTED — never an input to the projection** | (d)(2)(i)(A) |
| Cushion cap, required starting balance, target table, projected table, low point, surplus / shortage / deficiency, tier, lawful new payment | **Computed** | |
| What the servicer says: new monthly escrow payment, their shortage/surplus figure, their required/target low balance, last year's escrow payment | **Optional inputs used ONLY for comparison and for the "why did it jump" breakdown** | |

Suggested output: `{ annualDisbursements, baseMonthlyPayment, cushionCap, requiredStartingBalance, difference, surplus, shortage, deficiency, lowPoint{amount, month}, classification, cite, servicerOptions[], newMonthlyPayment{base, shortageSpread12, deficiencySpread, total}, table[12], comparison{…} }`. The JSON vectors use exactly these names with a `Cents` suffix.

---

## 5. Surplus — § 1024.17(f)(2)

> "(i) If an escrow account analysis discloses a surplus, the servicer shall, within 30 days from the date of the analysis, refund the surplus to the borrower if the surplus is greater than or equal to 50 dollars ($50). If the surplus is less than 50 dollars ($50), the servicer may refund such amount to the borrower, or credit such amount against the next year's escrow payments."

> "(ii) These provisions regarding surpluses apply if the borrower is current at the time of the escrow account analysis. A borrower is current if the servicer receives the borrower's payments within 30 days of the payment due date. If the servicer does not receive the borrower's payment within 30 days of the payment due date, then the servicer may retain the surplus in the escrow account pursuant to the terms of the federally related mortgage loan documents."

Answers to the specific questions:

- **Is it "greater than or equal to"? Yes.** A surplus of exactly $50.00 must be refunded (TV06). $49.99 may be refunded or credited (TV07).
- **The clock:** 30 days **from the date of the analysis** (not from the statement date, not from when you notice).
- **Under $50:** servicer's choice — refund, or credit against next year's escrow payments. The reg does not say how the credit is spread.
- **"Current" means:** the servicer *receives* your payments *within 30 days of the payment due date*. "Payment due date" is defined in (b) as "the date each month when the borrower's monthly payment to an escrow account is due to the servicer." If not current, the servicer "may retain the surplus … pursuant to the terms of the … loan documents" (TV20).
- HUD 1995 clarification (m): a servicer may **not** offer "apply my refundable surplus to principal instead" as an option; it has to send the refund, though it can tell you that you are free to send the money back toward principal. HUD clarification (k): wire transfer instead of a check is fine.
- HUD 1995 clarification (f): money sitting in the account because **you paid ahead voluntarily** is "not counted for the purpose of determining whether a surplus is to be credited or returned." So an early January payment made in December is not a surplus.
- (f)(2)(iii): you and the servicer can *voluntarily agree*, one year at a time, that you will pay in more than the limits. That agreement "may not alter how surpluses are to be treated" at the next analysis.

---

## 6. Shortage — § 1024.17(f)(3)

> "(i) If an escrow account analysis discloses a shortage of less than one month's escrow account payment, then the servicer has three possible courses of action:
> (A) The servicer may allow a shortage to exist and do nothing to change it;
> (B) The servicer may require the borrower to repay the shortage amount within 30 days; or
> (C) The servicer may require the borrower to repay the shortage amount in equal monthly payments over at least a 12-month period."

> "(ii) If an escrow account analysis discloses a shortage that is greater than or equal to one month's escrow account payment, then the servicer has two possible courses of action:
> (A) The servicer may allow a shortage to exist and do nothing to change it; or
> (B) The servicer may require the borrower to repay the shortage in equal monthly payments over at least a 12-month period."

| Shortage size | Do nothing | Demand it within 30 days | Equal monthly payments over **at least 12 months** |
|---|:-:|:-:|:-:|
| **less than** one month's escrow payment — (f)(3)(i) | yes | yes | yes |
| **greater than or equal to** one month's escrow payment — (f)(3)(ii) | yes | **NO** | yes |

- Exactly one month's payment falls in the **bigger** tier (TV10). One cent less falls in the smaller tier (TV10b).
- "At least 12" means 12 is the *fastest* allowed. 24 months is legal. 6 months is not.
- **Big practical finding.** The CFPB FAQ says: "The specified repayment options in Regulation X are exclusive. Therefore, a servicer cannot include in the annual escrow statement any options for repayment of shortages that are not specified in Regulation X, such as a lump sum payment option for a shortage that is equal to or more than one month's escrow payment." It adds that a servicer may *accept* a lump sum you choose to send unprompted, and may mention the voluntary option in a *separate* communication, but "cannot require or provide the option of a lump sum payment on the annual escrow account statement." (CFPB Mortgage Servicing FAQs, Escrow — Deficiencies, Shortages, and Surpluses #4–#6, last updated June 2, 2021.) Many real statements print a "pay your shortage in full by …" coupon. If the shortage is ≥ one month's payment and that option is printed *on the annual statement itself*, that is worth flagging to the user as a question to ask, not as a proven violation.
- (f)(5): "The servicer shall notify the borrower at least once during the escrow account computation year if there is a shortage or deficiency in the escrow account." The annual statement can be that notice.

---

## 7. Deficiency — § 1024.17(f)(4), and how it differs from a shortage

> "(4) Deficiency. If the escrow account analysis confirms a deficiency, then the servicer may require the borrower to pay additional monthly deposits to the account to eliminate the deficiency.
> (i) If the deficiency is less than one month's escrow account payment, then the servicer:
> (A) May allow the deficiency to exist and do nothing to change it;
> (B) May require the borrower to repay the deficiency within 30 days; or
> (C) May require the borrower to repay the deficiency in 2 or more equal monthly payments.
> (ii) If the deficiency is greater than or equal to 1 month's escrow payment, the servicer may allow the deficiency to exist and do nothing to change it or may require the borrower to repay the deficiency in two or more equal monthly payments.
> (iii) These provisions regarding deficiencies apply if the borrower is current at the time of the escrow account analysis. A borrower is current if the servicer receives the borrower's payments within 30 days of the payment due date. If the servicer does not receive the borrower's payment within 30 days of the payment due date, then the servicer may recover the deficiency pursuant to the terms of the federally related mortgage loan documents."

| Deficiency size | Do nothing | Demand it within 30 days | **2 or more** equal monthly payments |
|---|:-:|:-:|:-:|
| less than one month's escrow payment — (f)(4)(i) | yes | yes | yes |
| greater than or equal to one month's — (f)(4)(ii) | yes | **NO** | yes |

**Shortage vs. deficiency in plain words.**

- A **deficiency** is real and already happened: the account is below $0 because the servicer paid a bill with its own money. The servicer can get that back fast (as few as 2 monthly payments).
- A **shortage** is a forecast: the balance is positive (or zero) but lower than it needs to be for next year. It must be spread over at least 12 months (unless small).
- HUD, 1994 preamble: "HUD sees a distinction between a shortage and a deficiency in the escrow account. In a situation where the servicer has advanced its own funds (a deficiency), HUD believes that the servicer may collect this advance quickly." And: "Because a shortage is the difference between the current escrow account balance and the target balance, HUD believes that shortages warrant different treatment than deficiencies."
- **A projected dip below zero is not a deficiency.** HUD 1994: "An escrow account analysis may indicate a shortage at the time of the analysis that will produce a deficiency at a later date. This rule does not allow servicers to anticipate deficiencies and collect on a deficiency in advance." (TV19.)
- Before chasing a deficiency the servicer must run an analysis: (f)(1)(ii) "If a servicer advances funds in paying a disbursement, which is not the result of a borrower's payment default under the underlying mortgage document, then the servicer shall conduct an escrow account analysis to determine the extent of the deficiency before seeking repayment".

**How they coexist.** If the balance is negative, it is below zero (deficiency) *and* below target (shortage). To avoid charging the same dollars twice, HUD's 1995 clarification (l) says:

> "The servicer first computes the deficiency and then computes the remaining shortage, and informs the borrower accordingly".

HUD's Appendix M (60 FR 8837) works an example: ending balance **−$2,400**, required start **$3,300**.

> "This means you have a deficiency of $2,400. … We will ask you to pay it over 2 months. After considering the deficiency, you still have a remaining shortage of $3,300. … We have decided to collect it over 12 months."

So: deficiency = the part below zero ($2,400). Remaining shortage = from $0 up to the target ($3,300). Escrow payment = $500 base + $1,200 (2,400 ÷ 2) + $275 (3,300 ÷ 12) = **$1,975** for two months, then **$775**. HUD prints exactly those numbers. TV04 reproduces it.

---

## 8. The new monthly escrow payment, and "why did my payment jump?"

**How the lawful payment is built:**

```
new monthly escrow payment  =  D / 12                                  (c)(1)(ii)
                             + shortage ÷ N,  N ≥ 12   (if the servicer chooses to collect it monthly)   (f)(3)
                             + deficiency ÷ n, n ≥ 2   (same; only for the first n months)                (f)(4)
```

The **most** a servicer can lawfully put in the monthly escrow line is therefore D/12 + shortage/12 + deficiency/2 (dropping to D/12 + shortage/12 after the deficiency months). A small shortage or small deficiency can instead be demanded as one payment within 30 days, in which case the monthly line is just D/12.

**Where is the cushion in that formula? Nowhere — on purpose.** Appendix E shows pmt = $130 in Steps 1, 2 *and* 3. Adding the $260 cushion changed the balances, not the payment. The cushion is a level the *balance* must reach, so it gets funded through the starting balance, which means through the shortage. When your bills go up, the cushion cap goes up too (it is 1/6 of the bills), the target goes up, and the gap shows up as shortage.

**The three-part answer for the user** (TV18: escrow payment went $400.00 → $500.00):

| Piece | Formula | TV18 |
|---|---|---:|
| (a) Your bills went up | (D_new − D_old) ÷ 12 | +$75.00 |
| (b) You are repaying a shortage | shortage ÷ 12 | +$25.00 |
| …of which (c) rebuilding a bigger cushion | (C_new − C_old) ÷ 12 | $12.50 of the $25.00 |

And the shortage itself splits three ways. This identity is mine (derived, not quoted), but it is exact algebra and the script checks it:

```
shortage = (C_new − C_old)            cushion cap rose because bills rose            TV18: $150
         + (A_new − A_old)            bills bunch up differently / bigger before the low month   $75
         + (last year's target end − actual balance)   last year came in under projection       $75
                                                                                        total  $300
```

"Last year's target end" equals last year's required start (first row = last row). Part (b) drops off after 12 months *if* bills hold steady, which is worth telling the user: "about $25 of this increase should go away next year."

To produce this breakdown the engine needs one or two optional inputs about last year (old escrow payment, or old bill total). Without them it can still show (a)+(b) if the user enters last year's escrow payment, which § 1024.17(i)(1)(ii) requires the statement to show.

---

## 9. Rounding

**The regulation and Appendix E say nothing about cents.** Every Appendix E number is a whole dollar and every total divides evenly by 12.

The only rounding statement I found in a trustworthy source is HUD's 1995 clarification (a), 60 FR 8812:

> "May dollar amounts under this rule be rounded? Answer: Yes, any dollar amount referenced in this rule may be rounded up or down to the nearest dollar."

That is a 1995 HUD preamble statement about the predecessor rule (24 CFR 3500.17, same text). CFPB has not repeated or withdrawn it. I found no trustworthy source describing a standard industry cents convention, so I am not going to claim one.

**The conventions used in the vectors (CHOICES, not law):**

| Quantity | Convention | Reason |
|---|---|---|
| Base monthly payment | D ÷ 12, round half up to the cent | People pay whole cents; nearest-cent is the least surprising |
| Cushion cap | D × cushionMonths ÷ 12, round **down** | "no greater than" one-sixth → a cap must not be rounded up past the limit |
| Trial balance rows | Whole cents, using the rounded payment | Matches what a statement shows; rows add up |
| Shortage ÷ 12, deficiency ÷ n | Round half up | Same as the payment |
| Tie for the low month | Earliest month | Arbitrary (TV21) |

How much can this matter? TV15 (bills $5,000.00): whole-cent method gives required start $1,666.63 and surplus $33.37; doing it with no rounding at all gives $1,666.6667 and $33.3333. Four cents. The drift can never exceed about 7 cents (half a cent × 12 months, plus a cent on the cushion).

**Recommended UI rule (also a choice):** because HUD said servicers may round any figure to the nearest dollar, a perfectly legal statement can differ from exact-cents math by up to about $6.50 at the low point (50¢ × 12 months + 50¢ on the cushion). EscrowScope should say "matches" for differences under about **$7**, and only raise a flag above that. The $50.00 line in (f)(2) is then applied to whatever surplus figure results.

---

## 10. Timing: year not starting in January, same-month bills, installments, annual vs. semiannual

- **Year start.** The computation year begins "with the borrower's initial payment date" (b). Appendix E runs July–June. HUD's examples run September–August. The engine should number months 1–12 in escrow-year order and carry a `startMonth` for labels. (TV02, TV03, TV04, TV13.)
- **Two bills in one month / bill in the same month as the deposit.** Balances are month-end. Appendix E's July row has +130 and −500 in the same month and simply nets them. Order within the month does not matter. (TV14, TV21.)
- **Bills in month 1 and month 12.** A month-1 bill makes month 1 the low point and forces a large required start (TV14). A month-12-only bill means Step 1 never goes negative, so the required start is just the cushion — or $0 with no cushion (TV12).
- **Which date the servicer must assume, (d)(2)(i)(A):** "on or before the earlier of the deadline to take advantage of discounts, if available, or the deadline to avoid a penalty." HUD 1995 clarification (h) confirms a servicer may pick an earlier date (its example: paying in December so you get the tax deduction this year).
- **Timely payment, (k)(1):** "the servicer must pay the disbursements in a timely manner, that is, on or before the deadline to avoid a penalty, as long as the borrower's payment is not more than 30 days overdue." **(k)(2):** "The servicer must advance funds to make disbursements in a timely manner as long as the borrower's payment is not more than 30 days overdue." (That advance is how a deficiency is born.)
- **Installments vs. one annual payment, (k)(3):** "If the taxing jurisdiction neither offers a discount for disbursements on a lump sum annual basis nor imposes any additional charge or fee for installment disbursements, the servicer must make disbursements on an installment basis." If there *is* a discount for lump sum, or a fee for installments, the servicer "may, at the servicer's discretion (but is not required by RESPA to), make lump sum annual disbursements". (k)(4) lets borrower and servicer agree to something else, voluntarily. Why this matters for the math: paying a whole year's tax in one early lump makes the low point deeper and the required balance bigger than installments would. HUD 1995 (h): the rule was aimed at servicers "collecting and paying a full-year's taxes in advance, although they were billed on an installment basis."
- **Installments are one "item".** Quarterly taxes are still one escrow item with four disbursement dates (b). For the engine each installment is just another row. (TV21.)
- **Monthly pass-through items (PMI, FHA MIP).** HUD 1995 clarification (d): are items that "enter and leave the account within the same month, such as FHA monthly premiums, private mortgage insurance" escrow items? "Answer: Yes. All items in the account are included so that the projected low monthly balance is zero (-0-) at the end of Step 2". CFPB's FAQ #10 also treats PMI as a charge inside the escrow analysis. HUD adds: "State laws or Federal program requirements may prohibit cushioning for certain of these payments." So counting PMI in D gives the legal *maximum*; a servicer that leaves PMI out of its cushion is simply holding less than the max, which is allowed. (TV21.)
- **Pre-accrual is banned** (c)(6), and (d)(2)(i)(A) repeats "The servicer does not use pre-accrual on these disbursement dates."
- **Analysis happens a bit before year-end.** (i)(1): "In preparing the statement, the servicer may assume scheduled payments and disbursements will be made for the final 2 months of the escrow account computation year." So the "starting balance" on a statement is often itself a short projection. See §14 Q3.
- **Mid-year re-analysis** is allowed: (f)(1)(ii) "The servicer may conduct an escrow account analysis at other times during the escrow computation year"; CFPB FAQ #11 says the servicer then issues a short-year statement to reset the year.

---

## 11. What the annual statement must contain — § 1024.17(i)(1) → the form's fields

Timing, (i): "a servicer shall submit an annual escrow account statement to the borrower within 30 days of the completion of the escrow account computation year. The servicer shall also submit to the borrower the previous year's projection or initial escrow account statement."

Contents, (i)(1): "The annual escrow account statement shall provide an account history, reflecting the activity in the escrow account during the escrow account computation year, and a projection of the activity in the account for the next year. … The annual escrow account statement must include, at a minimum, the following (the items in paragraphs (i)(1)(i) through (i)(1)(iv) must be clearly itemized):"

| Cite | Required item, verbatim | EscrowScope field |
|---|---|---|
| (i)(1)(i) | "The amount of the borrower's current monthly mortgage payment and the portion of the monthly payment going into the escrow account;" | `statementNewMonthlyEscrow` (comparison only) |
| (i)(1)(ii) | "The amount of the past year's monthly mortgage payment and the portion of the monthly payment that went into the escrow account;" | `lastYearMonthlyEscrow` (for "why did it jump") |
| (i)(1)(iii) | "The total amount paid into the escrow account during the past computation year;" | optional sanity check |
| (i)(1)(iv) | "The total amount paid out of the escrow account during the same period for taxes, insurance premiums, and other charges (as separately identified);" | optional; helps pre-fill bills |
| (i)(1)(v) | "The balance in the escrow account at the end of the period;" | **`startingBalance`** |
| (i)(1)(vi) | "An explanation of how any surplus is being handled by the servicer;" | `servicerSurplusAction` (comparison) |
| (i)(1)(vii) | "An explanation of how any shortage or deficiency is to be paid by the borrower; and" | `servicerShortageAmount`, `servicerSpreadMonths` (comparison) |
| (i)(1)(viii) | "If applicable, the reason(s) why the estimated low monthly balance was not reached, as indicated by noting differences between the most recent account history and last year's projection." | info only |
| (i)(1) intro | "a projection of the activity in the account for the next year" | **`bills[]`: label, month, amount** and `startMonth` |

The cushion the servicer chose is required on the *initial* statement ((g)(1)(i): "shall indicate the amount that the servicer selects as a cushion") but is **not** in the (i)(1) list for annual statements. HUD's model annual format shows the required starting balance, and most real statements print a "required minimum balance". Treat the servicer's cushion as an optional comparison field.

---

## 12. When § 1024.17 does not apply, or applies differently

- **Only "federally related mortgage loans."** (a): "an escrow account that a lender establishes in connection with a federally related mortgage loan." § 1024.2(b) defines that (roughly: loans on 1–4 family homes from federally regulated/insured lenders or sold to Fannie/Freddie — nearly all normal home mortgages). § 1024.5(b) exempts business-purpose loans, temporary/construction financing, vacant land, and a few others.
- **Accounts you fully control.** (b): "the term 'escrow account' excludes any account that is under the borrower's total control."
- **Biweekly payers.** (a): "If an escrow account involves biweekly or any other payment period, the requirements in this section shall be modified accordingly." EscrowScope's monthly table will not match; say so.
- **Default, foreclosure, bankruptcy, (i)(2):** "If at the time the servicer conducts the escrow account analysis the borrower is more than 30 days overdue, then the servicer is exempt from the requirements of submitting an annual escrow account statement … This exemption also applies in situations where the servicer has brought an action for foreclosure … or where the borrower is in bankruptcy proceedings." Once current again, the servicer owes a history "within 90 days". Also the surplus-refund and deficiency-option rules only protect a borrower who is current ((f)(2)(ii), (f)(4)(iii)), and the duty to pay bills on time runs only "as long as the borrower's payment is not more than 30 days overdue" (k)(1).
- **Short-year statements, (i)(4):** a servicer "may issue a short year annual escrow account statement … to change one escrow account computation year to another", due within 60 days of the short year's end; required on servicing transfer and on payoff. A short-year history covers fewer than 12 months, but the *projection* for the new year is still 12 months, so the engine still works on the projection.
- **Servicing transfers, (e):** a new servicer that changes the payment or method sends a new initial statement within 60 days and starts a new computation year.
- **Flood insurance** is an ordinary escrow item ((b) "insurance premiums (including flood insurance)"). A premium billed every 3 years is handled under (c)(9) with 36 equal payments and a 3-year low point — outside a 12-month engine.
- **PMI / MIP:** escrow items when the servicer collects them through escrow (§10).
- **Voluntary extras** like credit life insurance, (l): "A discretionary payment is not part of the escrow account unless the payment is required by the lender … or the servicer chooses to place the discretionary payment in the escrow account."
- **Voluntary over-payment agreements**, (f)(2)(iii), one year at a time.
- **Payoff:** § 1024.34(b)(1) — remaining escrow money comes back "within 20 days (excluding legal public holidays, Saturdays, and Sundays) of a borrower's payment of a mortgage loan in full".
- **State law can be stricter** (lower cushion; some states require interest on escrow). § 1024.17(c)(8). CFPB's official comment 5(c)(1)-1: "State laws that give greater protection to consumers are not inconsistent with and are not preempted by RESPA or Regulation X." EscrowScope checks the federal ceiling only.

---

## 13. What a homeowner can do if the math looks wrong

**Step 0 — ask for the numbers. Request for information, § 1024.36.** A written request with your name, enough to identify the loan, and what you want. (a): "A servicer shall comply with the requirements of this section for any written request for information from a borrower that includes the name of the borrower, information that enables the servicer to identify the borrower's mortgage loan account, and states the information the borrower is requesting with respect to the borrower's mortgage loan."
- Acknowledge in **5 business days** — (c): "Within five days (excluding legal public holidays, Saturdays, and Sundays) … a written response acknowledging receipt".
- Answer in **30 business days** — (d)(2)(i)(B): "not later than 30 days (excluding legal public holidays, Saturdays, and Sundays) after the servicer receives the information request." One 15-business-day extension is possible if they tell you in writing first, (d)(2)(ii).
- No fee — (g)(1): "a servicer shall not charge a fee, or require a borrower to make any payment that may be owed on a borrower's account, as a condition of responding to an information request."
- CFPB's own commentary (comment 35(a)-2) uses an escrow statement as its example of something you can request this way.

**Step 1 — dispute it. Notice of error, § 1024.35.** (a): "any written notice from the borrower that asserts an error and that includes the name of the borrower, information that enables the servicer to identify the borrower's mortgage loan account, and the error the borrower believes has occurred." A note scribbled on a payment coupon does not count.

*Is an escrow miscalculation a "covered error"?* Honest answer: **it is not named.** § 1024.35(b) lists ten specific errors, then a catch-all. The specific ones closest to escrow are:
- (b)(2) "Failure to apply an accepted payment to principal, interest, escrow, or other charges under the terms of the mortgage loan and applicable law."
- (b)(4) failure to pay taxes/insurance on time or to refund escrow **at payoff** (that is § 1024.34, not the annual surplus refund).
- (b)(5) "Imposition of a fee or charge that the servicer lacks a reasonable basis to impose upon the borrower."

A wrong escrow analysis, a cushion over 1/6, or an unrefunded surplus fits best under the catch-all:
- **(b)(11) "Any other error relating to the servicing of a borrower's mortgage loan."** And § 1024.2(b) defines servicing as "receiving any scheduled periodic payments from a borrower pursuant to the terms of any federally related mortgage loan, including amounts for escrow accounts under section 10 of RESPA (12 U.S.C. 2609)". Escrow collection is servicing by definition, so an escrow error "relates to servicing". I did not find a CFPB statement that says "escrow analysis errors are covered by (b)(11)" in those words, so EscrowScope should say "you can send a notice of error", not "the law guarantees this is a covered error".

Timelines once a notice of error arrives:
- Acknowledge within **5 business days** — (d).
- Fix it, or investigate and explain in writing why there is no error, within **30 business days** — (e)(3)(i)(C): "not later than 30 days (excluding legal public holidays, Saturdays, and Sundays) after the servicer receives the applicable notice of error." One **15-business-day** extension if they notify you in writing before the 30 days are up — (e)(3)(ii).
- If they say "no error", you can ask for the documents they relied on; they must send them free within **15 business days** — (e)(4).
- No fee or catch-up payment can be demanded first — (h).
- **60-day credit-report shield** — (i)(1): "After receipt of a notice of error, a servicer may not, for 60 days, furnish adverse information to any consumer reporting agency regarding any payment that is the subject of the notice of error."
- **Use the right address.** (c): the servicer may designate one address for these, and then you *must* use it. It has to be on their website if they list any address. Same address for §§ 35 and 36.
- They can skip a notice that is a repeat, "overbroad", or sent more than a year after the loan was transferred or paid off — (g)(1).
- These two sections cover every servicer, including small ones (§ 1024.30(b) exempts small servicers only from §§ 1024.38–41), but not home-equity lines of credit (§ 1024.31 "Mortgage loan").

**Step 2 — CFPB complaint.** `https://www.consumerfinance.gov/complaint/` or (855) 411-2372. Free. CFPB forwards it to the company. Per that page: "Companies generally respond in 15 days. In some cases, the company will let you know their response is in progress and provide a final response in 60 days." One complaint per problem, so include everything the first time.

EscrowScope is not legal advice and should say so. It can honestly say: "Here is the federal ceiling, here is your servicer's number, here is the gap, here is the paragraph, here is how to ask them about it."

---

## 14. OPEN QUESTIONS / WHERE THE REG IS SILENT

| # | Question | What the sources say | What I did |
|---|---|---|---|
| Q1 | **Cents and rounding.** | Reg + Appendix E silent. HUD 1995: any dollar amount "may be rounded up or down to the nearest dollar." | §9 conventions, flagged as choices. Suggest ~$7 tolerance in the UI. |
| Q2 | **"One month's escrow account payment" — last year's payment or the new one?** | Silent. HUD Appendix M just says "less than 1 month's deposit". | Vectors use the **new base payment (D/12)**. If old and new payments put the shortage in different tiers, the UI should say so instead of picking a side. |
| Q3 | **Which balance is the "current escrow account balance"?** Analysis is usually run 1–2 months before year-end using assumed payments ((i)(1)). | Reg: "at the time of escrow analysis". HUD model form: "Your ending balance, from the last month of the account history". | Input = the balance the statement's projection starts from. Tell users to copy the "starting/beginning balance" of the projection table. |
| Q4 | **Literal overlap of "shortage" and "deficiency"** when the balance is negative. | HUD 1995 (l) + Appendix M: deficiency first, then *remaining* shortage from $0. | Vectors follow HUD. Non-binding but it is the only reading that avoids double-charging. |
| Q5 | **How a < $50 surplus "credit" is spread.** | Silent ("credit such amount against the next year's escrow payments"). | Engine reports base payment only; UI can note the credit. |
| Q6 | **Is a bad escrow analysis a covered "error"?** | Not enumerated; (b)(11) catch-all + § 1024.2 definition of servicing. | §13 wording: "can send", not "guaranteed covered". |
| Q7 | **Can a homeowner sue over § 1024.17?** | Not researched — case law, outside the approved source list. | Say nothing. Point to notice of error + CFPB complaint. |
| Q8 | **State-law cushion limits and escrow interest.** | (c)(8) says lower state limits win. No federal list of states. | `cushionMonths` input; no state database in v1. |
| Q9 | **Multi-year items (3-year flood), (c)(9).** | 36 equal payments; low point on a 3-year cycle. | Out of scope for the 12-month engine. UI should warn if the user has one. |
| Q10 | **Does the starting row count as a "month-end" when hunting the low point?** | Appendix E prints the starting row but the low is always a later month; with exact 1/12 deposits start = end, so it cannot matter. | Low point searched over months 1–12 only. |
| Q11 | **Is the HUD 1995 guidance still "live"?** | CFPB keeps the list and links the documents, but says they are not Bureau rules or interpretations. | Used only where the reg is silent (Q1, Q4) and always labeled. |
| Q12 | **The Public Guidance Document example statements** (formats I-1 to I-8, J, K, M). | They are scanned images in the Federal Register. I read Appendix I-8 and Appendix M directly from the page images in the CFPB-hosted PDF (pp. 8829, 8837). The 1995 rule's own change list says it corrected "a month reference in Example I, Step 3, of Appendix F from 'Jul' to 'Jun'" (Appendix F was the old name for today's Appendix E; today's text already shows "Jun"). A further correction was published at 60 FR 24734 (May 9, 1995), which I did not pull. | TV03/TV04 numbers are internally consistent and reproduce under the Appendix E method, so a later correction is unlikely to touch them; still, labeled as HUD guidance, not law. |

---

## 15. Test vectors — worked by hand, checked by script

**How these were produced.** I derived the key numbers for each case by hand from §4.3 (total, 1/12, cushion, Step 2 add, required start, difference, low point and month, tier). Then a throwaway Node script (kept in the session scratch folder, not in any repo) recomputed every case two independent ways — (1) the literal three-step Appendix E procedure, (2) a closed-form "cushion + worst cumulative gap between bills paid and deposits made" — and refused to output anything unless hand = method 1 = method 2. For cases where cents divide evenly it also ran a third, exact-fraction check. TV02 must reproduce all three printed Appendix E tables; TV03 and TV04 must reproduce HUD's printed tables. All 22 pass. The owner's `engine.js` was **not** used to produce any expected value. (Afterwards, for information only, I ran a read-only copy of it: it agrees on 18 of 22 and differs exactly where expected — TV12/TV16/TV17 because it has no lower-cushion input, TV15 because of floating-point cents.)

**Table columns.** "Step 1 trial balance" starts from $0 (Appendix E Step 1). "Target balance" is Appendix E Step 3 — the most the servicer may hold at that month-end. "Projected balance" starts from the real balance; this is the column the owner's engine produces. Target − Projected is the same in every row, and equals the shortage (or minus the surplus).

**Coverage map**

| Asked for | Vector(s) |
|---|---|
| Owner's test case #1 | TV01 |
| Every Appendix E official example | TV02 (aggregate); single-item in §4.2b and `referenceOnly` in the JSON |
| Official HUD guidance examples | TV03 (surplus), TV04 (deficiency + shortage) |
| Exact cushion / surplus 0 | TV05, TV02, TV21 |
| Surplus exactly $50.00 / $49.99 / $30 | TV06 / TV07 / TV08 |
| Shortage smaller than / equal to / larger than one month's payment | TV09, TV10b / TV10 / TV11 |
| Deficiency; shortage + deficiency combined | TV12 (pure deficiency), TV04 (combined) |
| Year not starting in January | TV02 (Jul), TV03 + TV04 (Sep), TV13 (Apr) |
| Two bills in one month; bill in month 1 and in month 12 | TV14 (also TV12 for month-12-only) |
| Total not divisible by 12 to the cent | TV15 |
| Lower cushion (1 month; zero) | TV16; TV17, TV12 |
| Extra: deposit-input bug + payment-jump breakdown | TV18 |
| Extra: projected dip ≠ deficiency | TV19 |
| Extra: borrower not current | TV20 |
| Extra: installments + monthly PMI + low-point tie | TV21 |

### TV01 — Owner's test case #1 - over-collection, refund required

*Source: OWNER-HAND-DERIVED (2026-07-24), re-derived with the reg method*

**Inputs:** starting balance $1,500.00 · year starts in Jan · cushion allowed: 2 month(s) · borrower current: yes

Bills: Property tax 1st half $1,800.00 in month 5; Homeowners insurance $1,200.00 in month 7; Property tax 2nd half $1,800.00 in month 11

| # | Month | Deposit | Bills paid | Step 1 trial balance (start $0) | Target balance (Step 3) | Projected balance (your real start) |
|---|---|---:|---:|---:|---:|---:|
| 0 | start | — | — | $0.00 | $1,200.00 | $1,500.00 |
| 1 | Jan | $400.00 | $0.00 | $400.00 | $1,600.00 | $1,900.00 |
| 2 | Feb | $400.00 | $0.00 | $800.00 | $2,000.00 | $2,300.00 |
| 3 | Mar | $400.00 | $0.00 | $1,200.00 | $2,400.00 | $2,700.00 |
| 4 | Apr | $400.00 | $0.00 | $1,600.00 | $2,800.00 | $3,100.00 |
| 5 | May | $400.00 | $1,800.00 | $200.00 | $1,400.00 | $1,700.00 |
| 6 | Jun | $400.00 | $0.00 | $600.00 | $1,800.00 | $2,100.00 |
| 7 | Jul | $400.00 | $1,200.00 | -$200.00 | $1,000.00 | $1,300.00 |
| 8 | Aug | $400.00 | $0.00 | $200.00 | $1,400.00 | $1,700.00 |
| 9 | Sep | $400.00 | $0.00 | $600.00 | $1,800.00 | $2,100.00 |
| 10 | Oct | $400.00 | $0.00 | $1,000.00 | $2,200.00 | $2,500.00 |
| 11 | Nov | $400.00 | $1,800.00 | -$400.00 | $800.00 ← low | $1,100.00 ← low |
| 12 | Dec | $400.00 | $0.00 | $0.00 | $1,200.00 | $1,500.00 |

- Annual disbursements: **$4,800.00** → base monthly payment (1/12): **$400.00** → cushion cap: **$800.00**
- Step 2 add (lifts the lowest Step 1 balance to $0): $400.00 → required (target) starting balance: **$1,200.00**
- Low point: projected $1,100.00 in month 11 (Nov); the target table's low is $800.00
- Actual − target = $1,500.00 − $1,200.00 = **$300.00** → surplus $300.00 · shortage $0.00 · deficiency $0.00
- Classification: **SURPLUS_REFUND_REQUIRED** — 12 CFR 1024.17(f)(2)(i)
- What the servicer may do: refund the surplus to the borrower within 30 days from the date of the analysis
- Lawful new monthly escrow payment: base $400.00 = **$400.00**

### TV02 — OFFICIAL Appendix E, Example I (aggregate analysis) - year starts in July

*Source: OFFICIAL - Appendix E to 12 CFR Part 1024, Part I*

**Inputs:** starting balance $1,040.00 · year starts in Jul · cushion allowed: 2 month(s) · borrower current: yes

Bills: County property taxes (Jul 25) $500.00 in month 1; School taxes (Sep 20) $360.00 in month 3; County property taxes (Dec 10) $700.00 in month 6

| # | Month | Deposit | Bills paid | Step 1 trial balance (start $0) | Target balance (Step 3) | Projected balance (your real start) |
|---|---|---:|---:|---:|---:|---:|
| 0 | start | — | — | $0.00 | $1,040.00 | $1,040.00 |
| 1 | Jul | $130.00 | $500.00 | -$370.00 | $670.00 | $670.00 |
| 2 | Aug | $130.00 | $0.00 | -$240.00 | $800.00 | $800.00 |
| 3 | Sep | $130.00 | $360.00 | -$470.00 | $570.00 | $570.00 |
| 4 | Oct | $130.00 | $0.00 | -$340.00 | $700.00 | $700.00 |
| 5 | Nov | $130.00 | $0.00 | -$210.00 | $830.00 | $830.00 |
| 6 | Dec | $130.00 | $700.00 | -$780.00 | $260.00 ← low | $260.00 ← low |
| 7 | Jan | $130.00 | $0.00 | -$650.00 | $390.00 | $390.00 |
| 8 | Feb | $130.00 | $0.00 | -$520.00 | $520.00 | $520.00 |
| 9 | Mar | $130.00 | $0.00 | -$390.00 | $650.00 | $650.00 |
| 10 | Apr | $130.00 | $0.00 | -$260.00 | $780.00 | $780.00 |
| 11 | May | $130.00 | $0.00 | -$130.00 | $910.00 | $910.00 |
| 12 | Jun | $130.00 | $0.00 | $0.00 | $1,040.00 | $1,040.00 |

- Annual disbursements: **$1,560.00** → base monthly payment (1/12): **$130.00** → cushion cap: **$260.00**
- Step 2 add (lifts the lowest Step 1 balance to $0): $780.00 → required (target) starting balance: **$1,040.00**
- Low point: projected $260.00 in month 6 (Dec); the target table's low is $260.00
- Actual − target = $1,040.00 − $1,040.00 = **$0.00** → surplus $0.00 · shortage $0.00 · deficiency $0.00
- Classification: **ON_TARGET** — 12 CFR 1024.17(d)(2)
- Lawful new monthly escrow payment: base $130.00 = **$130.00**

### TV03 — HUD guidance example, Appendix I-8 (aggregate annual statement) - surplus $230, year starts in September

*Source: HUD PUBLIC GUIDANCE DOCUMENT - 60 FR 8812, 8829 (Feb. 15, 1995), Appendix I-8*

**Inputs:** starting balance $1,320.00 · year starts in Sep · cushion allowed: 2 month(s) · borrower current: yes

Bills: Taxes $680.00 in month 2; Insurance $600.00 in month 3; Taxes $1,000.00 in month 11

| # | Month | Deposit | Bills paid | Step 1 trial balance (start $0) | Target balance (Step 3) | Projected balance (your real start) |
|---|---|---:|---:|---:|---:|---:|
| 0 | start | — | — | $0.00 | $1,090.00 | $1,320.00 |
| 1 | Sep | $190.00 | $0.00 | $190.00 | $1,280.00 | $1,510.00 |
| 2 | Oct | $190.00 | $680.00 | -$300.00 | $790.00 | $1,020.00 |
| 3 | Nov | $190.00 | $600.00 | -$710.00 | $380.00 ← low | $610.00 ← low |
| 4 | Dec | $190.00 | $0.00 | -$520.00 | $570.00 | $800.00 |
| 5 | Jan | $190.00 | $0.00 | -$330.00 | $760.00 | $990.00 |
| 6 | Feb | $190.00 | $0.00 | -$140.00 | $950.00 | $1,180.00 |
| 7 | Mar | $190.00 | $0.00 | $50.00 | $1,140.00 | $1,370.00 |
| 8 | Apr | $190.00 | $0.00 | $240.00 | $1,330.00 | $1,560.00 |
| 9 | May | $190.00 | $0.00 | $430.00 | $1,520.00 | $1,750.00 |
| 10 | Jun | $190.00 | $0.00 | $620.00 | $1,710.00 | $1,940.00 |
| 11 | Jul | $190.00 | $1,000.00 | -$190.00 | $900.00 | $1,130.00 |
| 12 | Aug | $190.00 | $0.00 | $0.00 | $1,090.00 | $1,320.00 |

- Annual disbursements: **$2,280.00** → base monthly payment (1/12): **$190.00** → cushion cap: **$380.00**
- Step 2 add (lifts the lowest Step 1 balance to $0): $710.00 → required (target) starting balance: **$1,090.00**
- Low point: projected $610.00 in month 3 (Nov); the target table's low is $380.00
- Actual − target = $1,320.00 − $1,090.00 = **$230.00** → surplus $230.00 · shortage $0.00 · deficiency $0.00
- Classification: **SURPLUS_REFUND_REQUIRED** — 12 CFR 1024.17(f)(2)(i)
- What the servicer may do: refund the surplus to the borrower within 30 days from the date of the analysis
- Lawful new monthly escrow payment: base $190.00 = **$190.00**

### TV04 — HUD guidance example, Appendix M - simultaneous deficiency ($2,400) and shortage ($3,300)

*Source: HUD PUBLIC GUIDANCE DOCUMENT - 60 FR 8812, 8837 (Feb. 15, 1995), Appendix M*

**Inputs:** starting balance -$2,400.00 · year starts in Sep · cushion allowed: 2 month(s) · borrower current: yes

Bills: Taxes $800.00 in month 2; Insurance $3,000.00 in month 3; Taxes $2,200.00 in month 10

| # | Month | Deposit | Bills paid | Step 1 trial balance (start $0) | Target balance (Step 3) | Projected balance (your real start) |
|---|---|---:|---:|---:|---:|---:|
| 0 | start | — | — | $0.00 | $3,300.00 | -$2,400.00 |
| 1 | Sep | $500.00 | $0.00 | $500.00 | $3,800.00 | -$1,900.00 |
| 2 | Oct | $500.00 | $800.00 | $200.00 | $3,500.00 | -$2,200.00 |
| 3 | Nov | $500.00 | $3,000.00 | -$2,300.00 | $1,000.00 ← low | -$4,700.00 ← low |
| 4 | Dec | $500.00 | $0.00 | -$1,800.00 | $1,500.00 | -$4,200.00 |
| 5 | Jan | $500.00 | $0.00 | -$1,300.00 | $2,000.00 | -$3,700.00 |
| 6 | Feb | $500.00 | $0.00 | -$800.00 | $2,500.00 | -$3,200.00 |
| 7 | Mar | $500.00 | $0.00 | -$300.00 | $3,000.00 | -$2,700.00 |
| 8 | Apr | $500.00 | $0.00 | $200.00 | $3,500.00 | -$2,200.00 |
| 9 | May | $500.00 | $0.00 | $700.00 | $4,000.00 | -$1,700.00 |
| 10 | Jun | $500.00 | $2,200.00 | -$1,000.00 | $2,300.00 | -$3,400.00 |
| 11 | Jul | $500.00 | $0.00 | -$500.00 | $2,800.00 | -$2,900.00 |
| 12 | Aug | $500.00 | $0.00 | $0.00 | $3,300.00 | -$2,400.00 |

- Annual disbursements: **$6,000.00** → base monthly payment (1/12): **$500.00** → cushion cap: **$1,000.00**
- Step 2 add (lifts the lowest Step 1 balance to $0): $2,300.00 → required (target) starting balance: **$3,300.00**
- Low point: projected -$4,700.00 in month 3 (Nov); the target table's low is $1,000.00
- Actual − target = -$2,400.00 − $3,300.00 = **-$5,700.00** → surplus $0.00 · shortage $3,300.00 · deficiency $2,400.00
- Classification: **DEFICIENCY_GE_ONE_MONTH_AND_SHORTAGE_GE_ONE_MONTH** — 12 CFR 1024.17(f)(4)(ii) + 12 CFR 1024.17(f)(3)(ii)
- What the servicer may do: deficiency: do nothing; deficiency: require repayment in 2 or more equal monthly payments; shortage: do nothing; shortage: require repayment in equal monthly payments over at least 12 months
- Lawful new monthly escrow payment: base $500.00 + shortage over 12 months $275.00 + deficiency over 2 months $1,200.00 = **$1,975.00** for the first 2 months, then **$775.00**

### TV05 — Exactly on target - low point lands exactly on the cushion, surplus 0

*Source: DERIVED*

**Inputs:** starting balance $1,200.00 · year starts in Jan · cushion allowed: 2 month(s) · borrower current: yes

Bills: Property tax 1st half $1,800.00 in month 5; Homeowners insurance $1,200.00 in month 7; Property tax 2nd half $1,800.00 in month 11

| # | Month | Deposit | Bills paid | Step 1 trial balance (start $0) | Target balance (Step 3) | Projected balance (your real start) |
|---|---|---:|---:|---:|---:|---:|
| 0 | start | — | — | $0.00 | $1,200.00 | $1,200.00 |
| 1 | Jan | $400.00 | $0.00 | $400.00 | $1,600.00 | $1,600.00 |
| 2 | Feb | $400.00 | $0.00 | $800.00 | $2,000.00 | $2,000.00 |
| 3 | Mar | $400.00 | $0.00 | $1,200.00 | $2,400.00 | $2,400.00 |
| 4 | Apr | $400.00 | $0.00 | $1,600.00 | $2,800.00 | $2,800.00 |
| 5 | May | $400.00 | $1,800.00 | $200.00 | $1,400.00 | $1,400.00 |
| 6 | Jun | $400.00 | $0.00 | $600.00 | $1,800.00 | $1,800.00 |
| 7 | Jul | $400.00 | $1,200.00 | -$200.00 | $1,000.00 | $1,000.00 |
| 8 | Aug | $400.00 | $0.00 | $200.00 | $1,400.00 | $1,400.00 |
| 9 | Sep | $400.00 | $0.00 | $600.00 | $1,800.00 | $1,800.00 |
| 10 | Oct | $400.00 | $0.00 | $1,000.00 | $2,200.00 | $2,200.00 |
| 11 | Nov | $400.00 | $1,800.00 | -$400.00 | $800.00 ← low | $800.00 ← low |
| 12 | Dec | $400.00 | $0.00 | $0.00 | $1,200.00 | $1,200.00 |

- Annual disbursements: **$4,800.00** → base monthly payment (1/12): **$400.00** → cushion cap: **$800.00**
- Step 2 add (lifts the lowest Step 1 balance to $0): $400.00 → required (target) starting balance: **$1,200.00**
- Low point: projected $800.00 in month 11 (Nov); the target table's low is $800.00
- Actual − target = $1,200.00 − $1,200.00 = **$0.00** → surplus $0.00 · shortage $0.00 · deficiency $0.00
- Classification: **ON_TARGET** — 12 CFR 1024.17(d)(2)
- Lawful new monthly escrow payment: base $400.00 = **$400.00**

### TV06 — Surplus of exactly $50.00 - refund REQUIRED ('greater than or equal to')

*Source: DERIVED*

**Inputs:** starting balance $1,250.00 · year starts in Jan · cushion allowed: 2 month(s) · borrower current: yes

Bills: Property tax 1st half $1,800.00 in month 5; Homeowners insurance $1,200.00 in month 7; Property tax 2nd half $1,800.00 in month 11

| # | Month | Deposit | Bills paid | Step 1 trial balance (start $0) | Target balance (Step 3) | Projected balance (your real start) |
|---|---|---:|---:|---:|---:|---:|
| 0 | start | — | — | $0.00 | $1,200.00 | $1,250.00 |
| 1 | Jan | $400.00 | $0.00 | $400.00 | $1,600.00 | $1,650.00 |
| 2 | Feb | $400.00 | $0.00 | $800.00 | $2,000.00 | $2,050.00 |
| 3 | Mar | $400.00 | $0.00 | $1,200.00 | $2,400.00 | $2,450.00 |
| 4 | Apr | $400.00 | $0.00 | $1,600.00 | $2,800.00 | $2,850.00 |
| 5 | May | $400.00 | $1,800.00 | $200.00 | $1,400.00 | $1,450.00 |
| 6 | Jun | $400.00 | $0.00 | $600.00 | $1,800.00 | $1,850.00 |
| 7 | Jul | $400.00 | $1,200.00 | -$200.00 | $1,000.00 | $1,050.00 |
| 8 | Aug | $400.00 | $0.00 | $200.00 | $1,400.00 | $1,450.00 |
| 9 | Sep | $400.00 | $0.00 | $600.00 | $1,800.00 | $1,850.00 |
| 10 | Oct | $400.00 | $0.00 | $1,000.00 | $2,200.00 | $2,250.00 |
| 11 | Nov | $400.00 | $1,800.00 | -$400.00 | $800.00 ← low | $850.00 ← low |
| 12 | Dec | $400.00 | $0.00 | $0.00 | $1,200.00 | $1,250.00 |

- Annual disbursements: **$4,800.00** → base monthly payment (1/12): **$400.00** → cushion cap: **$800.00**
- Step 2 add (lifts the lowest Step 1 balance to $0): $400.00 → required (target) starting balance: **$1,200.00**
- Low point: projected $850.00 in month 11 (Nov); the target table's low is $800.00
- Actual − target = $1,250.00 − $1,200.00 = **$50.00** → surplus $50.00 · shortage $0.00 · deficiency $0.00
- Classification: **SURPLUS_REFUND_REQUIRED** — 12 CFR 1024.17(f)(2)(i)
- What the servicer may do: refund the surplus to the borrower within 30 days from the date of the analysis
- Lawful new monthly escrow payment: base $400.00 = **$400.00**

### TV07 — Surplus of $49.99 - one cent under the threshold, refund OR credit

*Source: DERIVED*

**Inputs:** starting balance $1,249.99 · year starts in Jan · cushion allowed: 2 month(s) · borrower current: yes

Bills: Property tax 1st half $1,800.00 in month 5; Homeowners insurance $1,200.00 in month 7; Property tax 2nd half $1,800.00 in month 11

| # | Month | Deposit | Bills paid | Step 1 trial balance (start $0) | Target balance (Step 3) | Projected balance (your real start) |
|---|---|---:|---:|---:|---:|---:|
| 0 | start | — | — | $0.00 | $1,200.00 | $1,249.99 |
| 1 | Jan | $400.00 | $0.00 | $400.00 | $1,600.00 | $1,649.99 |
| 2 | Feb | $400.00 | $0.00 | $800.00 | $2,000.00 | $2,049.99 |
| 3 | Mar | $400.00 | $0.00 | $1,200.00 | $2,400.00 | $2,449.99 |
| 4 | Apr | $400.00 | $0.00 | $1,600.00 | $2,800.00 | $2,849.99 |
| 5 | May | $400.00 | $1,800.00 | $200.00 | $1,400.00 | $1,449.99 |
| 6 | Jun | $400.00 | $0.00 | $600.00 | $1,800.00 | $1,849.99 |
| 7 | Jul | $400.00 | $1,200.00 | -$200.00 | $1,000.00 | $1,049.99 |
| 8 | Aug | $400.00 | $0.00 | $200.00 | $1,400.00 | $1,449.99 |
| 9 | Sep | $400.00 | $0.00 | $600.00 | $1,800.00 | $1,849.99 |
| 10 | Oct | $400.00 | $0.00 | $1,000.00 | $2,200.00 | $2,249.99 |
| 11 | Nov | $400.00 | $1,800.00 | -$400.00 | $800.00 ← low | $849.99 ← low |
| 12 | Dec | $400.00 | $0.00 | $0.00 | $1,200.00 | $1,249.99 |

- Annual disbursements: **$4,800.00** → base monthly payment (1/12): **$400.00** → cushion cap: **$800.00**
- Step 2 add (lifts the lowest Step 1 balance to $0): $400.00 → required (target) starting balance: **$1,200.00**
- Low point: projected $849.99 in month 11 (Nov); the target table's low is $800.00
- Actual − target = $1,249.99 − $1,200.00 = **$49.99** → surplus $49.99 · shortage $0.00 · deficiency $0.00
- Classification: **SURPLUS_UNDER_50** — 12 CFR 1024.17(f)(2)(i)
- What the servicer may do: refund the surplus to the borrower; credit the surplus against next year's escrow payments
- Lawful new monthly escrow payment: base $400.00 = **$400.00**

### TV08 — Surplus of $30.00 - refund OR credit

*Source: DERIVED*

**Inputs:** starting balance $1,230.00 · year starts in Jan · cushion allowed: 2 month(s) · borrower current: yes

Bills: Property tax 1st half $1,800.00 in month 5; Homeowners insurance $1,200.00 in month 7; Property tax 2nd half $1,800.00 in month 11

| # | Month | Deposit | Bills paid | Step 1 trial balance (start $0) | Target balance (Step 3) | Projected balance (your real start) |
|---|---|---:|---:|---:|---:|---:|
| 0 | start | — | — | $0.00 | $1,200.00 | $1,230.00 |
| 1 | Jan | $400.00 | $0.00 | $400.00 | $1,600.00 | $1,630.00 |
| 2 | Feb | $400.00 | $0.00 | $800.00 | $2,000.00 | $2,030.00 |
| 3 | Mar | $400.00 | $0.00 | $1,200.00 | $2,400.00 | $2,430.00 |
| 4 | Apr | $400.00 | $0.00 | $1,600.00 | $2,800.00 | $2,830.00 |
| 5 | May | $400.00 | $1,800.00 | $200.00 | $1,400.00 | $1,430.00 |
| 6 | Jun | $400.00 | $0.00 | $600.00 | $1,800.00 | $1,830.00 |
| 7 | Jul | $400.00 | $1,200.00 | -$200.00 | $1,000.00 | $1,030.00 |
| 8 | Aug | $400.00 | $0.00 | $200.00 | $1,400.00 | $1,430.00 |
| 9 | Sep | $400.00 | $0.00 | $600.00 | $1,800.00 | $1,830.00 |
| 10 | Oct | $400.00 | $0.00 | $1,000.00 | $2,200.00 | $2,230.00 |
| 11 | Nov | $400.00 | $1,800.00 | -$400.00 | $800.00 ← low | $830.00 ← low |
| 12 | Dec | $400.00 | $0.00 | $0.00 | $1,200.00 | $1,230.00 |

- Annual disbursements: **$4,800.00** → base monthly payment (1/12): **$400.00** → cushion cap: **$800.00**
- Step 2 add (lifts the lowest Step 1 balance to $0): $400.00 → required (target) starting balance: **$1,200.00**
- Low point: projected $830.00 in month 11 (Nov); the target table's low is $800.00
- Actual − target = $1,230.00 − $1,200.00 = **$30.00** → surplus $30.00 · shortage $0.00 · deficiency $0.00
- Classification: **SURPLUS_UNDER_50** — 12 CFR 1024.17(f)(2)(i)
- What the servicer may do: refund the surplus to the borrower; credit the surplus against next year's escrow payments
- Lawful new monthly escrow payment: base $400.00 = **$400.00**

### TV09 — Shortage smaller than one month's escrow payment ($240 < $480)

*Source: DERIVED*

**Inputs:** starting balance $2,160.00 · year starts in Jan · cushion allowed: 2 month(s) · borrower current: yes

Bills: Property tax 1st half $2,160.00 in month 3; Homeowners insurance $1,440.00 in month 6; Property tax 2nd half $2,160.00 in month 9

| # | Month | Deposit | Bills paid | Step 1 trial balance (start $0) | Target balance (Step 3) | Projected balance (your real start) |
|---|---|---:|---:|---:|---:|---:|
| 0 | start | — | — | $0.00 | $2,400.00 | $2,160.00 |
| 1 | Jan | $480.00 | $0.00 | $480.00 | $2,880.00 | $2,640.00 |
| 2 | Feb | $480.00 | $0.00 | $960.00 | $3,360.00 | $3,120.00 |
| 3 | Mar | $480.00 | $2,160.00 | -$720.00 | $1,680.00 | $1,440.00 |
| 4 | Apr | $480.00 | $0.00 | -$240.00 | $2,160.00 | $1,920.00 |
| 5 | May | $480.00 | $0.00 | $240.00 | $2,640.00 | $2,400.00 |
| 6 | Jun | $480.00 | $1,440.00 | -$720.00 | $1,680.00 | $1,440.00 |
| 7 | Jul | $480.00 | $0.00 | -$240.00 | $2,160.00 | $1,920.00 |
| 8 | Aug | $480.00 | $0.00 | $240.00 | $2,640.00 | $2,400.00 |
| 9 | Sep | $480.00 | $2,160.00 | -$1,440.00 | $960.00 ← low | $720.00 ← low |
| 10 | Oct | $480.00 | $0.00 | -$960.00 | $1,440.00 | $1,200.00 |
| 11 | Nov | $480.00 | $0.00 | -$480.00 | $1,920.00 | $1,680.00 |
| 12 | Dec | $480.00 | $0.00 | $0.00 | $2,400.00 | $2,160.00 |

- Annual disbursements: **$5,760.00** → base monthly payment (1/12): **$480.00** → cushion cap: **$960.00**
- Step 2 add (lifts the lowest Step 1 balance to $0): $1,440.00 → required (target) starting balance: **$2,400.00**
- Low point: projected $720.00 in month 9 (Sep); the target table's low is $960.00
- Actual − target = $2,160.00 − $2,400.00 = **-$240.00** → surplus $0.00 · shortage $240.00 · deficiency $0.00
- Classification: **SHORTAGE_LT_ONE_MONTH** — 12 CFR 1024.17(f)(3)(i)
- What the servicer may do: shortage: do nothing; shortage: require repayment within 30 days; shortage: require repayment in equal monthly payments over at least 12 months
- Lawful new monthly escrow payment: base $480.00 + shortage over 12 months $20.00 = **$500.00**

### TV10 — Shortage EXACTLY one month's escrow payment ($480.00 = $480.00) - falls in the 'greater than or equal to' tier

*Source: DERIVED*

**Inputs:** starting balance $1,920.00 · year starts in Jan · cushion allowed: 2 month(s) · borrower current: yes

Bills: Property tax 1st half $2,160.00 in month 3; Homeowners insurance $1,440.00 in month 6; Property tax 2nd half $2,160.00 in month 9

| # | Month | Deposit | Bills paid | Step 1 trial balance (start $0) | Target balance (Step 3) | Projected balance (your real start) |
|---|---|---:|---:|---:|---:|---:|
| 0 | start | — | — | $0.00 | $2,400.00 | $1,920.00 |
| 1 | Jan | $480.00 | $0.00 | $480.00 | $2,880.00 | $2,400.00 |
| 2 | Feb | $480.00 | $0.00 | $960.00 | $3,360.00 | $2,880.00 |
| 3 | Mar | $480.00 | $2,160.00 | -$720.00 | $1,680.00 | $1,200.00 |
| 4 | Apr | $480.00 | $0.00 | -$240.00 | $2,160.00 | $1,680.00 |
| 5 | May | $480.00 | $0.00 | $240.00 | $2,640.00 | $2,160.00 |
| 6 | Jun | $480.00 | $1,440.00 | -$720.00 | $1,680.00 | $1,200.00 |
| 7 | Jul | $480.00 | $0.00 | -$240.00 | $2,160.00 | $1,680.00 |
| 8 | Aug | $480.00 | $0.00 | $240.00 | $2,640.00 | $2,160.00 |
| 9 | Sep | $480.00 | $2,160.00 | -$1,440.00 | $960.00 ← low | $480.00 ← low |
| 10 | Oct | $480.00 | $0.00 | -$960.00 | $1,440.00 | $960.00 |
| 11 | Nov | $480.00 | $0.00 | -$480.00 | $1,920.00 | $1,440.00 |
| 12 | Dec | $480.00 | $0.00 | $0.00 | $2,400.00 | $1,920.00 |

- Annual disbursements: **$5,760.00** → base monthly payment (1/12): **$480.00** → cushion cap: **$960.00**
- Step 2 add (lifts the lowest Step 1 balance to $0): $1,440.00 → required (target) starting balance: **$2,400.00**
- Low point: projected $480.00 in month 9 (Sep); the target table's low is $960.00
- Actual − target = $1,920.00 − $2,400.00 = **-$480.00** → surplus $0.00 · shortage $480.00 · deficiency $0.00
- Classification: **SHORTAGE_GE_ONE_MONTH** — 12 CFR 1024.17(f)(3)(ii)
- What the servicer may do: shortage: do nothing; shortage: require repayment in equal monthly payments over at least 12 months
- Lawful new monthly escrow payment: base $480.00 + shortage over 12 months $40.00 = **$520.00**

### TV10b — Shortage one cent UNDER one month's payment ($479.99) - still the small-shortage tier

*Source: DERIVED*

**Inputs:** starting balance $1,920.01 · year starts in Jan · cushion allowed: 2 month(s) · borrower current: yes

Bills: Property tax 1st half $2,160.00 in month 3; Homeowners insurance $1,440.00 in month 6; Property tax 2nd half $2,160.00 in month 9

| # | Month | Deposit | Bills paid | Step 1 trial balance (start $0) | Target balance (Step 3) | Projected balance (your real start) |
|---|---|---:|---:|---:|---:|---:|
| 0 | start | — | — | $0.00 | $2,400.00 | $1,920.01 |
| 1 | Jan | $480.00 | $0.00 | $480.00 | $2,880.00 | $2,400.01 |
| 2 | Feb | $480.00 | $0.00 | $960.00 | $3,360.00 | $2,880.01 |
| 3 | Mar | $480.00 | $2,160.00 | -$720.00 | $1,680.00 | $1,200.01 |
| 4 | Apr | $480.00 | $0.00 | -$240.00 | $2,160.00 | $1,680.01 |
| 5 | May | $480.00 | $0.00 | $240.00 | $2,640.00 | $2,160.01 |
| 6 | Jun | $480.00 | $1,440.00 | -$720.00 | $1,680.00 | $1,200.01 |
| 7 | Jul | $480.00 | $0.00 | -$240.00 | $2,160.00 | $1,680.01 |
| 8 | Aug | $480.00 | $0.00 | $240.00 | $2,640.00 | $2,160.01 |
| 9 | Sep | $480.00 | $2,160.00 | -$1,440.00 | $960.00 ← low | $480.01 ← low |
| 10 | Oct | $480.00 | $0.00 | -$960.00 | $1,440.00 | $960.01 |
| 11 | Nov | $480.00 | $0.00 | -$480.00 | $1,920.00 | $1,440.01 |
| 12 | Dec | $480.00 | $0.00 | $0.00 | $2,400.00 | $1,920.01 |

- Annual disbursements: **$5,760.00** → base monthly payment (1/12): **$480.00** → cushion cap: **$960.00**
- Step 2 add (lifts the lowest Step 1 balance to $0): $1,440.00 → required (target) starting balance: **$2,400.00**
- Low point: projected $480.01 in month 9 (Sep); the target table's low is $960.00
- Actual − target = $1,920.01 − $2,400.00 = **-$479.99** → surplus $0.00 · shortage $479.99 · deficiency $0.00
- Classification: **SHORTAGE_LT_ONE_MONTH** — 12 CFR 1024.17(f)(3)(i)
- What the servicer may do: shortage: do nothing; shortage: require repayment within 30 days; shortage: require repayment in equal monthly payments over at least 12 months
- Lawful new monthly escrow payment: base $480.00 + shortage over 12 months $40.00 = **$520.00**

### TV11 — Shortage larger than one month's payment ($1,200 vs $480)

*Source: DERIVED*

**Inputs:** starting balance $1,200.00 · year starts in Jan · cushion allowed: 2 month(s) · borrower current: yes

Bills: Property tax 1st half $2,160.00 in month 3; Homeowners insurance $1,440.00 in month 6; Property tax 2nd half $2,160.00 in month 9

| # | Month | Deposit | Bills paid | Step 1 trial balance (start $0) | Target balance (Step 3) | Projected balance (your real start) |
|---|---|---:|---:|---:|---:|---:|
| 0 | start | — | — | $0.00 | $2,400.00 | $1,200.00 |
| 1 | Jan | $480.00 | $0.00 | $480.00 | $2,880.00 | $1,680.00 |
| 2 | Feb | $480.00 | $0.00 | $960.00 | $3,360.00 | $2,160.00 |
| 3 | Mar | $480.00 | $2,160.00 | -$720.00 | $1,680.00 | $480.00 |
| 4 | Apr | $480.00 | $0.00 | -$240.00 | $2,160.00 | $960.00 |
| 5 | May | $480.00 | $0.00 | $240.00 | $2,640.00 | $1,440.00 |
| 6 | Jun | $480.00 | $1,440.00 | -$720.00 | $1,680.00 | $480.00 |
| 7 | Jul | $480.00 | $0.00 | -$240.00 | $2,160.00 | $960.00 |
| 8 | Aug | $480.00 | $0.00 | $240.00 | $2,640.00 | $1,440.00 |
| 9 | Sep | $480.00 | $2,160.00 | -$1,440.00 | $960.00 ← low | -$240.00 ← low |
| 10 | Oct | $480.00 | $0.00 | -$960.00 | $1,440.00 | $240.00 |
| 11 | Nov | $480.00 | $0.00 | -$480.00 | $1,920.00 | $720.00 |
| 12 | Dec | $480.00 | $0.00 | $0.00 | $2,400.00 | $1,200.00 |

- Annual disbursements: **$5,760.00** → base monthly payment (1/12): **$480.00** → cushion cap: **$960.00**
- Step 2 add (lifts the lowest Step 1 balance to $0): $1,440.00 → required (target) starting balance: **$2,400.00**
- Low point: projected -$240.00 in month 9 (Sep); the target table's low is $960.00
- Actual − target = $1,200.00 − $2,400.00 = **-$1,200.00** → surplus $0.00 · shortage $1,200.00 · deficiency $0.00
- Classification: **SHORTAGE_GE_ONE_MONTH** — 12 CFR 1024.17(f)(3)(ii)
- What the servicer may do: shortage: do nothing; shortage: require repayment in equal monthly payments over at least 12 months
- Lawful new monthly escrow payment: base $480.00 + shortage over 12 months $100.00 = **$580.00**

### TV12 — Pure deficiency (balance is negative), zero cushion in the mortgage documents, single bill in month 12

*Source: DERIVED*

**Inputs:** starting balance -$150.00 · year starts in Jan · cushion allowed: 0 month(s) · borrower current: yes

Bills: Annual property tax $2,400.00 in month 12

| # | Month | Deposit | Bills paid | Step 1 trial balance (start $0) | Target balance (Step 3) | Projected balance (your real start) |
|---|---|---:|---:|---:|---:|---:|
| 0 | start | — | — | $0.00 | $0.00 | -$150.00 |
| 1 | Jan | $200.00 | $0.00 | $200.00 | $200.00 | $50.00 |
| 2 | Feb | $200.00 | $0.00 | $400.00 | $400.00 | $250.00 |
| 3 | Mar | $200.00 | $0.00 | $600.00 | $600.00 | $450.00 |
| 4 | Apr | $200.00 | $0.00 | $800.00 | $800.00 | $650.00 |
| 5 | May | $200.00 | $0.00 | $1,000.00 | $1,000.00 | $850.00 |
| 6 | Jun | $200.00 | $0.00 | $1,200.00 | $1,200.00 | $1,050.00 |
| 7 | Jul | $200.00 | $0.00 | $1,400.00 | $1,400.00 | $1,250.00 |
| 8 | Aug | $200.00 | $0.00 | $1,600.00 | $1,600.00 | $1,450.00 |
| 9 | Sep | $200.00 | $0.00 | $1,800.00 | $1,800.00 | $1,650.00 |
| 10 | Oct | $200.00 | $0.00 | $2,000.00 | $2,000.00 | $1,850.00 |
| 11 | Nov | $200.00 | $0.00 | $2,200.00 | $2,200.00 | $2,050.00 |
| 12 | Dec | $200.00 | $2,400.00 | $0.00 | $0.00 ← low | -$150.00 ← low |

- Annual disbursements: **$2,400.00** → base monthly payment (1/12): **$200.00** → cushion cap: **$0.00**
- Step 2 add (lifts the lowest Step 1 balance to $0): $0.00 → required (target) starting balance: **$0.00**
- Low point: projected -$150.00 in month 12 (Dec); the target table's low is $0.00
- Actual − target = -$150.00 − $0.00 = **-$150.00** → surplus $0.00 · shortage $0.00 · deficiency $150.00
- Classification: **DEFICIENCY_LT_ONE_MONTH** — 12 CFR 1024.17(f)(4)(i)
- What the servicer may do: deficiency: do nothing; deficiency: require repayment within 30 days; deficiency: require repayment in 2 or more equal monthly payments
- Lawful new monthly escrow payment: base $200.00 + deficiency over 2 months $75.00 = **$275.00** for the first 2 months, then **$200.00**

### TV13 — Computation year starting in April (not January) - surplus $100

*Source: DERIVED*

**Inputs:** starting balance $1,000.00 · year starts in Apr · cushion allowed: 2 month(s) · borrower current: yes

Bills: Property tax (September) $1,200.00 in month 6; Property tax (January) $1,200.00 in month 10; Homeowners insurance (February) $1,200.00 in month 11

| # | Month | Deposit | Bills paid | Step 1 trial balance (start $0) | Target balance (Step 3) | Projected balance (your real start) |
|---|---|---:|---:|---:|---:|---:|
| 0 | start | — | — | $0.00 | $900.00 | $1,000.00 |
| 1 | Apr | $300.00 | $0.00 | $300.00 | $1,200.00 | $1,300.00 |
| 2 | May | $300.00 | $0.00 | $600.00 | $1,500.00 | $1,600.00 |
| 3 | Jun | $300.00 | $0.00 | $900.00 | $1,800.00 | $1,900.00 |
| 4 | Jul | $300.00 | $0.00 | $1,200.00 | $2,100.00 | $2,200.00 |
| 5 | Aug | $300.00 | $0.00 | $1,500.00 | $2,400.00 | $2,500.00 |
| 6 | Sep | $300.00 | $1,200.00 | $600.00 | $1,500.00 | $1,600.00 |
| 7 | Oct | $300.00 | $0.00 | $900.00 | $1,800.00 | $1,900.00 |
| 8 | Nov | $300.00 | $0.00 | $1,200.00 | $2,100.00 | $2,200.00 |
| 9 | Dec | $300.00 | $0.00 | $1,500.00 | $2,400.00 | $2,500.00 |
| 10 | Jan | $300.00 | $1,200.00 | $600.00 | $1,500.00 | $1,600.00 |
| 11 | Feb | $300.00 | $1,200.00 | -$300.00 | $600.00 ← low | $700.00 ← low |
| 12 | Mar | $300.00 | $0.00 | $0.00 | $900.00 | $1,000.00 |

- Annual disbursements: **$3,600.00** → base monthly payment (1/12): **$300.00** → cushion cap: **$600.00**
- Step 2 add (lifts the lowest Step 1 balance to $0): $300.00 → required (target) starting balance: **$900.00**
- Low point: projected $700.00 in month 11 (Feb); the target table's low is $600.00
- Actual − target = $1,000.00 − $900.00 = **$100.00** → surplus $100.00 · shortage $0.00 · deficiency $0.00
- Classification: **SURPLUS_REFUND_REQUIRED** — 12 CFR 1024.17(f)(2)(i)
- What the servicer may do: refund the surplus to the borrower within 30 days from the date of the analysis
- Lawful new monthly escrow payment: base $300.00 = **$300.00**

### TV14 — Two bills in the same month, plus a bill in month 1 and a bill in month 12

*Source: DERIVED*

**Inputs:** starting balance $1,700.00 · year starts in Jan · cushion allowed: 2 month(s) · borrower current: yes

Bills: Homeowners insurance $1,500.00 in month 1; County tax $1,100.00 in month 7; City tax $700.00 in month 7; Flood insurance $900.00 in month 12

| # | Month | Deposit | Bills paid | Step 1 trial balance (start $0) | Target balance (Step 3) | Projected balance (your real start) |
|---|---|---:|---:|---:|---:|---:|
| 0 | start | — | — | $0.00 | $1,850.00 | $1,700.00 |
| 1 | Jan | $350.00 | $1,500.00 | -$1,150.00 | $700.00 ← low | $550.00 ← low |
| 2 | Feb | $350.00 | $0.00 | -$800.00 | $1,050.00 | $900.00 |
| 3 | Mar | $350.00 | $0.00 | -$450.00 | $1,400.00 | $1,250.00 |
| 4 | Apr | $350.00 | $0.00 | -$100.00 | $1,750.00 | $1,600.00 |
| 5 | May | $350.00 | $0.00 | $250.00 | $2,100.00 | $1,950.00 |
| 6 | Jun | $350.00 | $0.00 | $600.00 | $2,450.00 | $2,300.00 |
| 7 | Jul | $350.00 | $1,800.00 | -$850.00 | $1,000.00 | $850.00 |
| 8 | Aug | $350.00 | $0.00 | -$500.00 | $1,350.00 | $1,200.00 |
| 9 | Sep | $350.00 | $0.00 | -$150.00 | $1,700.00 | $1,550.00 |
| 10 | Oct | $350.00 | $0.00 | $200.00 | $2,050.00 | $1,900.00 |
| 11 | Nov | $350.00 | $0.00 | $550.00 | $2,400.00 | $2,250.00 |
| 12 | Dec | $350.00 | $900.00 | $0.00 | $1,850.00 | $1,700.00 |

- Annual disbursements: **$4,200.00** → base monthly payment (1/12): **$350.00** → cushion cap: **$700.00**
- Step 2 add (lifts the lowest Step 1 balance to $0): $1,150.00 → required (target) starting balance: **$1,850.00**
- Low point: projected $550.00 in month 1 (Jan); the target table's low is $700.00
- Actual − target = $1,700.00 − $1,850.00 = **-$150.00** → surplus $0.00 · shortage $150.00 · deficiency $0.00
- Classification: **SHORTAGE_LT_ONE_MONTH** — 12 CFR 1024.17(f)(3)(i)
- What the servicer may do: shortage: do nothing; shortage: require repayment within 30 days; shortage: require repayment in equal monthly payments over at least 12 months
- Lawful new monthly escrow payment: base $350.00 + shortage over 12 months $12.50 = **$362.50**

### TV15 — Annual total NOT divisible by 12 to the cent ($5,000.00) - documents the rounding CHOICE

*Source: DERIVED (rounding convention is a choice, not law)*

**Inputs:** starting balance $1,700.00 · year starts in Jan · cushion allowed: 2 month(s) · borrower current: yes

Bills: Property tax 1st half $1,900.00 in month 4; Homeowners insurance $1,200.00 in month 8; Property tax 2nd half $1,900.00 in month 10

| # | Month | Deposit | Bills paid | Step 1 trial balance (start $0) | Target balance (Step 3) | Projected balance (your real start) |
|---|---|---:|---:|---:|---:|---:|
| 0 | start | — | — | $0.00 | $1,666.63 | $1,700.00 |
| 1 | Jan | $416.67 | $0.00 | $416.67 | $2,083.30 | $2,116.67 |
| 2 | Feb | $416.67 | $0.00 | $833.34 | $2,499.97 | $2,533.34 |
| 3 | Mar | $416.67 | $0.00 | $1,250.01 | $2,916.64 | $2,950.01 |
| 4 | Apr | $416.67 | $1,900.00 | -$233.32 | $1,433.31 | $1,466.68 |
| 5 | May | $416.67 | $0.00 | $183.35 | $1,849.98 | $1,883.35 |
| 6 | Jun | $416.67 | $0.00 | $600.02 | $2,266.65 | $2,300.02 |
| 7 | Jul | $416.67 | $0.00 | $1,016.69 | $2,683.32 | $2,716.69 |
| 8 | Aug | $416.67 | $1,200.00 | $233.36 | $1,899.99 | $1,933.36 |
| 9 | Sep | $416.67 | $0.00 | $650.03 | $2,316.66 | $2,350.03 |
| 10 | Oct | $416.67 | $1,900.00 | -$833.30 | $833.33 ← low | $866.70 ← low |
| 11 | Nov | $416.67 | $0.00 | -$416.63 | $1,250.00 | $1,283.37 |
| 12 | Dec | $416.67 | $0.00 | $0.04 | $1,666.67 | $1,700.04 |

- Annual disbursements: **$5,000.00** → base monthly payment (1/12): **$416.67** → cushion cap: **$833.33**
- Step 2 add (lifts the lowest Step 1 balance to $0): $833.30 → required (target) starting balance: **$1,666.63**
- Low point: projected $866.70 in month 10 (Oct); the target table's low is $833.33
- Actual − target = $1,700.00 − $1,666.63 = **$33.37** → surplus $33.37 · shortage $0.00 · deficiency $0.00
- Classification: **SURPLUS_UNDER_50** — 12 CFR 1024.17(f)(2)(i)
- What the servicer may do: refund the surplus to the borrower; credit the surplus against next year's escrow payments
- Lawful new monthly escrow payment: base $416.67 = **$416.67**
- Rounding note: with no rounding at all the required start is 1666.6667 dollars and the surplus 33.3333; the whole-cent convention used here differs by a few cents. See §9.

### TV16 — Lower cushion - mortgage documents allow only ONE month

*Source: DERIVED*

**Inputs:** starting balance $1,500.00 · year starts in Jan · cushion allowed: 1 month(s) · borrower current: yes

Bills: Property tax 1st half $1,800.00 in month 5; Homeowners insurance $1,200.00 in month 7; Property tax 2nd half $1,800.00 in month 11

| # | Month | Deposit | Bills paid | Step 1 trial balance (start $0) | Target balance (Step 3) | Projected balance (your real start) |
|---|---|---:|---:|---:|---:|---:|
| 0 | start | — | — | $0.00 | $800.00 | $1,500.00 |
| 1 | Jan | $400.00 | $0.00 | $400.00 | $1,200.00 | $1,900.00 |
| 2 | Feb | $400.00 | $0.00 | $800.00 | $1,600.00 | $2,300.00 |
| 3 | Mar | $400.00 | $0.00 | $1,200.00 | $2,000.00 | $2,700.00 |
| 4 | Apr | $400.00 | $0.00 | $1,600.00 | $2,400.00 | $3,100.00 |
| 5 | May | $400.00 | $1,800.00 | $200.00 | $1,000.00 | $1,700.00 |
| 6 | Jun | $400.00 | $0.00 | $600.00 | $1,400.00 | $2,100.00 |
| 7 | Jul | $400.00 | $1,200.00 | -$200.00 | $600.00 | $1,300.00 |
| 8 | Aug | $400.00 | $0.00 | $200.00 | $1,000.00 | $1,700.00 |
| 9 | Sep | $400.00 | $0.00 | $600.00 | $1,400.00 | $2,100.00 |
| 10 | Oct | $400.00 | $0.00 | $1,000.00 | $1,800.00 | $2,500.00 |
| 11 | Nov | $400.00 | $1,800.00 | -$400.00 | $400.00 ← low | $1,100.00 ← low |
| 12 | Dec | $400.00 | $0.00 | $0.00 | $800.00 | $1,500.00 |

- Annual disbursements: **$4,800.00** → base monthly payment (1/12): **$400.00** → cushion cap: **$400.00**
- Step 2 add (lifts the lowest Step 1 balance to $0): $400.00 → required (target) starting balance: **$800.00**
- Low point: projected $1,100.00 in month 11 (Nov); the target table's low is $400.00
- Actual − target = $1,500.00 − $800.00 = **$700.00** → surplus $700.00 · shortage $0.00 · deficiency $0.00
- Classification: **SURPLUS_REFUND_REQUIRED** — 12 CFR 1024.17(f)(2)(i)
- What the servicer may do: refund the surplus to the borrower within 30 days from the date of the analysis
- Lawful new monthly escrow payment: base $400.00 = **$400.00**

### TV17 — Lower cushion - mortgage documents allow ZERO cushion

*Source: DERIVED*

**Inputs:** starting balance $1,500.00 · year starts in Jan · cushion allowed: 0 month(s) · borrower current: yes

Bills: Property tax 1st half $1,800.00 in month 5; Homeowners insurance $1,200.00 in month 7; Property tax 2nd half $1,800.00 in month 11

| # | Month | Deposit | Bills paid | Step 1 trial balance (start $0) | Target balance (Step 3) | Projected balance (your real start) |
|---|---|---:|---:|---:|---:|---:|
| 0 | start | — | — | $0.00 | $400.00 | $1,500.00 |
| 1 | Jan | $400.00 | $0.00 | $400.00 | $800.00 | $1,900.00 |
| 2 | Feb | $400.00 | $0.00 | $800.00 | $1,200.00 | $2,300.00 |
| 3 | Mar | $400.00 | $0.00 | $1,200.00 | $1,600.00 | $2,700.00 |
| 4 | Apr | $400.00 | $0.00 | $1,600.00 | $2,000.00 | $3,100.00 |
| 5 | May | $400.00 | $1,800.00 | $200.00 | $600.00 | $1,700.00 |
| 6 | Jun | $400.00 | $0.00 | $600.00 | $1,000.00 | $2,100.00 |
| 7 | Jul | $400.00 | $1,200.00 | -$200.00 | $200.00 | $1,300.00 |
| 8 | Aug | $400.00 | $0.00 | $200.00 | $600.00 | $1,700.00 |
| 9 | Sep | $400.00 | $0.00 | $600.00 | $1,000.00 | $2,100.00 |
| 10 | Oct | $400.00 | $0.00 | $1,000.00 | $1,400.00 | $2,500.00 |
| 11 | Nov | $400.00 | $1,800.00 | -$400.00 | $0.00 ← low | $1,100.00 ← low |
| 12 | Dec | $400.00 | $0.00 | $0.00 | $400.00 | $1,500.00 |

- Annual disbursements: **$4,800.00** → base monthly payment (1/12): **$400.00** → cushion cap: **$0.00**
- Step 2 add (lifts the lowest Step 1 balance to $0): $400.00 → required (target) starting balance: **$400.00**
- Low point: projected $1,100.00 in month 11 (Nov); the target table's low is $0.00
- Actual − target = $1,500.00 − $400.00 = **$1,100.00** → surplus $1,100.00 · shortage $0.00 · deficiency $0.00
- Classification: **SURPLUS_REFUND_REQUIRED** — 12 CFR 1024.17(f)(2)(i)
- What the servicer may do: refund the surplus to the borrower within 30 days from the date of the analysis
- Lawful new monthly escrow payment: base $400.00 = **$400.00**

### TV18 — 'Why did my payment jump?' - bills rose $900; shows what breaks if last year's payment is typed in as the deposit

*Source: DERIVED*

**Inputs:** starting balance $1,125.00 · year starts in Jan · cushion allowed: 2 month(s) · borrower current: yes

Bills: Property tax 1st half $2,100.00 in month 5; Homeowners insurance $1,500.00 in month 7; Property tax 2nd half $2,100.00 in month 11

| # | Month | Deposit | Bills paid | Step 1 trial balance (start $0) | Target balance (Step 3) | Projected balance (your real start) |
|---|---|---:|---:|---:|---:|---:|
| 0 | start | — | — | $0.00 | $1,425.00 | $1,125.00 |
| 1 | Jan | $475.00 | $0.00 | $475.00 | $1,900.00 | $1,600.00 |
| 2 | Feb | $475.00 | $0.00 | $950.00 | $2,375.00 | $2,075.00 |
| 3 | Mar | $475.00 | $0.00 | $1,425.00 | $2,850.00 | $2,550.00 |
| 4 | Apr | $475.00 | $0.00 | $1,900.00 | $3,325.00 | $3,025.00 |
| 5 | May | $475.00 | $2,100.00 | $275.00 | $1,700.00 | $1,400.00 |
| 6 | Jun | $475.00 | $0.00 | $750.00 | $2,175.00 | $1,875.00 |
| 7 | Jul | $475.00 | $1,500.00 | -$275.00 | $1,150.00 | $850.00 |
| 8 | Aug | $475.00 | $0.00 | $200.00 | $1,625.00 | $1,325.00 |
| 9 | Sep | $475.00 | $0.00 | $675.00 | $2,100.00 | $1,800.00 |
| 10 | Oct | $475.00 | $0.00 | $1,150.00 | $2,575.00 | $2,275.00 |
| 11 | Nov | $475.00 | $2,100.00 | -$475.00 | $950.00 ← low | $650.00 ← low |
| 12 | Dec | $475.00 | $0.00 | $0.00 | $1,425.00 | $1,125.00 |

- Annual disbursements: **$5,700.00** → base monthly payment (1/12): **$475.00** → cushion cap: **$950.00**
- Step 2 add (lifts the lowest Step 1 balance to $0): $475.00 → required (target) starting balance: **$1,425.00**
- Low point: projected $650.00 in month 11 (Nov); the target table's low is $950.00
- Actual − target = $1,125.00 − $1,425.00 = **-$300.00** → surplus $0.00 · shortage $300.00 · deficiency $0.00
- Classification: **SHORTAGE_LT_ONE_MONTH** — 12 CFR 1024.17(f)(3)(i)
- What the servicer may do: shortage: do nothing; shortage: require repayment within 30 days; shortage: require repayment in equal monthly payments over at least 12 months
- Lawful new monthly escrow payment: base $475.00 + shortage over 12 months $25.00 = **$500.00**

### TV19 — Projected balance dips below zero but TODAY's balance is positive - that is a SHORTAGE, not a deficiency

*Source: DERIVED*

**Inputs:** starting balance $100.00 · year starts in Jan · cushion allowed: 2 month(s) · borrower current: yes

Bills: Property tax 1st half $1,800.00 in month 5; Homeowners insurance $1,200.00 in month 7; Property tax 2nd half $1,800.00 in month 11

| # | Month | Deposit | Bills paid | Step 1 trial balance (start $0) | Target balance (Step 3) | Projected balance (your real start) |
|---|---|---:|---:|---:|---:|---:|
| 0 | start | — | — | $0.00 | $1,200.00 | $100.00 |
| 1 | Jan | $400.00 | $0.00 | $400.00 | $1,600.00 | $500.00 |
| 2 | Feb | $400.00 | $0.00 | $800.00 | $2,000.00 | $900.00 |
| 3 | Mar | $400.00 | $0.00 | $1,200.00 | $2,400.00 | $1,300.00 |
| 4 | Apr | $400.00 | $0.00 | $1,600.00 | $2,800.00 | $1,700.00 |
| 5 | May | $400.00 | $1,800.00 | $200.00 | $1,400.00 | $300.00 |
| 6 | Jun | $400.00 | $0.00 | $600.00 | $1,800.00 | $700.00 |
| 7 | Jul | $400.00 | $1,200.00 | -$200.00 | $1,000.00 | -$100.00 |
| 8 | Aug | $400.00 | $0.00 | $200.00 | $1,400.00 | $300.00 |
| 9 | Sep | $400.00 | $0.00 | $600.00 | $1,800.00 | $700.00 |
| 10 | Oct | $400.00 | $0.00 | $1,000.00 | $2,200.00 | $1,100.00 |
| 11 | Nov | $400.00 | $1,800.00 | -$400.00 | $800.00 ← low | -$300.00 ← low |
| 12 | Dec | $400.00 | $0.00 | $0.00 | $1,200.00 | $100.00 |

- Annual disbursements: **$4,800.00** → base monthly payment (1/12): **$400.00** → cushion cap: **$800.00**
- Step 2 add (lifts the lowest Step 1 balance to $0): $400.00 → required (target) starting balance: **$1,200.00**
- Low point: projected -$300.00 in month 11 (Nov); the target table's low is $800.00
- Actual − target = $100.00 − $1,200.00 = **-$1,100.00** → surplus $0.00 · shortage $1,100.00 · deficiency $0.00
- Classification: **SHORTAGE_GE_ONE_MONTH** — 12 CFR 1024.17(f)(3)(ii)
- What the servicer may do: shortage: do nothing; shortage: require repayment in equal monthly payments over at least 12 months
- Lawful new monthly escrow payment: base $400.00 + shortage over 12 months $91.67 = **$491.67**

### TV20 — Surplus but borrower is NOT current (payment more than 30 days late) - refund rule does not apply

*Source: DERIVED*

**Inputs:** starting balance $1,500.00 · year starts in Jan · cushion allowed: 2 month(s) · borrower current: NO

Bills: Property tax 1st half $1,800.00 in month 5; Homeowners insurance $1,200.00 in month 7; Property tax 2nd half $1,800.00 in month 11

| # | Month | Deposit | Bills paid | Step 1 trial balance (start $0) | Target balance (Step 3) | Projected balance (your real start) |
|---|---|---:|---:|---:|---:|---:|
| 0 | start | — | — | $0.00 | $1,200.00 | $1,500.00 |
| 1 | Jan | $400.00 | $0.00 | $400.00 | $1,600.00 | $1,900.00 |
| 2 | Feb | $400.00 | $0.00 | $800.00 | $2,000.00 | $2,300.00 |
| 3 | Mar | $400.00 | $0.00 | $1,200.00 | $2,400.00 | $2,700.00 |
| 4 | Apr | $400.00 | $0.00 | $1,600.00 | $2,800.00 | $3,100.00 |
| 5 | May | $400.00 | $1,800.00 | $200.00 | $1,400.00 | $1,700.00 |
| 6 | Jun | $400.00 | $0.00 | $600.00 | $1,800.00 | $2,100.00 |
| 7 | Jul | $400.00 | $1,200.00 | -$200.00 | $1,000.00 | $1,300.00 |
| 8 | Aug | $400.00 | $0.00 | $200.00 | $1,400.00 | $1,700.00 |
| 9 | Sep | $400.00 | $0.00 | $600.00 | $1,800.00 | $2,100.00 |
| 10 | Oct | $400.00 | $0.00 | $1,000.00 | $2,200.00 | $2,500.00 |
| 11 | Nov | $400.00 | $1,800.00 | -$400.00 | $800.00 ← low | $1,100.00 ← low |
| 12 | Dec | $400.00 | $0.00 | $0.00 | $1,200.00 | $1,500.00 |

- Annual disbursements: **$4,800.00** → base monthly payment (1/12): **$400.00** → cushion cap: **$800.00**
- Step 2 add (lifts the lowest Step 1 balance to $0): $400.00 → required (target) starting balance: **$1,200.00**
- Low point: projected $1,100.00 in month 11 (Nov); the target table's low is $800.00
- Actual − target = $1,500.00 − $1,200.00 = **$300.00** → surplus $300.00 · shortage $0.00 · deficiency $0.00
- Classification: **SURPLUS_BORROWER_NOT_CURRENT** — 12 CFR 1024.17(f)(2)(ii)
- What the servicer may do: servicer may retain the surplus in the escrow account pursuant to the loan documents
- Lawful new monthly escrow payment: base $400.00 = **$400.00**

### TV21 — Quarterly tax installments + monthly PMI + annual insurance; two months tie for the low point

*Source: DERIVED*

**Inputs:** starting balance $1,300.00 · year starts in Jan · cushion allowed: 2 month(s) · borrower current: yes

Bills: PMI (monthly) $50.00 in month 1–12 (every month); Property tax (quarterly installment) $600.00 in month 2, 5, 8, 11; Homeowners insurance $1,200.00 in month 6

| # | Month | Deposit | Bills paid | Step 1 trial balance (start $0) | Target balance (Step 3) | Projected balance (your real start) |
|---|---|---:|---:|---:|---:|---:|
| 0 | start | — | — | $0.00 | $1,300.00 | $1,300.00 |
| 1 | Jan | $350.00 | $50.00 | $300.00 | $1,600.00 | $1,600.00 |
| 2 | Feb | $350.00 | $650.00 | $0.00 | $1,300.00 | $1,300.00 |
| 3 | Mar | $350.00 | $50.00 | $300.00 | $1,600.00 | $1,600.00 |
| 4 | Apr | $350.00 | $50.00 | $600.00 | $1,900.00 | $1,900.00 |
| 5 | May | $350.00 | $650.00 | $300.00 | $1,600.00 | $1,600.00 |
| 6 | Jun | $350.00 | $1,250.00 | -$600.00 | $700.00 ← low | $700.00 ← low |
| 7 | Jul | $350.00 | $50.00 | -$300.00 | $1,000.00 | $1,000.00 |
| 8 | Aug | $350.00 | $650.00 | -$600.00 | $700.00 | $700.00 |
| 9 | Sep | $350.00 | $50.00 | -$300.00 | $1,000.00 | $1,000.00 |
| 10 | Oct | $350.00 | $50.00 | $0.00 | $1,300.00 | $1,300.00 |
| 11 | Nov | $350.00 | $650.00 | -$300.00 | $1,000.00 | $1,000.00 |
| 12 | Dec | $350.00 | $50.00 | $0.00 | $1,300.00 | $1,300.00 |

- Annual disbursements: **$4,200.00** → base monthly payment (1/12): **$350.00** → cushion cap: **$700.00**
- Step 2 add (lifts the lowest Step 1 balance to $0): $600.00 → required (target) starting balance: **$1,300.00**
- Low point: projected $700.00 in month 6 (Jun); the target table's low is $700.00
- Actual − target = $1,300.00 − $1,300.00 = **$0.00** → surplus $0.00 · shortage $0.00 · deficiency $0.00
- Classification: **ON_TARGET** — 12 CFR 1024.17(d)(2)
- Lawful new monthly escrow payment: base $350.00 = **$350.00**

---

## 16. Sources actually used (all pulled 2026-09-19)

1. eCFR — 12 CFR § 1024.17, Appendix E to Part 1024, §§ 1024.2, 1024.35, 1024.36, Supplement I to Part 1024. `https://www.ecfr.gov/current/title-12/chapter-X/part-1024` (text as of 2026-09-01 via eCFR's versioner API).
2. CFPB Interactive Bureau Regulations — `https://www.consumerfinance.gov/rules-policy/regulations/1024/` pages `17/`, `e/`, `interp-17/`, `2/`, `5/`, `30/`, `31/`, `34/`, `35/`, `36/`, `interp-35/`.
3. Cornell Legal Information Institute — `https://www.law.cornell.edu/cfr/text/12/1024.17`, `/appendix-E_to_part_1024`, `/1024.35`, `/1024.36`.
4. CFPB Mortgage Servicing FAQs (Escrow Accounts sections) — `https://www.consumerfinance.gov/compliance/compliance-resources/mortgage-resources/mortserv/mortgage-servicing-faqs/`.
5. HUD, RESPA Escrow Accounting Procedures final rule, 59 FR 53890 (Oct. 26, 1994) — `https://www.govinfo.gov/content/pkg/FR-1994-10-26/html/94-26583.htm`.
6. HUD, Escrow Accounting Procedures final rule with clarifications and example statements, 60 FR 8812 (Feb. 15, 1995) — `https://www.govinfo.gov/content/pkg/FR-1995-02-15/html/95-3683.htm`; CFPB-hosted scan `https://files.consumerfinance.gov/f/documents/HUD_95-3683.pdf` (Appendix I-8 at p. 8829, Appendix M at p. 8837 read from the page images).
7. CFPB, "Escrow Disclosure Public Guidance Documents" (June 2021) — `https://files.consumerfinance.gov/f/documents/cfpb_escrow-disclosure_public-guidance-documents_2021-06.pdf`.
8. CFPB complaint portal — `https://www.consumerfinance.gov/complaint/`.
9. federalregister.gov API — used only to confirm the citations 60 FR 8812 (doc 95-3683) and the 1994 rule (doc 94-26583). Its full-text endpoint returned HTTP 429 (rate limit), so I left it and used govinfo plus the CFPB-hosted copy instead.

Not used: any law-firm blog, servicer marketing page, forum, or content site.
