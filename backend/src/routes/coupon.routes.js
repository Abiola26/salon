'use strict';

const express = require('express');
const router = express.Router();
const couponController = require('../controllers/coupon.controller');
const { authenticate } = require('../middlewares/auth.middleware');
const { adminOnly } = require('../middlewares/admin.middleware');

/**
 * @route   POST /api/coupons/validate
 * @desc    Validate a coupon code and return discount info
 * @access  Authenticated customers
 */
router.post('/validate', authenticate, couponController.validateCoupon);

/**
 * @route   GET /api/coupons
 * @desc    Get all coupons
 * @access  Admin
 */
router.get('/', authenticate, adminOnly, couponController.getAllCoupons);

/**
 * @route   GET /api/coupons/:id
 * @desc    Get a coupon by ID
 * @access  Admin
 */
router.get('/:id', authenticate, adminOnly, couponController.getCouponById);

/**
 * @route   POST /api/coupons
 * @desc    Create a new coupon
 * @access  Admin
 */
router.post('/', authenticate, adminOnly, couponController.createCoupon);

/**
 * @route   PUT /api/coupons/:id
 * @desc    Update a coupon
 * @access  Admin
 */
router.put('/:id', authenticate, adminOnly, couponController.updateCoupon);

/**
 * @route   DELETE /api/coupons/:id
 * @desc    Delete a coupon
 * @access  Admin
 */
router.delete('/:id', authenticate, adminOnly, couponController.deleteCoupon);

module.exports = router;
