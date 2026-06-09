'use strict';

const express = require('express');
const router = express.Router();
const userController = require('../controllers/user.controller');
const { authenticate } = require('../middlewares/auth.middleware');
const { adminOnly } = require('../middlewares/admin.middleware');
const { validate } = require('../middlewares/validate.middleware');
const { updateProfileSchema, changePasswordSchema } = require('../validators/user.validator');

// ─── Authenticated User Routes ────────────────────────────────────────────────

/**
 * @route   GET /api/users/profile
 * @desc    Get current user's profile
 * @access  Private
 */
router.get('/profile', authenticate, userController.getProfile);
router.get('/me', authenticate, userController.getProfile);

/**
 * @route   PUT /api/users/profile
 * @desc    Update current user's profile
 * @access  Private
 */
router.put('/profile', authenticate, validate(updateProfileSchema), userController.updateProfile);

/**
 * @route   PUT /api/users/change-password
 * @desc    Change current user's password
 * @access  Private
 */
router.put(
  '/change-password',
  authenticate,
  validate(changePasswordSchema),
  userController.changePassword
);

/**
 * @route   DELETE /api/users/profile
 * @desc    Delete current user's account
 * @access  Private
 */
router.delete('/profile', authenticate, userController.deleteAccount);

// ─── Admin Routes ─────────────────────────────────────────────────────────────

/**
 * @route   GET /api/users
 * @desc    Get all users (with optional role filter + pagination)
 * @access  Admin
 */
router.get('/', authenticate, adminOnly, userController.getAllUsers);

/**
 * @route   GET /api/users/:id
 * @desc    Get a specific user by ID
 * @access  Admin
 */
router.get('/:id', authenticate, adminOnly, userController.getUserById);

/**
 * @route   DELETE /api/users/:id
 * @desc    Delete a user by ID
 * @access  Admin
 */
router.delete('/:id', authenticate, adminOnly, userController.deleteUser);
router.put('/:id', authenticate, adminOnly, userController.updateUser);

module.exports = router;
