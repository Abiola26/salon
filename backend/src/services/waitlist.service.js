'use strict';

const waitlistRepository = require('../repositories/waitlist.repository');
const serviceRepository = require('../repositories/service.repository');
const staffRepository = require('../repositories/staff.repository');
const { auditLog } = require('../utils/audit');
const ApiError = require('../utils/ApiError');
const logger = require('../config/logger');
const { salonDateString, toDateOnly } = require('../utils/salonTime');
const { isOpenDayString, isWithinBusinessHours } = require('../config/workingHours');
const {
  sendWaitlistJoinedEmail,
  sendWaitlistAvailabilityEmail,
} = require('../utils/email');

const dateOnly = (value) => toDateOnly(value);

const waitlistService = {
  async joinWaitlist(userId, dto) {
    const service = await serviceRepository.findById(dto.serviceId);
    if (!service || !service.isActive) {
      throw ApiError.notFound('Service not found or inactive');
    }

    const preferredDate = dateOnly(dto.preferredDate);
    if (preferredDate < salonDateString()) {
      throw ApiError.badRequest('Preferred date cannot be in the past');
    }
    if (!isOpenDayString(preferredDate)) {
      throw ApiError.badRequest('The salon is closed on that date. Please choose an open day.');
    }

    let staff = null;
    if (dto.staffId) {
      staff = await staffRepository.findById(dto.staffId);
      if (!staff || !staff.isActive) {
        throw ApiError.notFound('Selected stylist not found or inactive');
      }
      if (!staff.services.some((item) => item.id === dto.serviceId)) {
        throw ApiError.badRequest('Selected stylist does not offer this service');
      }
    }

    if (dto.preferredTime && !isWithinBusinessHours(dto.preferredTime, service.duration)) {
      throw ApiError.badRequest(
        'Preferred time is outside business hours for this service duration'
      );
    }

    const duplicate = await waitlistRepository.findActiveDuplicate(
      userId,
      dto.serviceId,
      preferredDate
    );
    if (duplicate) {
      throw ApiError.conflict(
        'You are already on the waitlist for this service and date. Cancel that request first.'
      );
    }

    const entry = await waitlistRepository.create({
      userId,
      serviceId: dto.serviceId,
      staffId: staff ? staff.id : null,
      preferredDate,
      preferredTime: dto.preferredTime || null,
      notes: dto.notes?.trim() || null,
    });

    sendWaitlistJoinedEmail(entry.user, entry, entry.service).catch(() => {});
    return entry;
  },

  async getMyWaitlist(userId) {
    return waitlistRepository.findByUser(userId);
  },

  async getAdminWaitlist({ page = 1, limit = 20, status, date } = {}) {
    const skip = (page - 1) * limit;
    const [entries, total, statusCounts] = await Promise.all([
      waitlistRepository.findAll({ skip, take: limit, status, date }),
      waitlistRepository.count({ status, date }),
      waitlistRepository.getStatusCounts(),
    ]);

    const summary = {
      waiting: 0,
      notified: 0,
      converted: 0,
      cancelled: 0,
      total: 0,
    };
    for (const row of statusCounts) {
      summary[row.status.toLowerCase()] = row._count._all;
      summary.total += row._count._all;
    }

    return {
      entries,
      summary,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  },

  async notifyEntry(entryId, actorId = null, ipAddress = null) {
    const entry = await waitlistRepository.findById(entryId);
    if (!entry) throw ApiError.notFound('Waitlist entry not found');
    if (!['WAITING', 'NOTIFIED'].includes(entry.status)) {
      throw ApiError.badRequest(`Cannot notify a ${entry.status.toLowerCase()} waitlist entry`);
    }
    if (dateOnly(entry.preferredDate) < salonDateString()) {
      throw ApiError.badRequest('Cannot notify a waitlist entry for a past date');
    }

    const claimed = await waitlistRepository.markNotified(entryId, { allowResend: true });
    if (!claimed || claimed.count === 0) {
      throw ApiError.conflict('Waitlist entry is no longer active');
    }

    await sendWaitlistAvailabilityEmail(entry.user, entry, entry.service);

    await auditLog({
      userId: actorId,
      action: 'NOTIFY_WAITLIST',
      details: `Notified waitlist entry ${entryId} for ${entry.user.email}`,
      ipAddress,
    });

    return waitlistRepository.findById(entryId);
  },

  async cancelEntry(entryId, userId, role) {
    const entry = await waitlistRepository.findById(entryId);
    if (!entry) throw ApiError.notFound('Waitlist entry not found');
    if (role !== 'ADMIN' && entry.userId !== userId) {
      throw ApiError.forbidden('You are not authorized to cancel this waitlist entry');
    }

    const claimed = await waitlistRepository.markCancelled(entryId);
    if (!claimed || claimed.count === 0) {
      throw ApiError.badRequest('Only active waitlist entries can be cancelled');
    }

    return waitlistRepository.findById(entryId);
  },

  /**
   * Called after a cancellation/reschedule frees a slot. Notifies the oldest
   * matching waitlist entry (any-stylist entries always match; specific-stylist
   * entries only match their stylist). Never throws into the booking flow.
   */
  async notifyNextForSlot({ serviceId, preferredDate, staffId = null, appointmentTime = null }) {
    try {
      const date = dateOnly(preferredDate);
      if (date < salonDateString()) return null;

      const entry = await waitlistRepository.findNextWaiting({
        serviceId,
        preferredDate: date,
        staffId,
        appointmentTime,
      });
      if (!entry) return null;

      const claimed = await waitlistRepository.markNotified(entry.id);
      if (!claimed || claimed.count === 0) return null;

      await sendWaitlistAvailabilityEmail(entry.user, entry, entry.service);
      return entry;
    } catch (error) {
      logger.error(`Waitlist auto-notify failed: ${error.message}`);
      return null;
    }
  },

  /**
   * Booking the same service/date converts any active waitlist entry for that
   * customer. Best-effort: conversion must never fail a successful booking.
   */
  async markConvertedForBooking({ userId, serviceId, preferredDate }) {
    try {
      const result = await waitlistRepository.markConverted({
        userId,
        serviceId,
        preferredDate: dateOnly(preferredDate),
      });
      return result.count;
    } catch (error) {
      logger.error(`Waitlist conversion failed: ${error.message}`);
      return 0;
    }
  },
};

module.exports = waitlistService;
