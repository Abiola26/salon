'use strict';

const appointmentRepository = require('../repositories/appointment.repository');
const serviceRepository = require('../repositories/service.repository');
const staffRepository = require('../repositories/staff.repository');
const couponRepository = require('../repositories/coupon.repository');
const staffLeaveRepository = require('../repositories/staffLeave.repository');
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
const { toCents, toDecimal2 } = require('../utils/money');
const {
  POINTS_VALUE_IN_DOLLARS,
  MAX_POINTS_REDEMPTION_PCT,
  pointsForAmount,
} = require('../config/loyalty');

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
    const staffId = dto.staffId || null;
    if (staffId) {
      const staff = await staffRepository.findById(staffId);
      if (!staff || !staff.isActive) throw ApiError.notFound('Selected stylist not found or inactive');
      const offersService = staff.services.some((s) => s.id === dto.serviceId);
      if (!offersService) throw ApiError.badRequest('Selected stylist does not offer this service');
    }

    // ── Coupon Validation (read-only; consumed atomically inside the tx) ─────
    const servicePriceCents = Math.max(0, toCents(service.price));
    let couponId = null;
    let couponDiscountCents = 0;
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
            // Integer-cents math, rounded once — 15.5% of $33.33 = $5.17, not 5.166...
            const percent = Math.min(100, Math.max(0, parseFloat(coupon.discountValue)));
            couponDiscountCents = Math.round((servicePriceCents * percent) / 100);
          } else {
            couponDiscountCents = Math.max(0, toCents(coupon.discountValue));
          }
          couponDiscountCents = Math.min(couponDiscountCents, servicePriceCents);
        }
      }
    }

    // ── Loyalty Points Redemption (read-only) ─────────────────────────────────
    const pointsValueCents = toCents(POINTS_VALUE_IN_DOLLARS);
    let pointsRedeemed = 0;
    let pointsDiscountCents = 0;
    if (dto.redeemPoints) {
      const user = await prisma.user.findUnique({ where: { id: userId }, select: { loyaltyPoints: true } });
      const priceAfterCouponCents = Math.max(0, servicePriceCents - couponDiscountCents);
      const maxPointsDiscountCents = Math.floor(priceAfterCouponCents * MAX_POINTS_REDEMPTION_PCT);
      const availablePointsCents = (user?.loyaltyPoints || 0) * pointsValueCents;
      pointsDiscountCents = Math.min(availablePointsCents, maxPointsDiscountCents);
      pointsRedeemed = Math.floor(pointsDiscountCents / pointsValueCents);
      pointsDiscountCents = pointsRedeemed * pointsValueCents;
    }

    const discountCents = Math.min(couponDiscountCents + pointsDiscountCents, servicePriceCents);
    const discountAmount = toDecimal2(discountCents);

    // ── Book under a per-date advisory lock ───────────────────────────────────
    // Concurrent bookings for the same date serialize on this lock (works across
    // instances too — it is held by Postgres until the transaction ends), so the
    // conflict check below and the insert cannot race.
    const lockKey = `salon:booking:${new Date(dto.appointmentDate).toISOString().slice(0, 10)}`;

    const appointment = await prisma.$transaction(
      async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${lockKey})::bigint)`;

        // Auto-assign must run under the lock to see the latest bookings
        let resolvedStaffId = staffId;
        if (!resolvedStaffId) {
          const staffList = await staffRepository.findByServiceId(dto.serviceId);
          const onLeaveIds = await staffLeaveRepository.findStaffIdsOnLeave(dto.appointmentDate, tx);
          for (const candidate of staffList) {
            if (onLeaveIds.includes(candidate.id)) continue;
            const conflict = await appointmentRepository.checkSlotConflict(
              dto.appointmentDate, dto.appointmentTime, null, candidate.id, service.duration, tx
            );
            if (!conflict) {
              resolvedStaffId = candidate.id;
              break;
            }
          }
          // If no staff found (no stylists for service), fall back to no-staff booking
        } else {
          const onLeaveIds = await staffLeaveRepository.findStaffIdsOnLeave(dto.appointmentDate, tx);
          if (onLeaveIds.includes(resolvedStaffId)) {
            throw ApiError.conflict(
              `Selected stylist is on leave on ${dto.appointmentDate}. Please choose a different date or stylist.`
            );
          }
        }

        const conflict = await appointmentRepository.checkSlotConflict(
          dto.appointmentDate, dto.appointmentTime, null, resolvedStaffId, service.duration, tx
        );
        if (conflict) {
          throw ApiError.conflict(
            `The time slot ${dto.appointmentTime} on ${dto.appointmentDate} is already booked for this stylist. Please choose a different time or stylist.`
          );
        }

        if (couponId) {
          const claimed = await couponRepository.incrementUsage(couponId, tx);
          if (!claimed) {
            throw ApiError.conflict('Coupon is no longer available (usage limit reached). Please remove it and try again.');
          }
        }

        if (pointsRedeemed > 0) {
          const updated = await tx.user.updateMany({
            where: { id: userId, loyaltyPoints: { gte: pointsRedeemed } },
            data: { loyaltyPoints: { decrement: pointsRedeemed } },
          });
          if (!updated || updated.count === 0) {
            throw ApiError.conflict('You no longer have enough loyalty points for this redemption.');
          }
        }

        return appointmentRepository.create(
          {
            userId,
            serviceId: dto.serviceId,
            staffId: resolvedStaffId,
            couponId,
            appointmentDate: new Date(dto.appointmentDate),
            appointmentTime: dto.appointmentTime,
            notes: dto.notes || null,
            status: 'PENDING',
            // Fully discounted ⇒ nothing left to charge (paymentStatus is PAID).
            paymentStatus: servicePriceCents <= discountCents ? 'PAID' : 'UNPAID',
            amountPaid: 0,
            discountAmount,
            pointsRedeemed,
          },
          tx
        );
      },
      { timeout: 10000 }
    );

    // Fire-and-forget confirmation email (only after the booking is committed)
    sendAppointmentConfirmationEmail(appointment.user, appointment, appointment.service).catch(() => {});

    return appointment;
  },

  // ── Called after successful payment to credit loyalty points ─────────────────
  async creditLoyaltyPoints(appointmentId, amountPaid) {
    const appointment = await appointmentRepository.findByIdRaw(appointmentId);
    if (!appointment) return;
    const pointsEarned = pointsForAmount(amountPaid);
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

    // Check new slot availability (excluding this appointment, same staff),
    // under the same per-date advisory lock used by createAppointment.
    const lockKey = `salon:booking:${new Date(dto.appointmentDate).toISOString().slice(0, 10)}`;

    return prisma.$transaction(
      async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${lockKey})::bigint)`;

        if (appointment.staffId) {
          const onLeaveIds = await staffLeaveRepository.findStaffIdsOnLeave(dto.appointmentDate, tx);
          if (onLeaveIds.includes(appointment.staffId)) {
            throw ApiError.conflict(
              'The assigned stylist is on leave on this date. Please choose a different date or stylist.'
            );
          }
        }

        const conflict = await appointmentRepository.checkSlotConflict(
          dto.appointmentDate,
          dto.appointmentTime,
          id,
          appointment.staffId,
          service ? service.duration : 0,
          tx
        );
        if (conflict) {
          throw ApiError.conflict(
            `The time slot ${dto.appointmentTime} on ${dto.appointmentDate} is already booked.`
          );
        }

        return appointmentRepository.update(
          id,
          {
            appointmentDate: new Date(dto.appointmentDate),
            appointmentTime: dto.appointmentTime,
            notes: dto.notes !== undefined ? dto.notes : appointment.notes,
            status: 'PENDING', // Re-confirm after reschedule
          },
          tx
        );
      },
      { timeout: 10000 }
    );
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

    // Status flip, coupon-capacity release and points refund commit together:
    // a crash mid-way can no longer leak coupon capacity or lose redeemed points.
    const cancelled = await prisma.$transaction(async (tx) => {
      const claimed = await tx.appointment.updateMany({
        where: { id, status: { in: ['PENDING', 'CONFIRMED'] } },
        data: { status: 'CANCELLED' },
      });
      if (claimed.count === 0) {
        throw ApiError.badRequest('Appointment is already cancelled or completed');
      }

      if (appointment.couponId) {
        await couponRepository.releaseUsage(appointment.couponId, tx);
      }

      // Refund loyalty points if they were redeemed
      if (appointment.pointsRedeemed > 0) {
        await tx.user.update({
          where: { id: appointment.userId },
          data: { loyaltyPoints: { increment: appointment.pointsRedeemed } },
        });
      }

      return tx.appointment.findUnique({
        where: { id },
        include: {
          service: true,
          staff: { select: { id: true, name: true } },
          user: { select: { id: true, name: true, email: true } },
        },
      });
    });

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
    if (appointment.status === 'CANCELLED' || appointment.status === 'COMPLETED') {
      throw ApiError.badRequest(`Cannot confirm a ${appointment.status.toLowerCase()} appointment`);
    }

    // CAS: only PENDING → CONFIRMED, so a concurrent cancel cannot be resurrected.
    const claimed = await prisma.appointment.updateMany({
      where: { id, status: 'PENDING' },
      data: { status: 'CONFIRMED' },
    });
    if (claimed.count === 0) {
      const current = await appointmentRepository.findByIdRaw(id);
      throw ApiError.badRequest(
        current
          ? `Cannot confirm an appointment that is ${current.status.toLowerCase()}`
          : 'Appointment not found'
      );
    }

    const confirmed = await appointmentRepository.findById(id);

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
      // Stylist unavailable for the whole date (leave) → nothing to book
      const onLeaveIds = await staffLeaveRepository.findStaffIdsOnLeave(dateStr);
      if (onLeaveIds.includes(staffId)) {
        return {
          date: dateStr,
          open: true,
          onLeave: true,
          reason: 'This stylist is on leave on the selected date.',
          businessHours: { open: WORKING_HOURS.openTime, close: WORKING_HOURS.closeTime },
          serviceDurationMinutes: durationMin,
          slots: [],
        };
      }
      // Only check the specific stylist's bookings
      bookedForStaff = await appointmentRepository.findBookedSlots(dateStr, staffId);
    } else if (serviceId) {
      // "Any Stylist" mode: gather all stylists for this service
      const staffList = await staffRepository.findByServiceId(serviceId);
      const onLeaveIds = await staffLeaveRepository.findStaffIdsOnLeave(dateStr);
      const workingStaff = staffList.filter((s) => !onLeaveIds.includes(s.id));

      if (workingStaff.length === 0 && staffList.length > 0) {
        // Every stylist for this service is off — nobody can do the work
        return {
          date: dateStr,
          open: true,
          onLeave: true,
          reason: 'All stylists for this service are on leave on the selected date.',
          businessHours: { open: WORKING_HOURS.openTime, close: WORKING_HOURS.closeTime },
          serviceDurationMinutes: durationMin,
          slots: [],
        };
      }

      if (workingStaff.length > 0) {
        // For each slot, it's available if at least ONE stylist is free
        const blockedByStaff = await Promise.all(
          workingStaff.map((s) => appointmentRepository.findBookedSlots(dateStr, s.id))
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
