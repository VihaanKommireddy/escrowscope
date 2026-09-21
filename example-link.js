// example-link.js — reading "which example?" out of the page's address.
//
// A link such as ./check.html#example-2 opens the tool with example 2 filled in
// and checked. The landing page's buttons are links of exactly that shape. This
// file is the ONLY thing that reads the address, and it takes one small whole
// number from it and nothing else: no words, no amounts, nothing that is ever
// put on the page.
//
// It is pure (no page, no browser), so tests/shell.test.js runs it in Node.

export const EXAMPLE_HASH_PREFIX = "#example-";

// exampleNumberFromHash("#example-2", 3) → 2
// Anything else (no hash, another hash, 0, 4 when there are 3 examples, "2abc",
// "2.5", a minus sign, a very long string) → null.
export function exampleNumberFromHash(hash, exampleCount) {
  if (typeof hash !== "string") return null;
  if (!hash.startsWith(EXAMPLE_HASH_PREFIX)) return null;
  const digits = hash.slice(EXAMPLE_HASH_PREFIX.length);
  // One or two plain digits. No signs, no spaces, no decimals, no letters.
  if (!/^[0-9]{1,2}$/.test(digits)) return null;
  const number = Number(digits);
  if (!Number.isInteger(exampleCount) || exampleCount < 1) return null;
  if (number < 1 || number > exampleCount) return null;
  return number;
}
