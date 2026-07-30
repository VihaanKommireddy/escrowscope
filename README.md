# EscrowScope

Answers one question homeowners can't easily answer: why did my mortgage
payment just jump?

About 40 million US households pay into an escrow account, where the mortgage
servicer collects extra money each month to pay property taxes and insurance.
Once a year the servicer runs an escrow analysis and mails out a statement
that almost nobody can read, and sometimes the math is wrong in the servicer's
favor. That math is federal law (RESPA, 12 CFR 1024.17): the cushion they hold
is capped at one sixth of the year's bills.

EscrowScope rebuilds the math from your statement's numbers and tells you if
you're being over-collected, and by how much. If the surplus is $50 or more,
the regulation says the servicer owes you a refund within 30 days.

## How to use it

1. Put your account numbers in a JSON file (see account.json for the shape:
   starting balance, monthly deposit, and each bill with the month it's paid)
2. Run: `node check.js account.json`
3. Read the verdict

## How it works

The engine runs a 12 month trial balance: add the monthly deposit, subtract
each bill in the month it's paid, find the lowest month-end balance, and
compare it against the legal cushion cap (total annual bills divided by 6).
The gap between them is the surplus or shortage. Every formula comes straight
from 12 CFR 1024.17, and the engine passes a test suite of hand-derived cases
(`node tests.js`).

## Status

v0.2: tested terminal engine. Next: a web page so you don't need a terminal.