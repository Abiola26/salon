'use strict';

/**
 * Money helpers — work in integer cents end-to-end to avoid float drift.
 * Prisma Decimal columns arrive as strings ("12.34") or Decimal objects;
 * parseFloat of those is exact to 2dp, and Math.round makes it safe.
 */

/** Convert a decimal-like value (string/number/Decimal/null) to integer cents. 0 for junk. */
const toCents = (value) => {
  const n = parseFloat(value);
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
};

/** Convert integer cents back to a 2dp decimal string for Prisma Decimal columns. */
const toDecimal2 = (cents) => (Math.round(cents) / 100).toFixed(2);

module.exports = { toCents, toDecimal2 };
