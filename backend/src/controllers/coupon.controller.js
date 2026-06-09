'use strict';

const couponService = require('../services/coupon.service');
const ApiResponse = require('../utils/ApiResponse');
const asyncHandler = require('../utils/asyncHandler');

const couponController = {
  // Public: validate coupon and return discount info
  validateCoupon: asyncHandler(async (req, res) => {
    const { code, servicePrice } = req.body;
    if (!code) {
      return res.status(400).json({ success: false, message: 'Coupon code is required' });
    }
    const result = await couponService.validateCoupon(code, servicePrice || 0);
    return ApiResponse.ok(res, 'Coupon is valid', result);
  }),

  // Admin: list all coupons
  getAllCoupons: asyncHandler(async (req, res) => {
    const { page, limit } = req.query;
    const result = await couponService.getAllCoupons({
      page: parseInt(page) || 1,
      limit: parseInt(limit) || 20,
    });
    return ApiResponse.ok(res, 'Coupons retrieved successfully', result.coupons, result.meta);
  }),

  // Admin: get coupon by ID
  getCouponById: asyncHandler(async (req, res) => {
    const coupon = await couponService.getCouponById(req.params.id);
    return ApiResponse.ok(res, 'Coupon retrieved successfully', coupon);
  }),

  // Admin: create coupon
  createCoupon: asyncHandler(async (req, res) => {
    const coupon = await couponService.createCoupon(req.body, req.user?.id, req.ip);
    return ApiResponse.created(res, 'Coupon created successfully', coupon);
  }),

  // Admin: update coupon
  updateCoupon: asyncHandler(async (req, res) => {
    const coupon = await couponService.updateCoupon(req.params.id, req.body, req.user?.id, req.ip);
    return ApiResponse.ok(res, 'Coupon updated successfully', coupon);
  }),

  // Admin: delete coupon
  deleteCoupon: asyncHandler(async (req, res) => {
    await couponService.deleteCoupon(req.params.id, req.user?.id, req.ip);
    return ApiResponse.ok(res, 'Coupon deleted successfully');
  }),
};

module.exports = couponController;
