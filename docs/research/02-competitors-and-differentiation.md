# EscrowScope — Competitor & Differentiation Research

**Researched:** September 19, 2026
**Question this answers:** Does anything like EscrowScope already exist, how big is the real problem it solves, and what can EscrowScope do that nothing else does?

A quick jargon note before we start: **RESPA** (Real Estate Settlement Procedures Act) is a 1974 federal law about mortgages. **Regulation X** (12 CFR Part 1024) is the rulebook the CFPB (Consumer Financial Protection Bureau — the federal agency that polices mortgage servicers) wrote to enforce it. **Section 1024.17** is the specific part of that rulebook about escrow accounts — the "savings account" your mortgage servicer holds to pay your property taxes and homeowners insurance for you.

---

## 1. What exists today

### The closest real competitor: AgentCalc's Mortgage Escrow Calculator

**[agentcalc.com/mortgage-escrow-calculator](https://agentcalc.com/mortgage-escrow-calculator)** — This is the one tool that actually does the math right, and EscrowScope needs to be honest about that.

- **Who it's for:** General public / real estate agents (it's built to be embedded on agents' websites via an iframe — "Embed this calculator" is a featured option).
- **What it does:** Builds a full 13-row "trial running balance" (the month-by-month projection the regulation actually requires), finds the **low point** (lowest projected balance in the year), applies the aggregate adjustment, adds the cushion, and correctly separates a **shortage** (positive but below target) from a **deficiency** (negative balance) from a **surplus** — most calculators conflate these. It cites specific paragraphs like 12 CFR 1024.17(c)(5), (d)(2)(i)(C), and (f)(3)-(4) in its explanations. Produces a chart and a downloadable CSV.
- **What it does NOT do:** It computes what your escrow *should* be from numbers you enter — it does not take your servicer's *actual stated* numbers and tell you whether they match or where they diverge. It's a calculator, not a checker. No notice-of-error letter, no offline/privacy claim, no Spanish, no "is this even the right tool for you" screening.
- **Cost / account:** Free, no login required.
- **Applies the real 1024.17 aggregate/low-point test?** Yes — the only one found that does this correctly and completely.

### Other homeowner-facing calculators (generic bucket)

| Tool | URL | For whom | Does the real aggregate/low-point test? | Cost / account |
|---|---|---|---|---|
| HomePaymentCalc | [homepaymentcalc.com](https://homepaymentcalc.com/escrow-analysis-calculator/) | Homeowners | Claims "RESPA cushion compliance," surplus/shortage, 5-year projection, but does not show a month-by-month trial balance or cite specific regulation subsections the way AgentCalc does | Free, no account seen |
| Homebuyer.com Escrow Withholding Calculator | [homebuyer.com/tools/escrow-calculator](https://homebuyer.com/tools/escrow-calculator) | Homebuyers *before* closing | No — it only estimates how many months of property tax a lender will collect at closing, using state/county tax schedules. Different purpose entirely (pre-purchase cash-to-close estimate, not post-closing dispute-checking). Now owned by Opendoor; has an email signup prompt on the page. | Free |
| OfferMarket blog calculator | [offermarket.us/blog/escrow-analysis-calculator](https://www.offermarket.us/blog/escrow-analysis-calculator) | Real-estate investors (OfferMarket is a private lender for 1-4 unit investment property) | No — mostly an explainer/buyer's-guide article around the topic, not a rigorous regulation-grade calculator | Free |
| SimplifyCalc, CalculatorFree, TheTruthAboutMortgage, Pocketsense, and similar ad-supported "everything calculator" sites | (various) | General public | Unclear/likely no — these read as generic ad-supported finance-calculator mills bundling dozens of unrelated calculators; not deeply audited here because they don't look like serious, trustworthy sources of financial math | Free, ad-heavy |

### CFPB's own consumer resources (official, but not a calculator)

- **§ 1024.17 regulation text:** [consumerfinance.gov/rules-policy/regulations/1024/17](https://www.consumerfinance.gov/rules-policy/regulations/1024/17/) — the actual rule, in legal language.
- **Mortgage Servicing FAQs (Compliance Aid):** [consumerfinance.gov/.../mortgage-servicing-faqs](https://www.consumerfinance.gov/compliance/compliance-resources/mortgage-resources/mortserv/mortgage-servicing-faqs/) — clearly explains shortage/surplus/deficiency definitions and the repayment rules, but it's written for compliance professionals, not a self-check tool, and does zero math for you.
- **"What is an escrow or impound account" consumer explainer:** [consumerfinance.gov/ask-cfpb/...-en-153](https://www.consumerfinance.gov/ask-cfpb/what-is-an-escrow-or-impound-account-en-153/) — plain-language education, no numbers involved.
- **Notice of Error template (1024.35):** a blank fill-in-the-blank Word doc — [files.consumerfinance.gov/f/documents/201401_cfpb_mortgage_request-error-resolution.doc](https://files.consumerfinance.gov/f/documents/201401_cfpb_mortgage_request-error-resolution.doc). Generic, not pre-filled with any specific calculation, and the homeowner has to already know what "error" to describe.

**Bottom line: CFPB gives you the rulebook and a blank complaint form. It does not check your math for you.**

### Excel spreadsheets (compliance-professional side, not consumer)

Bankers Online lists a "TRID 1024.17 / RESPA 3500.17" Excel escrow-analysis spreadsheet built by Banker's Compliance Consulting ([bankersonline.com/tools/42696](https://www.bankersonline.com/tools/42696), page could not be fully verified — returned an access error on this research pass, listed here for completeness only). This is a bank-compliance-officer tool for *building* escrow accounts, not a homeowner-facing checker.

### Forensic loan audit / "mortgage audit" services (paid, adjacent, not really a match)

Firms selling "forensic loan audits" (e.g., LoanTech's "EscrowCheck" product, Mortgage Audits Online) exist and specifically market escrow-error review as one line item. Typical pricing runs **$300–500/hour**, or **flat fees from a few hundred to several thousand dollars**, per multiple industry sources ([mortgageauditsonline.com](https://www.mortgageauditsonline.com/the-cost-of-conducting-a-forensic-loan-audit-and-how-to-budget-for-it/), [loantech.com/audit-services](https://loantech.com/audit-services)). These sources themselves warn that **the forensic-audit industry has a real scam problem** — a useful data point for the pitch ("the paid alternative is expensive and reputation-risky; EscrowScope is free and instant").

### Servicer-side compliance software (exists — but it's for banks, not you)

The software that actually *generates* your annual escrow statement is enterprise B2B servicing platforms: **ICE Mortgage Technology's MSP** (formerly Black Knight; [mortgagetech.ice.com/products/msp-mortgage-servicing-system](https://mortgagetech.ice.com/products/msp-mortgage-servicing-system)) and **Sagent's LoanServ** ([sagent.com/products/loanserv](https://sagent.com/products/loanserv/)), among others. These are licensed to mortgage servicers to run escrow analysis at scale across millions of loans. **A homeowner has zero access to this software and no way to independently re-run their own servicer's calculation.** That asymmetry — the servicer has a powerful compliance engine and the homeowner has nothing — is a core part of the pitch.

### Housing counselors / nonprofits

HUD maintains a directory of HUD-approved housing counseling agencies ([hud.gov/program_offices/housing/sfh/hcc/hccprof14](https://www.hud.gov/hud-partners/housing-national-agencies)) that can help homeowners in person, and HUD Exchange lists case-management technology used *internally* by these agencies ([hudexchange.info/programs/housing-counseling/technology](https://www.hudexchange.info/programs/housing-counseling/technology/)). No dedicated, free, instant, public-facing digital escrow-checking tool built specifically for or by this network was found. This is a real, trustworthy referral path — but it requires scheduling a human appointment, not a two-minute self-check.

### GitHub / open source

Direct searches for `escrow analysis`, `RESPA`, `1024.17`, `aggregate analysis`, and `escrow cushion` on GitHub did not turn up any dedicated open-source implementation of the RESPA aggregate/low-point escrow test for consumers. (Search noise included unrelated projects: cryptocurrency/smart-contract "escrow" programs, a mortgage-tokenization project that briefly implements the impound rule as one small feature, and a resource-booking app unrelated to mortgages.) **This appears to be a genuine open-source gap**, not just a discovery-failure on this pass.

### AI chatbots (ChatGPT, Claude, Gemini, etc.)

Not independently tested during this research pass, so treat this as informed reasoning rather than a cited finding: general-purpose AI chatbots can explain what an escrow account or the 1/6 cushion rule is in plain language reasonably well. What they structurally cannot offer as well as a purpose-built calculator: (a) reliable, repeatable, checkable multi-step arithmetic (a trial running balance across 12+ months is exactly the kind of multi-step numeric task LLMs are known to make errors on); (b) a citation trail tying each specific number to the exact regulation paragraph, verifiable independent of the chatbot's own claim; (c) a guarantee that the homeowner's real financial numbers never leave their device — the opposite is true, since chat services typically process and may retain what's typed in.

---

## 2. How big and real is the problem

### Scale

- **~50.8 million** outstanding U.S. mortgages as of Q1 2024, per Federal Reserve Bank of New York / FHFA-sourced data reported by LendingTree ([lendingtree.com/home/mortgage/u-s-mortgage-market-statistics](https://www.lendingtree.com/home/mortgage/u-s-mortgage-market-statistics/)).
- **About 80%** of mortgage holders have an escrow account, per CNBC (May 2026) ([cnbc.com/2026/05/17/mortgage-escrow-shortages.html](https://www.cnbc.com/2026/05/17/mortgage-escrow-shortages.html)). All FHA loans and most conventional loans with under 20% equity require one.
- Combining those two (our own estimate, not a single source's number): **roughly 40 million U.S. households** currently have a mortgage escrow account that could, in principle, be checked with EscrowScope.

### Costs are spiking right now — this is exactly why people are confused about "why did my payment jump"

- Nationally, **escrow costs have risen about 45% since 2019**, according to property-data firm Cotality, reported by CNBC ([cnbc.com/2026/05/17/mortgage-escrow-shortages.html](https://www.cnbc.com/2026/05/17/mortgage-escrow-shortages.html)) and directly by Cotality ([cotality.com/insights/articles/escrow-costs-rising](https://www.cotality.com/insights/articles/escrow-costs-rising)). Florida and Colorado have risen **70%** and **77%** respectively since 2019 (Cotality).
- **65% of escrow accounts are projected to be short in 2025**, with an **average projected shortage of $2,157** (Cotality, via CNBC).
- U.S. average property taxes were **$3,018/year in 2024, up 27.4% since 2019** (Cotality). Nationally, property tax bills are about **15.4% higher** than just before the pandemic (Cotality).
- Homeowners insurance premiums rose roughly **24% from 2021–2024**, outpacing inflation by about 11 points, per the Harvard Joint Center for Housing Studies analysis of Insurance Information Institute and S&P Global data ([jchs.harvard.edu/blog/insurance-crisis-continues-weigh-homeowners](https://www.jchs.harvard.edu/blog/insurance-crisis-continues-weigh-homeowners)). The Insurance Information Institute (Triple-I) separately reports structural replacement costs — what it costs to rebuild a home — are up **nearly 30% over the past five years**, and 2025 industry-wide written premiums grew **11.8%** ([iii.org, Dec. 2025 press release](https://www.iii.org/press-release/triple-i-homeowners-insurance-market-shows-early-signs-of-stabilization-as-post-covid-inflation-pressures-level-set-into-new-normal-for-risk-pricing-121625)).
- Insurance-comparison site Insurify projects average homeowners insurance will hit **$3,057 by end of 2026** (up 4% from 2025's $2,948), and is **up 46% since 2021** — figures reported via CNBC ([cnbc.com/2026/05/17](https://www.cnbc.com/2026/05/17/mortgage-escrow-shortages.html)).

**Translation: bills going into escrow (taxes + insurance) are rising fast and unevenly across the country, which is exactly the mechanism that makes a fixed-rate mortgage's monthly payment jump — and almost nobody has an easy way to check whether their servicer applied the increase correctly.**

### Real enforcement cases — servicers actually get this wrong

These are gold for a pitch because they prove the risk is not hypothetical:

1. **Fay Servicing, LLC** (Tampa, FL) — August 21, 2024 CFPB consent order. Violated a prior 2017 CFPB order plus Regulation X (RESPA), Regulation Z (TILA), and the Homeowners Protection Act — including **overcharging borrowers for private mortgage insurance** and taking prohibited foreclosure actions while loss-mitigation applications were still pending. Ordered to pay **$3 million in consumer redress + $2 million civil penalty + $2 million required investment in servicing technology/compliance systems.** Source: [consumerfinance.gov/enforcement/actions/fay-servicing-llc-2024](https://www.consumerfinance.gov/enforcement/actions/fay-servicing-llc-2024/).
2. **BSI Financial Services / Servis One, Inc.** — May 2019 CFPB consent order. During 2012–2014, mishandled escrow information during loan-servicing transfers, causing **untimely disbursement of borrowers' property tax and insurance payments** out of escrow. Ordered to pay a **$200,000 civil penalty** plus restitution. Source: [consumerfinance.gov consent order PDF](https://files.consumerfinance.gov/f/documents/cfpb_servis-one-inc-BSI-financial-services_consent-order_2019-05.pdf); reporting via [National Mortgage News](https://www.nationalmortgagenews.com/news/cfpb-fines-bsi-200k-for-mishandling-loan-transfers-in-loss-mitigation).
3. **Residential Credit Solutions, Inc.** (Fort Worth, TX) — July 2015 CFPB action. Among other loss-mitigation violations, **sent consumers escrow statements falsely claiming they were due a refund.** Ordered to pay **$1.5 million in restitution + $100,000 civil penalty.** Source: [consumerfinance.gov press release (archived)](https://www.consumerfinance.gov/about-us/newsroom/cfpb-takes-action-against-mortgage-company-for-blocking-consumers-attempts-to-save-their-homes/).

Additional context: Regulation X (escrow) violations were among the **most-cited compliance findings** in the Federal Reserve System's 2023 bank examinations, per the Fed's own compliance publication ([consumercomplianceoutlook.org/2024/third-issue/common-violations-regulation-x-escrows](https://www.consumercomplianceoutlook.org/2024/third-issue/common-violations-regulation-x-escrows/)) — meaning escrow mistakes aren't a rare fluke, they're a persistent, actively-monitored problem across the industry.

*(Note on a case that looked promising but doesn't fit: the November 2022 $5.25 million CFPB consent order against Carrington Mortgage Services was about CARES Act forbearance/late-fee/credit-reporting violations, not escrow specifically — excluded here to keep the escrow-case list accurate.)*

---

## 3. The gap — what nothing existing does

1. **Nothing checks a servicer's actual numbers against the law.** AgentCalc computes what your escrow *should* be. Nothing found takes what your servicer *actually charged you* and tells you whether it's inside or outside the legal cushion cap — a calculator, not a checker.
2. **Nothing decomposes "why did my payment jump" into its three legally distinct causes** — bills went up, you're repaying a shortage, or the servicer added a cushion — even though this exact three-way split is the single most common source of confusion (per CFPB's own FAQ language about shortage vs. deficiency vs. surplus being frequently conflated).
3. **Nothing shows its work against the actual regulation text**, paragraph by paragraph, in a way a skeptical homeowner can verify independently. AgentCalc cites section numbers in prose; nothing links each individual computed number to its specific source paragraph.
4. **Nothing bridges "I found a problem" to "here's the letter to send."** CFPB's Notice of Error template is a blank form. No tool auto-fills it with the homeowner's own computed numbers.
5. **Nothing proves it's private.** Every tool found is a normal hosted web app; none make a verifiable claim (let alone prove it live) that your real financial numbers never leave your device.
6. **Nothing screens for fit first.** No tool checks "is this even your situation" (no escrow, a HELOC, a non-federally-related loan) before asking the user to type in a bunch of numbers.
7. **Nothing is bilingual.** No Spanish-language version was found anywhere in this space, despite Spanish being the second-most-spoken language in U.S. households and housing-cost shocks disproportionately hitting lower-income and first-time buyers.
8. **Nothing is designed to be handed to a professional.** The free safety net (HUD-approved housing counselors) already exists, but no tool produces a clean, printable artifact meant to bring into that meeting.

---

## 4. Differentiation bets

Rated for **user value**, **build cost** (assuming a static, in-browser, no-server, no-AI-call app), and **demo "wow"** in a short demo video.

| # | Feature | User value | Build cost | Demo wow | Notes |
|---|---|---|---|---|---|
| 1 | **Side-by-side "what your servicer says vs. what the law allows"** | High | Low | High | The single biggest gap (see #1 above). **Legal-risk note:** word it as a math comparison, not an accusation — explicitly state a mismatch doesn't prove an error, since the servicer may have a more current tax bill than what the user typed in. |
| 2 | **"Why did it jump" 3-way breakdown** (bills up / shortage repayment / cushion change) | High | Low–Med | High | Directly answers the #1 real-world question. Pure arithmetic on numbers already collected — no new inputs needed. |
| 3 | **Month-by-month balance chart** with low point and cushion line highlighted, **plus an overlay of what the servicer actually billed** | Med–High | Med | High | AgentCalc already does the base chart well — the "actual vs. lawful" overlay is what would make it new, not just prettier. |
| 4 | **Show-your-work panel**: every computed number links to the exact regulation paragraph | High | Low | Med–High | Use short paraphrases/anchor links to eCFR/CFPB's own regulation page, not long verbatim quotes, to stay well inside fair use. Skeptical readers respond well to this. |
| 5 | **Pre-filled Notice of Error letter** (12 CFR 1024.35), printable/downloadable | High | Med | High | **Legal-risk note — the most sensitive feature.** Frame it as "request my servicer explain this calculation," not "you violated the law." Include a visible non-legal-advice disclaimer on the letter itself, not just the app. Consider only auto-enabling the strongest wording when the numbers show a specific, unambiguous rule breach (e.g., cushion collected exceeds 1/6, or a surplus of $50+ wasn't refunded within 30 days) — otherwise default to the neutral "please explain" version. |
| 6 | **Provable-privacy indicator** — shows live network-request count (should read 0 after load) and works after the user goes into airplane mode | High (trust) | Low | Med | Genuinely unique — nothing else found makes or proves this claim. Bigger draw for technical reviewers than the general public, but pairs perfectly with "no account, no upload" as a headline claim. |
| 7 | **Printable one-page report** to bring to a HUD-approved housing counselor | Med–High | Low | Med | Connects the tool to the real, free, trustworthy human safety net that already exists (see Section 1). |
| 8 | **Plain-language / Spanish toggle** | High | Med | Med | Real accessibility/equity story; the demographic overlap with rising insurance/tax burden is documented above. |
| 9 | **"Is this even the right tool for me" 60-second pre-check** | Med | Low | Low–Med | Screens out HELOCs, no-escrow loans, non-federally-related loans before the user wastes time. Shows scope discipline, which reads well to careful reviewers even though it's not flashy. |
| 10 | **In-browser statement photo/OCR autofill** (e.g., tesseract.js, fully client-side WASM — no server, satisfies the no-server rule) | High | **High** (hardest item on this list — OCR accuracy on real, messy statement photos is a genuinely hard problem) | Very High | Best single demo moment if it works reliably, but recommend treating as a stretch goal after the core tool is solid, not a v1 requirement. |
| 11 | **Inline jargon explainers** next to each number (shortage vs. deficiency vs. surplus, cushion, aggregate analysis) | Med–High | Low | Low–Med | Straightforward, low-risk financial-literacy value-add. |
| 12 | **Multi-year local history** — paste in 2–3 years of past analyses, stored only in the browser's local storage, see the trend | Med | Med | Med | Useful for repeat visits; needs care to keep the "no account, nothing leaves your device" privacy story intact (must stay in localStorage, never synced anywhere). |

---

## 5. Positioning

### Three one-sentence pitch options

1. *"EscrowScope checks your mortgage servicer's escrow math against federal law — free, in your browser, in under two minutes, with no account and no upload."*
2. *"Type in your annual escrow statement, get the exact aggregate-analysis math your servicer is legally required to run — plus a plain-English answer to 'why did my payment jump.'"*
3. *"The first free tool that shows, paragraph by paragraph, whether your mortgage servicer stayed inside the RESPA escrow cushion cap — built to prove its own privacy, not just claim it."*

### Honest limits the product must state clearly (not optional)

- **This is math, not legal advice.** EscrowScope does not tell you whether you have a legal claim, and it is not a lawyer or a substitute for one.
- **It's only as accurate as the numbers you type in.** It cannot see your real bills or your servicer's internal records — it can only recompute from what you enter.
- **Your servicer may have information you don't.** A mismatch between "what the law allows" and "what your servicer charged" can be caused by the servicer having a more recent tax bill or rate change than the number you typed in — not necessarily a mistake on their part.
- **It only covers escrow (12 CFR 1024.17).** It does not check your interest rate, PMI removal eligibility, or anything else about your loan.
- **RESPA/Regulation X doesn't cover every loan.** Some loans (certain seller-financed loans, some portfolio loans, open-end HELOCs) may not be "federally related mortgage loans" under RESPA — the pre-check (differentiation bet #9) should catch this before the user relies on results that don't apply to them.

---

## Sources used (all fetched/verified during this research pass)

- Consumer Financial Protection Bureau — regulation text, FAQs, enforcement actions, and templates: [consumerfinance.gov/rules-policy/regulations/1024/17](https://www.consumerfinance.gov/rules-policy/regulations/1024/17/), [consumerfinance.gov mortgage servicing FAQs](https://www.consumerfinance.gov/compliance/compliance-resources/mortgage-resources/mortserv/mortgage-servicing-faqs/), [consumerfinance.gov ask-cfpb escrow explainer](https://www.consumerfinance.gov/ask-cfpb/what-is-an-escrow-or-impound-account-en-153/), [Notice of Error template](https://files.consumerfinance.gov/f/documents/201401_cfpb_mortgage_request-error-resolution.doc), [Fay Servicing enforcement page](https://www.consumerfinance.gov/enforcement/actions/fay-servicing-llc-2024/), [BSI Financial / Servis One consent order](https://files.consumerfinance.gov/f/documents/cfpb_servis-one-inc-BSI-financial-services_consent-order_2019-05.pdf), [Residential Credit Solutions press release](https://www.consumerfinance.gov/about-us/newsroom/cfpb-takes-action-against-mortgage-company-for-blocking-consumers-attempts-to-save-their-homes/)
- Federal Reserve System compliance data: [consumercomplianceoutlook.org — Reg X common violations 2023](https://www.consumercomplianceoutlook.org/2024/third-issue/common-violations-regulation-x-escrows/)
- CNBC: [Mortgage escrow shortages rise (May 2026)](https://www.cnbc.com/2026/05/17/mortgage-escrow-shortages.html)
- Fox Business: [Escrow payments jump 30%](https://www.foxbusiness.com/lifestyle/escrow-payments-rising-nationwide-homeownership-becomes-less-attainable)
- Cotality (property data/analytics firm): [Affordable homes, unstable costs](https://www.cotality.com/insights/articles/escrow-costs-rising)
- Harvard Joint Center for Housing Studies: [The Insurance Crisis Continues to Weigh on Homeowners](https://www.jchs.harvard.edu/blog/insurance-crisis-continues-weigh-homeowners)
- Insurance Information Institute (Triple-I): [Dec. 2025 homeowners insurance market press release](https://www.iii.org/press-release/triple-i-homeowners-insurance-market-shows-early-signs-of-stabilization-as-post-covid-inflation-pressures-level-set-into-new-normal-for-risk-pricing-121625)
- LendingTree: [U.S. Mortgage Market Statistics](https://www.lendingtree.com/home/mortgage/u-s-mortgage-market-statistics/)
- Goodwin Law: [CFPB Enters Into Consent Order With Mortgage Servicer (Aug. 2024)](https://www.goodwinlaw.com/en/insights/blogs/2024/08/cfpb-enters-into-consent-order-with-mortgage-servicer-resolving-allegations-of-improper-foreclosure)
- National Mortgage News: [CFPB fines BSI $200K](https://www.nationalmortgagenews.com/news/cfpb-fines-bsi-200k-for-mishandling-loan-transfers-in-loss-mitigation)
- Competitor product pages: [AgentCalc](https://agentcalc.com/mortgage-escrow-calculator), [HomePaymentCalc](https://homepaymentcalc.com/escrow-analysis-calculator/), [Homebuyer.com](https://homebuyer.com/tools/escrow-calculator), [OfferMarket](https://www.offermarket.us/blog/escrow-analysis-calculator), [ICE Mortgage Technology MSP](https://mortgagetech.ice.com/products/msp-mortgage-servicing-system), [Sagent LoanServ](https://sagent.com/products/loanserv/)
- Forensic audit industry (cost/caution data): [mortgageauditsonline.com](https://www.mortgageauditsonline.com/the-cost-of-conducting-a-forensic-loan-audit-and-how-to-budget-for-it/), [loantech.com/audit-services](https://loantech.com/audit-services)
- HUD housing counseling: [hud.gov HUD-approved agency directory](https://www.hud.gov/hud-partners/housing-national-agencies), [hudexchange.info housing counseling technology](https://www.hudexchange.info/programs/housing-counseling/technology/)

**Sources intentionally excluded** as low-quality/SEO-farm content per research rules (found during search but not cited): gitnux.org, zipdo.co, wifitalents.com, techvendorindex.com, and similar "best software of 2026" listicle sites that surfaced when searching for mortgage-servicing software rankings.
