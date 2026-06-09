'use strict';

const couponRepository = require('../repositories/coupon.repository');
const { auditLog } = require('../utils/audit');
const ApiError = require('../utils/ApiError');

const couponService = {
  async validateCoupon(code, servicePrice) {
    const coupon = await couponRepository.findByCode(code);

    if (!coupon) throw ApiError.notFound('Coupon code not found');
    if (!coupon.isActive) throw ApiError.badRequest('This coupon has been deactivated');

    const now = new Date();
    if (coupon.startDate && now < coupon.startDate) {
      throw ApiError.badRequest('This coupon is not yet active');
    }
    if (coupon.endDate && now > coupon.endDate) {
      throw ApiError.badRequest('This coupon has expired');
    }
    if (coupon.maxUsage !== null && coupon.usageCount >= coupon.maxUsage) {
      throw ApiError.badRequest('This coupon has reached its usage limit');
    }

    // Calculate discount
    let discountAmount = 0;
    if (coupon.discountType === 'PERCENTAGE') {
      discountAmount = (parseFloat(servicePrice) * parseFloat(coupon.discountValue)) / 100;
    } else {
      discountAmount = Math.min(parseFloat(coupon.discountValue), parseFloat(servicePrice));
    }

    return {
      couponId: coupon.id,
      code: coupon.code,
      discountType: coupon.discountType,
      discountValue: parseFloat(coupon.discountValue),
      discountAmount: parseFloat(discountAmount.toFixed(2)),
    };
  },

  async getAllCoupons({ page = 1, limit = 20 } = {}) {
    const skip = (page - 1) * limit;
    const [coupons, total] = await Promise.all([
      couponRepository.findAll({ skip, take: limit }),
      couponRepository.count(),
    ]);
    return { coupons, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } };
  },

  async getCouponById(id) {
    const coupon = await couponRepository.findById(id);
    if (!coupon) throw ApiError.notFound('Coupon not found');
    return coupon;
  },

  async createCoupon(dto, actorId = null, ipAddress = null) {
    // Check for duplicate code
    const existing = await couponRepository.findByCode(dto.code);
    if (existing) throw ApiError.conflict(`Coupon code "${dto.code.toUpperCase()}" already exists`);

    const coupon = await couponRepository.create({
      ...dto,
      code: dto.code.toUpperCase(),
    });

    await auditLog({
      userId: actorId,
      action: 'CREATE_COUPON',
      details: `Created coupon: ${coupon.code} (${coupon.discountType} - ${coupon.discountValue})`,
      ipAddress,
    });

    return coupon;
  },

  async updateCoupon(id, dto, actorId = null, ipAddress = null) {
    const existing = await couponRepository.findById(id);
    if (!existing) throw ApiError.notFound('Coupon not found');

    // Prevent code conflict if code is being changed
    if (dto.code && dto.code.toUpperCase() !== existing.code) {
      const codeConflict = await couponRepository.findByCode(dto.code);
      if (codeConflict) throw ApiError.conflict(`Coupon code "${dto.code.toUpperCase()}" already exists`);
    }

    const updated = await couponRepository.update(id, {
      ...dto,
      ...(dto.code && { code: dto.code.toUpperCase() }),
    });

    await auditLog({
      userId: actorId,
      action: 'UPDATE_COUPON',
      details: `Updated coupon: ${updated.code} (${id})`,
      ipAddress,
    });

    return updated;
  },

  async deleteCoupon(id, actorId = null, ipAddress = null) {
    const existing = await couponRepository.findById(id);
    if (!existing) throw ApiError.notFound('Coupon not found');

    await couponRepository.delete(id);

    await auditLog({
      userId: actorId,
      action: 'DELETE_COUPON',
      details: `Deleted coupon: ${existing.code} (${id})`,
      ipAddress,
    });
  },
};

module.exports = couponService;
