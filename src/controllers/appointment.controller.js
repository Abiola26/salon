'use strict';

const appointmentService = require('../services/appointment.service');
const ApiResponse = require('../utils/ApiResponse');
const asyncHandler = require('../utils/asyncHandler');

const appointmentController = {
  createAppointment: asyncHandler(async (req, res) => {
    const appointment = await appointmentService.createAppointment(req.user.id, req.body);
    return ApiResponse.created(res, 'Appointment booked successfully', appointment);
  }),

  getAppointments: asyncHandler(async (req, res) => {
    const { page, limit, status, paymentStatus, date, userId } = req.query;
    const result = await appointmentService.getAppointments(
      req.user.id,
      req.user.role,
      { page: parseInt(page) || 1, limit: parseInt(limit) || 20, status, paymentStatus, date, userId }
    );
    return ApiResponse.ok(res, 'Appointments retrieved successfully', result.appointments, result.meta);
  }),

  getAppointmentById: asyncHandler(async (req, res) => {
    const appointment = await appointmentService.getAppointmentById(
      req.params.id,
      req.user.id,
      req.user.role
    );
    return ApiResponse.ok(res, 'Appointment retrieved successfully', appointment);
  }),

  rescheduleAppointment: asyncHandler(async (req, res) => {
    const appointment = await appointmentService.rescheduleAppointment(
      req.params.id,
      req.user.id,
      req.user.role,
      req.body
    );
    return ApiResponse.ok(res, 'Appointment rescheduled successfully', appointment);
  }),

  cancelAppointment: asyncHandler(async (req, res) => {
    const appointment = await appointmentService.cancelAppointment(
      req.params.id,
      req.user.id,
      req.user.role
    );
    return ApiResponse.ok(res, 'Appointment cancelled successfully', appointment);
  }),

  // Admin: confirm appointment
  confirmAppointment: asyncHandler(async (req, res) => {
    const appointment = await appointmentService.confirmAppointment(req.params.id);
    return ApiResponse.ok(res, 'Appointment confirmed successfully', appointment);
  }),
};

module.exports = appointmentController;
