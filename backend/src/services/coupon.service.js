'use strict';

const couponRepository = require('../repositories/coupon.repository');
const { auditLog } = require('../utils/audit');
const ApiError = require('../utils/ApiError');
const { toCents } = require('../utils/money');

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

    // Calculate discount in integer cents; clamp to a sane [0, price] range so
    // legacy/negative discount rows can never increase the price.
    const priceCents = Math.max(0, toCents(servicePrice));
    let discountCents = 0;
    if (coupon.discountType === 'PERCENTAGE') {
      const percent = Math.min(100, Math.max(0, parseFloat(coupon.discountValue)));
      discountCents = Math.round((priceCents * percent) / 100);
    } else {
      discountCents = Math.max(0, toCents(coupon.discountValue));
    }
    discountCents = Math.min(discountCents, priceCents);

    return {
      couponId: coupon.id,
      code: coupon.code,
      discountType: coupon.discountType,
      discountValue: parseFloat(coupon.discountValue),
      discountAmount: discountCents / 100,
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

    // Soft delete (Phase 3): history keeps the coupon row (FK stays intact) and
    // the code suffix frees the unique `code` so the original can be re-created.
    await couponRepository.softDelete(id, {
      code: `${existing.code} (deleted ${id.slice(0, 6)})`,
    });

    await auditLog({
      userId: actorId,
      action: 'DELETE_COUPON',
      details: `Deleted coupon: ${existing.code} (${id})`,
      ipAddress,
    });
  },
};

module.exports = couponService;
