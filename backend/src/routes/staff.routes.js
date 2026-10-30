'use strict';

const express = require('express');
const router = express.Router();
const staffController = require('../controllers/staff.controller');
const staffLeaveController = require('../controllers/staffLeave.controller');
const { authenticate } = require('../middlewares/auth.middleware');
const { adminOnly } = require('../middlewares/admin.middleware');
const { validate } = require('../middlewares/validate.middleware');
const { createLeaveSchema } = require('../validators/staffLeave.validator');
const { createStaffSchema, updateStaffSchema } = require('../validators/staff.validator');

/**
 * @route   GET /api/staff
 * @desc    Get all stylists (optionally filter by serviceId)
 * @access  Public
 */
router.get('/', staffController.getAllStaff);

/**
 * @route   GET /api/staff/leave
 * @desc    Get all upcoming leave periods (admin overview)
 * @access  Admin
 * NOTE: must stay above GET /:id, otherwise "leave" is captured as an id.
 */
router.get('/leave', authenticate, adminOnly, staffLeaveController.getAllUpcomingLeave);

/**
 * @route   GET /api/staff/:id/leave
 * @desc    Get leave periods for one stylist
 * @access  Admin
 */
router.get('/:id/leave', authenticate, adminOnly, staffLeaveController.getLeaveForStaff);

/**
 * @route   POST /api/staff/:id/leave
 * @desc    Create a leave (blackout) period for a stylist
 * @access  Admin
 */
router.post(
  '/:id/leave',
  authenticate,
  adminOnly,
  validate(createLeaveSchema),
  staffLeaveController.createLeave
);

/**
 * @route   DELETE /api/staff/leave/:leaveId
 * @desc    Delete a leave period
 * @access  Admin
 */
router.delete('/leave/:leaveId', authenticate, adminOnly, staffLeaveController.deleteLeave);

/**
 * @route   GET /api/staff/:id
 * @desc    Get a single staff member by ID
 * @access  Public
 */
router.get('/:id', staffController.getStaffById);

/**
 * @route   POST /api/staff
 * @desc    Create a new staff member
 * @access  Admin
 */
router.post('/', authenticate, adminOnly, validate(createStaffSchema), staffController.createStaff);

/**
 * @route   PUT /api/staff/:id
 * @desc    Update a staff member
 * @access  Admin
 */
router.put('/:id', authenticate, adminOnly, validate(updateStaffSchema), staffController.updateStaff);

/**
 * @route   DELETE /api/staff/:id
 * @desc    Delete a staff member
 * @access  Admin
 */
router.delete('/:id', authenticate, adminOnly, staffController.deleteStaff);

module.exports = router;
