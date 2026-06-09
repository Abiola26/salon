'use strict';

const express = require('express');
const router = express.Router();
const staffController = require('../controllers/staff.controller');
const { authenticate } = require('../middlewares/auth.middleware');
const { adminOnly } = require('../middlewares/admin.middleware');

/**
 * @route   GET /api/staff
 * @desc    Get all stylists (optionally filter by serviceId)
 * @access  Public
 */
router.get('/', staffController.getAllStaff);

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
router.post('/', authenticate, adminOnly, staffController.createStaff);

/**
 * @route   PUT /api/staff/:id
 * @desc    Update a staff member
 * @access  Admin
 */
router.put('/:id', authenticate, adminOnly, staffController.updateStaff);

/**
 * @route   DELETE /api/staff/:id
 * @desc    Delete a staff member
 * @access  Admin
 */
router.delete('/:id', authenticate, adminOnly, staffController.deleteStaff);

module.exports = router;
