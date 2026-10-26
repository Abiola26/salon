'use strict';

const userRepository = require('../../src/repositories/user.repository');
const couponRepository = require('../../src/repositories/coupon.repository');
const paymentRepository = require('../../src/repositories/payment.repository');
const serviceRepository = require('../../src/repositories/service.repository');
const staffRepository = require('../../src/repositories/staff.repository');
const reviewRepository = require('../../src/repositories/review.repository');
const appointmentRepository = require('../../src/repositories/appointment.repository');
const { prisma } = require('../../src/config/db');

jest.mock('../../src/config/db', () => ({
  prisma: {
    $executeRaw: jest.fn(),
    $queryRaw: jest.fn(),
    user: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      findFirst: jest.fn(),
    },
    coupon: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    payment: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      aggregate: jest.fn(),
    },
    service: {
      findMany: jest.fn(),
      count: jest.fn(),
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    staff: {
      findMany: jest.fn(),
      count: jest.fn(),
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    review: {
      findMany: jest.fn(),
      count: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      delete: jest.fn(),
    },
    appointment: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      findFirst: jest.fn(),
    },
  },
}));

describe('Repositories', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  describe('userRepository', () => {
    it('calls standard findById (soft-delete filtered)', async () => {
      await userRepository.findById('1');
      expect(prisma.user.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: '1', deletedAt: null } })
      );
    });

    it('calls findByIdFull', async () => {
      await userRepository.findByIdFull('1');
      expect(prisma.user.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: '1', deletedAt: null } })
      );
    });

    it('calls findByEmail', async () => {
      await userRepository.findByEmail('t@t.com');
      expect(prisma.user.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { email: 't@t.com', deletedAt: null } })
      );
    });

    it('calls findAll with and without role', async () => {
      await userRepository.findAll();
      await userRepository.findAll({ role: 'ADMIN' });
      expect(prisma.user.findMany).toHaveBeenCalledTimes(2);
    });

    it('calls count', async () => {
      await userRepository.count();
      expect(prisma.user.count).toHaveBeenCalled();
    });

    it('calls create', async () => {
      await userRepository.create({ name: 'J' });
      expect(prisma.user.create).toHaveBeenCalled();
    });

    it('calls update and updateByEmail', async () => {
      await userRepository.update('1', { name: 'J' });
      await userRepository.updateByEmail('t@t.com', { name: 'J' });
      expect(prisma.user.update).toHaveBeenCalledTimes(2);
    });

    it('calls softDelete', async () => {
      await userRepository.softDelete('1', { name: 'Deleted user' });
      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: '1' },
          data: expect.objectContaining({ name: 'Deleted user', deletedAt: expect.any(Date) }),
        })
      );
    });

    it('calls findByResetToken', async () => {
      await userRepository.findByResetToken('token');
      expect(prisma.user.findFirst).toHaveBeenCalled();
    });
  });

  describe('couponRepository', () => {
    it('calls findByCode, findById, findAll, count, create, update, incrementUsage, softDelete', async () => {
      await couponRepository.findByCode('SAVE10');
      await couponRepository.findById('c1');
      await couponRepository.findAll();
      await couponRepository.count();
      await couponRepository.create({ code: 'CODE' });
      await couponRepository.update('c1', { code: 'CODE' });
      await couponRepository.incrementUsage('c1');
      await couponRepository.softDelete('c1', { code: 'CODE (deleted c1)' });

      expect(prisma.coupon.findFirst).toHaveBeenCalledTimes(2);
      expect(prisma.coupon.findMany).toHaveBeenCalled();
      expect(prisma.coupon.count).toHaveBeenCalledWith({ where: { deletedAt: null } });
      expect(prisma.coupon.create).toHaveBeenCalled();
      expect(prisma.coupon.update).toHaveBeenCalledTimes(2);
      expect(prisma.$executeRaw).toHaveBeenCalled(); // conditional incrementUsage
    });
  });

  describe('paymentRepository', () => {
    it('calls findById, findByAppointmentId, findByStripeIntentId, findAll, count, create, update, updateByStripeIntentId, getTotalRevenue', async () => {
      await paymentRepository.findById('p1');
      await paymentRepository.findByAppointmentId('a1');
      await paymentRepository.findByStripeIntentId('pi_123');
      await paymentRepository.findAll({ userId: 'u1', status: 'SUCCEEDED' });
      await paymentRepository.findAll();
      await paymentRepository.count();
      await paymentRepository.create({ amount: 10 });
      await paymentRepository.update('p1', { amount: 10 });
      await paymentRepository.updateByStripeIntentId('pi_123', { amount: 10 });
      await paymentRepository.getTotalRevenue();

      expect(prisma.payment.findUnique).toHaveBeenCalledTimes(2);
      expect(prisma.payment.findMany).toHaveBeenCalledTimes(3);
      expect(prisma.payment.count).toHaveBeenCalled();
      expect(prisma.payment.create).toHaveBeenCalled();
      expect(prisma.payment.update).toHaveBeenCalledTimes(2);
      expect(prisma.payment.aggregate).toHaveBeenCalled();
    });
  });

  describe('serviceRepository', () => {
    it('calls findAll, count, findById, findByName, create, update, softDelete, findMostBooked', async () => {
      await serviceRepository.findAll({ isActive: true });
      await serviceRepository.findAll();
      await serviceRepository.count();
      await serviceRepository.findById('s1');
      await serviceRepository.findByName('Cut');
      await serviceRepository.create({ name: 'Cut' });
      await serviceRepository.update('s1', { name: 'Cut' });
      await serviceRepository.softDelete('s1');
      await serviceRepository.findMostBooked();

      expect(prisma.service.findMany).toHaveBeenCalledTimes(3);
      expect(prisma.service.count).toHaveBeenCalledWith({ where: { deletedAt: null } });
      expect(prisma.service.findFirst).toHaveBeenCalled();
      expect(prisma.service.create).toHaveBeenCalled();
      expect(prisma.service.update).toHaveBeenCalledTimes(2); // update + softDelete
    });
  });

  describe('staffRepository', () => {
    it('calls findAll, count, findById, findByServiceId, create, update, softDelete', async () => {
      await staffRepository.findAll({ isActive: true });
      await staffRepository.findAll();
      await staffRepository.count();
      await staffRepository.findById('st1');
      await staffRepository.findByServiceId('s1');
      await staffRepository.create({ name: 'Stylist' });
      await staffRepository.update('st1', { name: 'Stylist' });
      await staffRepository.softDelete('st1');

      expect(prisma.staff.findMany).toHaveBeenCalledTimes(3);
      expect(prisma.staff.count).toHaveBeenCalled();
      expect(prisma.staff.findFirst).toHaveBeenCalled();
      expect(prisma.staff.create).toHaveBeenCalled();
      expect(prisma.staff.update).toHaveBeenCalledTimes(2); // update + softDelete
    });
  });

  describe('reviewRepository', () => {
    it('calls findById, findByAppointmentId, findAll, count, create, delete', async () => {
      await reviewRepository.findById('r1');
      await reviewRepository.findByAppointmentId('a1');
      await reviewRepository.findAll({ serviceId: 's1', userId: 'u1' });
      await reviewRepository.findAll();
      await reviewRepository.count({ serviceId: 's1' });
      await reviewRepository.create({ rating: 5 });
      await reviewRepository.delete('r1');

      expect(prisma.review.findUnique).toHaveBeenCalledTimes(2);
      expect(prisma.review.findMany).toHaveBeenCalledTimes(2);
      expect(prisma.review.count).toHaveBeenCalled();
      expect(prisma.review.create).toHaveBeenCalled();
      expect(prisma.review.delete).toHaveBeenCalled();
    });
  });

  describe('appointmentRepository', () => {
    it('calls findById, findByIdRaw, findAll, count, create, update, delete, checkSlotConflict, findBookedSlots', async () => {
      await appointmentRepository.findById('a1');
      await appointmentRepository.findByIdRaw('a1');
      await appointmentRepository.findAll({ userId: 'u1', status: 'PENDING', paymentStatus: 'UNPAID', date: '2026-06-25' });
      await appointmentRepository.findAll();
      await appointmentRepository.count();
      await appointmentRepository.create({ appointmentTime: '10:00' });
      await appointmentRepository.update('a1', { appointmentTime: '10:00' });
      await appointmentRepository.delete('a1');
      
      // Slot conflict checks (duration-aware, findMany-based)
      appointmentRepository.checkSlotConflict('2026-06-25', '10:00', 'a1', 'st1');
      appointmentRepository.checkSlotConflict('2026-06-25', '10:00', null, null);
      
      // Find booked slots
      appointmentRepository.findBookedSlots('2026-06-25', 'st1');
      appointmentRepository.findBookedSlots('2026-06-25', null);

      expect(prisma.appointment.findUnique).toHaveBeenCalledTimes(2);
      expect(prisma.appointment.findMany).toHaveBeenCalledTimes(6);
      expect(prisma.appointment.count).toHaveBeenCalled();
      expect(prisma.appointment.create).toHaveBeenCalled();
      expect(prisma.appointment.update).toHaveBeenCalled();
      expect(prisma.appointment.delete).toHaveBeenCalled();
      expect(prisma.appointment.findFirst).not.toHaveBeenCalled();
    });

    it('checkSlotConflict returns the overlapping booking (duration-aware)', async () => {
      // Request 10:30 for 30min [630,660) vs existing 10:00 for 60min [600,660) → overlap
      prisma.appointment.findMany.mockResolvedValueOnce([
        { appointmentTime: '10:00', service: { duration: 60 } },
      ]);
      const overlap = await appointmentRepository.checkSlotConflict('2026-06-25', '10:30', 'a1', 'st1', 30);
      expect(overlap).toEqual(expect.objectContaining({ appointmentTime: '10:00' }));
      expect(prisma.appointment.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            appointmentDate: new Date('2026-06-25'),
            status: { not: 'CANCELLED' },
            staffId: 'st1',
            id: { not: 'a1' },
          }),
        })
      );
    });

    it('checkSlotConflict ignores adjacent, later, and missing-duration cases', async () => {
      // Starts exactly when the request ends: [600,630) vs [630,660) → no overlap
      prisma.appointment.findMany.mockResolvedValueOnce([
        { appointmentTime: '10:00', service: { duration: 30 } },
      ]);
      const adjacent = await appointmentRepository.checkSlotConflict('2026-06-25', '10:30', null, null, 30);
      expect(adjacent).toBeNull();

      // Starts after the request ends: [660,690) vs [630,660) → no overlap
      prisma.appointment.findMany.mockResolvedValueOnce([
        { appointmentTime: '11:00', service: { duration: 30 } },
      ]);
      const later = await appointmentRepository.checkSlotConflict('2026-06-25', '10:30', null, null, 30);
      expect(later).toBeNull();

      // Ends before the request starts: [540,570) vs [600,630) → no overlap
      prisma.appointment.findMany.mockResolvedValueOnce([
        { appointmentTime: '09:00', service: { duration: 30 } },
      ]);
      const earlier = await appointmentRepository.checkSlotConflict('2026-06-25', '10:00', null, null, 30);
      expect(earlier).toBeNull();

      // Missing service duration → fallback to 1-minute ranges, same start conflicts
      prisma.appointment.findMany.mockResolvedValueOnce([
        { appointmentTime: '10:00', service: null },
      ]);
      const fallback = await appointmentRepository.checkSlotConflict('2026-06-25', '10:00');
      expect(fallback).toEqual(expect.objectContaining({ appointmentTime: '10:00' }));

      // Empty candidate list
      prisma.appointment.findMany.mockResolvedValueOnce([]);
      const none = await appointmentRepository.checkSlotConflict('2026-06-25', '10:00', null, 'st1', 30);
      expect(none).toBeNull();
    });
  });
});
