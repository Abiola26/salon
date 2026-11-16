'use strict';

const giftCardService = require('../services/giftCard.service');
const ApiResponse = require('../utils/ApiResponse');
const asyncHandler = require('../utils/asyncHandler');

const giftCardController = {
  createGiftCard: asyncHandler(async (req, res) => {
    const card = await giftCardService.createGiftCard(req.user.id, req.body, req.ip);
    return ApiResponse.created(res, 'Gift card created successfully', card);
  }),

  getAdminGiftCards: asyncHandler(async (req, res) => {
    const result = await giftCardService.getAdminGiftCards(req.query);
    return ApiResponse.ok(res, 'Gift cards retrieved successfully', result.cards, {
      ...result.meta,
      summary: result.summary,
    });
  }),

  getMyGiftCards: asyncHandler(async (req, res) => {
    const cards = await giftCardService.getMyGiftCards(req.user);
    return ApiResponse.ok(res, 'Gift cards retrieved successfully', cards);
  }),

  getGiftCardById: asyncHandler(async (req, res) => {
    const card = await giftCardService.getGiftCardById(req.params.id);
    return ApiResponse.ok(res, 'Gift card retrieved successfully', card);
  }),

  validateGiftCard: asyncHandler(async (req, res) => {
    const card = await giftCardService.validateGiftCard(req.body.code);
    return ApiResponse.ok(res, 'Gift card is valid', card);
  }),

  voidGiftCard: asyncHandler(async (req, res) => {
    const card = await giftCardService.voidGiftCard(req.params.id, req.user.id, req.ip);
    return ApiResponse.ok(res, 'Gift card voided successfully', card);
  }),
};

module.exports = giftCardController;
