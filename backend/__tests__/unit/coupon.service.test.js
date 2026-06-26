'use strict';

const couponService = require('../../src/services/coupon.service');
const couponRepository = require('../../src/repositories/coupon.repository');
const { auditLog } = require('../../src/utils/audit');
const ApiError = require('../../src/utils/ApiError');

jest.mock('../../src/repositories/coupon.repository');
jest.mock('../../src/utils/audit');

describe('couponService', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  describe('validateCoupon', () => {
    it('throws when coupon does not exist', async () => {
      couponRepository.findByCode.mockResolvedValue(null);

      await expect(couponService.validateCoupon('MISSING', '100.00')).rejects.toThrow(
        'Coupon code not found'
      );
    });

    it('throws when coupon is deactivated', async () => {
      couponRepository.findByCode.mockResolvedValue({ isActive: false });

      await expect(couponService.validateCoupon('OLD', '100.00')).rejects.toThrow(
        'This coupon has been deactivated'
      );
    });

    it('throws when coupon has expired', async () => {
      couponRepository.findByCode.mockResolvedValue({
        isActive: true,
        startDate: new Date('2000-01-01'),
        endDate: new Date('2001-01-01'),
      });

      await expect(couponService.validateCoupon('EXPIRED', '100.00')).rejects.toThrow(
        'This coupon has expired'
      );
    });

    it('returns percentage discount details', async () => {
      couponRepository.findByCode.mockResolvedValue({
        id: 'c1',
        code: 'SAVE10',
        discountType: 'PERCENTAGE',
        discountValue: '10',
        isActive: true,
        usageCount: 0,
        maxUsage: null,
      });

      const result = await couponService.validateCoupon('SAVE10', '100.00');

      expect(result).toEqual({
        couponId: 'c1',
        code: 'SAVE10',
        discountType: 'PERCENTAGE',
        discountValue: 10,
        discountAmount: 10,
      });
    });

    it('returns flat discount capped by service price', async () => {
      couponRepository.findByCode.mockResolvedValue({
        id: 'c2',
        code: 'FLAT50',
        discountType: 'FLAT',
        discountValue: '50',
        isActive: true,
        usageCount: 0,
        maxUsage: null,
      });

      const result = await couponService.validateCoupon('FLAT50', '40.00');

      expect(result).toEqual({
        couponId: 'c2',
        code: 'FLAT50',
        discountType: 'FLAT',
        discountValue: 50,
        discountAmount: 40,
      });
    });
  });

  describe('validateCoupon — additional branches', () => {
    it('throws when coupon startDate is in the future', async () => {
      couponRepository.findByCode.mockResolvedValue({
        isActive: true,
        startDate: new Date(Date.now() + 86400000), // tomorrow
        endDate: null,
        maxUsage: null,
      });
      await expect(couponService.validateCoupon('FUTURE', '100')).rejects.toThrow(
        'This coupon is not yet active'
      );
    });

    it('throws when coupon has reached its usage limit', async () => {
      couponRepository.findByCode.mockResolvedValue({
        isActive: true,
        startDate: null,
        endDate: null,
        maxUsage: 10,
        usageCount: 10,
      });
      await expect(couponService.validateCoupon('MAXED', '100')).rejects.toThrow(
        'This coupon has reached its usage limit'
      );
    });

    it('validates coupon with usageCount below maxUsage', async () => {
      couponRepository.findByCode.mockResolvedValue({
        id: 'cx', code: 'GOOD', discountType: 'FLAT', discountValue: '5',
        isActive: true, startDate: null, endDate: null, maxUsage: 10, usageCount: 5,
      });
      const r = await couponService.validateCoupon('GOOD', '50');
      expect(r.discountAmount).toBe(5);
    });
  });

  describe('getCouponById', () => {
    it('throws when coupon not found', async () => {
      couponRepository.findById.mockResolvedValue(null);
      await expect(couponService.getCouponById('x')).rejects.toThrow('Coupon not found');
    });

    it('returns coupon when found', async () => {
      const coupon = { id: 'c1', code: 'A' };
      couponRepository.findById.mockResolvedValue(coupon);
      expect(await couponService.getCouponById('c1')).toEqual(coupon);
    });
  });

  describe('getAllCoupons', () => {
    it('returns paginated coupons', async () => {
      couponRepository.findAll.mockResolvedValue([]);
      couponRepository.count.mockResolvedValue(0);
      const r = await couponService.getAllCoupons({ page: 1, limit: 5 });
      expect(r.meta.total).toBe(0);
    });
  });

  describe('updateCoupon', () => {
    it('throws when coupon not found', async () => {
      couponRepository.findById.mockResolvedValue(null);
      await expect(couponService.updateCoupon('x', {})).rejects.toThrow('Coupon not found');
    });

    it('updates without code change', async () => {
      const existing = { id: 'c1', code: 'OLD' };
      const updated = { id: 'c1', code: 'OLD', discountValue: '20' };
      couponRepository.findById.mockResolvedValue(existing);
      couponRepository.update.mockResolvedValue(updated);
      auditLog.mockResolvedValue();
      const r = await couponService.updateCoupon('c1', { discountValue: '20' }, 'admin', '::1');
      expect(r.code).toBe('OLD');
    });

    it('updates with code change — no conflict', async () => {
      const existing = { id: 'c1', code: 'OLD' };
      const updated = { id: 'c1', code: 'NEW' };
      couponRepository.findById.mockResolvedValue(existing);
      couponRepository.findByCode.mockResolvedValue(null); // no conflict
      couponRepository.update.mockResolvedValue(updated);
      auditLog.mockResolvedValue();
      const r = await couponService.updateCoupon('c1', { code: 'new' });
      expect(r.code).toBe('NEW');
    });

    it('throws on code change conflict', async () => {
      const existing = { id: 'c1', code: 'OLD' };
      couponRepository.findById.mockResolvedValue(existing);
      couponRepository.findByCode.mockResolvedValue({ id: 'other' }); // conflict
      await expect(couponService.updateCoupon('c1', { code: 'taken' })).rejects.toThrow(
        'Coupon code "TAKEN" already exists'
      );
    });
  });

  describe('deleteCoupon', () => {
    it('throws when coupon not found', async () => {
      couponRepository.findById.mockResolvedValue(null);
      await expect(couponService.deleteCoupon('x')).rejects.toThrow('Coupon not found');
    });

    it('deletes successfully and audits', async () => {
      const existing = { id: 'c1', code: 'DEL' };
      couponRepository.findById.mockResolvedValue(existing);
      couponRepository.delete.mockResolvedValue();
      auditLog.mockResolvedValue();
      await couponService.deleteCoupon('c1', 'admin', '::1');
      expect(couponRepository.delete).toHaveBeenCalledWith('c1');
      expect(auditLog).toHaveBeenCalledWith(expect.objectContaining({ action: 'DELETE_COUPON' }));
    });
  });
});
