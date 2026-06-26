'use strict';

const reviewService = require('../../src/services/review.service');
const reviewRepository = require('../../src/repositories/review.repository');
const appointmentRepository = require('../../src/repositories/appointment.repository');

jest.mock('../../src/repositories/review.repository');
jest.mock('../../src/repositories/appointment.repository');

describe('reviewService', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  describe('createReview', () => {
    it('throws when appointment not found', async () => {
      appointmentRepository.findById.mockResolvedValue(null);

      await expect(reviewService.createReview('u1', { appointmentId: 'a1', rating: 5 })).rejects.toThrow(
        'Appointment not found'
      );
    });

    it('throws when trying to review another user\'s appointment', async () => {
      appointmentRepository.findById.mockResolvedValue({ id: 'a1', userId: 'other' });

      await expect(reviewService.createReview('u1', { appointmentId: 'a1', rating: 5 })).rejects.toThrow(
        'You can only review your own appointments'
      );
    });

    it('throws when appointment is not COMPLETED', async () => {
      appointmentRepository.findById.mockResolvedValue({ id: 'a1', userId: 'u1', status: 'PENDING' });

      await expect(reviewService.createReview('u1', { appointmentId: 'a1', rating: 5 })).rejects.toThrow(
        'You can only review completed appointments'
      );
    });

    it('throws when review already submitted for appointment', async () => {
      appointmentRepository.findById.mockResolvedValue({ id: 'a1', userId: 'u1', status: 'COMPLETED' });
      reviewRepository.findByAppointmentId.mockResolvedValue({ id: 'r1' });

      await expect(reviewService.createReview('u1', { appointmentId: 'a1', rating: 5 })).rejects.toThrow(
        'You have already submitted a review'
      );
    });

    it('creates review successfully', async () => {
      appointmentRepository.findById.mockResolvedValue({
        id: 'a1',
        userId: 'u1',
        status: 'COMPLETED',
        serviceId: 's1',
      });
      reviewRepository.findByAppointmentId.mockResolvedValue(null);
      reviewRepository.create.mockResolvedValue({ id: 'r1', rating: 5 });

      const result = await reviewService.createReview('u1', { appointmentId: 'a1', rating: 5, comment: 'Great' });
      expect(result.rating).toBe(5);
      expect(reviewRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          appointmentId: 'a1',
          rating: 5,
          comment: 'Great',
        })
      );
    });
  });

  describe('createReview — comment branch', () => {
    it('stores null when comment is omitted', async () => {
      appointmentRepository.findById.mockResolvedValue({
        id: 'a2', userId: 'u1', status: 'COMPLETED', serviceId: 's1',
      });
      reviewRepository.findByAppointmentId.mockResolvedValue(null);
      reviewRepository.create.mockResolvedValue({ id: 'r2', rating: 4, comment: null });

      await reviewService.createReview('u1', { appointmentId: 'a2', rating: 4 });

      expect(reviewRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({ comment: null })
      );
    });
  });

  describe('getReviews', () => {
    it('returns filtered reviews when serviceId is provided', async () => {
      reviewRepository.findAll.mockResolvedValue([]);
      reviewRepository.count.mockResolvedValue(0);

      const result = await reviewService.getReviews({ page: 1, limit: 10, serviceId: 's1' });
      expect(result.reviews).toEqual([]);
      expect(result.meta.totalPages).toBe(0);
    });

    it('returns all reviews when serviceId is not provided (exercises && branch)', async () => {
      reviewRepository.findAll.mockResolvedValue([]);
      reviewRepository.count.mockResolvedValue(5);

      // No serviceId — exercises the false branch of `serviceId && { serviceId }`
      const result = await reviewService.getReviews({ page: 1, limit: 10 });
      expect(result.meta.total).toBe(5);
      // count should be called without serviceId filter
      expect(reviewRepository.count).toHaveBeenCalledWith({});
    });

    it('uses default pagination when no args given', async () => {
      reviewRepository.findAll.mockResolvedValue([]);
      reviewRepository.count.mockResolvedValue(0);
      const result = await reviewService.getReviews();
      expect(result.meta.page).toBe(1);
      expect(result.meta.limit).toBe(20);
    });
  });

  describe('getMyReviews', () => {
    it('returns user\'s own reviews', async () => {
      reviewRepository.findAll.mockResolvedValue([]);
      reviewRepository.count.mockResolvedValue(0);

      const result = await reviewService.getMyReviews('u1', { page: 1, limit: 10 });
      expect(result.reviews).toEqual([]);
      expect(result.meta.totalPages).toBe(0);
    });
  });

  describe('deleteReview', () => {
    it('throws when review not found', async () => {
      reviewRepository.findById.mockResolvedValue(null);

      await expect(reviewService.deleteReview('r1')).rejects.toThrow('Review not found');
    });

    it('deletes review when found', async () => {
      reviewRepository.findById.mockResolvedValue({ id: 'r1' });
      reviewRepository.delete.mockResolvedValue({});

      const result = await reviewService.deleteReview('r1');
      expect(result).toEqual({ deleted: true });
      expect(reviewRepository.delete).toHaveBeenCalledWith('r1');
    });
  });
});
