'use strict';

const { toCents } = require('../utils/money');

/**
 * Loyalty economics — single source of truth for earning, redeeming and
 * clawing back points. Amounts are handled in integer cents.
 */
const POINTS_PER_DOLLAR_SPENT = 0.1; // 1 point per $10 paid
const POINTS_VALUE_IN_DOLLARS = 1.0; // 1 point = $1.00 discount
const MAX_POINTS_REDEMPTION_PCT = 0.5; // max 50% of price payable with points

/**
 * Points granted by a payment of `amount` (dollars or Prisma Decimal).
 * Integer-cents math: floor(cents * rate / 100) — mirrors per-payment credit.
 * @param {number|string|import('@prisma/client').Prisma.Decimal} amount
 * @returns {number}
 */
const pointsForAmount = (amount) =>
  Math.floor((toCents(amount) * POINTS_PER_DOLLAR_SPENT) / 100);

module.exports = {
  POINTS_PER_DOLLAR_SPENT,
  POINTS_VALUE_IN_DOLLARS,
  MAX_POINTS_REDEMPTION_PCT,
  pointsForAmount,
};
