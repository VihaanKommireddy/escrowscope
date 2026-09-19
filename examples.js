// examples.js — the three built-in examples (SPEC D3).
//
// Each example is a complete, made-up scenario: the account (what goes into the
// federal math), the statement (what the servicer's letter says), and what we
// EXPECT the engine to conclude. tests/examples.test.js runs every example
// through the real engine and checks `expect`, so an example can never quietly
// disagree with the math.
//
// Rules for this file:
// - All money is whole cents (120000 = $1,200.00). No decimals anywhere.
// - `month` on a bill is in ESCROW-YEAR order: month 1 is the first month of the
//   escrow year (`startMonth` says which calendar month that is, 1 = January).
// - No real servicer names, no real people. These are teaching examples.

export const EXAMPLES = [
  {
    id: "jumped-ok",
    title: "My payment jumped, and the math checks out",
    blurb:
      "Tax and insurance bills went up $900 for the year. The statement raises the escrow payment from $400 to $500 a month. The federal math agrees with every number.",
    // Same account as test vector TV18 (without the prior-year block).
    account: {
      startMonth: 1, // escrow year starts in January
      startingBalanceCents: 112500, // $1,125.00
      cushionMonths: 2,
      borrowerCurrent: true,
      disbursements: [
        { label: "Property tax", month: 5, amountCents: 210000 }, // $2,100 in May
        { label: "Homeowners insurance", month: 7, amountCents: 150000 }, // $1,500 in July
        { label: "Property tax", month: 11, amountCents: 210000 }, // $2,100 in November
      ],
    },
    statement: {
      currentMonthlyEscrowCents: 40000, // $400.00
      newMonthlyEscrowCents: 50000, // $500.00
      requiredMinimumBalanceCents: 95000, // $950.00
      claimedKind: "shortage",
      claimedAmountCents: 30000, // $300.00
      shortageSpreadMonths: 12,
      lumpSumOfferedOnStatement: false,
    },
    details: {},
    expect: {
      classification: "SHORTAGE_LT_ONE_MONTH",
      overall: "matches",
      tone: "clear",
      flagKinds: [],
    },
  },

  {
    id: "holding-too-much",
    title: "They're holding too much",
    blurb:
      "The owner's hand-worked test case #1. The account never drops below $1,100, but the most cushion the law allows is $800. That leaves a $300 surplus. The rule says a surplus of $50 or more is refunded within 30 days, as long as payments are current.",
    // Same account as test vector TV01.
    account: {
      startMonth: 1,
      startingBalanceCents: 150000, // $1,500.00
      cushionMonths: 2,
      borrowerCurrent: true,
      disbursements: [
        { label: "Property tax", month: 5, amountCents: 180000 }, // $1,800 in May
        { label: "Homeowners insurance", month: 7, amountCents: 120000 }, // $1,200 in July
        { label: "Property tax", month: 11, amountCents: 180000 }, // $1,800 in November
      ],
    },
    statement: {
      currentMonthlyEscrowCents: 40000, // $400.00
      newMonthlyEscrowCents: 40000, // $400.00
      requiredMinimumBalanceCents: 80000, // $800.00
      claimedKind: "surplus",
      claimedAmountCents: 30000, // $300.00
    },
    // The date the servicer ran the analysis. The 30-day refund clock in
    // 12 CFR 1024.17(f)(2)(i) starts here, so the refund is due by 2026-10-01.
    details: { analysisDate: "2026-09-01" },
    expect: {
      classification: "SURPLUS_REFUND_REQUIRED",
      overall: "matches",
      // A required refund always shows in amber, even when the statement agrees
      // with the math (SPEC C4), because the homeowner has money coming back.
      tone: "flag",
      flagKinds: [],
    },
  },

  {
    id: "cushion-too-big",
    title: "The cushion is too big",
    blurb:
      "The statement keeps a $1,800 cushion. That is 3 months of payments. The most the federal rule allows is 2 months: $1,200. The extra $600 shows up as a shortage the federal math does not find.",
    account: {
      startMonth: 4, // escrow year starts in April
      startingBalanceCents: 180000, // $1,800.00
      cushionMonths: 2,
      borrowerCurrent: true,
      disbursements: [
        { label: "Homeowners insurance", month: 3, amountCents: 240000 }, // June = escrow month 3
        { label: "Property tax", month: 7, amountCents: 240000 }, // October = escrow month 7
        { label: "Property tax", month: 12, amountCents: 240000 }, // March = escrow month 12
      ],
    },
    statement: {
      currentMonthlyEscrowCents: 58000, // $580.00
      newMonthlyEscrowCents: 65000, // $650.00
      requiredMinimumBalanceCents: 180000, // $1,800.00 — a 3-month cushion
      claimedKind: "shortage",
      claimedAmountCents: 60000, // $600.00
      shortageSpreadMonths: 12,
    },
    details: {},
    expect: {
      classification: "ON_TARGET",
      overall: "look-here",
      tone: "flag",
      // Sorted A–Z. CUSHION_OVER_CAP: $600 over the cap. KIND_DIFFERS: the
      // statement says "shortage", the federal math says the account is on
      // target. PAYMENT_ABOVE_MAX: $50.00 a month = $600.00 a year.
      flagKinds: ["CUSHION_OVER_CAP", "KIND_DIFFERS", "PAYMENT_ABOVE_MAX"],
    },
  },
];
