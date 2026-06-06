'use strict';

const appointmentRepository = require('../repositories/appointment.repository');
const serviceRepository = require('../repositories/service.repository');
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

    // Check for double booking
    const conflict = await appointmentRepository.checkSlotConflict(
      dto.appointmentDate,
      dto.appointmentTime
    );
    if (conflict) {
      throw ApiError.conflict(
        `The time slot ${dto.appointmentTime} on ${dto.appointmentDate} is already booked. Please choose a different time.`
      );
    }

    const appointment = await appointmentRepository.create({
      userId,
      serviceId: dto.serviceId,
      appointmentDate: new Date(dto.appointmentDate),
      appointmentTime: dto.appointmentTime,
      notes: dto.notes || null,
      status: 'PENDING',
      paymentStatus: 'UNPAID',
      amountPaid: 0,
    });

    // Fire-and-forget confirmation email
    sendAppointmentConfirmationEmail(appointment.user, appointment, appointment.service).catch(() => {});

    return appointment;
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

    // Check new slot availability (excluding this appointment)
    const conflict = await appointmentRepository.checkSlotConflict(
      dto.appointmentDate,
      dto.appointmentTime,
      id
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
   * GET /appointments/available-slots?date=YYYY-MM-DD&serviceId=...
   * Returns a list of all slots with their availability for a given date.
   */
  async getAvailableSlots(dateStr, serviceId) {
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

    // Fetch booked slots for the day
    const booked = await appointmentRepository.findBookedSlots(dateStr);
    const openTime = timeToMinutes(WORKING_HOURS.openTime);

    // Build a set of blocked minutes (each booked appt blocks its own duration)
    const blockedMinutes = new Set();
    for (const appt of booked) {
      const start = timeToMinutes(appt.appointmentTime);
      const duration = appt.service?.duration || 0;
      for (let m = start; m < start + duration; m++) {
        blockedMinutes.add(m);
      }
    }

    const slots = allSlots.map((time) => {
      const start = timeToMinutes(time);
      // A slot is available if none of its minutes overlap with blocked range
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
