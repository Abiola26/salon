'use strict';

const paymentService = require('../services/payment.service');
const ApiResponse = require('../utils/ApiResponse');
const asyncHandler = require('../utils/asyncHandler');

const paymentController = {
  createPaymentIntent: asyncHandler(async (req, res) => {
    const result = await paymentService.createPaymentIntent(req.user.id, req.body);
    return ApiResponse.created(res, 'Payment intent created', result);
  }),

  handleWebhook: asyncHandler(async (req, res) => {
    const signature = req.headers['stripe-signature'];
    const result = await paymentService.handleWebhook(req.rawBody, signature);
    return res.status(200).json(result);
  }),

  getAllPayments: asyncHandler(async (req, res) => {
    const { page, limit, userId, status } = req.query;
    const result = await paymentService.getPayments({
      page: parseInt(page) || 1,
      limit: parseInt(limit) || 20,
      userId,
      status,
    });
    return ApiResponse.ok(res, 'Payments retrieved successfully', result.payments, result.meta);
  }),

  getPaymentsByAppointment: asyncHandler(async (req, res) => {
    const payments = await paymentService.getPaymentsByAppointment(
      req.params.appointmentId,
      req.user.id,
      req.user.role
    );
    return ApiResponse.ok(res, 'Payments retrieved successfully', payments);
  }),
};

module.exports = paymentController;
