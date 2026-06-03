'use strict';

const express = require('express');
const router = express.Router();
const analyticsController = require('../controllers/analytics.controller');
const { authenticate } = require('../middlewares/auth.middleware');
const { adminOnly } = require('../middlewares/admin.middleware');

/**
 * @route   GET /api/analytics/dashboard
 * @desc    Get full dashboard analytics
 * @access  Admin
 */
router.get('/dashboard', authenticate, adminOnly, analyticsController.getDashboard);

module.exports = router;
