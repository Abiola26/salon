'use strict';

jest.mock('../../src/repositories/giftCard.repository');
jest.mock('../../src/repositories/payment.repository');
jest.mock('../../src/utils/audit', () => ({ auditLog: jest.fn().mockResolvedValue(undefined) }));
jest.mock('../../src/utils/email', () => ({
  sendGiftCardIssuedEmail: jest.fn().mockResolvedValue({}),
  sendGiftCardAppliedEmail: jest.fn().mockResolvedValue({}),
}));
jest.mock('../../src/config/logger', () => ({
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  debug: jest.fn(),
}));
jest.mock('../../src/config/db', () => {
  const prisma = {
    giftCard: {
      updateMany: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
    },
    appointment: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    user: {
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    $executeRaw: jest.fn().mockResolvedValue(1),
    $queryRaw: jest.fn().mockResolvedValue([{ id: 'gc1' }]),
    $transaction: async (fn) => fn(prisma),
  };
  return { prisma };
});

const { prisma } = require('../../src/config/db');
const giftCardRepository = require('../../src/repositories/giftCard.repository');
const paymentRepository = require('../../src/repositories/payment.repository');
const { auditLog } = require('../../src/utils/audit');
const {
  sendGiftCardIssuedEmail,
  sendGiftCardAppliedEmail,
} = require('../../src/utils/email');
const {
  normalizeGiftCardCode,
  generateGiftCardCode,
  maskGiftCardCode,
} = require('../../src/utils/giftCard');
const giftCardService = require('../../src/services/giftCard.service');

const CODE = 'SALON-ABCD-EFGH-JKLM';

const card = (overrides = {}) => ({
  id: 'gc1',
  code: CODE,
  initialAmount: '50.00',
  balance: '50.00',
  currency: 'cad',
  status: 'ACTIVE',
  recipientName: null,
  recipientEmail: null,
  notes: null,
  createdById: 'admin-1',
  createdAt: new Date('2026-11-01T00:00:00.000Z'),
  updatedAt: new Date('2026-11-01T00:00:00.000Z'),
  ...overrides,
});

const appointment = (overrides = {}) => ({
  id: 'a1',
  userId: 'u1',
  status: 'PENDING',
  paymentStatus: 'UNPAID',
  amountPaid: '0.00',
  discountAmount: '0.00',
  service: { price: '100.00', name: 'Cut', duration: 60 },
  user: { id: 'u1', name: 'Ada', email: 'ada@example.com' },
  appointmentDate: new Date('2026-11-20T00:00:00.000Z'),
  appointmentTime: '10:00',
  ...overrides,
});

describe('giftCard utils', () => {
  it('formats, normalizes and masks codes', () => {
    expect(normalizeGiftCardCode('salon-abcd-efgh-jklm')).toBe(CODE);
    expect(normalizeGiftCardCode('ABCD EFGH JKLM')).toBe(CODE);
    expect(normalizeGiftCardCode('too-short')).toBeNull();
    expect(normalizeGiftCardCode(null)).toBeNull();
    expect(maskGiftCardCode(CODE)).toBe('SALON-****-****-JKLM');
    expect(generateGiftCardCode()).toMatch(/^SALON-[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/);
  });
});

describe('giftCardService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    giftCardRepository.findByCode.mockResolvedValue(card());
    giftCardRepository.findById.mockResolvedValue(card());
    giftCardRepository.findByIdWithRedemptions.mockResolvedValue(card({ redemptions: [] }));
    giftCardRepository.findAll.mockResolvedValue([card()]);
    giftCardRepository.count.mockResolvedValue(1);
    giftCardRepository.getSummary.mockResolvedValue({
      statusCounts: [
        { status: 'ACTIVE', _count: { _all: 2 } },
        { status: 'DEPLETED', _count: { _all: 1 } },
      ],
      activeBalance: { _sum: { balance: '75.50' } },
      issued: { _sum: { initialAmount: '150.00' } },
      redeemed: { _sum: { amount: '24.50' } },
    });
    giftCardRepository.create.mockResolvedValue(card());
    giftCardRepository.updateStatus.mockResolvedValue(card({ status: 'VOID' }));
    giftCardRepository.findAppliedRedemptions.mockResolvedValue([]);
    giftCardRepository.markRedemptionStatus.mockResolvedValue({ count: 1 });
    giftCardRepository.createRedemption.mockResolvedValue({});
    paymentRepository.applyRefundToAppointment.mockResolvedValue({ userId: 'u1' });
    prisma.$queryRaw.mockResolvedValue([{ id: 'gc1' }]);
    prisma.giftCard.updateMany.mockResolvedValue({ count: 1 });
    prisma.giftCard.findMany.mockResolvedValue([card()]);
    prisma.giftCard.update.mockResolvedValue(card());
    prisma.user.update.mockResolvedValue({});
    prisma.user.updateMany.mockResolvedValue({ count: 1 });
    prisma.appointment.findUnique.mockResolvedValue(appointment());
    prisma.appointment.update
      .mockResolvedValueOnce(appointment({ amountPaid: '50.00' }))
      .mockResolvedValue(appointment({ paymentStatus: 'PARTIAL', status: 'CONFIRMED' }));
  });

  describe('createGiftCard', () => {
    it('issues a card, audits it and emails the recipient', async () => {
      giftCardRepository.create.mockImplementation(async (data) => card({ ...data }));

      const result = await giftCardService.createGiftCard(
        'admin-1',
        {
          amount: 50,
          recipientName: '  Ada  ',
          recipientEmail: ' ADA@EXAMPLE.COM ',
          notes: '  birthday  ',
        },
        '127.0.0.1'
      );

      expect(giftCardRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          initialAmount: '50.00',
          balance: '50.00',
          recipientName: 'Ada',
          recipientEmail: 'ada@example.com',
          notes: 'birthday',
          createdById: 'admin-1',
        })
      );
      expect(giftCardRepository.create.mock.calls[0][0].code).toMatch(
        /^SALON-[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/
      );
      expect(auditLog).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'CREATE_GIFT_CARD' })
      );
      expect(sendGiftCardIssuedEmail).toHaveBeenCalled();
      expect(result.code).toMatch(/^SALON-/);
    });

    it('retries on a code collision', async () => {
      giftCardRepository.create
        .mockRejectedValueOnce({ code: 'P2002' })
        .mockImplementationOnce(async (data) => card({ ...data }));

      await expect(
        giftCardService.createGiftCard('admin-1', { amount: 50 })
      ).resolves.toMatchObject({ id: 'gc1' });
      expect(giftCardRepository.create).toHaveBeenCalledTimes(2);
    });

    it('rejects invalid amounts and fails after repeated collisions', async () => {
      await expect(
        giftCardService.createGiftCard('admin-1', { amount: 4.99 })
      ).rejects.toMatchObject({ statusCode: 400 });
      await expect(
        giftCardService.createGiftCard('admin-1', { amount: 5000.01 })
      ).rejects.toMatchObject({ statusCode: 400 });

      giftCardRepository.create.mockRejectedValue({ code: 'P2002' });
      await expect(
        giftCardService.createGiftCard('admin-1', { amount: 50 })
      ).rejects.toMatchObject({ statusCode: 409 });
    });
  });

  describe('listing and validation', () => {
    it('maps the admin summary and pagination', async () => {
      const result = await giftCardService.getAdminGiftCards({
        page: 2,
        limit: 10,
        status: 'ACTIVE',
        search: 'ada',
      });

      expect(giftCardRepository.findAll).toHaveBeenCalledWith({
        skip: 10,
        take: 10,
        status: 'ACTIVE',
        search: 'ada',
      });
      expect(result.summary).toMatchObject({
        active: 2,
        depleted: 1,
        void: 0,
        total: 3,
        activeBalance: 75.5,
        totalIssued: 150,
        totalRedeemed: 24.5,
      });
      expect(result.meta).toEqual({ total: 1, page: 2, limit: 10, totalPages: 1 });
    });

    it('returns public card details and rejects unusable cards', async () => {
      await expect(giftCardService.validateGiftCard('salon abcd efgh jklm')).resolves.toEqual({
        code: CODE,
        balance: '50.00',
        balanceCents: 5000,
        currency: 'cad',
        status: 'ACTIVE',
      });

      await expect(giftCardService.validateGiftCard('bad')).rejects.toMatchObject({
        statusCode: 400,
      });

      giftCardRepository.findByCode.mockResolvedValueOnce(null);
      await expect(giftCardService.validateGiftCard(CODE)).rejects.toMatchObject({
        statusCode: 404,
      });

      giftCardRepository.findByCode.mockResolvedValueOnce(card({ status: 'VOID' }));
      await expect(giftCardService.validateGiftCard(CODE)).rejects.toMatchObject({
        statusCode: 400,
      });

      giftCardRepository.findByCode.mockResolvedValueOnce(card({ balance: '0.00' }));
      await expect(giftCardService.validateGiftCard(CODE)).rejects.toMatchObject({
        statusCode: 400,
      });
    });

    it('returns active cards addressed to the customer', async () => {
      await giftCardService.getMyGiftCards({ email: 'ada@example.com' });
      expect(giftCardRepository.findActiveByRecipientEmail).toHaveBeenCalledWith(
        'ada@example.com'
      );
      await expect(giftCardService.getMyGiftCards(null)).resolves.toEqual([]);
    });

    it('voids active cards but refuses void/depleted cards', async () => {
      await expect(giftCardService.voidGiftCard('gc1', 'admin-1')).resolves.toMatchObject({
        status: 'VOID',
      });
      expect(auditLog).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'VOID_GIFT_CARD' })
      );

      giftCardRepository.findById.mockResolvedValueOnce(card({ status: 'VOID' }));
      await expect(
        giftCardService.voidGiftCard('gc1', 'admin-1')
      ).rejects.toMatchObject({ statusCode: 400 });

      giftCardRepository.findById.mockResolvedValueOnce(card({ status: 'DEPLETED' }));
      await expect(
        giftCardService.voidGiftCard('gc1', 'admin-1')
      ).rejects.toMatchObject({ statusCode: 400 });
    });
  });

  describe('applyForPayment', () => {
    it('debits the card, updates the appointment, credits points and emails the customer', async () => {
      giftCardRepository.findByCode.mockResolvedValue(card({ balance: '50.00' }));
      giftCardRepository.findById.mockResolvedValue(
        card({ balance: '0.00', status: 'DEPLETED' })
      );

      const result = await giftCardService.applyForPayment({
        userId: 'u1',
        appointmentId: 'a1',
        paymentType: 'FULL',
        giftCardCode: CODE,
      });

      expect(prisma.$executeRaw).toHaveBeenCalled();
      expect(giftCardRepository.createRedemption).toHaveBeenCalledWith(
        expect.objectContaining({
          giftCardId: 'gc1',
          appointmentId: 'a1',
          amount: '50.00',
          status: 'APPLIED',
        }),
        prisma
      );
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'u1' },
        data: { loyaltyPoints: { increment: 5 } },
      });
      expect(auditLog).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'REDEEM_GIFT_CARD' })
      );
      expect(sendGiftCardAppliedEmail).toHaveBeenCalled();
      expect(result).toMatchObject({
        appliedCents: 5000,
        chargeCents: 5000,
        pointsEarned: 5,
      });
      expect(prisma.appointment.update.mock.calls[1][0].data.status).toBeUndefined();
    });

    it('confirms a pending appointment when the card covers the full target', async () => {
      giftCardRepository.findByCode.mockResolvedValue(card({ balance: '100.00' }));
      giftCardRepository.findById.mockResolvedValue(
        card({ balance: '0.00', status: 'DEPLETED' })
      );
      prisma.appointment.update.mockReset();
      prisma.appointment.update
        .mockResolvedValueOnce(appointment({ amountPaid: '100.00' }))
        .mockResolvedValue(appointment({ paymentStatus: 'PAID', status: 'CONFIRMED' }));

      const result = await giftCardService.applyForPayment({
        userId: 'u1',
        appointmentId: 'a1',
        paymentType: 'FULL',
        giftCardCode: CODE,
      });

      expect(result).toMatchObject({ appliedCents: 10000, chargeCents: 0 });
      expect(prisma.appointment.update.mock.calls[1][0].data).toMatchObject({
        paymentStatus: 'PAID',
        status: 'CONFIRMED',
      });
    });

    it('reduces the debit so Stripe can charge its $0.50 minimum', async () => {
      giftCardRepository.findByCode.mockResolvedValue(card({ balance: '99.60' }));
      prisma.appointment.update.mockReset();
      prisma.appointment.update
        .mockResolvedValueOnce(appointment({ amountPaid: '99.50' }))
        .mockResolvedValue(appointment({ paymentStatus: 'PAID', status: 'CONFIRMED' }));

      const result = await giftCardService.applyForPayment({
        userId: 'u1',
        appointmentId: 'a1',
        paymentType: 'FULL',
        giftCardCode: CODE,
      });

      expect(prisma.giftCard.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ balance: { decrement: '99.50' } }),
        })
      );
      expect(result).toMatchObject({ appliedCents: 9950, chargeCents: 50 });
    });

    it('rejects unusable codes, appointments and non-positive card applications', async () => {
      await expect(
        giftCardService.applyForPayment({
          userId: 'u1',
          appointmentId: 'a1',
          paymentType: 'FULL',
          giftCardCode: 'bad',
        })
      ).rejects.toMatchObject({ statusCode: 400 });

      giftCardRepository.findByCode.mockResolvedValueOnce(null);
      await expect(
        giftCardService.applyForPayment({
          userId: 'u1',
          appointmentId: 'a1',
          paymentType: 'FULL',
          giftCardCode: CODE,
        })
      ).rejects.toMatchObject({ statusCode: 404 });

      prisma.appointment.findUnique.mockResolvedValueOnce(null);
      await expect(
        giftCardService.applyForPayment({
          userId: 'u1',
          appointmentId: 'a1',
          paymentType: 'FULL',
          giftCardCode: CODE,
        })
      ).rejects.toMatchObject({ statusCode: 404 });

      prisma.appointment.findUnique.mockResolvedValueOnce(
        appointment({ userId: 'other' })
      );
      await expect(
        giftCardService.applyForPayment({
          userId: 'u1',
          appointmentId: 'a1',
          paymentType: 'FULL',
          giftCardCode: CODE,
        })
      ).rejects.toMatchObject({ statusCode: 403 });

      prisma.appointment.findUnique.mockResolvedValueOnce(
        appointment({ status: 'CANCELLED' })
      );
      await expect(
        giftCardService.applyForPayment({
          userId: 'u1',
          appointmentId: 'a1',
          paymentType: 'FULL',
          giftCardCode: CODE,
        })
      ).rejects.toMatchObject({ statusCode: 400 });

      prisma.appointment.findUnique.mockResolvedValueOnce(
        appointment({ paymentStatus: 'PAID' })
      );
      await expect(
        giftCardService.applyForPayment({
          userId: 'u1',
          appointmentId: 'a1',
          paymentType: 'FULL',
          giftCardCode: CODE,
        })
      ).rejects.toMatchObject({ statusCode: 400 });

      prisma.appointment.findUnique.mockResolvedValueOnce(
        appointment({ paymentStatus: 'PARTIAL' })
      );
      await expect(
        giftCardService.applyForPayment({
          userId: 'u1',
          appointmentId: 'a1',
          paymentType: 'DEPOSIT',
          giftCardCode: CODE,
        })
      ).rejects.toMatchObject({ statusCode: 400 });

      prisma.appointment.findUnique.mockResolvedValueOnce(
        appointment({ amountPaid: '100.00' })
      );
      await expect(
        giftCardService.applyForPayment({
          userId: 'u1',
          appointmentId: 'a1',
          paymentType: 'FULL',
          giftCardCode: CODE,
        })
      ).rejects.toMatchObject({ statusCode: 400 });

      giftCardRepository.findByCode.mockResolvedValue(card({ balance: '0.20' }));
      prisma.appointment.findUnique.mockResolvedValueOnce(
        appointment({ amountPaid: '99.50' })
      );
      await expect(
        giftCardService.applyForPayment({
          userId: 'u1',
          appointmentId: 'a1',
          paymentType: 'FULL',
          giftCardCode: CODE,
        })
      ).rejects.toMatchObject({ statusCode: 400 });

      giftCardRepository.findByCode.mockResolvedValue(card({ balance: '50.00' }));
      prisma.giftCard.updateMany.mockResolvedValueOnce({ count: 0 });
      await expect(
        giftCardService.applyForPayment({
          userId: 'u1',
          appointmentId: 'a1',
          paymentType: 'FULL',
          giftCardCode: CODE,
        })
      ).rejects.toMatchObject({ statusCode: 409 });
    });
  });

  describe('restoreForAppointment', () => {
    const redemption = (overrides = {}) => ({
      id: 'r1',
      giftCardId: 'gc1',
      appointmentId: 'a1',
      amount: '25.00',
      status: 'APPLIED',
      giftCard: card(),
      ...overrides,
    });

    it('returns zeros when there are no applied redemptions', async () => {
      await expect(giftCardService.restoreForAppointment('a1')).resolves.toEqual({
        restoredCents: 0,
        forfeitedCents: 0,
        pointsClawed: 0,
      });
    });

    it('forfeits redemptions on a late customer cancellation', async () => {
      giftCardRepository.findAppliedRedemptions.mockResolvedValue([redemption()]);

      const result = await giftCardService.restoreForAppointment('a1', { forfeit: true });

      expect(giftCardRepository.markRedemptionStatus).toHaveBeenCalledWith(
        'r1',
        ['APPLIED'],
        'FORFEITED',
        prisma
      );
      expect(result).toEqual({ restoredCents: 0, forfeitedCents: 2500, pointsClawed: 0 });
      expect(paymentRepository.applyRefundToAppointment).not.toHaveBeenCalled();
    });

    it('restores card credit, reduces amountPaid and claws back points', async () => {
      giftCardRepository.findAppliedRedemptions.mockResolvedValue([redemption()]);

      const result = await giftCardService.restoreForAppointment('a1');

      expect(giftCardRepository.markRedemptionStatus).toHaveBeenCalledWith(
        'r1',
        ['APPLIED'],
        'RESTORED',
        prisma
      );
      expect(prisma.giftCard.update).toHaveBeenCalledWith({
        where: { id: 'gc1' },
        data: { balance: '75.00', status: 'ACTIVE' },
      });
      expect(paymentRepository.applyRefundToAppointment).toHaveBeenCalledWith(
        'a1',
        '25.00',
        prisma
      );
      expect(prisma.user.updateMany).toHaveBeenCalledWith({
        where: { id: 'u1', loyaltyPoints: { gte: 2 } },
        data: { loyaltyPoints: { decrement: 2 } },
      });
      expect(result).toEqual({ restoredCents: 2500, forfeitedCents: 0, pointsClawed: 2 });
    });

    it('forfeits redemptions from voided cards instead of restoring them', async () => {
      giftCardRepository.findAppliedRedemptions.mockResolvedValue([redemption()]);
      prisma.giftCard.findMany.mockResolvedValue([card({ status: 'VOID' })]);

      const result = await giftCardService.restoreForAppointment('a1');

      expect(result).toEqual({ restoredCents: 0, forfeitedCents: 2500, pointsClawed: 0 });
      expect(prisma.giftCard.update).not.toHaveBeenCalled();
    });
  });
});
