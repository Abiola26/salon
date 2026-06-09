'use strict';

const express = require('express');
const router = express.Router();
const reviewController = require('../controllers/review.controller');
const { authenticate } = require('../middlewares/auth.middleware');
const { adminOnly } = require('../middlewares/admin.middleware');
const { validate } = require('../middlewares/validate.middleware');
const { createReviewSchema } = require('../validators/review.validator');

/**
 * @route   POST /api/reviews
 * @desc    Submit a review for a completed appointment
 * @access  Private (Customer)
 */
router.post('/', authenticate, validate(createReviewSchema), reviewController.createReview);

/**
 * @route   GET /api/reviews/my
 * @desc    Get the authenticated user's own reviews
 * @access  Private
 */
router.get('/my', authenticate, reviewController.getMyReviews);

/**
 * @route   GET /api/reviews
 * @desc    Get all reviews (filterable by serviceId)
 * @access  Public
 */
router.get('/', reviewController.getReviews);

/**
 * @route   DELETE /api/reviews/:id
 * @desc    Delete a review
 * @access  Admin
 */
router.delete('/:id', authenticate, adminOnly, reviewController.deleteReview);

module.exports = router;
