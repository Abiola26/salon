'use strict';

/**
 * Booking & cancellation policy — exposed to clients via GET /api/config so
 * UI copy and enforcement share one source of truth.
 */
const CANCELLATION_POLICY = {
  freeCancelHours: 48,
  forfeitDepositOnLateCancel: true,
  noShowForfeitsDeposit: true,
};

module.exports = { CANCELLATION_POLICY };
