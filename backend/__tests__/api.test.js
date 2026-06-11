'use strict';

/**
 * Integration tests for the Salon Booking REST API
 * Uses supertest to make real HTTP requests against the Express app.
 *
 * NOTE: Requires a running PostgreSQL database with the test/dev .env loaded.
 */

const request = require('supertest');
const app = require('../src/app');
const { prisma } = require('../src/config/db');

// ─── Shared state across tests ────────────────────────────────────────────────
let adminToken = '';
let customerToken = '';
let createdServiceId = '';
let createdAppointmentId = '';
let createdStaffId = '';
let createdCouponId = '';
let createdCouponCode = '';
let createdReviewId = '';

// ─── Helper ───────────────────────────────────────────────────────────────────
const tomorrow = new Date();
tomorrow.setDate(tomorrow.getDate() + 1);
const tomorrowStr = tomorrow.toISOString().split('T')[0];

// =============================================================================
// AUTH ROUTES
// =============================================================================
describe('Auth API', () => {
  it('GET /api/health — should return 200', async () => {
    const res = await request(app).get('/api/health');
    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('POST /api/auth/register — should create a new customer', async () => {
    const uniqueEmail = `testcustomer_${Date.now()}@example.com`;
    const res = await request(app)
      .post('/api/auth/register')
      .send({
        name: 'Test Customer',
        email: uniqueEmail,
        password: 'TestPass123!',
        phone: '+1234567890',
      });

    expect(res.statusCode).toBe(201);
    expect(res.body.data).toHaveProperty('accessToken');
    customerToken = res.body.data.accessToken;
  });

  it('POST /api/auth/login — admin login should succeed', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({
        email: 'admin@salon.com',
        password: 'Admin@123456',
      });

    expect(res.statusCode).toBe(200);
    expect(res.body.data).toHaveProperty('accessToken');
    adminToken = res.body.data.accessToken;
  });

  it('POST /api/auth/login — wrong password should return 401', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'admin@salon.com', password: 'wrongpassword' });

    expect(res.statusCode).toBe(401);
    expect(res.body.success).toBe(false);
  });

  it('POST /api/auth/login — non-existent user should return 401', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'nobody@example.com', password: 'whatever' });

    expect(res.statusCode).toBe(401);
  });
});

// =============================================================================
// SERVICES ROUTES
// =============================================================================
describe('Services API', () => {
  it('GET /api/services — public access should return 200', async () => {
    const res = await request(app).get('/api/services');
    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
  });

  it('POST /api/services — admin should create a service', async () => {
    const res = await request(app)
      .post('/api/services')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: `Test Service ${Date.now()}`,
        description: 'An automated test service',
        duration: 45,
        price: '35.00',
        isActive: true,
      });

    expect(res.statusCode).toBe(201);
    expect(res.body.data).toHaveProperty('id');
    createdServiceId = res.body.data.id;
  });

  it('POST /api/services — customer should receive 403', async () => {
    const res = await request(app)
      .post('/api/services')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({
        name: 'Unauthorized Service',
        description: 'Should fail',
        duration: 30,
        price: '20.00',
      });

    expect(res.statusCode).toBe(403);
  });

  it('GET /api/services/:id — should return the created service', async () => {
    if (!createdServiceId) return;
    const res = await request(app).get(`/api/services/${createdServiceId}`);
    expect(res.statusCode).toBe(200);
    expect(res.body.data.id).toBe(createdServiceId);
  });

  it('PATCH /api/services/:id — admin should update service', async () => {
    if (!createdServiceId) return;
    const res = await request(app)
      .patch(`/api/services/${createdServiceId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ price: '40.00' });

    expect(res.statusCode).toBe(200);
    expect(parseFloat(res.body.data.price)).toBe(40.00);
  });
});

// =============================================================================
// APPOINTMENTS ROUTES
// =============================================================================
describe('Appointments API', () => {
  it('POST /api/appointments — customer should book an appointment', async () => {
    if (!createdServiceId || !customerToken) return;

    const res = await request(app)
      .post('/api/appointments')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({
        serviceId: createdServiceId,
        appointmentDate: tomorrowStr,
        appointmentTime: '11:00',
        notes: 'Automated integration test booking',
      });

    expect(res.statusCode).toBe(201);
    expect(res.body.data).toHaveProperty('id');
    createdAppointmentId = res.body.data.id;
  });

  it('POST /api/appointments — duplicate slot should return 409', async () => {
    if (!createdServiceId || !customerToken) return;

    const res = await request(app)
      .post('/api/appointments')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({
        serviceId: createdServiceId,
        appointmentDate: tomorrowStr,
        appointmentTime: '11:00',
        notes: 'Should fail — duplicate slot',
      });

    // Either 409 (conflict) or 201 if unique constraint handles it differently
    expect([409, 400]).toContain(res.statusCode);
  });

  it('GET /api/appointments — customer should see their appointments', async () => {
    const res = await request(app)
      .get('/api/appointments')
      .set('Authorization', `Bearer ${customerToken}`);

    expect(res.statusCode).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
  });

  it('GET /api/appointments — requires authentication', async () => {
    const res = await request(app).get('/api/appointments');
    expect(res.statusCode).toBe(401);
  });

  it('GET /api/appointments/:id — customer should access their own appointment', async () => {
    if (!createdAppointmentId) return;
    const res = await request(app)
      .get(`/api/appointments/${createdAppointmentId}`)
      .set('Authorization', `Bearer ${customerToken}`);

    expect(res.statusCode).toBe(200);
    expect(res.body.data.id).toBe(createdAppointmentId);
  });

  it('PATCH /api/appointments/:id/confirm — admin should confirm appointment', async () => {
    if (!createdAppointmentId) return;
    const res = await request(app)
      .patch(`/api/appointments/${createdAppointmentId}/confirm`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.statusCode).toBe(200);
    expect(res.body.data.status).toBe('CONFIRMED');
  });

  it('DELETE /api/appointments/:id — customer should cancel appointment', async () => {
    if (!createdAppointmentId) return;
    const res = await request(app)
      .delete(`/api/appointments/${createdAppointmentId}`)
      .set('Authorization', `Bearer ${customerToken}`);

    expect(res.statusCode).toBe(200);
    expect(res.body.data.status).toBe('CANCELLED');
  });
});

// =============================================================================
// USERS ROUTES
// =============================================================================
describe('Users API', () => {
  it('GET /api/users/me — should return current user profile', async () => {
    const res = await request(app)
      .get('/api/users/me')
      .set('Authorization', `Bearer ${customerToken}`);

    expect(res.statusCode).toBe(200);
    expect(res.body.data).toHaveProperty('email');
  });

  it('GET /api/users/me — no token should return 401', async () => {
    const res = await request(app).get('/api/users/me');
    expect(res.statusCode).toBe(401);
  });

  it('GET /api/users — admin should list all users', async () => {
    const res = await request(app)
      .get('/api/users')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.statusCode).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
  });

  it('GET /api/users — customer should receive 403', async () => {
    const res = await request(app)
      .get('/api/users')
      .set('Authorization', `Bearer ${customerToken}`);

    expect(res.statusCode).toBe(403);
  });
});

// =============================================================================
// ANALYTICS ROUTES
// =============================================================================
describe('Analytics API', () => {
  it('GET /api/analytics/dashboard — admin should access analytics', async () => {
    const res = await request(app)
      .get('/api/analytics/dashboard')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.statusCode).toBe(200);
    expect(res.body.data).toHaveProperty('overview');
  });

  it('GET /api/analytics/dashboard — customer should receive 403', async () => {
    const res = await request(app)
      .get('/api/analytics/dashboard')
      .set('Authorization', `Bearer ${customerToken}`);

    expect(res.statusCode).toBe(403);
  });
});

// =============================================================================
// STAFF API
// =============================================================================
describe('Staff API', () => {
  it('POST /api/staff — admin should create staff', async () => {
    const res = await request(app)
      .post('/api/staff')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'Test Stylist',
        bio: 'Automated test stylist bio',
        isActive: true,
      });
    expect(res.statusCode).toBe(201);
    expect(res.body.data).toHaveProperty('id');
    createdStaffId = res.body.data.id;
  });

  it('GET /api/staff — public should list staff', async () => {
    const res = await request(app).get('/api/staff');
    expect(res.statusCode).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
  });

  it('GET /api/staff/:id — public should get staff', async () => {
    if (!createdStaffId) return;
    const res = await request(app).get(`/api/staff/${createdStaffId}`);
    expect(res.statusCode).toBe(200);
    expect(res.body.data.name).toBe('Test Stylist');
  });

  it('PUT /api/staff/:id — admin should update staff', async () => {
    if (!createdStaffId) return;
    const res = await request(app)
      .put(`/api/staff/${createdStaffId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'Updated Test Stylist',
        isActive: true,
      });
    expect(res.statusCode).toBe(200);
    expect(res.body.data.name).toBe('Updated Test Stylist');
  });
});

// =============================================================================
// COUPONS API
// =============================================================================
describe('Coupons API', () => {
  it('POST /api/coupons — admin should create coupon', async () => {
    createdCouponCode = `TEST_${Date.now()}`;
    const res = await request(app)
      .post('/api/coupons')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        code: createdCouponCode,
        discountType: 'PERCENTAGE',
        discountValue: '15.00',
        isActive: true,
        startDate: new Date().toISOString(),
        endDate: tomorrow.toISOString(),
      });
    expect(res.statusCode).toBe(201);
    expect(res.body.data).toHaveProperty('id');
    createdCouponId = res.body.data.id;
  });

  it('GET /api/coupons — admin should get all coupons', async () => {
    const res = await request(app)
      .get('/api/coupons')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.statusCode).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
  });

  it('GET /api/coupons/:id — admin should get coupon by ID', async () => {
    if (!createdCouponId) return;
    const res = await request(app)
      .get(`/api/coupons/${createdCouponId}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.statusCode).toBe(200);
    expect(res.body.data.id).toBe(createdCouponId);
  });

  it('POST /api/coupons/validate — customer should validate coupon', async () => {
    if (!createdCouponCode) return;
    const res = await request(app)
      .post('/api/coupons/validate')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({
        code: createdCouponCode,
        servicePrice: 100.00,
      });
    expect(res.statusCode).toBe(200);
    expect(res.body.data).toHaveProperty('discountAmount');
    expect(Number(res.body.data.discountAmount)).toBe(15.00);
  });

  it('PUT /api/coupons/:id — admin should update coupon', async () => {
    if (!createdCouponId) return;
    const res = await request(app)
      .put(`/api/coupons/${createdCouponId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        code: createdCouponCode,
        discountType: 'PERCENTAGE',
        discountValue: '20.00',
        isActive: true,
      });
    expect(res.statusCode).toBe(200);
    expect(Number(res.body.data.discountValue)).toBe(20.00);
  });
});

// =============================================================================
// REVIEWS API
// =============================================================================
describe('Reviews API', () => {
  it('POST /api/reviews — customer should submit review for completed appointment', async () => {
    if (!createdAppointmentId || !createdServiceId || !customerToken) return;

    // Manually mark the appointment COMPLETED directly via Prisma
    await prisma.appointment.update({
      where: { id: createdAppointmentId },
      data: { status: 'COMPLETED' },
    });

    const res = await request(app)
      .post('/api/reviews')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({
        appointmentId: createdAppointmentId,
        rating: 5,
        comment: 'Excellent service!',
      });

    expect(res.statusCode).toBe(201);
    expect(res.body.data).toHaveProperty('id');
    createdReviewId = res.body.data.id;
  });

  it('GET /api/reviews — public should get reviews', async () => {
    const res = await request(app).get('/api/reviews');
    expect(res.statusCode).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
  });

  it('GET /api/reviews/my — customer should get their own reviews', async () => {
    if (!customerToken) return;
    const res = await request(app)
      .get('/api/reviews/my')
      .set('Authorization', `Bearer ${customerToken}`);
    expect(res.statusCode).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
  });
});

// =============================================================================
// PAYMENTS API
// =============================================================================
describe('Payments API', () => {
  it('GET /api/payments — admin should list all payments', async () => {
    const res = await request(app)
      .get('/api/payments')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.statusCode).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
  });

  it('GET /api/payments/:appointmentId — customer should list payments for appointment', async () => {
    if (!createdAppointmentId || !customerToken) return;
    const res = await request(app)
      .get(`/api/payments/${createdAppointmentId}`)
      .set('Authorization', `Bearer ${customerToken}`);
    expect(res.statusCode).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
  });
});

// =============================================================================
// CLEANUP — delete test entities directly via Prisma
// =============================================================================
afterAll(async () => {
  try {
    if (createdReviewId) {
      await prisma.review.delete({
        where: { id: createdReviewId },
      }).catch(() => {});
    }

    if (createdAppointmentId) {
      await prisma.appointment.delete({
        where: { id: createdAppointmentId },
      }).catch(() => {});
    }

    if (createdServiceId) {
      await prisma.service.delete({
        where: { id: createdServiceId },
      }).catch(() => {});
    }

    if (createdStaffId) {
      await prisma.staff.delete({
        where: { id: createdStaffId },
      }).catch(() => {});
    }

    if (createdCouponId) {
      await prisma.coupon.delete({
        where: { id: createdCouponId },
      }).catch(() => {});
    }
  } catch (error) {
    console.error('Error during test cleanup:', error);
  } finally {
    await prisma.$disconnect();
  }

  // Give the DB connection time to close gracefully
  await new Promise((resolve) => setTimeout(resolve, 500));
});

