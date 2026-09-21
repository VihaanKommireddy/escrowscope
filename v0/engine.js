// engine.js — EscrowScope v0.1: the RESPA escrow math (12 CFR 1024.17)

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

export { analyze };