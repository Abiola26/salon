'use strict';

const express = require('express');
const router = express.Router();
const notificationController = require('../controllers/notification.controller');
const { authenticate } = require('../middlewares/auth.middleware');
const { adminOnly } = require('../middlewares/admin.middleware');
const { validate } = require('../middlewares/validate.middleware');
const { queueQuerySchema } = require('../validators/notification.validator');

router.use(authenticate, adminOnly);

/**
 * @route   GET /api/notifications/summary
 * @desc    Email queue health + upcoming reminder coverage
 * @access  Admin
 */
router.get('/summary', notificationController.getSummary);

/**
 * @route   GET /api/notifications/queue
 * @desc    Paginated email queue (optionally filtered by status)
 * @access  Admin
 */
router.get('/queue', validate(queueQuerySchema, 'query'), notificationController.getQueue);

module.exports = router;
