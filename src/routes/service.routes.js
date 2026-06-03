'use strict';

const express = require('express');
const router = express.Router();
const serviceController = require('../controllers/service.controller');
const { authenticate } = require('../middlewares/auth.middleware');
const { adminOnly } = require('../middlewares/admin.middleware');
const { validate } = require('../middlewares/validate.middleware');
const { createServiceSchema, updateServiceSchema } = require('../validators/service.validator');

/**
 * @route   GET /api/services
 * @desc    Get all active services (paginated)
 * @access  Public
 */
router.get('/', serviceController.getAllServices);

/**
 * @route   GET /api/services/:id
 * @desc    Get a single service by ID
 * @access  Public
 */
router.get('/:id', serviceController.getServiceById);

/**
 * @route   POST /api/services
 * @desc    Create a new service
 * @access  Admin
 */
router.post(
  '/',
  authenticate,
  adminOnly,
  validate(createServiceSchema),
  serviceController.createService
);

/**
 * @route   PUT /api/services/:id
 * @desc    Update a service
 * @access  Admin
 */
router.put(
  '/:id',
  authenticate,
  adminOnly,
  validate(updateServiceSchema),
  serviceController.updateService
);

/**
 * @route   DELETE /api/services/:id
 * @desc    Delete a service
 * @access  Admin
 */
router.delete('/:id', authenticate, adminOnly, serviceController.deleteService);

module.exports = router;
