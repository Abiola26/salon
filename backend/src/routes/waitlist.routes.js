'use strict';

const express = require('express');
const router = express.Router();
const waitlistController = require('../controllers/waitlist.controller');
const { authenticate } = require('../middlewares/auth.middleware');
const { adminOnly } = require('../middlewares/admin.middleware');
const { validate } = require('../middlewares/validate.middleware');
const {
  createWaitlistSchema,
  waitlistQuerySchema,
} = require('../validators/waitlist.validator');

router.use(authenticate);

/**
 * @route   POST /api/waitlist
 * @desc    Join the waitlist for a service/date
 * @access  Private
 */
router.post('/', validate(createWaitlistSchema), waitlistController.joinWaitlist);

/**
 * @route   GET /api/waitlist/my
 * @desc    List the current customer's waitlist entries
 * @access  Private
 */
router.get('/my', waitlistController.getMyWaitlist);

/**
 * @route   GET /api/waitlist
 * @desc    List all waitlist entries (Admin only)
 * @access  Admin
 */
router.get(
  '/',
  adminOnly,
  validate(waitlistQuerySchema, 'query'),
  waitlistController.getAdminWaitlist
);

/**
 * @route   PATCH /api/waitlist/:id/notify
 * @desc    Email a customer that a matching slot may be available (Admin only)
 * @access  Admin
 */
router.patch('/:id/notify', adminOnly, waitlistController.notifyEntry);

/**
 * @route   DELETE /api/waitlist/:id
 * @desc    Cancel a waitlist entry (owner or admin)
 * @access  Private
 */
router.delete('/:id', waitlistController.cancelEntry);

module.exports = router;
