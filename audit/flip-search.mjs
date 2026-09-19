// flip-search.mjs — can the SPEC's cent-rounding choices flip a verdict compared with exact
// (unrounded) arithmetic? Searches simple accounts near the $50 line and the one-month tier line.
import { analyze } from './oracle.mjs';

const found = {};
const note = (key, account, r) => { if (!found[key]) found[key] = { account, rounded: { P: r.baseMonthlyPaymentCents, C: r.cushionCapCents, required: r.requiredStartingBalanceCents, difference: r.differenceCents, classification: r.classification }, exact: r.audit.exact }; };
let tried = 0; const counts = {};
const bump = (k) => { counts[k] = (counts[k] || 0) + 1; };

// Simple two-bill accounts: tax in month a, insurance in month b, amounts in whole dollars plus a few cents.
for (let taxDollars = 3000; taxDollars <= 3011; taxDollars++) {
  for (const cents of [0, 1, 5, 7]) {
    for (const [a, b] of [[4, 10], [2, 11], [6, 12], [1, 7]]) {
      const disbursements = [{ label: 'Property tax', month: a, amountCents: taxDollars * 100 + cents }, { label: 'Insurance', month: b, amountCents: 180000 }];
      const base = analyze({ startMonth: 1, startingBalanceCents: 0, cushionMonths: 2, borrowerCurrent: true, disbursements });
      const req = base.requiredStartingBalanceCents; const P = base.baseMonthlyPaymentCents;
      for (let d = -8; d <= 8; d++) {
        for (const S of [req + 5000 + d, req - P + d]) {
          if (S < 0) continue;
          tried++;
          const account = { startMonth: 1, startingBalanceCents: S, cushionMonths: 2, borrowerCurrent: true, disbursements };
          const r = analyze(account); const ex = r.audit.exact;
          if (r.surplusCents > 0 || ex.differenceCentsExact > 0) {
            const roundedSays = r.surplusCents >= 5000;
            if (roundedSays !== ex.surplusAtLeast50) { const k = ex.surplusAtLeast50 ? 'FIFTY: exact math says REFUND REQUIRED, rounded tool says under $50' : 'FIFTY: exact math says under $50, rounded tool says REFUND REQUIRED'; bump(k); note(k, account, r); }
          }
          if (r.shortageCents > 0 && r.deficiencyCents === 0) {
            const roundedGE = r.shortageCents >= P;
            if (roundedGE !== ex.shortageAtLeastOneMonth) { const k = ex.shortageAtLeastOneMonth ? 'TIER: exact math says >= one month (no 30-day lump sum), rounded tool says < one month' : 'TIER: exact math says < one month, rounded tool says >= one month'; bump(k); note(k, account, r); }
          }
        }
      }
    }
  }
}
console.log(`accounts tried: ${tried}`);
console.log('flip counts:', JSON.stringify(counts, null, 1));
for (const [k, v] of Object.entries(found)) console.log(`\n${k}\n${JSON.stringify(v)}`);
