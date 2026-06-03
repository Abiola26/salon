'use strict';

const express = require('express');
const router = express.Router();
const appointmentController = require('../controllers/appointment.controller');
const { authenticate } = require('../middlewares/auth.middleware');
const { adminOnly } = require('../middlewares/admin.middleware');
const { validate } = require('../middlewares/validate.middleware');
const {
  createAppointmentSchema,
  rescheduleAppointmentSchema,
} = require('../validators/appointment.validator');

/**
 * @route   POST /api/appointments
 * @desc    Book a new appointment
 * @access  Private (Customer/Admin)
 */
router.post(
  '/',
  authenticate,
  validate(createAppointmentSchema),
  appointmentController.createAppointment
);

/**
 * @route   GET /api/appointments
 * @desc    Get appointments — customers see their own, admins see all
 * @access  Private
 */
router.get('/', authenticate, appointmentController.getAppointments);

/**
 * @route   GET /api/appointments/:id
 * @desc    Get a single appointment by ID
 * @access  Private
 */
router.get('/:id', authenticate, appointmentController.getAppointmentById);

/**
 * @route   PUT /api/appointments/:id
 * @desc    Reschedule an appointment (date/time change)
 * @access  Private
 */
router.put(
  '/:id',
  authenticate,
  validate(rescheduleAppointmentSchema),
  appointmentController.rescheduleAppointment
);

/**
 * @route   DELETE /api/appointments/:id
 * @desc    Cancel an appointment
 * @access  Private
 */
router.delete('/:id', authenticate, appointmentController.cancelAppointment);

/**
 * @route   PATCH /api/appointments/:id/confirm
 * @desc    Confirm an appointment (Admin only)
 * @access  Admin
 */
router.patch('/:id/confirm', authenticate, adminOnly, appointmentController.confirmAppointment);

module.exports = router;
