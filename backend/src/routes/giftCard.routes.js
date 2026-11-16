'use strict';

const express = require('express');
const router = express.Router();
const giftCardController = require('../controllers/giftCard.controller');
const { authenticate } = require('../middlewares/auth.middleware');
const { adminOnly } = require('../middlewares/admin.middleware');
const { validate } = require('../middlewares/validate.middleware');
const { paymentLimiter } = require('../middlewares/rateLimiter.middleware');
const {
  createGiftCardSchema,
  giftCardQuerySchema,
  validateGiftCardSchema,
  idParamSchema,
} = require('../validators/giftCard.validator');

router.use(authenticate);

/**
 * @route   POST /api/gift-cards/validate
 * @desc    Validate a gift card code and return its available balance
 * @access  Private
 */
router.post(
  '/validate',
  paymentLimiter,
  validate(validateGiftCardSchema),
  giftCardController.validateGiftCard
);

/**
 * @route   GET /api/gift-cards/mine
 * @desc    List active gift cards addressed to the current customer
 * @access  Private
 */
router.get('/mine', giftCardController.getMyGiftCards);

/**
 * @route   GET /api/gift-cards
 * @desc    List all gift cards with summary counts (Admin only)
 * @access  Admin
 */
router.get(
  '/',
  adminOnly,
  validate(giftCardQuerySchema, 'query'),
  giftCardController.getAdminGiftCards
);

/**
 * @route   POST /api/gift-cards
 * @desc    Issue a new gift card (Admin only)
 * @access  Admin
 */
router.post(
  '/',
  adminOnly,
  validate(createGiftCardSchema),
  giftCardController.createGiftCard
);

/**
 * @route   GET /api/gift-cards/:id
 * @desc    Get a gift card with redemption history (Admin only)
 * @access  Admin
 */
router.get(
  '/:id',
  adminOnly,
  validate(idParamSchema, 'params'),
  giftCardController.getGiftCardById
);

/**
 * @route   PATCH /api/gift-cards/:id/void
 * @desc    Void a gift card and forfeit its remaining balance (Admin only)
 * @access  Admin
 */
router.patch(
  '/:id/void',
  adminOnly,
  validate(idParamSchema, 'params'),
  giftCardController.voidGiftCard
);

module.exports = router;
