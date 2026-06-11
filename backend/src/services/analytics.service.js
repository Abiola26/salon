'use strict';

const { prisma } = require('../config/db');
const appointmentRepository = require('../repositories/appointment.repository');
const serviceRepository = require('../repositories/service.repository');
const userRepository = require('../repositories/user.repository');
const paymentRepository = require('../repositories/payment.repository');
const reviewRepository = require('../repositories/review.repository');
const { createTtlCache } = require('../utils/ttlCache');

const DASHBOARD_CACHE_TTL_MS = 60_000;
const dashboardCache = createTtlCache(DASHBOARD_CACHE_TTL_MS);

const toNumber = (value) => {
  if (value === null || value === undefined) return 0;
  return Number(value);
};

const getDashboardFresh = async () => {
  const now = new Date();
  const year = now.getFullYear();

  const startOfMonth = new Date(year, now.getMonth(), 1);
  const startOfLastMonth = new Date(year, now.getMonth() - 1, 1);
  const endOfLastMonth = new Date(year, now.getMonth(), 0, 23, 59, 59);

  const [
    totalAppointments,
    totalCustomers,
    revenueResult,
    countByStatus,
    monthlyRevenue,
    mostBookedServices,
    thisMonthRevenue,
    lastMonthRevenue,
    recentAppointments,
    overallRating,
  ] = await Promise.all([
    appointmentRepository.count(),
    userRepository.count({ role: 'CUSTOMER' }),
    paymentRepository.getTotalRevenue(),
    appointmentRepository.getCountByStatus(),
    appointmentRepository.getMonthlyRevenue(year),
    serviceRepository.findMostBooked(5),
    prisma.payment.aggregate({
      where: { status: 'SUCCEEDED', createdAt: { gte: startOfMonth } },
      _sum: { amount: true },
    }),
    prisma.payment.aggregate({
      where: { status: 'SUCCEEDED', createdAt: { gte: startOfLastMonth, lte: endOfLastMonth } },
      _sum: { amount: true },
    }),
    prisma.appointment.findMany({
      take: 10,
      orderBy: { createdAt: 'desc' },
      include: {
        user: { select: { id: true, name: true, email: true } },
        service: { select: { id: true, name: true, price: true } },
      },
    }),
    reviewRepository.getOverallAverageRating(),
  ]);

  const thisMonth = toNumber(thisMonthRevenue._sum.amount);
  const lastMonth = toNumber(lastMonthRevenue._sum.amount);
  const revenueGrowth = lastMonth === 0 ? 100 : Number((((thisMonth - lastMonth) / lastMonth) * 100).toFixed(1));

  const appointmentsByStatus = countByStatus.reduce((acc, item) => {
    acc[item.status] = item._count.id;
    return acc;
  }, {});

  const topServices = await Promise.all(
    mostBookedServices.map(async (service) => {
      const ratingData = await reviewRepository.getAverageRating(service.id);
      return {
        id: service.id,
        name: service.name,
        price: String(service.price),
        bookingCount: service._count.appointments,
        averageRating: ratingData._avg.rating ? Number(ratingData._avg.rating.toFixed(2)) : null,
        reviewCount: ratingData._count.rating,
      };
    })
  );

  const monthlyData = Array.from({ length: 12 }, (_, index) => {
    const found = monthlyRevenue.find((item) => item.month === index + 1);
    return {
      month: index + 1,
      monthName: new Date(year, index, 1).toLocaleString('default', { month: 'long' }),
      revenue: found ? Number(found.revenue) : 0,
      count: found ? Number(found.count) : 0,
    };
  });

  return {
    overview: {
      totalAppointments,
      totalCustomers,
      totalRevenue: toNumber(revenueResult._sum.amount),
      thisMonthRevenue: thisMonth,
      lastMonthRevenue: lastMonth,
      revenueGrowth,
      overallAverageRating: overallRating._avg.rating ? Number(overallRating._avg.rating.toFixed(2)) : null,
      totalReviews: overallRating._count.rating,
    },
    appointmentsByStatus,
    monthlyRevenue: monthlyData,
    topServices,
    recentAppointments,
  };
};

const analyticsService = {
  getDashboard() {
    return dashboardCache.getOrSet('dashboard', getDashboardFresh);
  },

  clearDashboardCache() {
    dashboardCache.clear();
  },
};

module.exports = analyticsService;
