'use strict';

const { prisma } = require('../config/db');
const appointmentRepository = require('../repositories/appointment.repository');
const serviceRepository = require('../repositories/service.repository');
const userRepository = require('../repositories/user.repository');
const paymentRepository = require('../repositories/payment.repository');

const analyticsService = {
  async getDashboard() {
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
    ]);

    // Calculate revenue change %
    const thisMonth = parseFloat(thisMonthRevenue._sum.amount || 0);
    const lastMonth = parseFloat(lastMonthRevenue._sum.amount || 0);
    const revenueGrowth =
      lastMonth === 0 ? 100 : (((thisMonth - lastMonth) / lastMonth) * 100).toFixed(1);

    // Format status counts into a map
    const appointmentsByStatus = countByStatus.reduce((acc, item) => {
      acc[item.status] = item._count.id;
      return acc;
    }, {});

    // Format most booked services
    const topServices = mostBookedServices.map((s) => ({
      id: s.id,
      name: s.name,
      price: s.price,
      bookingCount: s._count.appointments,
    }));

    // Format monthly revenue (fill in 0 for missing months)
    const monthlyData = Array.from({ length: 12 }, (_, i) => {
      const found = monthlyRevenue.find((m) => m.month === i + 1);
      return {
        month: i + 1,
        monthName: new Date(year, i, 1).toLocaleString('default', { month: 'long' }),
        revenue: found ? Number(found.revenue) : 0,
        count: found ? Number(found.count) : 0,
      };
    });

    return {
      overview: {
        totalAppointments,
        totalCustomers,
        totalRevenue: parseFloat(revenueResult._sum.amount || 0),
        thisMonthRevenue: thisMonth,
        lastMonthRevenue: lastMonth,
        revenueGrowth: Number(revenueGrowth),
      },
      appointmentsByStatus,
      monthlyRevenue: monthlyData,
      topServices,
      recentAppointments,
    };
  },
};

module.exports = analyticsService;
