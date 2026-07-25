// engine.js — EscrowScope v0.1: the RESPA escrow math (12 CFR 1024.17)

const account = {
  startingBalance: 1500,
  monthlyDeposit: 400,
  bills: [
    { name: "property tax 1st half", amount: 1800, month: 5 },
    { name: "homeowners insurance", amount: 1200, month: 7 },
    { name: "property tax 2nd half", amount: 1800, month: 11 },
  ],
};

function analyze(acct) {
  const total = acct.bills.reduce((sum, bill) => sum + bill.amount, 0);
  const cushionCap = total / 6;

  let balance = acct.startingBalance;
  const monthEnds = [];
  for (let month = 1; month <= 12; month++) {
    balance = balance + acct.monthlyDeposit;
    for (const bill of acct.bills) {
      if (bill.month === month) balance = balance - bill.amount;
    }
    monthEnds.push(balance);
  }

  const lowPoint = Math.min(...monthEnds);
  const surplus = lowPoint - cushionCap;

  return { total, cushionCap, monthEnds, lowPoint, surplus };
}

const r = analyze(account);
console.log("total annual bills: $" + r.total);
console.log("cushion cap (1/6): $" + r.cushionCap);
console.log("month-end balances:", r.monthEnds.join(", "));
console.log("low point: $" + r.lowPoint);

if (r.surplus >= 50) {
  console.log("VERDICT: over-collecting by $" + r.surplus + " — servicer owes a refund within 30 days");
} else if (r.surplus > 0) {
  console.log("VERDICT: small surplus of $" + r.surplus + " — may be refunded or credited");
} else if (r.surplus === 0) {
  console.log("VERDICT: math checks out exactly");
} else {
  console.log("VERDICT: shortage of $" + Math.abs(r.surplus) + " — servicer may collect more");
}