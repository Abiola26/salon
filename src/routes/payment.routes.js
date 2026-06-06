'use strict';

const express = require('express');
const router = express.Router();
const paymentController = require('../controllers/payment.controller');
const { authenticate } = require('../middlewares/auth.middleware');
const { adminOnly } = require('../middlewares/admin.middleware');
const { validate } = require('../middlewares/validate.middleware');
const { createPaymentIntentSchema } = require('../validators/payment.validator');
const { paymentLimiter } = require('../middlewares/rateLimiter.middleware');

/**
 * @route   POST /api/payments/create-intent
 * @desc    Create a Stripe payment intent (full or deposit)
 * @access  Private
 */
router.post(
  '/create-intent',
  authenticate,
  paymentLimiter,
  validate(createPaymentIntentSchema),
  paymentController.createPaymentIntent
);

/**
 * @route   POST /api/payments/webhook
 * @desc    Stripe webhook handler — MUST use raw body (express.raw middleware)
 * @access  Stripe (signature verified)
 */
router.post(
  '/webhook',
  express.raw({ type: 'application/json' }),
  paymentController.handleWebhook
);

/**
 * @route   GET /api/payments
 * @desc    Get all payments (admin)
 * @access  Admin
 */
router.get('/', authenticate, adminOnly, paymentController.getAllPayments);

/**
 * @route   POST /api/payments/:paymentId/refund
 * @desc    Initiate a Stripe refund for a specific payment (Admin only)
 * @access  Admin
 */
router.post('/:paymentId/refund', authenticate, adminOnly, paymentLimiter, paymentController.refundPayment);

/**
 * @route   GET /api/payments/:appointmentId
 * @desc    Get payments for a specific appointment
 * @access  Private
 */
router.get('/:appointmentId', authenticate, paymentController.getPaymentsByAppointment);

module.exports = router;

