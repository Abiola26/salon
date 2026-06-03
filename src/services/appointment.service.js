'use strict';

const appointmentRepository = require('../repositories/appointment.repository');
const serviceRepository = require('../repositories/service.repository');
const { sendAppointmentConfirmationEmail, sendCancellationEmail } = require('../utils/email');
const ApiError = require('../utils/ApiError');

const appointmentService = {
  async createAppointment(userId, dto) {
    // Verify service exists and is active
    const service = await serviceRepository.findById(dto.serviceId);
    if (!service || !service.isActive) throw ApiError.notFound('Service not found or inactive');

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

  async cancelAppointment(id, userId, role) {
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

    return cancelled;
  },

  async confirmAppointment(id) {
    const appointment = await appointmentRepository.findByIdRaw(id);
    if (!appointment) throw ApiError.notFound('Appointment not found');
    return appointmentRepository.update(id, { status: 'CONFIRMED' });
  },
};

module.exports = appointmentService;
