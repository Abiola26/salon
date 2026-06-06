'use strict';

const reviewService = require('../services/review.service');
const ApiResponse = require('../utils/ApiResponse');
const asyncHandler = require('../utils/asyncHandler');

const reviewController = {
  createReview: asyncHandler(async (req, res) => {
    const review = await reviewService.createReview(req.user.id, req.body);
    return ApiResponse.created(res, 'Review submitted successfully', review);
  }),

  getReviews: asyncHandler(async (req, res) => {
    const { page, limit, serviceId } = req.query;
    const result = await reviewService.getReviews({
      page: parseInt(page) || 1,
      limit: parseInt(limit) || 20,
      serviceId,
    });
    return ApiResponse.ok(res, 'Reviews retrieved successfully', result.reviews, result.meta);
  }),

  getMyReviews: asyncHandler(async (req, res) => {
    const { page, limit } = req.query;
    const result = await reviewService.getMyReviews(req.user.id, {
      page: parseInt(page) || 1,
      limit: parseInt(limit) || 20,
    });
    return ApiResponse.ok(res, 'Your reviews retrieved successfully', result.reviews, result.meta);
  }),

  deleteReview: asyncHandler(async (req, res) => {
    const result = await reviewService.deleteReview(req.params.id);
    return ApiResponse.ok(res, 'Review deleted successfully', result);
  }),
};

module.exports = reviewController;
