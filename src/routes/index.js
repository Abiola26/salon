'use strict';

const express = require('express');
const router = express.Router();

const authRoutes = require('./auth.routes');
const userRoutes = require('./user.routes');
const serviceRoutes = require('./service.routes');
const appointmentRoutes = require('./appointment.routes');
const paymentRoutes = require('./payment.routes');
const analyticsRoutes = require('./analytics.routes');

// Health check
router.get('/health', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'Salon Booking API is running',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV,
  });
});

// Mount routes
router.use('/auth', authRoutes);
router.use('/users', userRoutes);
router.use('/services', serviceRoutes);
router.use('/appointments', appointmentRoutes);
router.use('/payments', paymentRoutes);
router.use('/analytics', analyticsRoutes);

module.exports = router;
