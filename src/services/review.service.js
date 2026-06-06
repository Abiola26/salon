'use strict';

const reviewRepository = require('../repositories/review.repository');
const appointmentRepository = require('../repositories/appointment.repository');
const ApiError = require('../utils/ApiError');

const reviewService = {
  /**
   * Submit a review for a COMPLETED appointment the user owns.
   * One review per appointment (enforced by DB unique constraint).
   */
  async createReview(userId, dto) {
    // Appointment must exist and belong to the user
    const appointment = await appointmentRepository.findById(dto.appointmentId);
    if (!appointment) throw ApiError.notFound('Appointment not found');

    if (appointment.userId !== userId) {
      throw ApiError.forbidden('You can only review your own appointments');
    }

    if (appointment.status !== 'COMPLETED') {
      throw ApiError.badRequest(
        'You can only review completed appointments. Your appointment must be marked COMPLETED first.'
      );
    }

    // Check for duplicate review (defensive — DB unique also guards this)
    const existing = await reviewRepository.findByAppointmentId(dto.appointmentId);
    if (existing) {
      throw ApiError.conflict('You have already submitted a review for this appointment');
    }

    return reviewRepository.create({
      appointmentId: dto.appointmentId,
      userId,
      serviceId: appointment.serviceId,
      rating: dto.rating,
      comment: dto.comment || null,
    });
  },

  /**
   * List reviews — public, filterable by serviceId.
   */
  async getReviews({ page = 1, limit = 20, serviceId } = {}) {
    const skip = (page - 1) * limit;
    const [reviews, total] = await Promise.all([
      reviewRepository.findAll({ skip, take: limit, serviceId }),
      reviewRepository.count({ ...(serviceId && { serviceId }) }),
    ]);
    return {
      reviews,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  },

  /**
   * Get the authenticated user's own reviews.
   */
  async getMyReviews(userId, { page = 1, limit = 20 } = {}) {
    const skip = (page - 1) * limit;
    const [reviews, total] = await Promise.all([
      reviewRepository.findAll({ skip, take: limit, userId }),
      reviewRepository.count({ userId }),
    ]);
    return {
      reviews,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  },

  /**
   * Delete a review — admin only.
   */
  async deleteReview(id) {
    const review = await reviewRepository.findById(id);
    if (!review) throw ApiError.notFound('Review not found');
    await reviewRepository.delete(id);
    return { deleted: true };
  },
};

module.exports = reviewService;
