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

  describe('createCoupon', () => {
    it('throws when coupon code is duplicate', async () => {
      couponRepository.findByCode.mockResolvedValue({ id: 'duplicate' });

      await expect(
        couponService.createCoupon({ code: 'DUPLICATE', discountType: 'FLAT', discountValue: '10' })
      ).rejects.toThrow('Coupon code "DUPLICATE" already exists');
    });

    it('creates a coupon and writes an audit log', async () => {
      couponRepository.findByCode.mockResolvedValue(null);
      couponRepository.create.mockResolvedValue({ id: 'c3', code: 'NEWCODE', discountType: 'FLAT', discountValue: '25' });
      auditLog.mockResolvedValue();

      const result = await couponService.createCoupon(
        { code: 'newcode', discountType: 'FLAT', discountValue: '25' },
        'admin-1',
        '127.0.0.1'
      );

      expect(result).toEqual({ id: 'c3', code: 'NEWCODE', discountType: 'FLAT', discountValue: '25' });
      expect(auditLog).toHaveBeenCalledWith(expect.objectContaining({ action: 'CREATE_COUPON' }));
    });
  });
});
