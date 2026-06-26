'use strict';

const appointmentService = require('../../src/services/appointment.service');
const appointmentRepository = require('../../src/repositories/appointment.repository');
const serviceRepository = require('../../src/repositories/service.repository');
const staffRepository = require('../../src/repositories/staff.repository');
const couponRepository = require('../../src/repositories/coupon.repository');
const { prisma } = require('../../src/config/db');
const emailUtils = require('../../src/utils/email');
const { auditLog } = require('../../src/utils/audit');
const ApiError = require('../../src/utils/ApiError');

jest.mock('../../src/repositories/appointment.repository');
jest.mock('../../src/repositories/service.repository');
jest.mock('../../src/repositories/staff.repository');
jest.mock('../../src/repositories/coupon.repository');
jest.mock('../../src/config/db', () => ({
  prisma: {
    user: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    appointment: {
      update: jest.fn(),
    },
  },
}));
jest.mock('../../src/utils/email');
jest.mock('../../src/utils/audit');

describe('appointmentService', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    emailUtils.sendAppointmentConfirmationEmail.mockResolvedValue({});
    emailUtils.sendCancellationEmail.mockResolvedValue({});
  });

  describe('createAppointment', () => {
    it('throws when service is missing or inactive', async () => {
      serviceRepository.findById.mockResolvedValue(null);

      await expect(
        appointmentService.createAppointment('u1', { serviceId: 's1', appointmentDate: '2026-06-29', appointmentTime: '10:00' })
      ).rejects.toThrow('Service not found or inactive');
    });

    it('throws when closed on the requested day', async () => {
      serviceRepository.findById.mockResolvedValue({ id: 's1', isActive: true, duration: 30 });
      // Sunday is 0. Open days are Monday-Saturday (1-6). 2026-06-28 is a Sunday.
      await expect(
        appointmentService.createAppointment('u1', { serviceId: 's1', appointmentDate: '2026-06-28', appointmentTime: '10:00' })
      ).rejects.toThrow('We are closed on Sundays');
    });

    it('throws when slot is outside business hours', async () => {
      serviceRepository.findById.mockResolvedValue({ id: 's1', isActive: true, duration: 30 });
      // 2026-06-29 is Monday. Hours: 09:00 - 18:00
      await expect(
        appointmentService.createAppointment('u1', { serviceId: 's1', appointmentDate: '2026-06-29', appointmentTime: '08:00' })
      ).rejects.toThrow('outside business hours');
    });

    it('throws when selected stylist is inactive', async () => {
      serviceRepository.findById.mockResolvedValue({ id: 's1', isActive: true, duration: 30 });
      staffRepository.findById.mockResolvedValue({ id: 'st1', isActive: false });

      await expect(
        appointmentService.createAppointment('u1', {
          serviceId: 's1',
          appointmentDate: '2026-06-29',
          appointmentTime: '10:00',
          staffId: 'st1',
        })
      ).rejects.toThrow('Selected stylist not found or inactive');
    });

    it('throws when stylist does not offer the service', async () => {
      serviceRepository.findById.mockResolvedValue({ id: 's1', isActive: true, duration: 30 });
      staffRepository.findById.mockResolvedValue({ id: 'st1', isActive: true, services: [{ id: 's2' }] });

      await expect(
        appointmentService.createAppointment('u1', {
          serviceId: 's1',
          appointmentDate: '2026-06-29',
          appointmentTime: '10:00',
          staffId: 'st1',
        })
      ).rejects.toThrow('Selected stylist does not offer this service');
    });

    it('throws when slot is already booked', async () => {
      serviceRepository.findById.mockResolvedValue({ id: 's1', isActive: true, duration: 30, price: '100.00' });
      staffRepository.findById.mockResolvedValue({ id: 'st1', isActive: true, services: [{ id: 's1' }] });
      appointmentRepository.checkSlotConflict.mockResolvedValue(true);

      await expect(
        appointmentService.createAppointment('u1', {
          serviceId: 's1',
          appointmentDate: '2026-06-29',
          appointmentTime: '10:00',
          staffId: 'st1',
        })
      ).rejects.toThrow('already booked');
    });

    it('creates appointment successfully with valid coupon percentage', async () => {
      serviceRepository.findById.mockResolvedValue({ id: 's1', isActive: true, duration: 30, price: '100.00' });
      staffRepository.findById.mockResolvedValue({ id: 'st1', isActive: true, services: [{ id: 's1' }] });
      appointmentRepository.checkSlotConflict.mockResolvedValue(false);
      couponRepository.findByCode.mockResolvedValue({
        id: 'c1',
        isActive: true,
        discountType: 'PERCENTAGE',
        discountValue: '20',
        usageCount: 0,
        maxUsage: null,
      });
      couponRepository.incrementUsage.mockResolvedValue({});
      appointmentRepository.create.mockResolvedValue({
        id: 'a1',
        user: { email: 'u1@example.com' },
        service: { name: 'Cut' },
      });

      const result = await appointmentService.createAppointment('u1', {
        serviceId: 's1',
        appointmentDate: '2026-06-29',
        appointmentTime: '10:00',
        staffId: 'st1',
        couponCode: 'SAVE20',
      });

      expect(couponRepository.incrementUsage).toHaveBeenCalledWith('c1');
      expect(appointmentRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          discountAmount: 20, // 20% of 100
        })
      );
    });

    it('creates appointment successfully redeeming loyalty points', async () => {
      serviceRepository.findById.mockResolvedValue({ id: 's1', isActive: true, duration: 30, price: '100.00' });
      staffRepository.findById.mockResolvedValue({ id: 'st1', isActive: true, services: [{ id: 's1' }] });
      appointmentRepository.checkSlotConflict.mockResolvedValue(false);
      prisma.user.findUnique.mockResolvedValue({ loyaltyPoints: 30 }); // 30 points = $30 discount
      prisma.user.update.mockResolvedValue({});
      appointmentRepository.create.mockResolvedValue({
        id: 'a1',
        user: { email: 'u1@example.com' },
        service: { name: 'Cut' },
      });

      await appointmentService.createAppointment('u1', {
        serviceId: 's1',
        appointmentDate: '2026-06-29',
        appointmentTime: '10:00',
        staffId: 'st1',
        redeemPoints: true,
      });

      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { loyaltyPoints: { decrement: 30 } },
        })
      );
    });
  });

  describe('creditLoyaltyPoints', () => {
    it('does nothing when appointment is not found', async () => {
      appointmentRepository.findByIdRaw.mockResolvedValue(null);

      await appointmentService.creditLoyaltyPoints('a1', 100);
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it('credits points to user on payment amount', async () => {
      appointmentRepository.findByIdRaw.mockResolvedValue({ userId: 'u1' });
      prisma.user.update.mockResolvedValue({});

      await appointmentService.creditLoyaltyPoints('a1', '100.00'); // 1 point per $10 -> 10 points
      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { loyaltyPoints: { increment: 10 } },
        })
      );
    });
  });

  describe('getAppointments', () => {
    it('returns appointment list and total count', async () => {
      appointmentRepository.findAll.mockResolvedValue([]);
      appointmentRepository.count.mockResolvedValue(0);

      const result = await appointmentService.getAppointments('u1', 'CUSTOMER', { page: 1, limit: 10 });
      expect(result.appointments).toEqual([]);
      expect(result.meta.totalPages).toBe(0);
    });
  });

  describe('getAppointmentById', () => {
    it('throws when not found', async () => {
      appointmentRepository.findById.mockResolvedValue(null);

      await expect(appointmentService.getAppointmentById('a1', 'u1', 'CUSTOMER')).rejects.toThrow('Appointment not found');
    });

    it('throws when customer attempts to access other profile', async () => {
      appointmentRepository.findById.mockResolvedValue({ id: 'a1', userId: 'other' });

      await expect(appointmentService.getAppointmentById('a1', 'u1', 'CUSTOMER')).rejects.toThrow('not authorized');
    });

    it('returns appointment successfully', async () => {
      const appointment = { id: 'a1', userId: 'u1' };
      appointmentRepository.findById.mockResolvedValue(appointment);

      const result = await appointmentService.getAppointmentById('a1', 'u1', 'CUSTOMER');
      expect(result).toEqual(appointment);
    });
  });

  describe('rescheduleAppointment', () => {
    it('throws when appointment not found', async () => {
      appointmentRepository.findByIdRaw.mockResolvedValue(null);

      await expect(
        appointmentService.rescheduleAppointment('a1', 'u1', 'CUSTOMER', { appointmentDate: '2026-06-29', appointmentTime: '10:00' })
      ).rejects.toThrow('Appointment not found');
    });

    it('throws when cancelled or completed', async () => {
      appointmentRepository.findByIdRaw.mockResolvedValue({ id: 'a1', userId: 'u1', status: 'CANCELLED' });

      await expect(
        appointmentService.rescheduleAppointment('a1', 'u1', 'CUSTOMER', { appointmentDate: '2026-06-29', appointmentTime: '10:00' })
      ).rejects.toThrow('Cannot reschedule a cancelled appointment');
    });

    it('reschedules appointment successfully', async () => {
      appointmentRepository.findByIdRaw.mockResolvedValue({ id: 'a1', userId: 'u1', status: 'PENDING', serviceId: 's1' });
      serviceRepository.findById.mockResolvedValue({ duration: 30 });
      appointmentRepository.checkSlotConflict.mockResolvedValue(false);
      appointmentRepository.update.mockResolvedValue({ id: 'a1' });

      const result = await appointmentService.rescheduleAppointment('a1', 'u1', 'CUSTOMER', {
        appointmentDate: '2026-06-29',
        appointmentTime: '10:00',
      });

      expect(appointmentRepository.update).toHaveBeenCalledWith('a1', expect.objectContaining({
        appointmentTime: '10:00',
        status: 'PENDING',
      }));
    });
  });

  describe('cancelAppointment', () => {
    it('throws when not found', async () => {
      appointmentRepository.findById.mockResolvedValue(null);

      await expect(appointmentService.cancelAppointment('a1', 'u1', 'CUSTOMER')).rejects.toThrow('Appointment not found');
    });

    it('throws when already cancelled', async () => {
      appointmentRepository.findById.mockResolvedValue({ id: 'a1', userId: 'u1', status: 'CANCELLED' });

      await expect(appointmentService.cancelAppointment('a1', 'u1', 'CUSTOMER')).rejects.toThrow('already cancelled');
    });

    it('cancels appointment successfully and refunds loyalty points', async () => {
      appointmentRepository.findById.mockResolvedValue({
        id: 'a1',
        userId: 'u1',
        status: 'CONFIRMED',
        pointsRedeemed: 30,
        user: {},
        service: {},
      });
      appointmentRepository.update.mockResolvedValue({ id: 'a1', status: 'CANCELLED' });
      prisma.user.update.mockResolvedValue({});
      emailUtils.sendCancellationEmail.mockResolvedValue({});
      auditLog.mockResolvedValue({});

      const result = await appointmentService.cancelAppointment('a1', 'u1', 'CUSTOMER');

      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { loyaltyPoints: { increment: 30 } },
        })
      );
      expect(appointmentRepository.update).toHaveBeenCalledWith('a1', { status: 'CANCELLED' });
    });
  });

  describe('confirmAppointment', () => {
    it('confirms appointment successfully', async () => {
      appointmentRepository.findByIdRaw.mockResolvedValue({ id: 'a1', userId: 'u1' });
      appointmentRepository.update.mockResolvedValue({ id: 'a1', status: 'CONFIRMED' });
      auditLog.mockResolvedValue({});

      const result = await appointmentService.confirmAppointment('a1', 'admin-1');

      expect(appointmentRepository.update).toHaveBeenCalledWith('a1', { status: 'CONFIRMED' });
      expect(auditLog).toHaveBeenCalledWith(expect.objectContaining({ action: 'CONFIRM_APPOINTMENT' }));
    });
  });

  describe('getAvailableSlots', () => {
    it('returns closed status when day is closed', async () => {
      // 2026-06-28 is Sunday
      const result = await appointmentService.getAvailableSlots('2026-06-28', 's1');
      expect(result.open).toBe(false);
      expect(result.reason).toContain('Closed on Sunday');
    });

    it('returns list of slots and checks blocked time overlapping', async () => {
      serviceRepository.findById.mockResolvedValue({ duration: 30, isActive: true });
      // 2026-06-29 is Monday (open)
      // Appointment at 10:00 for 30 minutes blocks 10:00 to 10:30
      appointmentRepository.findBookedSlots.mockResolvedValue([
        { appointmentTime: '10:00', service: { duration: 30 } },
      ]);

      const result = await appointmentService.getAvailableSlots('2026-06-29', 's1', 'st1');
      expect(result.open).toBe(true);
      
      const slot1000 = result.slots.find((s) => s.time === '10:00');
      const slot1030 = result.slots.find((s) => s.time === '10:30');
      
      expect(slot1000.available).toBe(false);
      expect(slot1030.available).toBe(true);
    });
  });
});
