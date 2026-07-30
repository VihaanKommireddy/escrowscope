import { analyze } from "./engine.js";

const bills = [
  { name: "property tax 1st half", amount: 1800, month: 5 },
  { name: "homeowners insurance", amount: 1200, month: 7 },
  { name: "property tax 2nd half", amount: 1800, month: 11 },
];

const cases = [
  { name: "over-collection", start: 1500, expectLow: 1100, expectSurplus: 300 },
  { name: "exact cushion", start: 1200, expectLow: 800, expectSurplus: 0 },
  { name: "small surplus", start: 1230, expectLow: 830, expectSurplus: 30 },
  { name: "shortage", start: 1000, expectLow: 600, expectSurplus: -200 },
];

let passed = 0;
for (const c of cases) {
  const r = analyze({ startingBalance: c.start, monthlyDeposit: 400, bills: bills });
  const ok = r.lowPoint === c.expectLow && r.surplus === c.expectSurplus;
  if (ok) passed = passed + 1;
  console.log(ok ? "PASS" : "FAIL", "|", c.name, "| low", r.lowPoint, "| surplus", r.surplus);
}
console.log(passed + "/" + cases.length + " tests passed");