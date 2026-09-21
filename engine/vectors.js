// GENERATED — do not edit.
// Source of truth: docs/research/01-test-vectors.json
// To regenerate:   node tools/make-vectors.mjs
// tests/vectors-sync.test.js fails if this file and the JSON ever differ.

// How the vectors were made, the rounding choices, and the sources.
export const VECTORS_META = {
  "name": "EscrowScope test vectors - 12 CFR 1024.17 aggregate escrow analysis",
  "generated": "2026-09-19",
  "companionNotes": "01-reg-math.md (same folder)",
  "howTheseWereMade": "Key numbers for every vector were derived BY HAND from the regulation's own method (12 CFR 1024.17(d)(2)(i)(A)-(C) and Appendix E Steps 1-3), then re-checked two independent ways by a throwaway script (literal 3-step Appendix E method, and a closed-form 'cushion + worst cumulative gap' method). Expected values do NOT come from the owner's engine. TV02 reproduces the three published Appendix E tables exactly; TV03 and TV04 reproduce HUD's published annual-statement examples exactly.",
  "units": "All money is integer cents. Negative numbers are negative balances.",
  "months": "`month` is 1-12 in COMPUTATION-YEAR order (month 1 = the first month of the escrow year). `startMonth` is the calendar month (1 = January) that computation-year month 1 falls in. `calendarMonth` in the tables is provided for convenience.",
  "method": [
    "annualDisbursements D = sum of every disbursement expected in the coming 12 months",
    "baseMonthlyPayment P = D / 12  [1024.17(c)(1)(ii); (d)(2)(i)(A)]",
    "cushionCap C = D * cushionMonths / 12, cushionMonths = 2 unless mortgage documents or state law say less  [1024.17(c)(5), (c)(8), (d)(2)(i)(C)]",
    "Step 1: start at 0; each month balance += P - (bills paid that month)  [Appendix E Step 1]",
    "Step 2: stepTwoAdd A = amount that lifts the lowest Step 1 month-end balance to exactly 0  [Appendix E Step 2]",
    "Step 3: target balance for every month = Step 1 balance + A + C; requiredStartingBalance = A + C  [Appendix E Step 3]",
    "difference = startingBalance - requiredStartingBalance. >0 surplus, <0 shortage  [1024.17(b) definitions of surplus / shortage]",
    "deficiency = amount of a NEGATIVE startingBalance (a real negative balance today, never a projected one)  [1024.17(b)]",
    "when both exist: deficiency first, then the REMAINING shortage measured from $0 up to the target  [HUD, 60 FR 8812, 8814 item (l) and Appendix M at 8837]",
    "projectedBalance = startingBalance + Step 1 balance. Its lowest month is the 'low point'. lowPoint - C equals `difference` whenever the deposit used is exactly P."
  ],
  "choicesThatAreNotLaw": {
    "warning": "The regulation and Appendix E are SILENT on cents. HUD's 1995 preamble (60 FR 8812, clarification (a)) says any dollar amount 'may be rounded up or down to the nearest dollar'. The conventions below are engineering choices made so tests are deterministic. Only TV15, TV10b and TV19 are affected by them.",
    "baseMonthlyPayment": "round half up to the nearest cent: floor((D + 6) / 12)",
    "cushionCap": "round DOWN to the cent (floor), because the law says 'no greater than' one-sixth",
    "trialBalance": "run in whole cents using the rounded base payment (this is what a real statement shows)",
    "shortageSpread": "shortage / 12 rounded half up to the nearest cent",
    "deficiencySpread": "deficiency / n rounded half up; n = 2 is the fastest the law allows",
    "lowPointTie": "earliest month wins (TV21)",
    "oneMonthsPayment": "the (f)(3)/(f)(4) tier test compares against the NEW base monthly payment P (the reg does not say old vs new)",
    "suggestedUiTolerance": "Do not call a difference an error unless it is bigger than about $7: a servicer that rounds every figure to whole dollars (allowed per HUD 1995) can drift by up to 50 cents x 12 months + 50 cents on the cushion."
  },
  "classifications": {
    "SURPLUS_REFUND_REQUIRED": "surplus >= $50.00 and borrower current -> refund within 30 days of the analysis. 1024.17(f)(2)(i)",
    "SURPLUS_UNDER_50": "0 < surplus < $50.00 and borrower current -> refund OR credit against next year's payments. 1024.17(f)(2)(i)",
    "SURPLUS_BORROWER_NOT_CURRENT": "surplus exists but a payment was not received within 30 days of its due date -> servicer may retain it per the loan documents. 1024.17(f)(2)(ii)",
    "ON_TARGET": "starting balance equals the required starting balance exactly",
    "SHORTAGE_LT_ONE_MONTH": "shortage < one month's escrow payment -> do nothing / repay within 30 days / equal monthly payments over at least 12 months. 1024.17(f)(3)(i)",
    "SHORTAGE_GE_ONE_MONTH": "shortage >= one month's escrow payment -> do nothing / equal monthly payments over at least 12 months. NO 30-day demand. 1024.17(f)(3)(ii)",
    "DEFICIENCY_LT_ONE_MONTH": "negative balance < one month's escrow payment -> do nothing / repay within 30 days / 2 or more equal monthly payments. 1024.17(f)(4)(i)",
    "DEFICIENCY_GE_ONE_MONTH": "negative balance >= one month's escrow payment -> do nothing / 2 or more equal monthly payments. 1024.17(f)(4)(ii)",
    "combined": "A deficiency and a remaining shortage can coexist; the classification string joins them with _AND_ (TV04)."
  },
  "sources": [
    "eCFR 12 CFR 1024.17 and Appendix E to Part 1024 (ecfr.gov versioner API, as of 2026-09-01; section last amended 2017-10-19) - pulled 2026-09-19",
    "CFPB interactive Regulation X: consumerfinance.gov/rules-policy/regulations/1024/17/ and /1024/e/ - pulled 2026-09-19",
    "Cornell LII: law.cornell.edu/cfr/text/12/1024.17 and /appendix-E_to_part_1024 - pulled 2026-09-19",
    "HUD, Escrow Accounting Procedures final rule, 60 FR 8812 (Feb. 15, 1995), govinfo.gov FR-1995-02-15 doc 95-3683, and the CFPB-hosted copy files.consumerfinance.gov/f/documents/HUD_95-3683.pdf - pulled 2026-09-19"
  ],
  "amendments": [
    "2026-09-19 (Phase 4, independent math audit): appended TV22, TV23, TV24, TV25, TV26, TV27, TV28, TV29 and added the additive key expected.nearLine to every earlier vector (SPEC Part E). No pre-existing value was changed; verified by script."
  ]
};

// The 22 worked cases the engine must reproduce, cent for cent.
export const VECTORS = [
  {
    "id": "TV01",
    "title": "Owner's test case #1 - over-collection, refund required",
    "source": "OWNER-HAND-DERIVED (2026-07-24), re-derived with the reg method",
    "startMonth": 1,
    "inputs": {
      "startingBalanceCents": 150000,
      "cushionMonths": 2,
      "borrowerCurrent": true,
      "disbursements": [
        {
          "label": "Property tax 1st half",
          "month": 5,
          "amountCents": 180000
        },
        {
          "label": "Homeowners insurance",
          "month": 7,
          "amountCents": 120000
        },
        {
          "label": "Property tax 2nd half",
          "month": 11,
          "amountCents": 180000
        }
      ]
    },
    "expected": {
      "annualDisbursementsCents": 480000,
      "baseMonthlyPaymentCents": 40000,
      "cushionCapCents": 80000,
      "stepTwoAddCents": 40000,
      "requiredStartingBalanceCents": 120000,
      "differenceCents": 30000,
      "surplusCents": 30000,
      "shortageCents": 0,
      "deficiencyCents": 0,
      "lowPoint": {
        "projectedBalanceCents": 110000,
        "month": 11,
        "calendarMonth": 11,
        "lowestTargetBalanceCents": 80000
      },
      "classification": "SURPLUS_REFUND_REQUIRED",
      "cite": "12 CFR 1024.17(f)(2)(i)",
      "servicerOptions": [
        "refund the surplus to the borrower within 30 days from the date of the analysis"
      ],
      "newMonthlyEscrowPayment": {
        "baseMonthlyCents": 40000,
        "shortageSpreadOver12Cents": 0,
        "deficiencySpreadCents": 0,
        "deficiencySpreadMonths": 0,
        "monthlyEscrowWhileRepayingDeficiencyCents": 40000,
        "monthlyEscrowAfterDeficiencyRepaidCents": 40000
      },
      "table": [
        {
          "month": 1,
          "calendarMonth": 1,
          "depositCents": 40000,
          "disbursementCents": 0,
          "step1TrialBalanceCents": 40000,
          "targetBalanceCents": 160000,
          "projectedBalanceCents": 190000
        },
        {
          "month": 2,
          "calendarMonth": 2,
          "depositCents": 40000,
          "disbursementCents": 0,
          "step1TrialBalanceCents": 80000,
          "targetBalanceCents": 200000,
          "projectedBalanceCents": 230000
        },
        {
          "month": 3,
          "calendarMonth": 3,
          "depositCents": 40000,
          "disbursementCents": 0,
          "step1TrialBalanceCents": 120000,
          "targetBalanceCents": 240000,
          "projectedBalanceCents": 270000
        },
        {
          "month": 4,
          "calendarMonth": 4,
          "depositCents": 40000,
          "disbursementCents": 0,
          "step1TrialBalanceCents": 160000,
          "targetBalanceCents": 280000,
          "projectedBalanceCents": 310000
        },
        {
          "month": 5,
          "calendarMonth": 5,
          "depositCents": 40000,
          "disbursementCents": 180000,
          "step1TrialBalanceCents": 20000,
          "targetBalanceCents": 140000,
          "projectedBalanceCents": 170000
        },
        {
          "month": 6,
          "calendarMonth": 6,
          "depositCents": 40000,
          "disbursementCents": 0,
          "step1TrialBalanceCents": 60000,
          "targetBalanceCents": 180000,
          "projectedBalanceCents": 210000
        },
        {
          "month": 7,
          "calendarMonth": 7,
          "depositCents": 40000,
          "disbursementCents": 120000,
          "step1TrialBalanceCents": -20000,
          "targetBalanceCents": 100000,
          "projectedBalanceCents": 130000
        },
        {
          "month": 8,
          "calendarMonth": 8,
          "depositCents": 40000,
          "disbursementCents": 0,
          "step1TrialBalanceCents": 20000,
          "targetBalanceCents": 140000,
          "projectedBalanceCents": 170000
        },
        {
          "month": 9,
          "calendarMonth": 9,
          "depositCents": 40000,
          "disbursementCents": 0,
          "step1TrialBalanceCents": 60000,
          "targetBalanceCents": 180000,
          "projectedBalanceCents": 210000
        },
        {
          "month": 10,
          "calendarMonth": 10,
          "depositCents": 40000,
          "disbursementCents": 0,
          "step1TrialBalanceCents": 100000,
          "targetBalanceCents": 220000,
          "projectedBalanceCents": 250000
        },
        {
          "month": 11,
          "calendarMonth": 11,
          "depositCents": 40000,
          "disbursementCents": 180000,
          "step1TrialBalanceCents": -40000,
          "targetBalanceCents": 80000,
          "projectedBalanceCents": 110000
        },
        {
          "month": 12,
          "calendarMonth": 12,
          "depositCents": 40000,
          "disbursementCents": 0,
          "step1TrialBalanceCents": 0,
          "targetBalanceCents": 120000,
          "projectedBalanceCents": 150000
        }
      ],
      "nearLine": null
    }
  },
  {
    "id": "TV02",
    "title": "OFFICIAL Appendix E, Example I (aggregate analysis) - year starts in July",
    "source": "OFFICIAL - Appendix E to 12 CFR Part 1024, Part I",
    "startMonth": 7,
    "inputs": {
      "startingBalanceCents": 104000,
      "cushionMonths": 2,
      "borrowerCurrent": true,
      "disbursements": [
        {
          "label": "County property taxes (Jul 25)",
          "month": 1,
          "amountCents": 50000
        },
        {
          "label": "School taxes (Sep 20)",
          "month": 3,
          "amountCents": 36000
        },
        {
          "label": "County property taxes (Dec 10)",
          "month": 6,
          "amountCents": 70000
        }
      ]
    },
    "expected": {
      "annualDisbursementsCents": 156000,
      "baseMonthlyPaymentCents": 13000,
      "cushionCapCents": 26000,
      "stepTwoAddCents": 78000,
      "requiredStartingBalanceCents": 104000,
      "differenceCents": 0,
      "surplusCents": 0,
      "shortageCents": 0,
      "deficiencyCents": 0,
      "lowPoint": {
        "projectedBalanceCents": 26000,
        "month": 6,
        "calendarMonth": 12,
        "lowestTargetBalanceCents": 26000
      },
      "classification": "ON_TARGET",
      "cite": "12 CFR 1024.17(d)(2)",
      "servicerOptions": [],
      "newMonthlyEscrowPayment": {
        "baseMonthlyCents": 13000,
        "shortageSpreadOver12Cents": 0,
        "deficiencySpreadCents": 0,
        "deficiencySpreadMonths": 0,
        "monthlyEscrowWhileRepayingDeficiencyCents": 13000,
        "monthlyEscrowAfterDeficiencyRepaidCents": 13000
      },
      "table": [
        {
          "month": 1,
          "calendarMonth": 7,
          "depositCents": 13000,
          "disbursementCents": 50000,
          "step1TrialBalanceCents": -37000,
          "targetBalanceCents": 67000,
          "projectedBalanceCents": 67000
        },
        {
          "month": 2,
          "calendarMonth": 8,
          "depositCents": 13000,
          "disbursementCents": 0,
          "step1TrialBalanceCents": -24000,
          "targetBalanceCents": 80000,
          "projectedBalanceCents": 80000
        },
        {
          "month": 3,
          "calendarMonth": 9,
          "depositCents": 13000,
          "disbursementCents": 36000,
          "step1TrialBalanceCents": -47000,
          "targetBalanceCents": 57000,
          "projectedBalanceCents": 57000
        },
        {
          "month": 4,
          "calendarMonth": 10,
          "depositCents": 13000,
          "disbursementCents": 0,
          "step1TrialBalanceCents": -34000,
          "targetBalanceCents": 70000,
          "projectedBalanceCents": 70000
        },
        {
          "month": 5,
          "calendarMonth": 11,
          "depositCents": 13000,
          "disbursementCents": 0,
          "step1TrialBalanceCents": -21000,
          "targetBalanceCents": 83000,
          "projectedBalanceCents": 83000
        },
        {
          "month": 6,
          "calendarMonth": 12,
          "depositCents": 13000,
          "disbursementCents": 70000,
          "step1TrialBalanceCents": -78000,
          "targetBalanceCents": 26000,
          "projectedBalanceCents": 26000
        },
        {
          "month": 7,
          "calendarMonth": 1,
          "depositCents": 13000,
          "disbursementCents": 0,
          "step1TrialBalanceCents": -65000,
          "targetBalanceCents": 39000,
          "projectedBalanceCents": 39000
        },
        {
          "month": 8,
          "calendarMonth": 2,
          "depositCents": 13000,
          "disbursementCents": 0,
          "step1TrialBalanceCents": -52000,
          "targetBalanceCents": 52000,
          "projectedBalanceCents": 52000
        },
        {
          "month": 9,
          "calendarMonth": 3,
          "depositCents": 13000,
          "disbursementCents": 0,
          "step1TrialBalanceCents": -39000,
          "targetBalanceCents": 65000,
          "projectedBalanceCents": 65000
        },
        {
          "month": 10,
          "calendarMonth": 4,
          "depositCents": 13000,
          "disbursementCents": 0,
          "step1TrialBalanceCents": -26000,
          "targetBalanceCents": 78000,
          "projectedBalanceCents": 78000
        },
        {
          "month": 11,
          "calendarMonth": 5,
          "depositCents": 13000,
          "disbursementCents": 0,
          "step1TrialBalanceCents": -13000,
          "targetBalanceCents": 91000,
          "projectedBalanceCents": 91000
        },
        {
          "month": 12,
          "calendarMonth": 6,
          "depositCents": 13000,
          "disbursementCents": 0,
          "step1TrialBalanceCents": 0,
          "targetBalanceCents": 104000,
          "projectedBalanceCents": 104000
        }
      ],
      "nearLine": null
    },
    "publishedTables": {
      "note": "13 entries: starting row then months 1-12, exactly as printed in the source",
      "step1": [
        0,
        -37000,
        -24000,
        -47000,
        -34000,
        -21000,
        -78000,
        -65000,
        -52000,
        -39000,
        -26000,
        -13000,
        0
      ],
      "step2": [
        78000,
        41000,
        54000,
        31000,
        44000,
        57000,
        0,
        13000,
        26000,
        39000,
        52000,
        65000,
        78000
      ],
      "step3": [
        104000,
        67000,
        80000,
        57000,
        70000,
        83000,
        26000,
        39000,
        52000,
        65000,
        78000,
        91000,
        104000
      ]
    }
  },
  {
    "id": "TV03",
    "title": "HUD guidance example, Appendix I-8 (aggregate annual statement) - surplus $230, year starts in September",
    "source": "HUD PUBLIC GUIDANCE DOCUMENT - 60 FR 8812, 8829 (Feb. 15, 1995), Appendix I-8",
    "startMonth": 9,
    "inputs": {
      "startingBalanceCents": 132000,
      "cushionMonths": 2,
      "borrowerCurrent": true,
      "disbursements": [
        {
          "label": "Taxes",
          "month": 2,
          "amountCents": 68000
        },
        {
          "label": "Insurance",
          "month": 3,
          "amountCents": 60000
        },
        {
          "label": "Taxes",
          "month": 11,
          "amountCents": 100000
        }
      ]
    },
    "expected": {
      "annualDisbursementsCents": 228000,
      "baseMonthlyPaymentCents": 19000,
      "cushionCapCents": 38000,
      "stepTwoAddCents": 71000,
      "requiredStartingBalanceCents": 109000,
      "differenceCents": 23000,
      "surplusCents": 23000,
      "shortageCents": 0,
      "deficiencyCents": 0,
      "lowPoint": {
        "projectedBalanceCents": 61000,
        "month": 3,
        "calendarMonth": 11,
        "lowestTargetBalanceCents": 38000
      },
      "classification": "SURPLUS_REFUND_REQUIRED",
      "cite": "12 CFR 1024.17(f)(2)(i)",
      "servicerOptions": [
        "refund the surplus to the borrower within 30 days from the date of the analysis"
      ],
      "newMonthlyEscrowPayment": {
        "baseMonthlyCents": 19000,
        "shortageSpreadOver12Cents": 0,
        "deficiencySpreadCents": 0,
        "deficiencySpreadMonths": 0,
        "monthlyEscrowWhileRepayingDeficiencyCents": 19000,
        "monthlyEscrowAfterDeficiencyRepaidCents": 19000
      },
      "table": [
        {
          "month": 1,
          "calendarMonth": 9,
          "depositCents": 19000,
          "disbursementCents": 0,
          "step1TrialBalanceCents": 19000,
          "targetBalanceCents": 128000,
          "projectedBalanceCents": 151000
        },
        {
          "month": 2,
          "calendarMonth": 10,
          "depositCents": 19000,
          "disbursementCents": 68000,
          "step1TrialBalanceCents": -30000,
          "targetBalanceCents": 79000,
          "projectedBalanceCents": 102000
        },
        {
          "month": 3,
          "calendarMonth": 11,
          "depositCents": 19000,
          "disbursementCents": 60000,
          "step1TrialBalanceCents": -71000,
          "targetBalanceCents": 38000,
          "projectedBalanceCents": 61000
        },
        {
          "month": 4,
          "calendarMonth": 12,
          "depositCents": 19000,
          "disbursementCents": 0,
          "step1TrialBalanceCents": -52000,
          "targetBalanceCents": 57000,
          "projectedBalanceCents": 80000
        },
        {
          "month": 5,
          "calendarMonth": 1,
          "depositCents": 19000,
          "disbursementCents": 0,
          "step1TrialBalanceCents": -33000,
          "targetBalanceCents": 76000,
          "projectedBalanceCents": 99000
        },
        {
          "month": 6,
          "calendarMonth": 2,
          "depositCents": 19000,
          "disbursementCents": 0,
          "step1TrialBalanceCents": -14000,
          "targetBalanceCents": 95000,
          "projectedBalanceCents": 118000
        },
        {
          "month": 7,
          "calendarMonth": 3,
          "depositCents": 19000,
          "disbursementCents": 0,
          "step1TrialBalanceCents": 5000,
          "targetBalanceCents": 114000,
          "projectedBalanceCents": 137000
        },
        {
          "month": 8,
          "calendarMonth": 4,
          "depositCents": 19000,
          "disbursementCents": 0,
          "step1TrialBalanceCents": 24000,
          "targetBalanceCents": 133000,
          "projectedBalanceCents": 156000
        },
        {
          "month": 9,
          "calendarMonth": 5,
          "depositCents": 19000,
          "disbursementCents": 0,
          "step1TrialBalanceCents": 43000,
          "targetBalanceCents": 152000,
          "projectedBalanceCents": 175000
        },
        {
          "month": 10,
          "calendarMonth": 6,
          "depositCents": 19000,
          "disbursementCents": 0,
          "step1TrialBalanceCents": 62000,
          "targetBalanceCents": 171000,
          "projectedBalanceCents": 194000
        },
        {
          "month": 11,
          "calendarMonth": 7,
          "depositCents": 19000,
          "disbursementCents": 100000,
          "step1TrialBalanceCents": -19000,
          "targetBalanceCents": 90000,
          "projectedBalanceCents": 113000
        },
        {
          "month": 12,
          "calendarMonth": 8,
          "depositCents": 19000,
          "disbursementCents": 0,
          "step1TrialBalanceCents": 0,
          "targetBalanceCents": 109000,
          "projectedBalanceCents": 132000
        }
      ],
      "nearLine": null
    },
    "publishedTables": {
      "note": "13 entries: starting row then months 1-12, exactly as printed in the source",
      "step1": null,
      "step2": null,
      "step3": [
        109000,
        128000,
        79000,
        38000,
        57000,
        76000,
        95000,
        114000,
        133000,
        152000,
        171000,
        90000,
        109000
      ]
    }
  },
  {
    "id": "TV04",
    "title": "HUD guidance example, Appendix M - simultaneous deficiency ($2,400) and shortage ($3,300)",
    "source": "HUD PUBLIC GUIDANCE DOCUMENT - 60 FR 8812, 8837 (Feb. 15, 1995), Appendix M",
    "startMonth": 9,
    "inputs": {
      "startingBalanceCents": -240000,
      "cushionMonths": 2,
      "borrowerCurrent": true,
      "disbursements": [
        {
          "label": "Taxes",
          "month": 2,
          "amountCents": 80000
        },
        {
          "label": "Insurance",
          "month": 3,
          "amountCents": 300000
        },
        {
          "label": "Taxes",
          "month": 10,
          "amountCents": 220000
        }
      ]
    },
    "expected": {
      "annualDisbursementsCents": 600000,
      "baseMonthlyPaymentCents": 50000,
      "cushionCapCents": 100000,
      "stepTwoAddCents": 230000,
      "requiredStartingBalanceCents": 330000,
      "differenceCents": -570000,
      "surplusCents": 0,
      "shortageCents": 330000,
      "deficiencyCents": 240000,
      "lowPoint": {
        "projectedBalanceCents": -470000,
        "month": 3,
        "calendarMonth": 11,
        "lowestTargetBalanceCents": 100000
      },
      "classification": "DEFICIENCY_GE_ONE_MONTH_AND_SHORTAGE_GE_ONE_MONTH",
      "cite": "12 CFR 1024.17(f)(4)(ii) + 12 CFR 1024.17(f)(3)(ii)",
      "servicerOptions": [
        "deficiency: do nothing",
        "deficiency: require repayment in 2 or more equal monthly payments",
        "shortage: do nothing",
        "shortage: require repayment in equal monthly payments over at least 12 months"
      ],
      "newMonthlyEscrowPayment": {
        "baseMonthlyCents": 50000,
        "shortageSpreadOver12Cents": 27500,
        "deficiencySpreadCents": 120000,
        "deficiencySpreadMonths": 2,
        "monthlyEscrowWhileRepayingDeficiencyCents": 197500,
        "monthlyEscrowAfterDeficiencyRepaidCents": 77500
      },
      "table": [
        {
          "month": 1,
          "calendarMonth": 9,
          "depositCents": 50000,
          "disbursementCents": 0,
          "step1TrialBalanceCents": 50000,
          "targetBalanceCents": 380000,
          "projectedBalanceCents": -190000
        },
        {
          "month": 2,
          "calendarMonth": 10,
          "depositCents": 50000,
          "disbursementCents": 80000,
          "step1TrialBalanceCents": 20000,
          "targetBalanceCents": 350000,
          "projectedBalanceCents": -220000
        },
        {
          "month": 3,
          "calendarMonth": 11,
          "depositCents": 50000,
          "disbursementCents": 300000,
          "step1TrialBalanceCents": -230000,
          "targetBalanceCents": 100000,
          "projectedBalanceCents": -470000
        },
        {
          "month": 4,
          "calendarMonth": 12,
          "depositCents": 50000,
          "disbursementCents": 0,
          "step1TrialBalanceCents": -180000,
          "targetBalanceCents": 150000,
          "projectedBalanceCents": -420000
        },
        {
          "month": 5,
          "calendarMonth": 1,
          "depositCents": 50000,
          "disbursementCents": 0,
          "step1TrialBalanceCents": -130000,
          "targetBalanceCents": 200000,
          "projectedBalanceCents": -370000
        },
        {
          "month": 6,
          "calendarMonth": 2,
          "depositCents": 50000,
          "disbursementCents": 0,
          "step1TrialBalanceCents": -80000,
          "targetBalanceCents": 250000,
          "projectedBalanceCents": -320000
        },
        {
          "month": 7,
          "calendarMonth": 3,
          "depositCents": 50000,
          "disbursementCents": 0,
          "step1TrialBalanceCents": -30000,
          "targetBalanceCents": 300000,
          "projectedBalanceCents": -270000
        },
        {
          "month": 8,
          "calendarMonth": 4,
          "depositCents": 50000,
          "disbursementCents": 0,
          "step1TrialBalanceCents": 20000,
          "targetBalanceCents": 350000,
          "projectedBalanceCents": -220000
        },
        {
          "month": 9,
          "calendarMonth": 5,
          "depositCents": 50000,
          "disbursementCents": 0,
          "step1TrialBalanceCents": 70000,
          "targetBalanceCents": 400000,
          "projectedBalanceCents": -170000
        },
        {
          "month": 10,
          "calendarMonth": 6,
          "depositCents": 50000,
          "disbursementCents": 220000,
          "step1TrialBalanceCents": -100000,
          "targetBalanceCents": 230000,
          "projectedBalanceCents": -340000
        },
        {
          "month": 11,
          "calendarMonth": 7,
          "depositCents": 50000,
          "disbursementCents": 0,
          "step1TrialBalanceCents": -50000,
          "targetBalanceCents": 280000,
          "projectedBalanceCents": -290000
        },
        {
          "month": 12,
          "calendarMonth": 8,
          "depositCents": 50000,
          "disbursementCents": 0,
          "step1TrialBalanceCents": 0,
          "targetBalanceCents": 330000,
          "projectedBalanceCents": -240000
        }
      ],
      "nearLine": null
    },
    "publishedTables": {
      "note": "13 entries: starting row then months 1-12, exactly as printed in the source",
      "step1": null,
      "step2": null,
      "step3": [
        330000,
        380000,
        350000,
        100000,
        150000,
        200000,
        250000,
        300000,
        350000,
        400000,
        230000,
        280000,
        330000
      ]
    }
  },
  {
    "id": "TV05",
    "title": "Exactly on target - low point lands exactly on the cushion, surplus 0",
    "source": "DERIVED",
    "startMonth": 1,
    "inputs": {
      "startingBalanceCents": 120000,
      "cushionMonths": 2,
      "borrowerCurrent": true,
      "disbursements": [
        {
          "label": "Property tax 1st half",
          "month": 5,
          "amountCents": 180000
        },
        {
          "label": "Homeowners insurance",
          "month": 7,
          "amountCents": 120000
        },
        {
          "label": "Property tax 2nd half",
          "month": 11,
          "amountCents": 180000
        }
      ]
    },
    "expected": {
      "annualDisbursementsCents": 480000,
      "baseMonthlyPaymentCents": 40000,
      "cushionCapCents": 80000,
      "stepTwoAddCents": 40000,
      "requiredStartingBalanceCents": 120000,
      "differenceCents": 0,
      "surplusCents": 0,
      "shortageCents": 0,
      "deficiencyCents": 0,
      "lowPoint": {
        "projectedBalanceCents": 80000,
        "month": 11,
        "calendarMonth": 11,
        "lowestTargetBalanceCents": 80000
      },
      "classification": "ON_TARGET",
      "cite": "12 CFR 1024.17(d)(2)",
      "servicerOptions": [],
      "newMonthlyEscrowPayment": {
        "baseMonthlyCents": 40000,
        "shortageSpreadOver12Cents": 0,
        "deficiencySpreadCents": 0,
        "deficiencySpreadMonths": 0,
        "monthlyEscrowWhileRepayingDeficiencyCents": 40000,
        "monthlyEscrowAfterDeficiencyRepaidCents": 40000
      },
      "table": [
        {
          "month": 1,
          "calendarMonth": 1,
          "depositCents": 40000,
          "disbursementCents": 0,
          "step1TrialBalanceCents": 40000,
          "targetBalanceCents": 160000,
          "projectedBalanceCents": 160000
        },
        {
          "month": 2,
          "calendarMonth": 2,
          "depositCents": 40000,
          "disbursementCents": 0,
          "step1TrialBalanceCents": 80000,
          "targetBalanceCents": 200000,
          "projectedBalanceCents": 200000
        },
        {
          "month": 3,
          "calendarMonth": 3,
          "depositCents": 40000,
          "disbursementCents": 0,
          "step1TrialBalanceCents": 120000,
          "targetBalanceCents": 240000,
          "projectedBalanceCents": 240000
        },
        {
          "month": 4,
          "calendarMonth": 4,
          "depositCents": 40000,
          "disbursementCents": 0,
          "step1TrialBalanceCents": 160000,
          "targetBalanceCents": 280000,
          "projectedBalanceCents": 280000
        },
        {
          "month": 5,
          "calendarMonth": 5,
          "depositCents": 40000,
          "disbursementCents": 180000,
          "step1TrialBalanceCents": 20000,
          "targetBalanceCents": 140000,
          "projectedBalanceCents": 140000
        },
        {
          "month": 6,
          "calendarMonth": 6,
          "depositCents": 40000,
          "disbursementCents": 0,
          "step1TrialBalanceCents": 60000,
          "targetBalanceCents": 180000,
          "projectedBalanceCents": 180000
        },
        {
          "month": 7,
          "calendarMonth": 7,
          "depositCents": 40000,
          "disbursementCents": 120000,
          "step1TrialBalanceCents": -20000,
          "targetBalanceCents": 100000,
          "projectedBalanceCents": 100000
        },
        {
          "month": 8,
          "calendarMonth": 8,
          "depositCents": 40000,
          "disbursementCents": 0,
          "step1TrialBalanceCents": 20000,
          "targetBalanceCents": 140000,
          "projectedBalanceCents": 140000
        },
        {
          "month": 9,
          "calendarMonth": 9,
          "depositCents": 40000,
          "disbursementCents": 0,
          "step1TrialBalanceCents": 60000,
          "targetBalanceCents": 180000,
          "projectedBalanceCents": 180000
        },
        {
          "month": 10,
          "calendarMonth": 10,
          "depositCents": 40000,
          "disbursementCents": 0,
          "step1TrialBalanceCents": 100000,
          "targetBalanceCents": 220000,
          "projectedBalanceCents": 220000
        },
        {
          "month": 11,
          "calendarMonth": 11,
          "depositCents": 40000,
          "disbursementCents": 180000,
          "step1TrialBalanceCents": -40000,
          "targetBalanceCents": 80000,
          "projectedBalanceCents": 80000
        },
        {
          "month": 12,
          "calendarMonth": 12,
          "depositCents": 40000,
          "disbursementCents": 0,
          "step1TrialBalanceCents": 0,
          "targetBalanceCents": 120000,
          "projectedBalanceCents": 120000
        }
      ],
      "nearLine": null
    }
  },
  {
    "id": "TV06",
    "title": "Surplus of exactly $50.00 - refund REQUIRED ('greater than or equal to')",
    "source": "DERIVED",
    "startMonth": 1,
    "inputs": {
      "startingBalanceCents": 125000,
      "cushionMonths": 2,
      "borrowerCurrent": true,
      "disbursements": [
        {
          "label": "Property tax 1st half",
          "month": 5,
          "amountCents": 180000
        },
        {
          "label": "Homeowners insurance",
          "month": 7,
          "amountCents": 120000
        },
        {
          "label": "Property tax 2nd half",
          "month": 11,
          "amountCents": 180000
        }
      ]
    },
    "expected": {
      "annualDisbursementsCents": 480000,
      "baseMonthlyPaymentCents": 40000,
      "cushionCapCents": 80000,
      "stepTwoAddCents": 40000,
      "requiredStartingBalanceCents": 120000,
      "differenceCents": 5000,
      "surplusCents": 5000,
      "shortageCents": 0,
      "deficiencyCents": 0,
      "lowPoint": {
        "projectedBalanceCents": 85000,
        "month": 11,
        "calendarMonth": 11,
        "lowestTargetBalanceCents": 80000
      },
      "classification": "SURPLUS_REFUND_REQUIRED",
      "cite": "12 CFR 1024.17(f)(2)(i)",
      "servicerOptions": [
        "refund the surplus to the borrower within 30 days from the date of the analysis"
      ],
      "newMonthlyEscrowPayment": {
        "baseMonthlyCents": 40000,
        "shortageSpreadOver12Cents": 0,
        "deficiencySpreadCents": 0,
        "deficiencySpreadMonths": 0,
        "monthlyEscrowWhileRepayingDeficiencyCents": 40000,
        "monthlyEscrowAfterDeficiencyRepaidCents": 40000
      },
      "table": [
        {
          "month": 1,
          "calendarMonth": 1,
          "depositCents": 40000,
          "disbursementCents": 0,
          "step1TrialBalanceCents": 40000,
          "targetBalanceCents": 160000,
          "projectedBalanceCents": 165000
        },
        {
          "month": 2,
          "calendarMonth": 2,
          "depositCents": 40000,
          "disbursementCents": 0,
          "step1TrialBalanceCents": 80000,
          "targetBalanceCents": 200000,
          "projectedBalanceCents": 205000
        },
        {
          "month": 3,
          "calendarMonth": 3,
          "depositCents": 40000,
          "disbursementCents": 0,
          "step1TrialBalanceCents": 120000,
          "targetBalanceCents": 240000,
          "projectedBalanceCents": 245000
        },
        {
          "month": 4,
          "calendarMonth": 4,
          "depositCents": 40000,
          "disbursementCents": 0,
          "step1TrialBalanceCents": 160000,
          "targetBalanceCents": 280000,
          "projectedBalanceCents": 285000
        },
        {
          "month": 5,
          "calendarMonth": 5,
          "depositCents": 40000,
          "disbursementCents": 180000,
          "step1TrialBalanceCents": 20000,
          "targetBalanceCents": 140000,
          "projectedBalanceCents": 145000
        },
        {
          "month": 6,
          "calendarMonth": 6,
          "depositCents": 40000,
          "disbursementCents": 0,
          "step1TrialBalanceCents": 60000,
          "targetBalanceCents": 180000,
          "projectedBalanceCents": 185000
        },
        {
          "month": 7,
          "calendarMonth": 7,
          "depositCents": 40000,
          "disbursementCents": 120000,
          "step1TrialBalanceCents": -20000,
          "targetBalanceCents": 100000,
          "projectedBalanceCents": 105000
        },
        {
          "month": 8,
          "calendarMonth": 8,
          "depositCents": 40000,
          "disbursementCents": 0,
          "step1TrialBalanceCents": 20000,
          "targetBalanceCents": 140000,
          "projectedBalanceCents": 145000
        },
        {
          "month": 9,
          "calendarMonth": 9,
          "depositCents": 40000,
          "disbursementCents": 0,
          "step1TrialBalanceCents": 60000,
          "targetBalanceCents": 180000,
          "projectedBalanceCents": 185000
        },
        {
          "month": 10,
          "calendarMonth": 10,
          "depositCents": 40000,
          "disbursementCents": 0,
          "step1TrialBalanceCents": 100000,
          "targetBalanceCents": 220000,
          "projectedBalanceCents": 225000
        },
        {
          "month": 11,
          "calendarMonth": 11,
          "depositCents": 40000,
          "disbursementCents": 180000,
          "step1TrialBalanceCents": -40000,
          "targetBalanceCents": 80000,
          "projectedBalanceCents": 85000
        },
        {
          "month": 12,
          "calendarMonth": 12,
          "depositCents": 40000,
          "disbursementCents": 0,
          "step1TrialBalanceCents": 0,
          "targetBalanceCents": 120000,
          "projectedBalanceCents": 125000
        }
      ],
      "nearLine": {
        "line": "SURPLUS_50",
        "distanceCents": 0,
        "toleranceCents": 700
      }
    }
  },
  {
    "id": "TV07",
    "title": "Surplus of $49.99 - one cent under the threshold, refund OR credit",
    "source": "DERIVED",
    "startMonth": 1,
    "inputs": {
      "startingBalanceCents": 124999,
      "cushionMonths": 2,
      "borrowerCurrent": true,
      "disbursements": [
        {
          "label": "Property tax 1st half",
          "month": 5,
          "amountCents": 180000
        },
        {
          "label": "Homeowners insurance",
          "month": 7,
          "amountCents": 120000
        },
        {
          "label": "Property tax 2nd half",
          "month": 11,
          "amountCents": 180000
        }
      ]
    },
    "expected": {
      "annualDisbursementsCents": 480000,
      "baseMonthlyPaymentCents": 40000,
      "cushionCapCents": 80000,
      "stepTwoAddCents": 40000,
      "requiredStartingBalanceCents": 120000,
      "differenceCents": 4999,
      "surplusCents": 4999,
      "shortageCents": 0,
      "deficiencyCents": 0,
      "lowPoint": {
        "projectedBalanceCents": 84999,
        "month": 11,
        "calendarMonth": 11,
        "lowestTargetBalanceCents": 80000
      },
      "classification": "SURPLUS_UNDER_50",
      "cite": "12 CFR 1024.17(f)(2)(i)",
      "servicerOptions": [
        "refund the surplus to the borrower",
        "credit the surplus against next year's escrow payments"
      ],
      "newMonthlyEscrowPayment": {
        "baseMonthlyCents": 40000,
        "shortageSpreadOver12Cents": 0,
        "deficiencySpreadCents": 0,
        "deficiencySpreadMonths": 0,
        "monthlyEscrowWhileRepayingDeficiencyCents": 40000,
        "monthlyEscrowAfterDeficiencyRepaidCents": 40000
      },
      "table": [
        {
          "month": 1,
          "calendarMonth": 1,
          "depositCents": 40000,
          "disbursementCents": 0,
          "step1TrialBalanceCents": 40000,
          "targetBalanceCents": 160000,
          "projectedBalanceCents": 164999
        },
        {
          "month": 2,
          "calendarMonth": 2,
          "depositCents": 40000,
          "disbursementCents": 0,
          "step1TrialBalanceCents": 80000,
          "targetBalanceCents": 200000,
          "projectedBalanceCents": 204999
        },
        {
          "month": 3,
          "calendarMonth": 3,
          "depositCents": 40000,
          "disbursementCents": 0,
          "step1TrialBalanceCents": 120000,
          "targetBalanceCents": 240000,
          "projectedBalanceCents": 244999
        },
        {
          "month": 4,
          "calendarMonth": 4,
          "depositCents": 40000,
          "disbursementCents": 0,
          "step1TrialBalanceCents": 160000,
          "targetBalanceCents": 280000,
          "projectedBalanceCents": 284999
        },
        {
          "month": 5,
          "calendarMonth": 5,
          "depositCents": 40000,
          "disbursementCents": 180000,
          "step1TrialBalanceCents": 20000,
          "targetBalanceCents": 140000,
          "projectedBalanceCents": 144999
        },
        {
          "month": 6,
          "calendarMonth": 6,
          "depositCents": 40000,
          "disbursementCents": 0,
          "step1TrialBalanceCents": 60000,
          "targetBalanceCents": 180000,
          "projectedBalanceCents": 184999
        },
        {
          "month": 7,
          "calendarMonth": 7,
          "depositCents": 40000,
          "disbursementCents": 120000,
          "step1TrialBalanceCents": -20000,
          "targetBalanceCents": 100000,
          "projectedBalanceCents": 104999
        },
        {
          "month": 8,
          "calendarMonth": 8,
          "depositCents": 40000,
          "disbursementCents": 0,
          "step1TrialBalanceCents": 20000,
          "targetBalanceCents": 140000,
          "projectedBalanceCents": 144999
        },
        {
          "month": 9,
          "calendarMonth": 9,
          "depositCents": 40000,
          "disbursementCents": 0,
          "step1TrialBalanceCents": 60000,
          "targetBalanceCents": 180000,
          "projectedBalanceCents": 184999
        },
        {
          "month": 10,
          "calendarMonth": 10,
          "depositCents": 40000,
          "disbursementCents": 0,
          "step1TrialBalanceCents": 100000,
          "targetBalanceCents": 220000,
          "projectedBalanceCents": 224999
        },
        {
          "month": 11,
          "calendarMonth": 11,
          "depositCents": 40000,
          "disbursementCents": 180000,
          "step1TrialBalanceCents": -40000,
          "targetBalanceCents": 80000,
          "projectedBalanceCents": 84999
        },
        {
          "month": 12,
          "calendarMonth": 12,
          "depositCents": 40000,
          "disbursementCents": 0,
          "step1TrialBalanceCents": 0,
          "targetBalanceCents": 120000,
          "projectedBalanceCents": 124999
        }
      ],
      "nearLine": {
        "line": "SURPLUS_50",
        "distanceCents": 1,
        "toleranceCents": 700
      }
    }
  },
  {
    "id": "TV08",
    "title": "Surplus of $30.00 - refund OR credit",
    "source": "DERIVED",
    "startMonth": 1,
    "inputs": {
      "startingBalanceCents": 123000,
      "cushionMonths": 2,
      "borrowerCurrent": true,
      "disbursements": [
        {
          "label": "Property tax 1st half",
          "month": 5,
          "amountCents": 180000
        },
        {
          "label": "Homeowners insurance",
          "month": 7,
          "amountCents": 120000
        },
        {
          "label": "Property tax 2nd half",
          "month": 11,
          "amountCents": 180000
        }
      ]
    },
    "expected": {
      "annualDisbursementsCents": 480000,
      "baseMonthlyPaymentCents": 40000,
      "cushionCapCents": 80000,
      "stepTwoAddCents": 40000,
      "requiredStartingBalanceCents": 120000,
      "differenceCents": 3000,
      "surplusCents": 3000,
      "shortageCents": 0,
      "deficiencyCents": 0,
      "lowPoint": {
        "projectedBalanceCents": 83000,
        "month": 11,
        "calendarMonth": 11,
        "lowestTargetBalanceCents": 80000
      },
      "classification": "SURPLUS_UNDER_50",
      "cite": "12 CFR 1024.17(f)(2)(i)",
      "servicerOptions": [
        "refund the surplus to the borrower",
        "credit the surplus against next year's escrow payments"
      ],
      "newMonthlyEscrowPayment": {
        "baseMonthlyCents": 40000,
        "shortageSpreadOver12Cents": 0,
        "deficiencySpreadCents": 0,
        "deficiencySpreadMonths": 0,
        "monthlyEscrowWhileRepayingDeficiencyCents": 40000,
        "monthlyEscrowAfterDeficiencyRepaidCents": 40000
      },
      "table": [
        {
          "month": 1,
          "calendarMonth": 1,
          "depositCents": 40000,
          "disbursementCents": 0,
          "step1TrialBalanceCents": 40000,
          "targetBalanceCents": 160000,
          "projectedBalanceCents": 163000
        },
        {
          "month": 2,
          "calendarMonth": 2,
          "depositCents": 40000,
          "disbursementCents": 0,
          "step1TrialBalanceCents": 80000,
          "targetBalanceCents": 200000,
          "projectedBalanceCents": 203000
        },
        {
          "month": 3,
          "calendarMonth": 3,
          "depositCents": 40000,
          "disbursementCents": 0,
          "step1TrialBalanceCents": 120000,
          "targetBalanceCents": 240000,
          "projectedBalanceCents": 243000
        },
        {
          "month": 4,
          "calendarMonth": 4,
          "depositCents": 40000,
          "disbursementCents": 0,
          "step1TrialBalanceCents": 160000,
          "targetBalanceCents": 280000,
          "projectedBalanceCents": 283000
        },
        {
          "month": 5,
          "calendarMonth": 5,
          "depositCents": 40000,
          "disbursementCents": 180000,
          "step1TrialBalanceCents": 20000,
          "targetBalanceCents": 140000,
          "projectedBalanceCents": 143000
        },
        {
          "month": 6,
          "calendarMonth": 6,
          "depositCents": 40000,
          "disbursementCents": 0,
          "step1TrialBalanceCents": 60000,
          "targetBalanceCents": 180000,
          "projectedBalanceCents": 183000
        },
        {
          "month": 7,
          "calendarMonth": 7,
          "depositCents": 40000,
          "disbursementCents": 120000,
          "step1TrialBalanceCents": -20000,
          "targetBalanceCents": 100000,
          "projectedBalanceCents": 103000
        },
        {
          "month": 8,
          "calendarMonth": 8,
          "depositCents": 40000,
          "disbursementCents": 0,
          "step1TrialBalanceCents": 20000,
          "targetBalanceCents": 140000,
          "projectedBalanceCents": 143000
        },
        {
          "month": 9,
          "calendarMonth": 9,
          "depositCents": 40000,
          "disbursementCents": 0,
          "step1TrialBalanceCents": 60000,
          "targetBalanceCents": 180000,
          "projectedBalanceCents": 183000
        },
        {
          "month": 10,
          "calendarMonth": 10,
          "depositCents": 40000,
          "disbursementCents": 0,
          "step1TrialBalanceCents": 100000,
          "targetBalanceCents": 220000,
          "projectedBalanceCents": 223000
        },
        {
          "month": 11,
          "calendarMonth": 11,
          "depositCents": 40000,
          "disbursementCents": 180000,
          "step1TrialBalanceCents": -40000,
          "targetBalanceCents": 80000,
          "projectedBalanceCents": 83000
        },
        {
          "month": 12,
          "calendarMonth": 12,
          "depositCents": 40000,
          "disbursementCents": 0,
          "step1TrialBalanceCents": 0,
          "targetBalanceCents": 120000,
          "projectedBalanceCents": 123000
        }
      ],
      "nearLine": null
    }
  },
  {
    "id": "TV09",
    "title": "Shortage smaller than one month's escrow payment ($240 < $480)",
    "source": "DERIVED",
    "startMonth": 1,
    "inputs": {
      "startingBalanceCents": 216000,
      "cushionMonths": 2,
      "borrowerCurrent": true,
      "disbursements": [
        {
          "label": "Property tax 1st half",
          "month": 3,
          "amountCents": 216000
        },
        {
          "label": "Homeowners insurance",
          "month": 6,
          "amountCents": 144000
        },
        {
          "label": "Property tax 2nd half",
          "month": 9,
          "amountCents": 216000
        }
      ]
    },
    "expected": {
      "annualDisbursementsCents": 576000,
      "baseMonthlyPaymentCents": 48000,
      "cushionCapCents": 96000,
      "stepTwoAddCents": 144000,
      "requiredStartingBalanceCents": 240000,
      "differenceCents": -24000,
      "surplusCents": 0,
      "shortageCents": 24000,
      "deficiencyCents": 0,
      "lowPoint": {
        "projectedBalanceCents": 72000,
        "month": 9,
        "calendarMonth": 9,
        "lowestTargetBalanceCents": 96000
      },
      "classification": "SHORTAGE_LT_ONE_MONTH",
      "cite": "12 CFR 1024.17(f)(3)(i)",
      "servicerOptions": [
        "shortage: do nothing",
        "shortage: require repayment within 30 days",
        "shortage: require repayment in equal monthly payments over at least 12 months"
      ],
      "newMonthlyEscrowPayment": {
        "baseMonthlyCents": 48000,
        "shortageSpreadOver12Cents": 2000,
        "deficiencySpreadCents": 0,
        "deficiencySpreadMonths": 0,
        "monthlyEscrowWhileRepayingDeficiencyCents": 50000,
        "monthlyEscrowAfterDeficiencyRepaidCents": 50000
      },
      "table": [
        {
          "month": 1,
          "calendarMonth": 1,
          "depositCents": 48000,
          "disbursementCents": 0,
          "step1TrialBalanceCents": 48000,
          "targetBalanceCents": 288000,
          "projectedBalanceCents": 264000
        },
        {
          "month": 2,
          "calendarMonth": 2,
          "depositCents": 48000,
          "disbursementCents": 0,
          "step1TrialBalanceCents": 96000,
          "targetBalanceCents": 336000,
          "projectedBalanceCents": 312000
        },
        {
          "month": 3,
          "calendarMonth": 3,
          "depositCents": 48000,
          "disbursementCents": 216000,
          "step1TrialBalanceCents": -72000,
          "targetBalanceCents": 168000,
          "projectedBalanceCents": 144000
        },
        {
          "month": 4,
          "calendarMonth": 4,
          "depositCents": 48000,
          "disbursementCents": 0,
          "step1TrialBalanceCents": -24000,
          "targetBalanceCents": 216000,
          "projectedBalanceCents": 192000
        },
        {
          "month": 5,
          "calendarMonth": 5,
          "depositCents": 48000,
          "disbursementCents": 0,
          "step1TrialBalanceCents": 24000,
          "targetBalanceCents": 264000,
          "projectedBalanceCents": 240000
        },
        {
          "month": 6,
          "calendarMonth": 6,
          "depositCents": 48000,
          "disbursementCents": 144000,
          "step1TrialBalanceCents": -72000,
          "targetBalanceCents": 168000,
          "projectedBalanceCents": 144000
        },
        {
          "month": 7,
          "calendarMonth": 7,
          "depositCents": 48000,
          "disbursementCents": 0,
          "step1TrialBalanceCents": -24000,
          "targetBalanceCents": 216000,
          "projectedBalanceCents": 192000
        },
        {
          "month": 8,
          "calendarMonth": 8,
          "depositCents": 48000,
          "disbursementCents": 0,
          "step1TrialBalanceCents": 24000,
          "targetBalanceCents": 264000,
          "projectedBalanceCents": 240000
        },
        {
          "month": 9,
          "calendarMonth": 9,
          "depositCents": 48000,
          "disbursementCents": 216000,
          "step1TrialBalanceCents": -144000,
          "targetBalanceCents": 96000,
          "projectedBalanceCents": 72000
        },
        {
          "month": 10,
          "calendarMonth": 10,
          "depositCents": 48000,
          "disbursementCents": 0,
          "step1TrialBalanceCents": -96000,
          "targetBalanceCents": 144000,
          "projectedBalanceCents": 120000
        },
        {
          "month": 11,
          "calendarMonth": 11,
          "depositCents": 48000,
          "disbursementCents": 0,
          "step1TrialBalanceCents": -48000,
          "targetBalanceCents": 192000,
          "projectedBalanceCents": 168000
        },
        {
          "month": 12,
          "calendarMonth": 12,
          "depositCents": 48000,
          "disbursementCents": 0,
          "step1TrialBalanceCents": 0,
          "targetBalanceCents": 240000,
          "projectedBalanceCents": 216000
        }
      ],
      "nearLine": null
    }
  },
  {
    "id": "TV10",
    "title": "Shortage EXACTLY one month's escrow payment ($480.00 = $480.00) - falls in the 'greater than or equal to' tier",
    "source": "DERIVED",
    "startMonth": 1,
    "inputs": {
      "startingBalanceCents": 192000,
      "cushionMonths": 2,
      "borrowerCurrent": true,
      "disbursements": [
        {
          "label": "Property tax 1st half",
          "month": 3,
          "amountCents": 216000
        },
        {
          "label": "Homeowners insurance",
          "month": 6,
          "amountCents": 144000
        },
        {
          "label": "Property tax 2nd half",
          "month": 9,
          "amountCents": 216000
        }
      ]
    },
    "expected": {
      "annualDisbursementsCents": 576000,
      "baseMonthlyPaymentCents": 48000,
      "cushionCapCents": 96000,
      "stepTwoAddCents": 144000,
      "requiredStartingBalanceCents": 240000,
      "differenceCents": -48000,
      "surplusCents": 0,
      "shortageCents": 48000,
      "deficiencyCents": 0,
      "lowPoint": {
        "projectedBalanceCents": 48000,
        "month": 9,
        "calendarMonth": 9,
        "lowestTargetBalanceCents": 96000
      },
      "classification": "SHORTAGE_GE_ONE_MONTH",
      "cite": "12 CFR 1024.17(f)(3)(ii)",
      "servicerOptions": [
        "shortage: do nothing",
        "shortage: require repayment in equal monthly payments over at least 12 months"
      ],
      "newMonthlyEscrowPayment": {
        "baseMonthlyCents": 48000,
        "shortageSpreadOver12Cents": 4000,
        "deficiencySpreadCents": 0,
        "deficiencySpreadMonths": 0,
        "monthlyEscrowWhileRepayingDeficiencyCents": 52000,
        "monthlyEscrowAfterDeficiencyRepaidCents": 52000
      },
      "table": [
        {
          "month": 1,
          "calendarMonth": 1,
          "depositCents": 48000,
          "disbursementCents": 0,
          "step1TrialBalanceCents": 48000,
          "targetBalanceCents": 288000,
          "projectedBalanceCents": 240000
        },
        {
          "month": 2,
          "calendarMonth": 2,
          "depositCents": 48000,
          "disbursementCents": 0,
          "step1TrialBalanceCents": 96000,
          "targetBalanceCents": 336000,
          "projectedBalanceCents": 288000
        },
        {
          "month": 3,
          "calendarMonth": 3,
          "depositCents": 48000,
          "disbursementCents": 216000,
          "step1TrialBalanceCents": -72000,
          "targetBalanceCents": 168000,
          "projectedBalanceCents": 120000
        },
        {
          "month": 4,
          "calendarMonth": 4,
          "depositCents": 48000,
          "disbursementCents": 0,
          "step1TrialBalanceCents": -24000,
          "targetBalanceCents": 216000,
          "projectedBalanceCents": 168000
        },
        {
          "month": 5,
          "calendarMonth": 5,
          "depositCents": 48000,
          "disbursementCents": 0,
          "step1TrialBalanceCents": 24000,
          "targetBalanceCents": 264000,
          "projectedBalanceCents": 216000
        },
        {
          "month": 6,
          "calendarMonth": 6,
          "depositCents": 48000,
          "disbursementCents": 144000,
          "step1TrialBalanceCents": -72000,
          "targetBalanceCents": 168000,
          "projectedBalanceCents": 120000
        },
        {
          "month": 7,
          "calendarMonth": 7,
          "depositCents": 48000,
          "disbursementCents": 0,
          "step1TrialBalanceCents": -24000,
          "targetBalanceCents": 216000,
          "projectedBalanceCents": 168000
        },
        {
          "month": 8,
          "calendarMonth": 8,
          "depositCents": 48000,
          "disbursementCents": 0,
          "step1TrialBalanceCents": 24000,
          "targetBalanceCents": 264000,
          "projectedBalanceCents": 216000
        },
        {
          "month": 9,
          "calendarMonth": 9,
          "depositCents": 48000,
          "disbursementCents": 216000,
          "step1TrialBalanceCents": -144000,
          "targetBalanceCents": 96000,
          "projectedBalanceCents": 48000
        },
        {
          "month": 10,
          "calendarMonth": 10,
          "depositCents": 48000,
          "disbursementCents": 0,
          "step1TrialBalanceCents": -96000,
          "targetBalanceCents": 144000,
          "projectedBalanceCents": 96000
        },
        {
          "month": 11,
          "calendarMonth": 11,
          "depositCents": 48000,
          "disbursementCents": 0,
          "step1TrialBalanceCents": -48000,
          "targetBalanceCents": 192000,
          "projectedBalanceCents": 144000
        },
        {
          "month": 12,
          "calendarMonth": 12,
          "depositCents": 48000,
          "disbursementCents": 0,
          "step1TrialBalanceCents": 0,
          "targetBalanceCents": 240000,
          "projectedBalanceCents": 192000
        }
      ],
      "nearLine": {
        "line": "ONE_MONTH_PAYMENT",
        "distanceCents": 0,
        "toleranceCents": 700
      }
    }
  },
  {
    "id": "TV10b",
    "title": "Shortage one cent UNDER one month's payment ($479.99) - still the small-shortage tier",
    "source": "DERIVED",
    "startMonth": 1,
    "inputs": {
      "startingBalanceCents": 192001,
      "cushionMonths": 2,
      "borrowerCurrent": true,
      "disbursements": [
        {
          "label": "Property tax 1st half",
          "month": 3,
          "amountCents": 216000
        },
        {
          "label": "Homeowners insurance",
          "month": 6,
          "amountCents": 144000
        },
        {
          "label": "Property tax 2nd half",
          "month": 9,
          "amountCents": 216000
        }
      ]
    },
    "expected": {
      "annualDisbursementsCents": 576000,
      "baseMonthlyPaymentCents": 48000,
      "cushionCapCents": 96000,
      "stepTwoAddCents": 144000,
      "requiredStartingBalanceCents": 240000,
      "differenceCents": -47999,
      "surplusCents": 0,
      "shortageCents": 47999,
      "deficiencyCents": 0,
      "lowPoint": {
        "projectedBalanceCents": 48001,
        "month": 9,
        "calendarMonth": 9,
        "lowestTargetBalanceCents": 96000
      },
      "classification": "SHORTAGE_LT_ONE_MONTH",
      "cite": "12 CFR 1024.17(f)(3)(i)",
      "servicerOptions": [
        "shortage: do nothing",
        "shortage: require repayment within 30 days",
        "shortage: require repayment in equal monthly payments over at least 12 months"
      ],
      "newMonthlyEscrowPayment": {
        "baseMonthlyCents": 48000,
        "shortageSpreadOver12Cents": 4000,
        "deficiencySpreadCents": 0,
        "deficiencySpreadMonths": 0,
        "monthlyEscrowWhileRepayingDeficiencyCents": 52000,
        "monthlyEscrowAfterDeficiencyRepaidCents": 52000
      },
      "table": [
        {
          "month": 1,
          "calendarMonth": 1,
          "depositCents": 48000,
          "disbursementCents": 0,
          "step1TrialBalanceCents": 48000,
          "targetBalanceCents": 288000,
          "projectedBalanceCents": 240001
        },
        {
          "month": 2,
          "calendarMonth": 2,
          "depositCents": 48000,
          "disbursementCents": 0,
          "step1TrialBalanceCents": 96000,
          "targetBalanceCents": 336000,
          "projectedBalanceCents": 288001
        },
        {
          "month": 3,
          "calendarMonth": 3,
          "depositCents": 48000,
          "disbursementCents": 216000,
          "step1TrialBalanceCents": -72000,
          "targetBalanceCents": 168000,
          "projectedBalanceCents": 120001
        },
        {
          "month": 4,
          "calendarMonth": 4,
          "depositCents": 48000,
          "disbursementCents": 0,
          "step1TrialBalanceCents": -24000,
          "targetBalanceCents": 216000,
          "projectedBalanceCents": 168001
        },
        {
          "month": 5,
          "calendarMonth": 5,
          "depositCents": 48000,
          "disbursementCents": 0,
          "step1TrialBalanceCents": 24000,
          "targetBalanceCents": 264000,
          "projectedBalanceCents": 216001
        },
        {
          "month": 6,
          "calendarMonth": 6,
          "depositCents": 48000,
          "disbursementCents": 144000,
          "step1TrialBalanceCents": -72000,
          "targetBalanceCents": 168000,
          "projectedBalanceCents": 120001
        },
        {
          "month": 7,
          "calendarMonth": 7,
          "depositCents": 48000,
          "disbursementCents": 0,
          "step1TrialBalanceCents": -24000,
          "targetBalanceCents": 216000,
          "projectedBalanceCents": 168001
        },
        {
          "month": 8,
          "calendarMonth": 8,
          "depositCents": 48000,
          "disbursementCents": 0,
          "step1TrialBalanceCents": 24000,
          "targetBalanceCents": 264000,
          "projectedBalanceCents": 216001
        },
        {
          "month": 9,
          "calendarMonth": 9,
          "depositCents": 48000,
          "disbursementCents": 216000,
          "step1TrialBalanceCents": -144000,
          "targetBalanceCents": 96000,
          "projectedBalanceCents": 48001
        },
        {
          "month": 10,
          "calendarMonth": 10,
          "depositCents": 48000,
          "disbursementCents": 0,
          "step1TrialBalanceCents": -96000,
          "targetBalanceCents": 144000,
          "projectedBalanceCents": 96001
        },
        {
          "month": 11,
          "calendarMonth": 11,
          "depositCents": 48000,
          "disbursementCents": 0,
          "step1TrialBalanceCents": -48000,
          "targetBalanceCents": 192000,
          "projectedBalanceCents": 144001
        },
        {
          "month": 12,
          "calendarMonth": 12,
          "depositCents": 48000,
          "disbursementCents": 0,
          "step1TrialBalanceCents": 0,
          "targetBalanceCents": 240000,
          "projectedBalanceCents": 192001
        }
      ],
      "nearLine": {
        "line": "ONE_MONTH_PAYMENT",
        "distanceCents": 1,
        "toleranceCents": 700
      }
    }
  },
  {
    "id": "TV11",
    "title": "Shortage larger than one month's payment ($1,200 vs $480)",
    "source": "DERIVED",
    "startMonth": 1,
    "inputs": {
      "startingBalanceCents": 120000,
      "cushionMonths": 2,
      "borrowerCurrent": true,
      "disbursements": [
        {
          "label": "Property tax 1st half",
          "month": 3,
          "amountCents": 216000
        },
        {
          "label": "Homeowners insurance",
          "month": 6,
          "amountCents": 144000
        },
        {
          "label": "Property tax 2nd half",
          "month": 9,
          "amountCents": 216000
        }
      ]
    },
    "expected": {
      "annualDisbursementsCents": 576000,
      "baseMonthlyPaymentCents": 48000,
      "cushionCapCents": 96000,
      "stepTwoAddCents": 144000,
      "requiredStartingBalanceCents": 240000,
      "differenceCents": -120000,
      "surplusCents": 0,
      "shortageCents": 120000,
      "deficiencyCents": 0,
      "lowPoint": {
        "projectedBalanceCents": -24000,
        "month": 9,
        "calendarMonth": 9,
        "lowestTargetBalanceCents": 96000
      },
      "classification": "SHORTAGE_GE_ONE_MONTH",
      "cite": "12 CFR 1024.17(f)(3)(ii)",
      "servicerOptions": [
        "shortage: do nothing",
        "shortage: require repayment in equal monthly payments over at least 12 months"
      ],
      "newMonthlyEscrowPayment": {
        "baseMonthlyCents": 48000,
        "shortageSpreadOver12Cents": 10000,
        "deficiencySpreadCents": 0,
        "deficiencySpreadMonths": 0,
        "monthlyEscrowWhileRepayingDeficiencyCents": 58000,
        "monthlyEscrowAfterDeficiencyRepaidCents": 58000
      },
      "table": [
        {
          "month": 1,
          "calendarMonth": 1,
          "depositCents": 48000,
          "disbursementCents": 0,
          "step1TrialBalanceCents": 48000,
          "targetBalanceCents": 288000,
          "projectedBalanceCents": 168000
        },
        {
          "month": 2,
          "calendarMonth": 2,
          "depositCents": 48000,
          "disbursementCents": 0,
          "step1TrialBalanceCents": 96000,
          "targetBalanceCents": 336000,
          "projectedBalanceCents": 216000
        },
        {
          "month": 3,
          "calendarMonth": 3,
          "depositCents": 48000,
          "disbursementCents": 216000,
          "step1TrialBalanceCents": -72000,
          "targetBalanceCents": 168000,
          "projectedBalanceCents": 48000
        },
        {
          "month": 4,
          "calendarMonth": 4,
          "depositCents": 48000,
          "disbursementCents": 0,
          "step1TrialBalanceCents": -24000,
          "targetBalanceCents": 216000,
          "projectedBalanceCents": 96000
        },
        {
          "month": 5,
          "calendarMonth": 5,
          "depositCents": 48000,
          "disbursementCents": 0,
          "step1TrialBalanceCents": 24000,
          "targetBalanceCents": 264000,
          "projectedBalanceCents": 144000
        },
        {
          "month": 6,
          "calendarMonth": 6,
          "depositCents": 48000,
          "disbursementCents": 144000,
          "step1TrialBalanceCents": -72000,
          "targetBalanceCents": 168000,
          "projectedBalanceCents": 48000
        },
        {
          "month": 7,
          "calendarMonth": 7,
          "depositCents": 48000,
          "disbursementCents": 0,
          "step1TrialBalanceCents": -24000,
          "targetBalanceCents": 216000,
          "projectedBalanceCents": 96000
        },
        {
          "month": 8,
          "calendarMonth": 8,
          "depositCents": 48000,
          "disbursementCents": 0,
          "step1TrialBalanceCents": 24000,
          "targetBalanceCents": 264000,
          "projectedBalanceCents": 144000
        },
        {
          "month": 9,
          "calendarMonth": 9,
          "depositCents": 48000,
          "disbursementCents": 216000,
          "step1TrialBalanceCents": -144000,
          "targetBalanceCents": 96000,
          "projectedBalanceCents": -24000
        },
        {
          "month": 10,
          "calendarMonth": 10,
          "depositCents": 48000,
          "disbursementCents": 0,
          "step1TrialBalanceCents": -96000,
          "targetBalanceCents": 144000,
          "projectedBalanceCents": 24000
        },
        {
          "month": 11,
          "calendarMonth": 11,
          "depositCents": 48000,
          "disbursementCents": 0,
          "step1TrialBalanceCents": -48000,
          "targetBalanceCents": 192000,
          "projectedBalanceCents": 72000
        },
        {
          "month": 12,
          "calendarMonth": 12,
          "depositCents": 48000,
          "disbursementCents": 0,
          "step1TrialBalanceCents": 0,
          "targetBalanceCents": 240000,
          "projectedBalanceCents": 120000
        }
      ],
      "nearLine": null
    }
  },
  {
    "id": "TV12",
    "title": "Pure deficiency (balance is negative), zero cushion in the mortgage documents, single bill in month 12",
    "source": "DERIVED",
    "startMonth": 1,
    "inputs": {
      "startingBalanceCents": -15000,
      "cushionMonths": 0,
      "borrowerCurrent": true,
      "disbursements": [
        {
          "label": "Annual property tax",
          "month": 12,
          "amountCents": 240000
        }
      ]
    },
    "expected": {
      "annualDisbursementsCents": 240000,
      "baseMonthlyPaymentCents": 20000,
      "cushionCapCents": 0,
      "stepTwoAddCents": 0,
      "requiredStartingBalanceCents": 0,
      "differenceCents": -15000,
      "surplusCents": 0,
      "shortageCents": 0,
      "deficiencyCents": 15000,
      "lowPoint": {
        "projectedBalanceCents": -15000,
        "month": 12,
        "calendarMonth": 12,
        "lowestTargetBalanceCents": 0
      },
      "classification": "DEFICIENCY_LT_ONE_MONTH",
      "cite": "12 CFR 1024.17(f)(4)(i)",
      "servicerOptions": [
        "deficiency: do nothing",
        "deficiency: require repayment within 30 days",
        "deficiency: require repayment in 2 or more equal monthly payments"
      ],
      "newMonthlyEscrowPayment": {
        "baseMonthlyCents": 20000,
        "shortageSpreadOver12Cents": 0,
        "deficiencySpreadCents": 7500,
        "deficiencySpreadMonths": 2,
        "monthlyEscrowWhileRepayingDeficiencyCents": 27500,
        "monthlyEscrowAfterDeficiencyRepaidCents": 20000
      },
      "table": [
        {
          "month": 1,
          "calendarMonth": 1,
          "depositCents": 20000,
          "disbursementCents": 0,
          "step1TrialBalanceCents": 20000,
          "targetBalanceCents": 20000,
          "projectedBalanceCents": 5000
        },
        {
          "month": 2,
          "calendarMonth": 2,
          "depositCents": 20000,
          "disbursementCents": 0,
          "step1TrialBalanceCents": 40000,
          "targetBalanceCents": 40000,
          "projectedBalanceCents": 25000
        },
        {
          "month": 3,
          "calendarMonth": 3,
          "depositCents": 20000,
          "disbursementCents": 0,
          "step1TrialBalanceCents": 60000,
          "targetBalanceCents": 60000,
          "projectedBalanceCents": 45000
        },
        {
          "month": 4,
          "calendarMonth": 4,
          "depositCents": 20000,
          "disbursementCents": 0,
          "step1TrialBalanceCents": 80000,
          "targetBalanceCents": 80000,
          "projectedBalanceCents": 65000
        },
        {
          "month": 5,
          "calendarMonth": 5,
          "depositCents": 20000,
          "disbursementCents": 0,
          "step1TrialBalanceCents": 100000,
          "targetBalanceCents": 100000,
          "projectedBalanceCents": 85000
        },
        {
          "month": 6,
          "calendarMonth": 6,
          "depositCents": 20000,
          "disbursementCents": 0,
          "step1TrialBalanceCents": 120000,
          "targetBalanceCents": 120000,
          "projectedBalanceCents": 105000
        },
        {
          "month": 7,
          "calendarMonth": 7,
          "depositCents": 20000,
          "disbursementCents": 0,
          "step1TrialBalanceCents": 140000,
          "targetBalanceCents": 140000,
          "projectedBalanceCents": 125000
        },
        {
          "month": 8,
          "calendarMonth": 8,
          "depositCents": 20000,
          "disbursementCents": 0,
          "step1TrialBalanceCents": 160000,
          "targetBalanceCents": 160000,
          "projectedBalanceCents": 145000
        },
        {
          "month": 9,
          "calendarMonth": 9,
          "depositCents": 20000,
          "disbursementCents": 0,
          "step1TrialBalanceCents": 180000,
          "targetBalanceCents": 180000,
          "projectedBalanceCents": 165000
        },
        {
          "month": 10,
          "calendarMonth": 10,
          "depositCents": 20000,
          "disbursementCents": 0,
          "step1TrialBalanceCents": 200000,
          "targetBalanceCents": 200000,
          "projectedBalanceCents": 185000
        },
        {
          "month": 11,
          "calendarMonth": 11,
          "depositCents": 20000,
          "disbursementCents": 0,
          "step1TrialBalanceCents": 220000,
          "targetBalanceCents": 220000,
          "projectedBalanceCents": 205000
        },
        {
          "month": 12,
          "calendarMonth": 12,
          "depositCents": 20000,
          "disbursementCents": 240000,
          "step1TrialBalanceCents": 0,
          "targetBalanceCents": 0,
          "projectedBalanceCents": -15000
        }
      ],
      "nearLine": null
    }
  },
  {
    "id": "TV13",
    "title": "Computation year starting in April (not January) - surplus $100",
    "source": "DERIVED",
    "startMonth": 4,
    "inputs": {
      "startingBalanceCents": 100000,
      "cushionMonths": 2,
      "borrowerCurrent": true,
      "disbursements": [
        {
          "label": "Property tax (September)",
          "month": 6,
          "amountCents": 120000
        },
        {
          "label": "Property tax (January)",
          "month": 10,
          "amountCents": 120000
        },
        {
          "label": "Homeowners insurance (February)",
          "month": 11,
          "amountCents": 120000
        }
      ]
    },
    "expected": {
      "annualDisbursementsCents": 360000,
      "baseMonthlyPaymentCents": 30000,
      "cushionCapCents": 60000,
      "stepTwoAddCents": 30000,
      "requiredStartingBalanceCents": 90000,
      "differenceCents": 10000,
      "surplusCents": 10000,
      "shortageCents": 0,
      "deficiencyCents": 0,
      "lowPoint": {
        "projectedBalanceCents": 70000,
        "month": 11,
        "calendarMonth": 2,
        "lowestTargetBalanceCents": 60000
      },
      "classification": "SURPLUS_REFUND_REQUIRED",
      "cite": "12 CFR 1024.17(f)(2)(i)",
      "servicerOptions": [
        "refund the surplus to the borrower within 30 days from the date of the analysis"
      ],
      "newMonthlyEscrowPayment": {
        "baseMonthlyCents": 30000,
        "shortageSpreadOver12Cents": 0,
        "deficiencySpreadCents": 0,
        "deficiencySpreadMonths": 0,
        "monthlyEscrowWhileRepayingDeficiencyCents": 30000,
        "monthlyEscrowAfterDeficiencyRepaidCents": 30000
      },
      "table": [
        {
          "month": 1,
          "calendarMonth": 4,
          "depositCents": 30000,
          "disbursementCents": 0,
          "step1TrialBalanceCents": 30000,
          "targetBalanceCents": 120000,
          "projectedBalanceCents": 130000
        },
        {
          "month": 2,
          "calendarMonth": 5,
          "depositCents": 30000,
          "disbursementCents": 0,
          "step1TrialBalanceCents": 60000,
          "targetBalanceCents": 150000,
          "projectedBalanceCents": 160000
        },
        {
          "month": 3,
          "calendarMonth": 6,
          "depositCents": 30000,
          "disbursementCents": 0,
          "step1TrialBalanceCents": 90000,
          "targetBalanceCents": 180000,
          "projectedBalanceCents": 190000
        },
        {
          "month": 4,
          "calendarMonth": 7,
          "depositCents": 30000,
          "disbursementCents": 0,
          "step1TrialBalanceCents": 120000,
          "targetBalanceCents": 210000,
          "projectedBalanceCents": 220000
        },
        {
          "month": 5,
          "calendarMonth": 8,
          "depositCents": 30000,
          "disbursementCents": 0,
          "step1TrialBalanceCents": 150000,
          "targetBalanceCents": 240000,
          "projectedBalanceCents": 250000
        },
        {
          "month": 6,
          "calendarMonth": 9,
          "depositCents": 30000,
          "disbursementCents": 120000,
          "step1TrialBalanceCents": 60000,
          "targetBalanceCents": 150000,
          "projectedBalanceCents": 160000
        },
        {
          "month": 7,
          "calendarMonth": 10,
          "depositCents": 30000,
          "disbursementCents": 0,
          "step1TrialBalanceCents": 90000,
          "targetBalanceCents": 180000,
          "projectedBalanceCents": 190000
        },
        {
          "month": 8,
          "calendarMonth": 11,
          "depositCents": 30000,
          "disbursementCents": 0,
          "step1TrialBalanceCents": 120000,
          "targetBalanceCents": 210000,
          "projectedBalanceCents": 220000
        },
        {
          "month": 9,
          "calendarMonth": 12,
          "depositCents": 30000,
          "disbursementCents": 0,
          "step1TrialBalanceCents": 150000,
          "targetBalanceCents": 240000,
          "projectedBalanceCents": 250000
        },
        {
          "month": 10,
          "calendarMonth": 1,
          "depositCents": 30000,
          "disbursementCents": 120000,
          "step1TrialBalanceCents": 60000,
          "targetBalanceCents": 150000,
          "projectedBalanceCents": 160000
        },
        {
          "month": 11,
          "calendarMonth": 2,
          "depositCents": 30000,
          "disbursementCents": 120000,
          "step1TrialBalanceCents": -30000,
          "targetBalanceCents": 60000,
          "projectedBalanceCents": 70000
        },
        {
          "month": 12,
          "calendarMonth": 3,
          "depositCents": 30000,
          "disbursementCents": 0,
          "step1TrialBalanceCents": 0,
          "targetBalanceCents": 90000,
          "projectedBalanceCents": 100000
        }
      ],
      "nearLine": null
    }
  },
  {
    "id": "TV14",
    "title": "Two bills in the same month, plus a bill in month 1 and a bill in month 12",
    "source": "DERIVED",
    "startMonth": 1,
    "inputs": {
      "startingBalanceCents": 170000,
      "cushionMonths": 2,
      "borrowerCurrent": true,
      "disbursements": [
        {
          "label": "Homeowners insurance",
          "month": 1,
          "amountCents": 150000
        },
        {
          "label": "County tax",
          "month": 7,
          "amountCents": 110000
        },
        {
          "label": "City tax",
          "month": 7,
          "amountCents": 70000
        },
        {
          "label": "Flood insurance",
          "month": 12,
          "amountCents": 90000
        }
      ]
    },
    "expected": {
      "annualDisbursementsCents": 420000,
      "baseMonthlyPaymentCents": 35000,
      "cushionCapCents": 70000,
      "stepTwoAddCents": 115000,
      "requiredStartingBalanceCents": 185000,
      "differenceCents": -15000,
      "surplusCents": 0,
      "shortageCents": 15000,
      "deficiencyCents": 0,
      "lowPoint": {
        "projectedBalanceCents": 55000,
        "month": 1,
        "calendarMonth": 1,
        "lowestTargetBalanceCents": 70000
      },
      "classification": "SHORTAGE_LT_ONE_MONTH",
      "cite": "12 CFR 1024.17(f)(3)(i)",
      "servicerOptions": [
        "shortage: do nothing",
        "shortage: require repayment within 30 days",
        "shortage: require repayment in equal monthly payments over at least 12 months"
      ],
      "newMonthlyEscrowPayment": {
        "baseMonthlyCents": 35000,
        "shortageSpreadOver12Cents": 1250,
        "deficiencySpreadCents": 0,
        "deficiencySpreadMonths": 0,
        "monthlyEscrowWhileRepayingDeficiencyCents": 36250,
        "monthlyEscrowAfterDeficiencyRepaidCents": 36250
      },
      "table": [
        {
          "month": 1,
          "calendarMonth": 1,
          "depositCents": 35000,
          "disbursementCents": 150000,
          "step1TrialBalanceCents": -115000,
          "targetBalanceCents": 70000,
          "projectedBalanceCents": 55000
        },
        {
          "month": 2,
          "calendarMonth": 2,
          "depositCents": 35000,
          "disbursementCents": 0,
          "step1TrialBalanceCents": -80000,
          "targetBalanceCents": 105000,
          "projectedBalanceCents": 90000
        },
        {
          "month": 3,
          "calendarMonth": 3,
          "depositCents": 35000,
          "disbursementCents": 0,
          "step1TrialBalanceCents": -45000,
          "targetBalanceCents": 140000,
          "projectedBalanceCents": 125000
        },
        {
          "month": 4,
          "calendarMonth": 4,
          "depositCents": 35000,
          "disbursementCents": 0,
          "step1TrialBalanceCents": -10000,
          "targetBalanceCents": 175000,
          "projectedBalanceCents": 160000
        },
        {
          "month": 5,
          "calendarMonth": 5,
          "depositCents": 35000,
          "disbursementCents": 0,
          "step1TrialBalanceCents": 25000,
          "targetBalanceCents": 210000,
          "projectedBalanceCents": 195000
        },
        {
          "month": 6,
          "calendarMonth": 6,
          "depositCents": 35000,
          "disbursementCents": 0,
          "step1TrialBalanceCents": 60000,
          "targetBalanceCents": 245000,
          "projectedBalanceCents": 230000
        },
        {
          "month": 7,
          "calendarMonth": 7,
          "depositCents": 35000,
          "disbursementCents": 180000,
          "step1TrialBalanceCents": -85000,
          "targetBalanceCents": 100000,
          "projectedBalanceCents": 85000
        },
        {
          "month": 8,
          "calendarMonth": 8,
          "depositCents": 35000,
          "disbursementCents": 0,
          "step1TrialBalanceCents": -50000,
          "targetBalanceCents": 135000,
          "projectedBalanceCents": 120000
        },
        {
          "month": 9,
          "calendarMonth": 9,
          "depositCents": 35000,
          "disbursementCents": 0,
          "step1TrialBalanceCents": -15000,
          "targetBalanceCents": 170000,
          "projectedBalanceCents": 155000
        },
        {
          "month": 10,
          "calendarMonth": 10,
          "depositCents": 35000,
          "disbursementCents": 0,
          "step1TrialBalanceCents": 20000,
          "targetBalanceCents": 205000,
          "projectedBalanceCents": 190000
        },
        {
          "month": 11,
          "calendarMonth": 11,
          "depositCents": 35000,
          "disbursementCents": 0,
          "step1TrialBalanceCents": 55000,
          "targetBalanceCents": 240000,
          "projectedBalanceCents": 225000
        },
        {
          "month": 12,
          "calendarMonth": 12,
          "depositCents": 35000,
          "disbursementCents": 90000,
          "step1TrialBalanceCents": 0,
          "targetBalanceCents": 185000,
          "projectedBalanceCents": 170000
        }
      ],
      "nearLine": null
    }
  },
  {
    "id": "TV15",
    "title": "Annual total NOT divisible by 12 to the cent ($5,000.00) - documents the rounding CHOICE",
    "source": "DERIVED (rounding convention is a choice, not law)",
    "startMonth": 1,
    "inputs": {
      "startingBalanceCents": 170000,
      "cushionMonths": 2,
      "borrowerCurrent": true,
      "disbursements": [
        {
          "label": "Property tax 1st half",
          "month": 4,
          "amountCents": 190000
        },
        {
          "label": "Homeowners insurance",
          "month": 8,
          "amountCents": 120000
        },
        {
          "label": "Property tax 2nd half",
          "month": 10,
          "amountCents": 190000
        }
      ]
    },
    "expected": {
      "annualDisbursementsCents": 500000,
      "baseMonthlyPaymentCents": 41667,
      "cushionCapCents": 83333,
      "stepTwoAddCents": 83330,
      "requiredStartingBalanceCents": 166663,
      "differenceCents": 3337,
      "surplusCents": 3337,
      "shortageCents": 0,
      "deficiencyCents": 0,
      "lowPoint": {
        "projectedBalanceCents": 86670,
        "month": 10,
        "calendarMonth": 10,
        "lowestTargetBalanceCents": 83333
      },
      "classification": "SURPLUS_UNDER_50",
      "cite": "12 CFR 1024.17(f)(2)(i)",
      "servicerOptions": [
        "refund the surplus to the borrower",
        "credit the surplus against next year's escrow payments"
      ],
      "newMonthlyEscrowPayment": {
        "baseMonthlyCents": 41667,
        "shortageSpreadOver12Cents": 0,
        "deficiencySpreadCents": 0,
        "deficiencySpreadMonths": 0,
        "monthlyEscrowWhileRepayingDeficiencyCents": 41667,
        "monthlyEscrowAfterDeficiencyRepaidCents": 41667
      },
      "table": [
        {
          "month": 1,
          "calendarMonth": 1,
          "depositCents": 41667,
          "disbursementCents": 0,
          "step1TrialBalanceCents": 41667,
          "targetBalanceCents": 208330,
          "projectedBalanceCents": 211667
        },
        {
          "month": 2,
          "calendarMonth": 2,
          "depositCents": 41667,
          "disbursementCents": 0,
          "step1TrialBalanceCents": 83334,
          "targetBalanceCents": 249997,
          "projectedBalanceCents": 253334
        },
        {
          "month": 3,
          "calendarMonth": 3,
          "depositCents": 41667,
          "disbursementCents": 0,
          "step1TrialBalanceCents": 125001,
          "targetBalanceCents": 291664,
          "projectedBalanceCents": 295001
        },
        {
          "month": 4,
          "calendarMonth": 4,
          "depositCents": 41667,
          "disbursementCents": 190000,
          "step1TrialBalanceCents": -23332,
          "targetBalanceCents": 143331,
          "projectedBalanceCents": 146668
        },
        {
          "month": 5,
          "calendarMonth": 5,
          "depositCents": 41667,
          "disbursementCents": 0,
          "step1TrialBalanceCents": 18335,
          "targetBalanceCents": 184998,
          "projectedBalanceCents": 188335
        },
        {
          "month": 6,
          "calendarMonth": 6,
          "depositCents": 41667,
          "disbursementCents": 0,
          "step1TrialBalanceCents": 60002,
          "targetBalanceCents": 226665,
          "projectedBalanceCents": 230002
        },
        {
          "month": 7,
          "calendarMonth": 7,
          "depositCents": 41667,
          "disbursementCents": 0,
          "step1TrialBalanceCents": 101669,
          "targetBalanceCents": 268332,
          "projectedBalanceCents": 271669
        },
        {
          "month": 8,
          "calendarMonth": 8,
          "depositCents": 41667,
          "disbursementCents": 120000,
          "step1TrialBalanceCents": 23336,
          "targetBalanceCents": 189999,
          "projectedBalanceCents": 193336
        },
        {
          "month": 9,
          "calendarMonth": 9,
          "depositCents": 41667,
          "disbursementCents": 0,
          "step1TrialBalanceCents": 65003,
          "targetBalanceCents": 231666,
          "projectedBalanceCents": 235003
        },
        {
          "month": 10,
          "calendarMonth": 10,
          "depositCents": 41667,
          "disbursementCents": 190000,
          "step1TrialBalanceCents": -83330,
          "targetBalanceCents": 83333,
          "projectedBalanceCents": 86670
        },
        {
          "month": 11,
          "calendarMonth": 11,
          "depositCents": 41667,
          "disbursementCents": 0,
          "step1TrialBalanceCents": -41663,
          "targetBalanceCents": 125000,
          "projectedBalanceCents": 128337
        },
        {
          "month": 12,
          "calendarMonth": 12,
          "depositCents": 41667,
          "disbursementCents": 0,
          "step1TrialBalanceCents": 4,
          "targetBalanceCents": 166667,
          "projectedBalanceCents": 170004
        }
      ],
      "exactArithmeticReference": {
        "note": "What you get with NO rounding until the end. Not the expected value - shown so the rounding drift is visible.",
        "requiredStartingBalanceExactCents": 166666.66666666666,
        "surplusExactCents": 3333.333333333343
      },
      "nearLine": null
    }
  },
  {
    "id": "TV16",
    "title": "Lower cushion - mortgage documents allow only ONE month",
    "source": "DERIVED",
    "startMonth": 1,
    "inputs": {
      "startingBalanceCents": 150000,
      "cushionMonths": 1,
      "borrowerCurrent": true,
      "disbursements": [
        {
          "label": "Property tax 1st half",
          "month": 5,
          "amountCents": 180000
        },
        {
          "label": "Homeowners insurance",
          "month": 7,
          "amountCents": 120000
        },
        {
          "label": "Property tax 2nd half",
          "month": 11,
          "amountCents": 180000
        }
      ]
    },
    "expected": {
      "annualDisbursementsCents": 480000,
      "baseMonthlyPaymentCents": 40000,
      "cushionCapCents": 40000,
      "stepTwoAddCents": 40000,
      "requiredStartingBalanceCents": 80000,
      "differenceCents": 70000,
      "surplusCents": 70000,
      "shortageCents": 0,
      "deficiencyCents": 0,
      "lowPoint": {
        "projectedBalanceCents": 110000,
        "month": 11,
        "calendarMonth": 11,
        "lowestTargetBalanceCents": 40000
      },
      "classification": "SURPLUS_REFUND_REQUIRED",
      "cite": "12 CFR 1024.17(f)(2)(i)",
      "servicerOptions": [
        "refund the surplus to the borrower within 30 days from the date of the analysis"
      ],
      "newMonthlyEscrowPayment": {
        "baseMonthlyCents": 40000,
        "shortageSpreadOver12Cents": 0,
        "deficiencySpreadCents": 0,
        "deficiencySpreadMonths": 0,
        "monthlyEscrowWhileRepayingDeficiencyCents": 40000,
        "monthlyEscrowAfterDeficiencyRepaidCents": 40000
      },
      "table": [
        {
          "month": 1,
          "calendarMonth": 1,
          "depositCents": 40000,
          "disbursementCents": 0,
          "step1TrialBalanceCents": 40000,
          "targetBalanceCents": 120000,
          "projectedBalanceCents": 190000
        },
        {
          "month": 2,
          "calendarMonth": 2,
          "depositCents": 40000,
          "disbursementCents": 0,
          "step1TrialBalanceCents": 80000,
          "targetBalanceCents": 160000,
          "projectedBalanceCents": 230000
        },
        {
          "month": 3,
          "calendarMonth": 3,
          "depositCents": 40000,
          "disbursementCents": 0,
          "step1TrialBalanceCents": 120000,
          "targetBalanceCents": 200000,
          "projectedBalanceCents": 270000
        },
        {
          "month": 4,
          "calendarMonth": 4,
          "depositCents": 40000,
          "disbursementCents": 0,
          "step1TrialBalanceCents": 160000,
          "targetBalanceCents": 240000,
          "projectedBalanceCents": 310000
        },
        {
          "month": 5,
          "calendarMonth": 5,
          "depositCents": 40000,
          "disbursementCents": 180000,
          "step1TrialBalanceCents": 20000,
          "targetBalanceCents": 100000,
          "projectedBalanceCents": 170000
        },
        {
          "month": 6,
          "calendarMonth": 6,
          "depositCents": 40000,
          "disbursementCents": 0,
          "step1TrialBalanceCents": 60000,
          "targetBalanceCents": 140000,
          "projectedBalanceCents": 210000
        },
        {
          "month": 7,
          "calendarMonth": 7,
          "depositCents": 40000,
          "disbursementCents": 120000,
          "step1TrialBalanceCents": -20000,
          "targetBalanceCents": 60000,
          "projectedBalanceCents": 130000
        },
        {
          "month": 8,
          "calendarMonth": 8,
          "depositCents": 40000,
          "disbursementCents": 0,
          "step1TrialBalanceCents": 20000,
          "targetBalanceCents": 100000,
          "projectedBalanceCents": 170000
        },
        {
          "month": 9,
          "calendarMonth": 9,
          "depositCents": 40000,
          "disbursementCents": 0,
          "step1TrialBalanceCents": 60000,
          "targetBalanceCents": 140000,
          "projectedBalanceCents": 210000
        },
        {
          "month": 10,
          "calendarMonth": 10,
          "depositCents": 40000,
          "disbursementCents": 0,
          "step1TrialBalanceCents": 100000,
          "targetBalanceCents": 180000,
          "projectedBalanceCents": 250000
        },
        {
          "month": 11,
          "calendarMonth": 11,
          "depositCents": 40000,
          "disbursementCents": 180000,
          "step1TrialBalanceCents": -40000,
          "targetBalanceCents": 40000,
          "projectedBalanceCents": 110000
        },
        {
          "month": 12,
          "calendarMonth": 12,
          "depositCents": 40000,
          "disbursementCents": 0,
          "step1TrialBalanceCents": 0,
          "targetBalanceCents": 80000,
          "projectedBalanceCents": 150000
        }
      ],
      "nearLine": null
    }
  },
  {
    "id": "TV17",
    "title": "Lower cushion - mortgage documents allow ZERO cushion",
    "source": "DERIVED",
    "startMonth": 1,
    "inputs": {
      "startingBalanceCents": 150000,
      "cushionMonths": 0,
      "borrowerCurrent": true,
      "disbursements": [
        {
          "label": "Property tax 1st half",
          "month": 5,
          "amountCents": 180000
        },
        {
          "label": "Homeowners insurance",
          "month": 7,
          "amountCents": 120000
        },
        {
          "label": "Property tax 2nd half",
          "month": 11,
          "amountCents": 180000
        }
      ]
    },
    "expected": {
      "annualDisbursementsCents": 480000,
      "baseMonthlyPaymentCents": 40000,
      "cushionCapCents": 0,
      "stepTwoAddCents": 40000,
      "requiredStartingBalanceCents": 40000,
      "differenceCents": 110000,
      "surplusCents": 110000,
      "shortageCents": 0,
      "deficiencyCents": 0,
      "lowPoint": {
        "projectedBalanceCents": 110000,
        "month": 11,
        "calendarMonth": 11,
        "lowestTargetBalanceCents": 0
      },
      "classification": "SURPLUS_REFUND_REQUIRED",
      "cite": "12 CFR 1024.17(f)(2)(i)",
      "servicerOptions": [
        "refund the surplus to the borrower within 30 days from the date of the analysis"
      ],
      "newMonthlyEscrowPayment": {
        "baseMonthlyCents": 40000,
        "shortageSpreadOver12Cents": 0,
        "deficiencySpreadCents": 0,
        "deficiencySpreadMonths": 0,
        "monthlyEscrowWhileRepayingDeficiencyCents": 40000,
        "monthlyEscrowAfterDeficiencyRepaidCents": 40000
      },
      "table": [
        {
          "month": 1,
          "calendarMonth": 1,
          "depositCents": 40000,
          "disbursementCents": 0,
          "step1TrialBalanceCents": 40000,
          "targetBalanceCents": 80000,
          "projectedBalanceCents": 190000
        },
        {
          "month": 2,
          "calendarMonth": 2,
          "depositCents": 40000,
          "disbursementCents": 0,
          "step1TrialBalanceCents": 80000,
          "targetBalanceCents": 120000,
          "projectedBalanceCents": 230000
        },
        {
          "month": 3,
          "calendarMonth": 3,
          "depositCents": 40000,
          "disbursementCents": 0,
          "step1TrialBalanceCents": 120000,
          "targetBalanceCents": 160000,
          "projectedBalanceCents": 270000
        },
        {
          "month": 4,
          "calendarMonth": 4,
          "depositCents": 40000,
          "disbursementCents": 0,
          "step1TrialBalanceCents": 160000,
          "targetBalanceCents": 200000,
          "projectedBalanceCents": 310000
        },
        {
          "month": 5,
          "calendarMonth": 5,
          "depositCents": 40000,
          "disbursementCents": 180000,
          "step1TrialBalanceCents": 20000,
          "targetBalanceCents": 60000,
          "projectedBalanceCents": 170000
        },
        {
          "month": 6,
          "calendarMonth": 6,
          "depositCents": 40000,
          "disbursementCents": 0,
          "step1TrialBalanceCents": 60000,
          "targetBalanceCents": 100000,
          "projectedBalanceCents": 210000
        },
        {
          "month": 7,
          "calendarMonth": 7,
          "depositCents": 40000,
          "disbursementCents": 120000,
          "step1TrialBalanceCents": -20000,
          "targetBalanceCents": 20000,
          "projectedBalanceCents": 130000
        },
        {
          "month": 8,
          "calendarMonth": 8,
          "depositCents": 40000,
          "disbursementCents": 0,
          "step1TrialBalanceCents": 20000,
          "targetBalanceCents": 60000,
          "projectedBalanceCents": 170000
        },
        {
          "month": 9,
          "calendarMonth": 9,
          "depositCents": 40000,
          "disbursementCents": 0,
          "step1TrialBalanceCents": 60000,
          "targetBalanceCents": 100000,
          "projectedBalanceCents": 210000
        },
        {
          "month": 10,
          "calendarMonth": 10,
          "depositCents": 40000,
          "disbursementCents": 0,
          "step1TrialBalanceCents": 100000,
          "targetBalanceCents": 140000,
          "projectedBalanceCents": 250000
        },
        {
          "month": 11,
          "calendarMonth": 11,
          "depositCents": 40000,
          "disbursementCents": 180000,
          "step1TrialBalanceCents": -40000,
          "targetBalanceCents": 0,
          "projectedBalanceCents": 110000
        },
        {
          "month": 12,
          "calendarMonth": 12,
          "depositCents": 40000,
          "disbursementCents": 0,
          "step1TrialBalanceCents": 0,
          "targetBalanceCents": 40000,
          "projectedBalanceCents": 150000
        }
      ],
      "nearLine": null
    }
  },
  {
    "id": "TV18",
    "title": "'Why did my payment jump?' - bills rose $900; shows what breaks if last year's payment is typed in as the deposit",
    "source": "DERIVED",
    "startMonth": 1,
    "inputs": {
      "startingBalanceCents": 112500,
      "cushionMonths": 2,
      "borrowerCurrent": true,
      "disbursements": [
        {
          "label": "Property tax 1st half",
          "month": 5,
          "amountCents": 210000
        },
        {
          "label": "Homeowners insurance",
          "month": 7,
          "amountCents": 150000
        },
        {
          "label": "Property tax 2nd half",
          "month": 11,
          "amountCents": 210000
        }
      ],
      "priorYear": {
        "annualDisbursementsCents": 480000,
        "monthlyEscrowCents": 40000,
        "cushionCents": 80000,
        "stepTwoAddCents": 40000
      }
    },
    "expected": {
      "annualDisbursementsCents": 570000,
      "baseMonthlyPaymentCents": 47500,
      "cushionCapCents": 95000,
      "stepTwoAddCents": 47500,
      "requiredStartingBalanceCents": 142500,
      "differenceCents": -30000,
      "surplusCents": 0,
      "shortageCents": 30000,
      "deficiencyCents": 0,
      "lowPoint": {
        "projectedBalanceCents": 65000,
        "month": 11,
        "calendarMonth": 11,
        "lowestTargetBalanceCents": 95000
      },
      "classification": "SHORTAGE_LT_ONE_MONTH",
      "cite": "12 CFR 1024.17(f)(3)(i)",
      "servicerOptions": [
        "shortage: do nothing",
        "shortage: require repayment within 30 days",
        "shortage: require repayment in equal monthly payments over at least 12 months"
      ],
      "newMonthlyEscrowPayment": {
        "baseMonthlyCents": 47500,
        "shortageSpreadOver12Cents": 2500,
        "deficiencySpreadCents": 0,
        "deficiencySpreadMonths": 0,
        "monthlyEscrowWhileRepayingDeficiencyCents": 50000,
        "monthlyEscrowAfterDeficiencyRepaidCents": 50000
      },
      "table": [
        {
          "month": 1,
          "calendarMonth": 1,
          "depositCents": 47500,
          "disbursementCents": 0,
          "step1TrialBalanceCents": 47500,
          "targetBalanceCents": 190000,
          "projectedBalanceCents": 160000
        },
        {
          "month": 2,
          "calendarMonth": 2,
          "depositCents": 47500,
          "disbursementCents": 0,
          "step1TrialBalanceCents": 95000,
          "targetBalanceCents": 237500,
          "projectedBalanceCents": 207500
        },
        {
          "month": 3,
          "calendarMonth": 3,
          "depositCents": 47500,
          "disbursementCents": 0,
          "step1TrialBalanceCents": 142500,
          "targetBalanceCents": 285000,
          "projectedBalanceCents": 255000
        },
        {
          "month": 4,
          "calendarMonth": 4,
          "depositCents": 47500,
          "disbursementCents": 0,
          "step1TrialBalanceCents": 190000,
          "targetBalanceCents": 332500,
          "projectedBalanceCents": 302500
        },
        {
          "month": 5,
          "calendarMonth": 5,
          "depositCents": 47500,
          "disbursementCents": 210000,
          "step1TrialBalanceCents": 27500,
          "targetBalanceCents": 170000,
          "projectedBalanceCents": 140000
        },
        {
          "month": 6,
          "calendarMonth": 6,
          "depositCents": 47500,
          "disbursementCents": 0,
          "step1TrialBalanceCents": 75000,
          "targetBalanceCents": 217500,
          "projectedBalanceCents": 187500
        },
        {
          "month": 7,
          "calendarMonth": 7,
          "depositCents": 47500,
          "disbursementCents": 150000,
          "step1TrialBalanceCents": -27500,
          "targetBalanceCents": 115000,
          "projectedBalanceCents": 85000
        },
        {
          "month": 8,
          "calendarMonth": 8,
          "depositCents": 47500,
          "disbursementCents": 0,
          "step1TrialBalanceCents": 20000,
          "targetBalanceCents": 162500,
          "projectedBalanceCents": 132500
        },
        {
          "month": 9,
          "calendarMonth": 9,
          "depositCents": 47500,
          "disbursementCents": 0,
          "step1TrialBalanceCents": 67500,
          "targetBalanceCents": 210000,
          "projectedBalanceCents": 180000
        },
        {
          "month": 10,
          "calendarMonth": 10,
          "depositCents": 47500,
          "disbursementCents": 0,
          "step1TrialBalanceCents": 115000,
          "targetBalanceCents": 257500,
          "projectedBalanceCents": 227500
        },
        {
          "month": 11,
          "calendarMonth": 11,
          "depositCents": 47500,
          "disbursementCents": 210000,
          "step1TrialBalanceCents": -47500,
          "targetBalanceCents": 95000,
          "projectedBalanceCents": 65000
        },
        {
          "month": 12,
          "calendarMonth": 12,
          "depositCents": 47500,
          "disbursementCents": 0,
          "step1TrialBalanceCents": 0,
          "targetBalanceCents": 142500,
          "projectedBalanceCents": 112500
        }
      ],
      "whatGoesWrong": {
        "ifLastYearsPaymentIsUsedAsDeposit": {
          "depositCents": 40000,
          "bogusSurplusCents": -112500
        },
        "ifNewTotalPaymentIncludingShortageSpreadIsUsed": {
          "depositCents": 50000,
          "bogusSurplusCents": -2500
        },
        "correctDifferenceCents": -30000
      },
      "paymentJumpDecomposition": {
        "oldMonthlyEscrowCents": 40000,
        "newMonthlyEscrowCents": 50000,
        "billsWentUpCents": 7500,
        "shortageRepaymentCents": 2500,
        "shortageBreakdown": {
          "cushionRoseCents": 15000,
          "timingNeedRoseCents": 7500,
          "lastYearCameInUnderProjectionCents": 7500
        }
      },
      "nearLine": null
    }
  },
  {
    "id": "TV19",
    "title": "Projected balance dips below zero but TODAY's balance is positive - that is a SHORTAGE, not a deficiency",
    "source": "DERIVED",
    "startMonth": 1,
    "inputs": {
      "startingBalanceCents": 10000,
      "cushionMonths": 2,
      "borrowerCurrent": true,
      "disbursements": [
        {
          "label": "Property tax 1st half",
          "month": 5,
          "amountCents": 180000
        },
        {
          "label": "Homeowners insurance",
          "month": 7,
          "amountCents": 120000
        },
        {
          "label": "Property tax 2nd half",
          "month": 11,
          "amountCents": 180000
        }
      ]
    },
    "expected": {
      "annualDisbursementsCents": 480000,
      "baseMonthlyPaymentCents": 40000,
      "cushionCapCents": 80000,
      "stepTwoAddCents": 40000,
      "requiredStartingBalanceCents": 120000,
      "differenceCents": -110000,
      "surplusCents": 0,
      "shortageCents": 110000,
      "deficiencyCents": 0,
      "lowPoint": {
        "projectedBalanceCents": -30000,
        "month": 11,
        "calendarMonth": 11,
        "lowestTargetBalanceCents": 80000
      },
      "classification": "SHORTAGE_GE_ONE_MONTH",
      "cite": "12 CFR 1024.17(f)(3)(ii)",
      "servicerOptions": [
        "shortage: do nothing",
        "shortage: require repayment in equal monthly payments over at least 12 months"
      ],
      "newMonthlyEscrowPayment": {
        "baseMonthlyCents": 40000,
        "shortageSpreadOver12Cents": 9167,
        "deficiencySpreadCents": 0,
        "deficiencySpreadMonths": 0,
        "monthlyEscrowWhileRepayingDeficiencyCents": 49167,
        "monthlyEscrowAfterDeficiencyRepaidCents": 49167
      },
      "table": [
        {
          "month": 1,
          "calendarMonth": 1,
          "depositCents": 40000,
          "disbursementCents": 0,
          "step1TrialBalanceCents": 40000,
          "targetBalanceCents": 160000,
          "projectedBalanceCents": 50000
        },
        {
          "month": 2,
          "calendarMonth": 2,
          "depositCents": 40000,
          "disbursementCents": 0,
          "step1TrialBalanceCents": 80000,
          "targetBalanceCents": 200000,
          "projectedBalanceCents": 90000
        },
        {
          "month": 3,
          "calendarMonth": 3,
          "depositCents": 40000,
          "disbursementCents": 0,
          "step1TrialBalanceCents": 120000,
          "targetBalanceCents": 240000,
          "projectedBalanceCents": 130000
        },
        {
          "month": 4,
          "calendarMonth": 4,
          "depositCents": 40000,
          "disbursementCents": 0,
          "step1TrialBalanceCents": 160000,
          "targetBalanceCents": 280000,
          "projectedBalanceCents": 170000
        },
        {
          "month": 5,
          "calendarMonth": 5,
          "depositCents": 40000,
          "disbursementCents": 180000,
          "step1TrialBalanceCents": 20000,
          "targetBalanceCents": 140000,
          "projectedBalanceCents": 30000
        },
        {
          "month": 6,
          "calendarMonth": 6,
          "depositCents": 40000,
          "disbursementCents": 0,
          "step1TrialBalanceCents": 60000,
          "targetBalanceCents": 180000,
          "projectedBalanceCents": 70000
        },
        {
          "month": 7,
          "calendarMonth": 7,
          "depositCents": 40000,
          "disbursementCents": 120000,
          "step1TrialBalanceCents": -20000,
          "targetBalanceCents": 100000,
          "projectedBalanceCents": -10000
        },
        {
          "month": 8,
          "calendarMonth": 8,
          "depositCents": 40000,
          "disbursementCents": 0,
          "step1TrialBalanceCents": 20000,
          "targetBalanceCents": 140000,
          "projectedBalanceCents": 30000
        },
        {
          "month": 9,
          "calendarMonth": 9,
          "depositCents": 40000,
          "disbursementCents": 0,
          "step1TrialBalanceCents": 60000,
          "targetBalanceCents": 180000,
          "projectedBalanceCents": 70000
        },
        {
          "month": 10,
          "calendarMonth": 10,
          "depositCents": 40000,
          "disbursementCents": 0,
          "step1TrialBalanceCents": 100000,
          "targetBalanceCents": 220000,
          "projectedBalanceCents": 110000
        },
        {
          "month": 11,
          "calendarMonth": 11,
          "depositCents": 40000,
          "disbursementCents": 180000,
          "step1TrialBalanceCents": -40000,
          "targetBalanceCents": 80000,
          "projectedBalanceCents": -30000
        },
        {
          "month": 12,
          "calendarMonth": 12,
          "depositCents": 40000,
          "disbursementCents": 0,
          "step1TrialBalanceCents": 0,
          "targetBalanceCents": 120000,
          "projectedBalanceCents": 10000
        }
      ],
      "nearLine": null
    }
  },
  {
    "id": "TV20",
    "title": "Surplus but borrower is NOT current (payment more than 30 days late) - refund rule does not apply",
    "source": "DERIVED",
    "startMonth": 1,
    "inputs": {
      "startingBalanceCents": 150000,
      "cushionMonths": 2,
      "borrowerCurrent": false,
      "disbursements": [
        {
          "label": "Property tax 1st half",
          "month": 5,
          "amountCents": 180000
        },
        {
          "label": "Homeowners insurance",
          "month": 7,
          "amountCents": 120000
        },
        {
          "label": "Property tax 2nd half",
          "month": 11,
          "amountCents": 180000
        }
      ]
    },
    "expected": {
      "annualDisbursementsCents": 480000,
      "baseMonthlyPaymentCents": 40000,
      "cushionCapCents": 80000,
      "stepTwoAddCents": 40000,
      "requiredStartingBalanceCents": 120000,
      "differenceCents": 30000,
      "surplusCents": 30000,
      "shortageCents": 0,
      "deficiencyCents": 0,
      "lowPoint": {
        "projectedBalanceCents": 110000,
        "month": 11,
        "calendarMonth": 11,
        "lowestTargetBalanceCents": 80000
      },
      "classification": "SURPLUS_BORROWER_NOT_CURRENT",
      "cite": "12 CFR 1024.17(f)(2)(ii)",
      "servicerOptions": [
        "servicer may retain the surplus in the escrow account pursuant to the loan documents"
      ],
      "newMonthlyEscrowPayment": {
        "baseMonthlyCents": 40000,
        "shortageSpreadOver12Cents": 0,
        "deficiencySpreadCents": 0,
        "deficiencySpreadMonths": 0,
        "monthlyEscrowWhileRepayingDeficiencyCents": 40000,
        "monthlyEscrowAfterDeficiencyRepaidCents": 40000
      },
      "table": [
        {
          "month": 1,
          "calendarMonth": 1,
          "depositCents": 40000,
          "disbursementCents": 0,
          "step1TrialBalanceCents": 40000,
          "targetBalanceCents": 160000,
          "projectedBalanceCents": 190000
        },
        {
          "month": 2,
          "calendarMonth": 2,
          "depositCents": 40000,
          "disbursementCents": 0,
          "step1TrialBalanceCents": 80000,
          "targetBalanceCents": 200000,
          "projectedBalanceCents": 230000
        },
        {
          "month": 3,
          "calendarMonth": 3,
          "depositCents": 40000,
          "disbursementCents": 0,
          "step1TrialBalanceCents": 120000,
          "targetBalanceCents": 240000,
          "projectedBalanceCents": 270000
        },
        {
          "month": 4,
          "calendarMonth": 4,
          "depositCents": 40000,
          "disbursementCents": 0,
          "step1TrialBalanceCents": 160000,
          "targetBalanceCents": 280000,
          "projectedBalanceCents": 310000
        },
        {
          "month": 5,
          "calendarMonth": 5,
          "depositCents": 40000,
          "disbursementCents": 180000,
          "step1TrialBalanceCents": 20000,
          "targetBalanceCents": 140000,
          "projectedBalanceCents": 170000
        },
        {
          "month": 6,
          "calendarMonth": 6,
          "depositCents": 40000,
          "disbursementCents": 0,
          "step1TrialBalanceCents": 60000,
          "targetBalanceCents": 180000,
          "projectedBalanceCents": 210000
        },
        {
          "month": 7,
          "calendarMonth": 7,
          "depositCents": 40000,
          "disbursementCents": 120000,
          "step1TrialBalanceCents": -20000,
          "targetBalanceCents": 100000,
          "projectedBalanceCents": 130000
        },
        {
          "month": 8,
          "calendarMonth": 8,
          "depositCents": 40000,
          "disbursementCents": 0,
          "step1TrialBalanceCents": 20000,
          "targetBalanceCents": 140000,
          "projectedBalanceCents": 170000
        },
        {
          "month": 9,
          "calendarMonth": 9,
          "depositCents": 40000,
          "disbursementCents": 0,
          "step1TrialBalanceCents": 60000,
          "targetBalanceCents": 180000,
          "projectedBalanceCents": 210000
        },
        {
          "month": 10,
          "calendarMonth": 10,
          "depositCents": 40000,
          "disbursementCents": 0,
          "step1TrialBalanceCents": 100000,
          "targetBalanceCents": 220000,
          "projectedBalanceCents": 250000
        },
        {
          "month": 11,
          "calendarMonth": 11,
          "depositCents": 40000,
          "disbursementCents": 180000,
          "step1TrialBalanceCents": -40000,
          "targetBalanceCents": 80000,
          "projectedBalanceCents": 110000
        },
        {
          "month": 12,
          "calendarMonth": 12,
          "depositCents": 40000,
          "disbursementCents": 0,
          "step1TrialBalanceCents": 0,
          "targetBalanceCents": 120000,
          "projectedBalanceCents": 150000
        }
      ],
      "nearLine": null
    }
  },
  {
    "id": "TV21",
    "title": "Quarterly tax installments + monthly PMI + annual insurance; two months tie for the low point",
    "source": "DERIVED",
    "startMonth": 1,
    "inputs": {
      "startingBalanceCents": 130000,
      "cushionMonths": 2,
      "borrowerCurrent": true,
      "disbursements": [
        {
          "label": "PMI (monthly)",
          "month": 1,
          "amountCents": 5000
        },
        {
          "label": "PMI (monthly)",
          "month": 2,
          "amountCents": 5000
        },
        {
          "label": "PMI (monthly)",
          "month": 3,
          "amountCents": 5000
        },
        {
          "label": "PMI (monthly)",
          "month": 4,
          "amountCents": 5000
        },
        {
          "label": "PMI (monthly)",
          "month": 5,
          "amountCents": 5000
        },
        {
          "label": "PMI (monthly)",
          "month": 6,
          "amountCents": 5000
        },
        {
          "label": "PMI (monthly)",
          "month": 7,
          "amountCents": 5000
        },
        {
          "label": "PMI (monthly)",
          "month": 8,
          "amountCents": 5000
        },
        {
          "label": "PMI (monthly)",
          "month": 9,
          "amountCents": 5000
        },
        {
          "label": "PMI (monthly)",
          "month": 10,
          "amountCents": 5000
        },
        {
          "label": "PMI (monthly)",
          "month": 11,
          "amountCents": 5000
        },
        {
          "label": "PMI (monthly)",
          "month": 12,
          "amountCents": 5000
        },
        {
          "label": "Property tax (quarterly installment)",
          "month": 2,
          "amountCents": 60000
        },
        {
          "label": "Property tax (quarterly installment)",
          "month": 5,
          "amountCents": 60000
        },
        {
          "label": "Property tax (quarterly installment)",
          "month": 8,
          "amountCents": 60000
        },
        {
          "label": "Property tax (quarterly installment)",
          "month": 11,
          "amountCents": 60000
        },
        {
          "label": "Homeowners insurance",
          "month": 6,
          "amountCents": 120000
        }
      ]
    },
    "expected": {
      "annualDisbursementsCents": 420000,
      "baseMonthlyPaymentCents": 35000,
      "cushionCapCents": 70000,
      "stepTwoAddCents": 60000,
      "requiredStartingBalanceCents": 130000,
      "differenceCents": 0,
      "surplusCents": 0,
      "shortageCents": 0,
      "deficiencyCents": 0,
      "lowPoint": {
        "projectedBalanceCents": 70000,
        "month": 6,
        "calendarMonth": 6,
        "lowestTargetBalanceCents": 70000
      },
      "classification": "ON_TARGET",
      "cite": "12 CFR 1024.17(d)(2)",
      "servicerOptions": [],
      "newMonthlyEscrowPayment": {
        "baseMonthlyCents": 35000,
        "shortageSpreadOver12Cents": 0,
        "deficiencySpreadCents": 0,
        "deficiencySpreadMonths": 0,
        "monthlyEscrowWhileRepayingDeficiencyCents": 35000,
        "monthlyEscrowAfterDeficiencyRepaidCents": 35000
      },
      "table": [
        {
          "month": 1,
          "calendarMonth": 1,
          "depositCents": 35000,
          "disbursementCents": 5000,
          "step1TrialBalanceCents": 30000,
          "targetBalanceCents": 160000,
          "projectedBalanceCents": 160000
        },
        {
          "month": 2,
          "calendarMonth": 2,
          "depositCents": 35000,
          "disbursementCents": 65000,
          "step1TrialBalanceCents": 0,
          "targetBalanceCents": 130000,
          "projectedBalanceCents": 130000
        },
        {
          "month": 3,
          "calendarMonth": 3,
          "depositCents": 35000,
          "disbursementCents": 5000,
          "step1TrialBalanceCents": 30000,
          "targetBalanceCents": 160000,
          "projectedBalanceCents": 160000
        },
        {
          "month": 4,
          "calendarMonth": 4,
          "depositCents": 35000,
          "disbursementCents": 5000,
          "step1TrialBalanceCents": 60000,
          "targetBalanceCents": 190000,
          "projectedBalanceCents": 190000
        },
        {
          "month": 5,
          "calendarMonth": 5,
          "depositCents": 35000,
          "disbursementCents": 65000,
          "step1TrialBalanceCents": 30000,
          "targetBalanceCents": 160000,
          "projectedBalanceCents": 160000
        },
        {
          "month": 6,
          "calendarMonth": 6,
          "depositCents": 35000,
          "disbursementCents": 125000,
          "step1TrialBalanceCents": -60000,
          "targetBalanceCents": 70000,
          "projectedBalanceCents": 70000
        },
        {
          "month": 7,
          "calendarMonth": 7,
          "depositCents": 35000,
          "disbursementCents": 5000,
          "step1TrialBalanceCents": -30000,
          "targetBalanceCents": 100000,
          "projectedBalanceCents": 100000
        },
        {
          "month": 8,
          "calendarMonth": 8,
          "depositCents": 35000,
          "disbursementCents": 65000,
          "step1TrialBalanceCents": -60000,
          "targetBalanceCents": 70000,
          "projectedBalanceCents": 70000
        },
        {
          "month": 9,
          "calendarMonth": 9,
          "depositCents": 35000,
          "disbursementCents": 5000,
          "step1TrialBalanceCents": -30000,
          "targetBalanceCents": 100000,
          "projectedBalanceCents": 100000
        },
        {
          "month": 10,
          "calendarMonth": 10,
          "depositCents": 35000,
          "disbursementCents": 5000,
          "step1TrialBalanceCents": 0,
          "targetBalanceCents": 130000,
          "projectedBalanceCents": 130000
        },
        {
          "month": 11,
          "calendarMonth": 11,
          "depositCents": 35000,
          "disbursementCents": 65000,
          "step1TrialBalanceCents": -30000,
          "targetBalanceCents": 100000,
          "projectedBalanceCents": 100000
        },
        {
          "month": 12,
          "calendarMonth": 12,
          "depositCents": 35000,
          "disbursementCents": 5000,
          "step1TrialBalanceCents": 0,
          "targetBalanceCents": 130000,
          "projectedBalanceCents": 130000
        }
      ],
      "nearLine": null
    }
  },
  {
    "id": "TV22",
    "title": "Pure deficiency, borrower NOT current - (f)(4)(iii): no tier, no repayment schedule (audit, SPEC E2)",
    "source": "DERIVED",
    "startMonth": 3,
    "inputs": {
      "startingBalanceCents": -45000,
      "cushionMonths": 0,
      "borrowerCurrent": false,
      "disbursements": [
        {
          "label": "Property tax (annual)",
          "month": 12,
          "amountCents": 360000
        }
      ]
    },
    "expected": {
      "annualDisbursementsCents": 360000,
      "baseMonthlyPaymentCents": 30000,
      "cushionCapCents": 0,
      "stepTwoAddCents": 0,
      "requiredStartingBalanceCents": 0,
      "differenceCents": -45000,
      "surplusCents": 0,
      "shortageCents": 0,
      "deficiencyCents": 45000,
      "lowPoint": {
        "projectedBalanceCents": -45000,
        "month": 12,
        "calendarMonth": 2,
        "lowestTargetBalanceCents": 0
      },
      "classification": "DEFICIENCY_BORROWER_NOT_CURRENT",
      "cite": "12 CFR 1024.17(f)(4)(iii)",
      "servicerOptions": [
        "deficiency: servicer may recover the deficiency pursuant to the loan documents"
      ],
      "nearLine": null,
      "newMonthlyEscrowPayment": {
        "baseMonthlyCents": 30000,
        "shortageSpreadOver12Cents": 0,
        "deficiencySpreadCents": 0,
        "deficiencySpreadMonths": 0,
        "monthlyEscrowWhileRepayingDeficiencyCents": 30000,
        "monthlyEscrowAfterDeficiencyRepaidCents": 30000
      },
      "table": [
        {
          "month": 1,
          "calendarMonth": 3,
          "depositCents": 30000,
          "disbursementCents": 0,
          "step1TrialBalanceCents": 30000,
          "targetBalanceCents": 30000,
          "projectedBalanceCents": -15000
        },
        {
          "month": 2,
          "calendarMonth": 4,
          "depositCents": 30000,
          "disbursementCents": 0,
          "step1TrialBalanceCents": 60000,
          "targetBalanceCents": 60000,
          "projectedBalanceCents": 15000
        },
        {
          "month": 3,
          "calendarMonth": 5,
          "depositCents": 30000,
          "disbursementCents": 0,
          "step1TrialBalanceCents": 90000,
          "targetBalanceCents": 90000,
          "projectedBalanceCents": 45000
        },
        {
          "month": 4,
          "calendarMonth": 6,
          "depositCents": 30000,
          "disbursementCents": 0,
          "step1TrialBalanceCents": 120000,
          "targetBalanceCents": 120000,
          "projectedBalanceCents": 75000
        },
        {
          "month": 5,
          "calendarMonth": 7,
          "depositCents": 30000,
          "disbursementCents": 0,
          "step1TrialBalanceCents": 150000,
          "targetBalanceCents": 150000,
          "projectedBalanceCents": 105000
        },
        {
          "month": 6,
          "calendarMonth": 8,
          "depositCents": 30000,
          "disbursementCents": 0,
          "step1TrialBalanceCents": 180000,
          "targetBalanceCents": 180000,
          "projectedBalanceCents": 135000
        },
        {
          "month": 7,
          "calendarMonth": 9,
          "depositCents": 30000,
          "disbursementCents": 0,
          "step1TrialBalanceCents": 210000,
          "targetBalanceCents": 210000,
          "projectedBalanceCents": 165000
        },
        {
          "month": 8,
          "calendarMonth": 10,
          "depositCents": 30000,
          "disbursementCents": 0,
          "step1TrialBalanceCents": 240000,
          "targetBalanceCents": 240000,
          "projectedBalanceCents": 195000
        },
        {
          "month": 9,
          "calendarMonth": 11,
          "depositCents": 30000,
          "disbursementCents": 0,
          "step1TrialBalanceCents": 270000,
          "targetBalanceCents": 270000,
          "projectedBalanceCents": 225000
        },
        {
          "month": 10,
          "calendarMonth": 12,
          "depositCents": 30000,
          "disbursementCents": 0,
          "step1TrialBalanceCents": 300000,
          "targetBalanceCents": 300000,
          "projectedBalanceCents": 255000
        },
        {
          "month": 11,
          "calendarMonth": 1,
          "depositCents": 30000,
          "disbursementCents": 0,
          "step1TrialBalanceCents": 330000,
          "targetBalanceCents": 330000,
          "projectedBalanceCents": 285000
        },
        {
          "month": 12,
          "calendarMonth": 2,
          "depositCents": 30000,
          "disbursementCents": 360000,
          "step1TrialBalanceCents": 0,
          "targetBalanceCents": 0,
          "projectedBalanceCents": -45000
        }
      ]
    }
  },
  {
    "id": "TV23",
    "title": "Deficiency + shortage, borrower NOT current - deficiency has no tier, shortage tier unchanged (audit, SPEC E2)",
    "source": "DERIVED",
    "startMonth": 1,
    "inputs": {
      "startingBalanceCents": -20000,
      "cushionMonths": 2,
      "borrowerCurrent": false,
      "disbursements": [
        {
          "label": "Property tax",
          "month": 4,
          "amountCents": 240000
        },
        {
          "label": "Homeowners insurance",
          "month": 9,
          "amountCents": 120000
        }
      ]
    },
    "expected": {
      "annualDisbursementsCents": 360000,
      "baseMonthlyPaymentCents": 30000,
      "cushionCapCents": 60000,
      "stepTwoAddCents": 120000,
      "requiredStartingBalanceCents": 180000,
      "differenceCents": -200000,
      "surplusCents": 0,
      "shortageCents": 180000,
      "deficiencyCents": 20000,
      "lowPoint": {
        "projectedBalanceCents": -140000,
        "month": 4,
        "calendarMonth": 4,
        "lowestTargetBalanceCents": 60000
      },
      "classification": "DEFICIENCY_BORROWER_NOT_CURRENT_AND_SHORTAGE_GE_ONE_MONTH",
      "cite": "12 CFR 1024.17(f)(4)(iii) + 12 CFR 1024.17(f)(3)(ii)",
      "servicerOptions": [
        "deficiency: servicer may recover the deficiency pursuant to the loan documents",
        "shortage: do nothing",
        "shortage: require repayment in equal monthly payments over at least 12 months"
      ],
      "nearLine": null,
      "newMonthlyEscrowPayment": {
        "baseMonthlyCents": 30000,
        "shortageSpreadOver12Cents": 15000,
        "deficiencySpreadCents": 0,
        "deficiencySpreadMonths": 0,
        "monthlyEscrowWhileRepayingDeficiencyCents": 45000,
        "monthlyEscrowAfterDeficiencyRepaidCents": 45000
      },
      "table": [
        {
          "month": 1,
          "calendarMonth": 1,
          "depositCents": 30000,
          "disbursementCents": 0,
          "step1TrialBalanceCents": 30000,
          "targetBalanceCents": 210000,
          "projectedBalanceCents": 10000
        },
        {
          "month": 2,
          "calendarMonth": 2,
          "depositCents": 30000,
          "disbursementCents": 0,
          "step1TrialBalanceCents": 60000,
          "targetBalanceCents": 240000,
          "projectedBalanceCents": 40000
        },
        {
          "month": 3,
          "calendarMonth": 3,
          "depositCents": 30000,
          "disbursementCents": 0,
          "step1TrialBalanceCents": 90000,
          "targetBalanceCents": 270000,
          "projectedBalanceCents": 70000
        },
        {
          "month": 4,
          "calendarMonth": 4,
          "depositCents": 30000,
          "disbursementCents": 240000,
          "step1TrialBalanceCents": -120000,
          "targetBalanceCents": 60000,
          "projectedBalanceCents": -140000
        },
        {
          "month": 5,
          "calendarMonth": 5,
          "depositCents": 30000,
          "disbursementCents": 0,
          "step1TrialBalanceCents": -90000,
          "targetBalanceCents": 90000,
          "projectedBalanceCents": -110000
        },
        {
          "month": 6,
          "calendarMonth": 6,
          "depositCents": 30000,
          "disbursementCents": 0,
          "step1TrialBalanceCents": -60000,
          "targetBalanceCents": 120000,
          "projectedBalanceCents": -80000
        },
        {
          "month": 7,
          "calendarMonth": 7,
          "depositCents": 30000,
          "disbursementCents": 0,
          "step1TrialBalanceCents": -30000,
          "targetBalanceCents": 150000,
          "projectedBalanceCents": -50000
        },
        {
          "month": 8,
          "calendarMonth": 8,
          "depositCents": 30000,
          "disbursementCents": 0,
          "step1TrialBalanceCents": 0,
          "targetBalanceCents": 180000,
          "projectedBalanceCents": -20000
        },
        {
          "month": 9,
          "calendarMonth": 9,
          "depositCents": 30000,
          "disbursementCents": 120000,
          "step1TrialBalanceCents": -90000,
          "targetBalanceCents": 90000,
          "projectedBalanceCents": -110000
        },
        {
          "month": 10,
          "calendarMonth": 10,
          "depositCents": 30000,
          "disbursementCents": 0,
          "step1TrialBalanceCents": -60000,
          "targetBalanceCents": 120000,
          "projectedBalanceCents": -80000
        },
        {
          "month": 11,
          "calendarMonth": 11,
          "depositCents": 30000,
          "disbursementCents": 0,
          "step1TrialBalanceCents": -30000,
          "targetBalanceCents": 150000,
          "projectedBalanceCents": -50000
        },
        {
          "month": 12,
          "calendarMonth": 12,
          "depositCents": 30000,
          "disbursementCents": 0,
          "step1TrialBalanceCents": 0,
          "targetBalanceCents": 180000,
          "projectedBalanceCents": -20000
        }
      ]
    }
  },
  {
    "id": "TV24",
    "title": "SHORTAGE with borrower NOT current - shortage tiers and options do not change, (f)(3) has no current test (audit, SPEC E2)",
    "source": "DERIVED",
    "startMonth": 10,
    "inputs": {
      "startingBalanceCents": 180000,
      "cushionMonths": 2,
      "borrowerCurrent": false,
      "disbursements": [
        {
          "label": "Property tax 1st half",
          "month": 2,
          "amountCents": 150000
        },
        {
          "label": "Homeowners insurance",
          "month": 6,
          "amountCents": 90000
        },
        {
          "label": "Property tax 2nd half",
          "month": 8,
          "amountCents": 150000
        }
      ]
    },
    "expected": {
      "annualDisbursementsCents": 390000,
      "baseMonthlyPaymentCents": 32500,
      "cushionCapCents": 65000,
      "stepTwoAddCents": 130000,
      "requiredStartingBalanceCents": 195000,
      "differenceCents": -15000,
      "surplusCents": 0,
      "shortageCents": 15000,
      "deficiencyCents": 0,
      "lowPoint": {
        "projectedBalanceCents": 50000,
        "month": 8,
        "calendarMonth": 5,
        "lowestTargetBalanceCents": 65000
      },
      "classification": "SHORTAGE_LT_ONE_MONTH",
      "cite": "12 CFR 1024.17(f)(3)(i)",
      "servicerOptions": [
        "shortage: do nothing",
        "shortage: require repayment within 30 days",
        "shortage: require repayment in equal monthly payments over at least 12 months"
      ],
      "nearLine": null,
      "newMonthlyEscrowPayment": {
        "baseMonthlyCents": 32500,
        "shortageSpreadOver12Cents": 1250,
        "deficiencySpreadCents": 0,
        "deficiencySpreadMonths": 0,
        "monthlyEscrowWhileRepayingDeficiencyCents": 33750,
        "monthlyEscrowAfterDeficiencyRepaidCents": 33750
      },
      "table": [
        {
          "month": 1,
          "calendarMonth": 10,
          "depositCents": 32500,
          "disbursementCents": 0,
          "step1TrialBalanceCents": 32500,
          "targetBalanceCents": 227500,
          "projectedBalanceCents": 212500
        },
        {
          "month": 2,
          "calendarMonth": 11,
          "depositCents": 32500,
          "disbursementCents": 150000,
          "step1TrialBalanceCents": -85000,
          "targetBalanceCents": 110000,
          "projectedBalanceCents": 95000
        },
        {
          "month": 3,
          "calendarMonth": 12,
          "depositCents": 32500,
          "disbursementCents": 0,
          "step1TrialBalanceCents": -52500,
          "targetBalanceCents": 142500,
          "projectedBalanceCents": 127500
        },
        {
          "month": 4,
          "calendarMonth": 1,
          "depositCents": 32500,
          "disbursementCents": 0,
          "step1TrialBalanceCents": -20000,
          "targetBalanceCents": 175000,
          "projectedBalanceCents": 160000
        },
        {
          "month": 5,
          "calendarMonth": 2,
          "depositCents": 32500,
          "disbursementCents": 0,
          "step1TrialBalanceCents": 12500,
          "targetBalanceCents": 207500,
          "projectedBalanceCents": 192500
        },
        {
          "month": 6,
          "calendarMonth": 3,
          "depositCents": 32500,
          "disbursementCents": 90000,
          "step1TrialBalanceCents": -45000,
          "targetBalanceCents": 150000,
          "projectedBalanceCents": 135000
        },
        {
          "month": 7,
          "calendarMonth": 4,
          "depositCents": 32500,
          "disbursementCents": 0,
          "step1TrialBalanceCents": -12500,
          "targetBalanceCents": 182500,
          "projectedBalanceCents": 167500
        },
        {
          "month": 8,
          "calendarMonth": 5,
          "depositCents": 32500,
          "disbursementCents": 150000,
          "step1TrialBalanceCents": -130000,
          "targetBalanceCents": 65000,
          "projectedBalanceCents": 50000
        },
        {
          "month": 9,
          "calendarMonth": 6,
          "depositCents": 32500,
          "disbursementCents": 0,
          "step1TrialBalanceCents": -97500,
          "targetBalanceCents": 97500,
          "projectedBalanceCents": 82500
        },
        {
          "month": 10,
          "calendarMonth": 7,
          "depositCents": 32500,
          "disbursementCents": 0,
          "step1TrialBalanceCents": -65000,
          "targetBalanceCents": 130000,
          "projectedBalanceCents": 115000
        },
        {
          "month": 11,
          "calendarMonth": 8,
          "depositCents": 32500,
          "disbursementCents": 0,
          "step1TrialBalanceCents": -32500,
          "targetBalanceCents": 162500,
          "projectedBalanceCents": 147500
        },
        {
          "month": 12,
          "calendarMonth": 9,
          "depositCents": 32500,
          "disbursementCents": 0,
          "step1TrialBalanceCents": 0,
          "targetBalanceCents": 195000,
          "projectedBalanceCents": 180000
        }
      ]
    }
  },
  {
    "id": "TV25",
    "title": "All-positive Step 1 (rounding artifact): one bill of $1,200.06 in month 12 - pins the floor on the Step 2 add (audit, SPEC E1)",
    "source": "DERIVED",
    "startMonth": 1,
    "inputs": {
      "startingBalanceCents": 30000,
      "cushionMonths": 2,
      "borrowerCurrent": true,
      "disbursements": [
        {
          "label": "Property tax (annual)",
          "month": 12,
          "amountCents": 120006
        }
      ]
    },
    "expected": {
      "annualDisbursementsCents": 120006,
      "baseMonthlyPaymentCents": 10001,
      "cushionCapCents": 20001,
      "stepTwoAddCents": 0,
      "requiredStartingBalanceCents": 20001,
      "differenceCents": 9999,
      "surplusCents": 9999,
      "shortageCents": 0,
      "deficiencyCents": 0,
      "lowPoint": {
        "projectedBalanceCents": 30006,
        "month": 12,
        "calendarMonth": 12,
        "lowestTargetBalanceCents": 20007
      },
      "classification": "SURPLUS_REFUND_REQUIRED",
      "cite": "12 CFR 1024.17(f)(2)(i)",
      "servicerOptions": [
        "refund the surplus to the borrower within 30 days from the date of the analysis"
      ],
      "nearLine": null,
      "newMonthlyEscrowPayment": {
        "baseMonthlyCents": 10001,
        "shortageSpreadOver12Cents": 0,
        "deficiencySpreadCents": 0,
        "deficiencySpreadMonths": 0,
        "monthlyEscrowWhileRepayingDeficiencyCents": 10001,
        "monthlyEscrowAfterDeficiencyRepaidCents": 10001
      },
      "table": [
        {
          "month": 1,
          "calendarMonth": 1,
          "depositCents": 10001,
          "disbursementCents": 0,
          "step1TrialBalanceCents": 10001,
          "targetBalanceCents": 30002,
          "projectedBalanceCents": 40001
        },
        {
          "month": 2,
          "calendarMonth": 2,
          "depositCents": 10001,
          "disbursementCents": 0,
          "step1TrialBalanceCents": 20002,
          "targetBalanceCents": 40003,
          "projectedBalanceCents": 50002
        },
        {
          "month": 3,
          "calendarMonth": 3,
          "depositCents": 10001,
          "disbursementCents": 0,
          "step1TrialBalanceCents": 30003,
          "targetBalanceCents": 50004,
          "projectedBalanceCents": 60003
        },
        {
          "month": 4,
          "calendarMonth": 4,
          "depositCents": 10001,
          "disbursementCents": 0,
          "step1TrialBalanceCents": 40004,
          "targetBalanceCents": 60005,
          "projectedBalanceCents": 70004
        },
        {
          "month": 5,
          "calendarMonth": 5,
          "depositCents": 10001,
          "disbursementCents": 0,
          "step1TrialBalanceCents": 50005,
          "targetBalanceCents": 70006,
          "projectedBalanceCents": 80005
        },
        {
          "month": 6,
          "calendarMonth": 6,
          "depositCents": 10001,
          "disbursementCents": 0,
          "step1TrialBalanceCents": 60006,
          "targetBalanceCents": 80007,
          "projectedBalanceCents": 90006
        },
        {
          "month": 7,
          "calendarMonth": 7,
          "depositCents": 10001,
          "disbursementCents": 0,
          "step1TrialBalanceCents": 70007,
          "targetBalanceCents": 90008,
          "projectedBalanceCents": 100007
        },
        {
          "month": 8,
          "calendarMonth": 8,
          "depositCents": 10001,
          "disbursementCents": 0,
          "step1TrialBalanceCents": 80008,
          "targetBalanceCents": 100009,
          "projectedBalanceCents": 110008
        },
        {
          "month": 9,
          "calendarMonth": 9,
          "depositCents": 10001,
          "disbursementCents": 0,
          "step1TrialBalanceCents": 90009,
          "targetBalanceCents": 110010,
          "projectedBalanceCents": 120009
        },
        {
          "month": 10,
          "calendarMonth": 10,
          "depositCents": 10001,
          "disbursementCents": 0,
          "step1TrialBalanceCents": 100010,
          "targetBalanceCents": 120011,
          "projectedBalanceCents": 130010
        },
        {
          "month": 11,
          "calendarMonth": 11,
          "depositCents": 10001,
          "disbursementCents": 0,
          "step1TrialBalanceCents": 110011,
          "targetBalanceCents": 130012,
          "projectedBalanceCents": 140011
        },
        {
          "month": 12,
          "calendarMonth": 12,
          "depositCents": 10001,
          "disbursementCents": 120006,
          "step1TrialBalanceCents": 6,
          "targetBalanceCents": 20007,
          "projectedBalanceCents": 30006
        }
      ]
    }
  },
  {
    "id": "TV26",
    "title": "Surplus $52.00 - refund required by the cents, but inside the $7 too-close-to-call band (audit, SPEC E3)",
    "source": "DERIVED",
    "startMonth": 6,
    "inputs": {
      "startingBalanceCents": 155200,
      "cushionMonths": 2,
      "borrowerCurrent": true,
      "disbursements": [
        {
          "label": "Property tax 1st half",
          "month": 3,
          "amountCents": 135000
        },
        {
          "label": "Homeowners insurance",
          "month": 5,
          "amountCents": 90000
        },
        {
          "label": "Property tax 2nd half",
          "month": 9,
          "amountCents": 135000
        }
      ]
    },
    "expected": {
      "annualDisbursementsCents": 360000,
      "baseMonthlyPaymentCents": 30000,
      "cushionCapCents": 60000,
      "stepTwoAddCents": 90000,
      "requiredStartingBalanceCents": 150000,
      "differenceCents": 5200,
      "surplusCents": 5200,
      "shortageCents": 0,
      "deficiencyCents": 0,
      "lowPoint": {
        "projectedBalanceCents": 65200,
        "month": 9,
        "calendarMonth": 2,
        "lowestTargetBalanceCents": 60000
      },
      "classification": "SURPLUS_REFUND_REQUIRED",
      "cite": "12 CFR 1024.17(f)(2)(i)",
      "servicerOptions": [
        "refund the surplus to the borrower within 30 days from the date of the analysis"
      ],
      "nearLine": {
        "line": "SURPLUS_50",
        "distanceCents": 200,
        "toleranceCents": 700
      },
      "newMonthlyEscrowPayment": {
        "baseMonthlyCents": 30000,
        "shortageSpreadOver12Cents": 0,
        "deficiencySpreadCents": 0,
        "deficiencySpreadMonths": 0,
        "monthlyEscrowWhileRepayingDeficiencyCents": 30000,
        "monthlyEscrowAfterDeficiencyRepaidCents": 30000
      },
      "table": [
        {
          "month": 1,
          "calendarMonth": 6,
          "depositCents": 30000,
          "disbursementCents": 0,
          "step1TrialBalanceCents": 30000,
          "targetBalanceCents": 180000,
          "projectedBalanceCents": 185200
        },
        {
          "month": 2,
          "calendarMonth": 7,
          "depositCents": 30000,
          "disbursementCents": 0,
          "step1TrialBalanceCents": 60000,
          "targetBalanceCents": 210000,
          "projectedBalanceCents": 215200
        },
        {
          "month": 3,
          "calendarMonth": 8,
          "depositCents": 30000,
          "disbursementCents": 135000,
          "step1TrialBalanceCents": -45000,
          "targetBalanceCents": 105000,
          "projectedBalanceCents": 110200
        },
        {
          "month": 4,
          "calendarMonth": 9,
          "depositCents": 30000,
          "disbursementCents": 0,
          "step1TrialBalanceCents": -15000,
          "targetBalanceCents": 135000,
          "projectedBalanceCents": 140200
        },
        {
          "month": 5,
          "calendarMonth": 10,
          "depositCents": 30000,
          "disbursementCents": 90000,
          "step1TrialBalanceCents": -75000,
          "targetBalanceCents": 75000,
          "projectedBalanceCents": 80200
        },
        {
          "month": 6,
          "calendarMonth": 11,
          "depositCents": 30000,
          "disbursementCents": 0,
          "step1TrialBalanceCents": -45000,
          "targetBalanceCents": 105000,
          "projectedBalanceCents": 110200
        },
        {
          "month": 7,
          "calendarMonth": 12,
          "depositCents": 30000,
          "disbursementCents": 0,
          "step1TrialBalanceCents": -15000,
          "targetBalanceCents": 135000,
          "projectedBalanceCents": 140200
        },
        {
          "month": 8,
          "calendarMonth": 1,
          "depositCents": 30000,
          "disbursementCents": 0,
          "step1TrialBalanceCents": 15000,
          "targetBalanceCents": 165000,
          "projectedBalanceCents": 170200
        },
        {
          "month": 9,
          "calendarMonth": 2,
          "depositCents": 30000,
          "disbursementCents": 135000,
          "step1TrialBalanceCents": -90000,
          "targetBalanceCents": 60000,
          "projectedBalanceCents": 65200
        },
        {
          "month": 10,
          "calendarMonth": 3,
          "depositCents": 30000,
          "disbursementCents": 0,
          "step1TrialBalanceCents": -60000,
          "targetBalanceCents": 90000,
          "projectedBalanceCents": 95200
        },
        {
          "month": 11,
          "calendarMonth": 4,
          "depositCents": 30000,
          "disbursementCents": 0,
          "step1TrialBalanceCents": -30000,
          "targetBalanceCents": 120000,
          "projectedBalanceCents": 125200
        },
        {
          "month": 12,
          "calendarMonth": 5,
          "depositCents": 30000,
          "disbursementCents": 0,
          "step1TrialBalanceCents": 0,
          "targetBalanceCents": 150000,
          "projectedBalanceCents": 155200
        }
      ]
    }
  },
  {
    "id": "TV27",
    "title": "Shortage $346.00, $4.00 under one month's payment ($350.00) - small tier by the cents, but too close to call (audit, SPEC E3)",
    "source": "DERIVED",
    "startMonth": 1,
    "inputs": {
      "startingBalanceCents": 85400,
      "cushionMonths": 2,
      "borrowerCurrent": true,
      "disbursements": [
        {
          "label": "Homeowners insurance",
          "month": 2,
          "amountCents": 120000
        },
        {
          "label": "Property tax (annual)",
          "month": 11,
          "amountCents": 300000
        }
      ]
    },
    "expected": {
      "annualDisbursementsCents": 420000,
      "baseMonthlyPaymentCents": 35000,
      "cushionCapCents": 70000,
      "stepTwoAddCents": 50000,
      "requiredStartingBalanceCents": 120000,
      "differenceCents": -34600,
      "surplusCents": 0,
      "shortageCents": 34600,
      "deficiencyCents": 0,
      "lowPoint": {
        "projectedBalanceCents": 35400,
        "month": 2,
        "calendarMonth": 2,
        "lowestTargetBalanceCents": 70000
      },
      "classification": "SHORTAGE_LT_ONE_MONTH",
      "cite": "12 CFR 1024.17(f)(3)(i)",
      "servicerOptions": [
        "shortage: do nothing",
        "shortage: require repayment within 30 days",
        "shortage: require repayment in equal monthly payments over at least 12 months"
      ],
      "nearLine": {
        "line": "ONE_MONTH_PAYMENT",
        "distanceCents": 400,
        "toleranceCents": 700
      },
      "newMonthlyEscrowPayment": {
        "baseMonthlyCents": 35000,
        "shortageSpreadOver12Cents": 2883,
        "deficiencySpreadCents": 0,
        "deficiencySpreadMonths": 0,
        "monthlyEscrowWhileRepayingDeficiencyCents": 37883,
        "monthlyEscrowAfterDeficiencyRepaidCents": 37883
      },
      "table": [
        {
          "month": 1,
          "calendarMonth": 1,
          "depositCents": 35000,
          "disbursementCents": 0,
          "step1TrialBalanceCents": 35000,
          "targetBalanceCents": 155000,
          "projectedBalanceCents": 120400
        },
        {
          "month": 2,
          "calendarMonth": 2,
          "depositCents": 35000,
          "disbursementCents": 120000,
          "step1TrialBalanceCents": -50000,
          "targetBalanceCents": 70000,
          "projectedBalanceCents": 35400
        },
        {
          "month": 3,
          "calendarMonth": 3,
          "depositCents": 35000,
          "disbursementCents": 0,
          "step1TrialBalanceCents": -15000,
          "targetBalanceCents": 105000,
          "projectedBalanceCents": 70400
        },
        {
          "month": 4,
          "calendarMonth": 4,
          "depositCents": 35000,
          "disbursementCents": 0,
          "step1TrialBalanceCents": 20000,
          "targetBalanceCents": 140000,
          "projectedBalanceCents": 105400
        },
        {
          "month": 5,
          "calendarMonth": 5,
          "depositCents": 35000,
          "disbursementCents": 0,
          "step1TrialBalanceCents": 55000,
          "targetBalanceCents": 175000,
          "projectedBalanceCents": 140400
        },
        {
          "month": 6,
          "calendarMonth": 6,
          "depositCents": 35000,
          "disbursementCents": 0,
          "step1TrialBalanceCents": 90000,
          "targetBalanceCents": 210000,
          "projectedBalanceCents": 175400
        },
        {
          "month": 7,
          "calendarMonth": 7,
          "depositCents": 35000,
          "disbursementCents": 0,
          "step1TrialBalanceCents": 125000,
          "targetBalanceCents": 245000,
          "projectedBalanceCents": 210400
        },
        {
          "month": 8,
          "calendarMonth": 8,
          "depositCents": 35000,
          "disbursementCents": 0,
          "step1TrialBalanceCents": 160000,
          "targetBalanceCents": 280000,
          "projectedBalanceCents": 245400
        },
        {
          "month": 9,
          "calendarMonth": 9,
          "depositCents": 35000,
          "disbursementCents": 0,
          "step1TrialBalanceCents": 195000,
          "targetBalanceCents": 315000,
          "projectedBalanceCents": 280400
        },
        {
          "month": 10,
          "calendarMonth": 10,
          "depositCents": 35000,
          "disbursementCents": 0,
          "step1TrialBalanceCents": 230000,
          "targetBalanceCents": 350000,
          "projectedBalanceCents": 315400
        },
        {
          "month": 11,
          "calendarMonth": 11,
          "depositCents": 35000,
          "disbursementCents": 300000,
          "step1TrialBalanceCents": -35000,
          "targetBalanceCents": 85000,
          "projectedBalanceCents": 50400
        },
        {
          "month": 12,
          "calendarMonth": 12,
          "depositCents": 35000,
          "disbursementCents": 0,
          "step1TrialBalanceCents": 0,
          "targetBalanceCents": 120000,
          "projectedBalanceCents": 85400
        }
      ]
    }
  },
  {
    "id": "TV28",
    "title": "Surplus $57.00 - exactly $7.00 above the $50 line: still inside the band, the band is inclusive (audit, SPEC E3, optional)",
    "source": "DERIVED",
    "startMonth": 6,
    "inputs": {
      "startingBalanceCents": 155700,
      "cushionMonths": 2,
      "borrowerCurrent": true,
      "disbursements": [
        {
          "label": "Property tax 1st half",
          "month": 3,
          "amountCents": 135000
        },
        {
          "label": "Homeowners insurance",
          "month": 5,
          "amountCents": 90000
        },
        {
          "label": "Property tax 2nd half",
          "month": 9,
          "amountCents": 135000
        }
      ]
    },
    "expected": {
      "annualDisbursementsCents": 360000,
      "baseMonthlyPaymentCents": 30000,
      "cushionCapCents": 60000,
      "stepTwoAddCents": 90000,
      "requiredStartingBalanceCents": 150000,
      "differenceCents": 5700,
      "surplusCents": 5700,
      "shortageCents": 0,
      "deficiencyCents": 0,
      "lowPoint": {
        "projectedBalanceCents": 65700,
        "month": 9,
        "calendarMonth": 2,
        "lowestTargetBalanceCents": 60000
      },
      "classification": "SURPLUS_REFUND_REQUIRED",
      "cite": "12 CFR 1024.17(f)(2)(i)",
      "servicerOptions": [
        "refund the surplus to the borrower within 30 days from the date of the analysis"
      ],
      "nearLine": {
        "line": "SURPLUS_50",
        "distanceCents": 700,
        "toleranceCents": 700
      },
      "newMonthlyEscrowPayment": {
        "baseMonthlyCents": 30000,
        "shortageSpreadOver12Cents": 0,
        "deficiencySpreadCents": 0,
        "deficiencySpreadMonths": 0,
        "monthlyEscrowWhileRepayingDeficiencyCents": 30000,
        "monthlyEscrowAfterDeficiencyRepaidCents": 30000
      },
      "table": [
        {
          "month": 1,
          "calendarMonth": 6,
          "depositCents": 30000,
          "disbursementCents": 0,
          "step1TrialBalanceCents": 30000,
          "targetBalanceCents": 180000,
          "projectedBalanceCents": 185700
        },
        {
          "month": 2,
          "calendarMonth": 7,
          "depositCents": 30000,
          "disbursementCents": 0,
          "step1TrialBalanceCents": 60000,
          "targetBalanceCents": 210000,
          "projectedBalanceCents": 215700
        },
        {
          "month": 3,
          "calendarMonth": 8,
          "depositCents": 30000,
          "disbursementCents": 135000,
          "step1TrialBalanceCents": -45000,
          "targetBalanceCents": 105000,
          "projectedBalanceCents": 110700
        },
        {
          "month": 4,
          "calendarMonth": 9,
          "depositCents": 30000,
          "disbursementCents": 0,
          "step1TrialBalanceCents": -15000,
          "targetBalanceCents": 135000,
          "projectedBalanceCents": 140700
        },
        {
          "month": 5,
          "calendarMonth": 10,
          "depositCents": 30000,
          "disbursementCents": 90000,
          "step1TrialBalanceCents": -75000,
          "targetBalanceCents": 75000,
          "projectedBalanceCents": 80700
        },
        {
          "month": 6,
          "calendarMonth": 11,
          "depositCents": 30000,
          "disbursementCents": 0,
          "step1TrialBalanceCents": -45000,
          "targetBalanceCents": 105000,
          "projectedBalanceCents": 110700
        },
        {
          "month": 7,
          "calendarMonth": 12,
          "depositCents": 30000,
          "disbursementCents": 0,
          "step1TrialBalanceCents": -15000,
          "targetBalanceCents": 135000,
          "projectedBalanceCents": 140700
        },
        {
          "month": 8,
          "calendarMonth": 1,
          "depositCents": 30000,
          "disbursementCents": 0,
          "step1TrialBalanceCents": 15000,
          "targetBalanceCents": 165000,
          "projectedBalanceCents": 170700
        },
        {
          "month": 9,
          "calendarMonth": 2,
          "depositCents": 30000,
          "disbursementCents": 135000,
          "step1TrialBalanceCents": -90000,
          "targetBalanceCents": 60000,
          "projectedBalanceCents": 65700
        },
        {
          "month": 10,
          "calendarMonth": 3,
          "depositCents": 30000,
          "disbursementCents": 0,
          "step1TrialBalanceCents": -60000,
          "targetBalanceCents": 90000,
          "projectedBalanceCents": 95700
        },
        {
          "month": 11,
          "calendarMonth": 4,
          "depositCents": 30000,
          "disbursementCents": 0,
          "step1TrialBalanceCents": -30000,
          "targetBalanceCents": 120000,
          "projectedBalanceCents": 125700
        },
        {
          "month": 12,
          "calendarMonth": 5,
          "depositCents": 30000,
          "disbursementCents": 0,
          "step1TrialBalanceCents": 0,
          "targetBalanceCents": 150000,
          "projectedBalanceCents": 155700
        }
      ]
    }
  },
  {
    "id": "TV29",
    "title": "Surplus $57.01 - one cent outside the band: nearLine is null (audit, SPEC E3, optional)",
    "source": "DERIVED",
    "startMonth": 6,
    "inputs": {
      "startingBalanceCents": 155701,
      "cushionMonths": 2,
      "borrowerCurrent": true,
      "disbursements": [
        {
          "label": "Property tax 1st half",
          "month": 3,
          "amountCents": 135000
        },
        {
          "label": "Homeowners insurance",
          "month": 5,
          "amountCents": 90000
        },
        {
          "label": "Property tax 2nd half",
          "month": 9,
          "amountCents": 135000
        }
      ]
    },
    "expected": {
      "annualDisbursementsCents": 360000,
      "baseMonthlyPaymentCents": 30000,
      "cushionCapCents": 60000,
      "stepTwoAddCents": 90000,
      "requiredStartingBalanceCents": 150000,
      "differenceCents": 5701,
      "surplusCents": 5701,
      "shortageCents": 0,
      "deficiencyCents": 0,
      "lowPoint": {
        "projectedBalanceCents": 65701,
        "month": 9,
        "calendarMonth": 2,
        "lowestTargetBalanceCents": 60000
      },
      "classification": "SURPLUS_REFUND_REQUIRED",
      "cite": "12 CFR 1024.17(f)(2)(i)",
      "servicerOptions": [
        "refund the surplus to the borrower within 30 days from the date of the analysis"
      ],
      "nearLine": null,
      "newMonthlyEscrowPayment": {
        "baseMonthlyCents": 30000,
        "shortageSpreadOver12Cents": 0,
        "deficiencySpreadCents": 0,
        "deficiencySpreadMonths": 0,
        "monthlyEscrowWhileRepayingDeficiencyCents": 30000,
        "monthlyEscrowAfterDeficiencyRepaidCents": 30000
      },
      "table": [
        {
          "month": 1,
          "calendarMonth": 6,
          "depositCents": 30000,
          "disbursementCents": 0,
          "step1TrialBalanceCents": 30000,
          "targetBalanceCents": 180000,
          "projectedBalanceCents": 185701
        },
        {
          "month": 2,
          "calendarMonth": 7,
          "depositCents": 30000,
          "disbursementCents": 0,
          "step1TrialBalanceCents": 60000,
          "targetBalanceCents": 210000,
          "projectedBalanceCents": 215701
        },
        {
          "month": 3,
          "calendarMonth": 8,
          "depositCents": 30000,
          "disbursementCents": 135000,
          "step1TrialBalanceCents": -45000,
          "targetBalanceCents": 105000,
          "projectedBalanceCents": 110701
        },
        {
          "month": 4,
          "calendarMonth": 9,
          "depositCents": 30000,
          "disbursementCents": 0,
          "step1TrialBalanceCents": -15000,
          "targetBalanceCents": 135000,
          "projectedBalanceCents": 140701
        },
        {
          "month": 5,
          "calendarMonth": 10,
          "depositCents": 30000,
          "disbursementCents": 90000,
          "step1TrialBalanceCents": -75000,
          "targetBalanceCents": 75000,
          "projectedBalanceCents": 80701
        },
        {
          "month": 6,
          "calendarMonth": 11,
          "depositCents": 30000,
          "disbursementCents": 0,
          "step1TrialBalanceCents": -45000,
          "targetBalanceCents": 105000,
          "projectedBalanceCents": 110701
        },
        {
          "month": 7,
          "calendarMonth": 12,
          "depositCents": 30000,
          "disbursementCents": 0,
          "step1TrialBalanceCents": -15000,
          "targetBalanceCents": 135000,
          "projectedBalanceCents": 140701
        },
        {
          "month": 8,
          "calendarMonth": 1,
          "depositCents": 30000,
          "disbursementCents": 0,
          "step1TrialBalanceCents": 15000,
          "targetBalanceCents": 165000,
          "projectedBalanceCents": 170701
        },
        {
          "month": 9,
          "calendarMonth": 2,
          "depositCents": 30000,
          "disbursementCents": 135000,
          "step1TrialBalanceCents": -90000,
          "targetBalanceCents": 60000,
          "projectedBalanceCents": 65701
        },
        {
          "month": 10,
          "calendarMonth": 3,
          "depositCents": 30000,
          "disbursementCents": 0,
          "step1TrialBalanceCents": -60000,
          "targetBalanceCents": 90000,
          "projectedBalanceCents": 95701
        },
        {
          "month": 11,
          "calendarMonth": 4,
          "depositCents": 30000,
          "disbursementCents": 0,
          "step1TrialBalanceCents": -30000,
          "targetBalanceCents": 120000,
          "projectedBalanceCents": 125701
        },
        {
          "month": 12,
          "calendarMonth": 5,
          "depositCents": 30000,
          "disbursementCents": 0,
          "step1TrialBalanceCents": 0,
          "targetBalanceCents": 150000,
          "projectedBalanceCents": 155701
        }
      ]
    }
  }
];

// Reference material that is NOT run through the engine (the old, now-banned
// single-item method from Appendix E, kept as a negative example).
export const REFERENCE_ONLY = [
  {
    "id": "REF-APPENDIX-E-II",
    "title": "OFFICIAL Appendix E, Example II (SINGLE-ITEM analysis) - DO NOT IMPLEMENT",
    "source": "OFFICIAL - Appendix E to 12 CFR Part 1024, Part II",
    "whyItIsHere": "The task asked for every Appendix E example. Single-item analysis is no longer allowed: 1024.17(c)(4) says 'All servicers must use the aggregate accounting method'. It is kept as a NEGATIVE test: with the same bills, single-item analysis would demand a starting balance of 80000 + 33000 = 113000 cents, which is 9000 cents MORE than the aggregate answer of 104000 (TV02). An engine that returns 113000 for TV02's inputs is wrong.",
    "startMonth": 7,
    "assumptions": "Same as Example I: $360 school taxes disbursed Sep 20; $1,200 county property taxes ($500 Jul 25, $700 Dec 10); cushion one-sixth; settlement May 15; first payment July 1.",
    "rowsNote": "13 entries each: the starting 'June' row, then July through June, exactly as printed. Cents.",
    "taxes": {
      "monthlyPaymentCents": 10000,
      "disbursementsByRow": [
        0,
        50000,
        0,
        0,
        0,
        0,
        70000,
        0,
        0,
        0,
        0,
        0,
        0
      ],
      "step1": [
        0,
        -40000,
        -30000,
        -20000,
        -10000,
        0,
        -60000,
        -50000,
        -40000,
        -30000,
        -20000,
        -10000,
        0
      ],
      "step2": [
        60000,
        20000,
        30000,
        40000,
        50000,
        60000,
        0,
        10000,
        20000,
        30000,
        40000,
        50000,
        60000
      ],
      "step3": [
        80000,
        40000,
        50000,
        60000,
        70000,
        80000,
        20000,
        30000,
        40000,
        50000,
        60000,
        70000,
        80000
      ]
    },
    "schoolTaxes": {
      "monthlyPaymentCents": 3000,
      "disbursementsByRow": [
        0,
        0,
        0,
        36000,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0
      ],
      "step1": [
        0,
        3000,
        6000,
        -27000,
        -24000,
        -21000,
        -18000,
        -15000,
        -12000,
        -9000,
        -6000,
        -3000,
        0
      ],
      "step2": [
        27000,
        30000,
        33000,
        0,
        3000,
        6000,
        9000,
        12000,
        15000,
        18000,
        21000,
        24000,
        27000
      ],
      "step3": [
        33000,
        36000,
        39000,
        6000,
        9000,
        12000,
        15000,
        18000,
        21000,
        24000,
        27000,
        30000,
        33000
      ]
    },
    "singleItemStartingBalanceCents": 113000,
    "aggregateStartingBalanceCents": 104000
  }
];
