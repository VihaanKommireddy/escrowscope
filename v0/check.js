import { readFileSync } from "fs";
import { analyze } from "./engine.js";

const file = process.argv[2];
if (!file) {
  console.log("Usage: node check.js <account.json>");
  process.exit(1);
}

const account = JSON.parse(readFileSync(file, "utf8"));
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