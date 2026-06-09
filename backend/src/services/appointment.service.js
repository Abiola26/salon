'use strict';

const appointmentRepository = require('../repositories/appointment.repository');
const serviceRepository = require('../repositories/service.repository');
const staffRepository = require('../repositories/staff.repository');
const couponRepository = require('../repositories/coupon.repository');
const { prisma } = require('../config/db');
const { sendAppointmentConfirmationEmail, sendCancellationEmail } = require('../utils/email');
const { auditLog } = require('../utils/audit');
const ApiError = require('../utils/ApiError');
const {
  isOpenDay,
  isWithinBusinessHours,
  generateSlots,
  timeToMinutes,
  WORKING_HOURS,
} = require('../config/workingHours');

// ── Loyalty points config ─────────────────────────────────────────────────────
const POINTS_PER_DOLLAR_SPENT = 0.1;   // 1 point per $10 paid
const POINTS_VALUE_IN_DOLLARS = 1.0;   // 1 point = $1.00 discount
const MAX_POINTS_REDEMPTION_PCT = 0.5; // max 50% of price can be paid with points

const appointmentService = {
  async createAppointment(userId, dto) {
    // Verify service exists and is active
    const service = await serviceRepository.findById(dto.serviceId);
    if (!service || !service.isActive) throw ApiError.notFound('Service not found or inactive');

    // ── Business Hours Check ─────────────────────────────────────────────────
    const requestedDate = new Date(dto.appointmentDate);
    if (!isOpenDay(requestedDate)) {
      throw ApiError.badRequest(
        `We are closed on ${requestedDate.toLocaleDateString('en-US', { weekday: 'long' })}s. Please choose a Monday–Saturday.`
      );
    }
    if (!isWithinBusinessHours(dto.appointmentTime, service.duration)) {
      throw ApiError.badRequest(
        `Time slot ${dto.appointmentTime} is outside business hours (${WORKING_HOURS.openTime}–${WORKING_HOURS.closeTime}). ` +
        `Note: your ${service.duration}-min service must end by ${WORKING_HOURS.closeTime}.`
      );
    }

    // ── Resolve Staff ─────────────────────────────────────────────────────────
    let staffId = dto.staffId || null;
    if (staffId) {
      const staff = await staffRepository.findById(staffId);
      if (!staff || !staff.isActive) throw ApiError.notFound('Selected stylist not found or inactive');
      const offersService = staff.services.some((s) => s.id === dto.serviceId);
      if (!offersService) throw ApiError.badRequest('Selected stylist does not offer this service');
    } else {
      // Auto-assign first available stylist for this service
      const staffList = await staffRepository.findByServiceId(dto.serviceId);
      for (const candidate of staffList) {
        const conflict = await appointmentRepository.checkSlotConflict(
          dto.appointmentDate, dto.appointmentTime, null, candidate.id
        );
        if (!conflict) {
          staffId = candidate.id;
          break;
        }
      }
      // If no staff found (no stylists for service), fall back to no-staff booking
    }

    // ── Double booking Check ──────────────────────────────────────────────────
    const conflict = await appointmentRepository.checkSlotConflict(
      dto.appointmentDate, dto.appointmentTime, null, staffId
    );
    if (conflict) {
      throw ApiError.conflict(
        `The time slot ${dto.appointmentTime} on ${dto.appointmentDate} is already booked for this stylist. Please choose a different time or stylist.`
      );
    }

    // ── Coupon Validation ─────────────────────────────────────────────────────
    let couponId = null;
    let couponDiscount = 0;
    if (dto.couponCode) {
      const coupon = await couponRepository.findByCode(dto.couponCode);
      if (coupon && coupon.isActive) {
        const now = new Date();
        const notExpired = (!coupon.endDate || now <= coupon.endDate);
        const notStartedYet = (coupon.startDate && now < coupon.startDate);
        const hasUsage = (coupon.maxUsage === null || coupon.usageCount < coupon.maxUsage);
        if (notExpired && !notStartedYet && hasUsage) {
          couponId = coupon.id;
          if (coupon.discountType === 'PERCENTAGE') {
            couponDiscount = (parseFloat(service.price) * parseFloat(coupon.discountValue)) / 100;
          } else {
            couponDiscount = Math.min(parseFloat(coupon.discountValue), parseFloat(service.price));
          }
          // Increment usage count
          await couponRepository.incrementUsage(couponId);
        }
      }
    }

    // ── Loyalty Points Redemption ─────────────────────────────────────────────
    let pointsRedeemed = 0;
    let pointsDiscount = 0;
    if (dto.redeemPoints) {
      const user = await prisma.user.findUnique({ where: { id: userId }, select: { loyaltyPoints: true } });
      const priceAfterCoupon = parseFloat(service.price) - couponDiscount;
      const maxPointsDiscount = priceAfterCoupon * MAX_POINTS_REDEMPTION_PCT;
      const availablePointsValue = (user?.loyaltyPoints || 0) * POINTS_VALUE_IN_DOLLARS;
      pointsDiscount = Math.min(availablePointsValue, maxPointsDiscount);
      pointsRedeemed = Math.floor(pointsDiscount / POINTS_VALUE_IN_DOLLARS);
      pointsDiscount = pointsRedeemed * POINTS_VALUE_IN_DOLLARS;
    }

    const totalDiscount = couponDiscount + pointsDiscount;
    const discountAmount = parseFloat(Math.min(totalDiscount, parseFloat(service.price)).toFixed(2));

    // Deduct redeemed points from user
    if (pointsRedeemed > 0) {
      await prisma.user.update({
        where: { id: userId },
        data: { loyaltyPoints: { decrement: pointsRedeemed } },
      });
    }

    const appointment = await appointmentRepository.create({
      userId,
      serviceId: dto.serviceId,
      staffId,
      couponId,
      appointmentDate: new Date(dto.appointmentDate),
      appointmentTime: dto.appointmentTime,
      notes: dto.notes || null,
      status: 'PENDING',
      paymentStatus: 'UNPAID',
      amountPaid: 0,
      discountAmount,
      pointsRedeemed,
    });

    // Fire-and-forget confirmation email
    sendAppointmentConfirmationEmail(appointment.user, appointment, appointment.service).catch(() => {});

    return appointment;
  },

  // ── Called after successful payment to credit loyalty points ─────────────────
  async creditLoyaltyPoints(appointmentId, amountPaid) {
    const appointment = await appointmentRepository.findByIdRaw(appointmentId);
    if (!appointment) return;
    const pointsEarned = Math.floor(parseFloat(amountPaid) * POINTS_PER_DOLLAR_SPENT);
    if (pointsEarned > 0) {
      await prisma.user.update({
        where: { id: appointment.userId },
        data: { loyaltyPoints: { increment: pointsEarned } },
      });
    }
  },

  async getAppointments(userId, role, filters = {}) {
    const { page = 1, limit = 20, status, paymentStatus, date } = filters;
    const skip = (page - 1) * limit;

    // Customers only see their own; admins see all
    const queryUserId = role === 'ADMIN' ? filters.userId : userId;

    const [appointments, total] = await Promise.all([
      appointmentRepository.findAll({ skip, take: limit, userId: queryUserId, status, paymentStatus, date }),
      appointmentRepository.count({
        ...(queryUserId && { userId: queryUserId }),
        ...(status && { status }),
        ...(paymentStatus && { paymentStatus }),
      }),
    ]);

    return {
      appointments,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  },

  async getAppointmentById(id, userId, role) {
    const appointment = await appointmentRepository.findById(id);
    if (!appointment) throw ApiError.notFound('Appointment not found');

    // Customers can only access their own appointments
    if (role !== 'ADMIN' && appointment.userId !== userId) {
      throw ApiError.forbidden('You are not authorized to view this appointment');
    }

    return appointment;
  },

  async rescheduleAppointment(id, userId, role, dto) {
    const appointment = await appointmentRepository.findByIdRaw(id);
    if (!appointment) throw ApiError.notFound('Appointment not found');

    if (role !== 'ADMIN' && appointment.userId !== userId) {
      throw ApiError.forbidden('You are not authorized to reschedule this appointment');
    }

    if (appointment.status === 'CANCELLED') {
      throw ApiError.badRequest('Cannot reschedule a cancelled appointment');
    }
    if (appointment.status === 'COMPLETED') {
      throw ApiError.badRequest('Cannot reschedule a completed appointment');
    }

    // ── Business Hours Check ─────────────────────────────────────────────────
    const requestedDate = new Date(dto.appointmentDate);
    if (!isOpenDay(requestedDate)) {
      throw ApiError.badRequest(
        `We are closed on ${requestedDate.toLocaleDateString('en-US', { weekday: 'long' })}s. Please choose a Monday–Saturday.`
      );
    }
    // Fetch service for duration
    const service = await serviceRepository.findById(appointment.serviceId);
    if (service && !isWithinBusinessHours(dto.appointmentTime, service.duration)) {
      throw ApiError.badRequest(
        `Time slot ${dto.appointmentTime} is outside business hours (${WORKING_HOURS.openTime}–${WORKING_HOURS.closeTime}). ` +
        `Note: your ${service.duration}-min service must end by ${WORKING_HOURS.closeTime}.`
      );
    }

    // Check new slot availability (excluding this appointment, same staff)
    const conflict = await appointmentRepository.checkSlotConflict(
      dto.appointmentDate,
      dto.appointmentTime,
      id,
      appointment.staffId
    );
    if (conflict) {
      throw ApiError.conflict(
        `The time slot ${dto.appointmentTime} on ${dto.appointmentDate} is already booked.`
      );
    }

    return appointmentRepository.update(id, {
      appointmentDate: new Date(dto.appointmentDate),
      appointmentTime: dto.appointmentTime,
      notes: dto.notes !== undefined ? dto.notes : appointment.notes,
      status: 'PENDING', // Re-confirm after reschedule
    });
  },

  async cancelAppointment(id, userId, role, ipAddress = null) {
    const appointment = await appointmentRepository.findById(id);
    if (!appointment) throw ApiError.notFound('Appointment not found');

    if (role !== 'ADMIN' && appointment.userId !== userId) {
      throw ApiError.forbidden('You are not authorized to cancel this appointment');
    }

    if (appointment.status === 'CANCELLED') {
      throw ApiError.badRequest('Appointment is already cancelled');
    }
    if (appointment.status === 'COMPLETED') {
      throw ApiError.badRequest('Cannot cancel a completed appointment');
    }

    const cancelled = await appointmentRepository.update(id, { status: 'CANCELLED' });

    // Refund loyalty points if they were redeemed
    if (appointment.pointsRedeemed > 0) {
      await prisma.user.update({
        where: { id: appointment.userId },
        data: { loyaltyPoints: { increment: appointment.pointsRedeemed } },
      });
    }

    // Fire-and-forget cancellation email
    sendCancellationEmail(appointment.user, appointment, appointment.service).catch(() => {});

    await auditLog({
      userId,
      action: 'CANCEL_APPOINTMENT',
      details: `Cancelled appointment ${id} for user ${appointment.userId}`,
      ipAddress,
    });

    return cancelled;
  },

  async confirmAppointment(id, actorId = null, ipAddress = null) {
    const appointment = await appointmentRepository.findByIdRaw(id);
    if (!appointment) throw ApiError.notFound('Appointment not found');
    const confirmed = await appointmentRepository.update(id, { status: 'CONFIRMED' });

    await auditLog({
      userId: actorId,
      action: 'CONFIRM_APPOINTMENT',
      details: `Confirmed appointment ${id} for user ${appointment.userId}`,
      ipAddress,
    });

    return confirmed;
  },

  /**
   * GET /appointments/available-slots?date=YYYY-MM-DD&serviceId=...&staffId=...
   * Returns a list of all slots with their availability.
   * If staffId is given → check that stylist's calendar.
   * If staffId is omitted → check across all active stylists for the service.
   */
  async getAvailableSlots(dateStr, serviceId, staffId) {
    const date = new Date(dateStr);

    // Validate business day
    if (!isOpenDay(date)) {
      return {
        date: dateStr,
        open: false,
        reason: `Closed on ${date.toLocaleDateString('en-US', { weekday: 'long' })}s`,
        slots: [],
      };
    }

    // Resolve service duration (default 0 if no serviceId given)
    let durationMin = 0;
    if (serviceId) {
      const service = await serviceRepository.findById(serviceId);
      if (!service || !service.isActive) throw ApiError.notFound('Service not found or inactive');
      durationMin = service.duration;
    }

    // Generate all theoretically possible slots
    const allSlots = generateSlots(durationMin);

    // Determine which appointments to check
    let bookedForStaff = [];
    if (staffId) {
      // Only check the specific stylist's bookings
      bookedForStaff = await appointmentRepository.findBookedSlots(dateStr, staffId);
    } else if (serviceId) {
      // "Any Stylist" mode: gather all stylists for this service
      const staffList = await staffRepository.findByServiceId(serviceId);
      if (staffList.length > 0) {
        // For each slot, it's available if at least ONE stylist is free
        const blockedByStaff = await Promise.all(
          staffList.map((s) => appointmentRepository.findBookedSlots(dateStr, s.id))
        );

        const slots = allSlots.map((time) => {
          const start = timeToMinutes(time);
          const slotMinutes = Array.from({ length: durationMin || 1 }, (_, i) => start + i);
          // Slot is available if any stylist has none of these minutes blocked
          const available = blockedByStaff.some((booked) => {
            const blocked = new Set();
            for (const appt of booked) {
              const s = timeToMinutes(appt.appointmentTime);
              const d = appt.service?.duration || 0;
              for (let m = s; m < s + d; m++) blocked.add(m);
            }
            return !slotMinutes.some((m) => blocked.has(m));
          });
          return { time, available };
        });

        return {
          date: dateStr,
          open: true,
          businessHours: { open: WORKING_HOURS.openTime, close: WORKING_HOURS.closeTime },
          serviceDurationMinutes: durationMin,
          slots,
        };
      }
      // No stylists for service → fall through to global check
      bookedForStaff = await appointmentRepository.findBookedSlots(dateStr, null);
    } else {
      bookedForStaff = await appointmentRepository.findBookedSlots(dateStr, null);
    }

    // Build a set of blocked minutes
    const blockedMinutes = new Set();
    for (const appt of bookedForStaff) {
      const start = timeToMinutes(appt.appointmentTime);
      const duration = appt.service?.duration || 0;
      for (let m = start; m < start + duration; m++) {
        blockedMinutes.add(m);
      }
    }

    const slots = allSlots.map((time) => {
      const start = timeToMinutes(time);
      const overlaps = Array.from({ length: durationMin || 1 }, (_, i) => start + i)
        .some((m) => blockedMinutes.has(m));
      return { time, available: !overlaps };
    });

    return {
      date: dateStr,
      open: true,
      businessHours: {
        open: WORKING_HOURS.openTime,
        close: WORKING_HOURS.closeTime,
      },
      serviceDurationMinutes: durationMin,
      slots,
    };
  },
};

module.exports = appointmentService;
