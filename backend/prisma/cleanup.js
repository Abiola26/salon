'use strict';

/**
 * ┌──────────────────────────────────────────────────────────────────┐
 * │  Ottawa Loctician (IWA LOCZ) — Database Cleanup Script          │
 * │  Deletes ALL test / transactional data.                         │
 * │  KEEPS: Services, Staff, Coupons, and the admin account.        │
 * └──────────────────────────────────────────────────────────────────┘
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// ── Email of the admin account to PRESERVE ──────────────────────────
const KEEP_ADMIN_EMAIL = 'admin@salon.com';

async function cleanup() {
  console.log('🧹 Starting database cleanup...\n');

  // 1. Reviews (references appointments + users + services)
  const { count: reviews } = await prisma.review.deleteMany({});
  console.log(`✅ Deleted ${reviews} review(s)`);

  // 2. Email Queue (standalone)
  const { count: emails } = await prisma.emailQueue.deleteMany({});
  console.log(`✅ Deleted ${emails} email queue entry(ies)`);

  // 3. Audit Logs (userId is nullable — safe to delete all)
  const { count: auditLogs } = await prisma.auditLog.deleteMany({});
  console.log(`✅ Deleted ${auditLogs} audit log(s)`);

  // 4. Payments (depends on appointments + users — cascade handles it)
  const { count: payments } = await prisma.payment.deleteMany({});
  console.log(`✅ Deleted ${payments} payment record(s)`);

  // 5. Appointments (depends on users + services)
  const { count: appointments } = await prisma.appointment.deleteMany({});
  console.log(`✅ Deleted ${appointments} appointment(s)`);

  // 6. Customer accounts — delete ALL users except the admin
  const { count: users } = await prisma.user.deleteMany({
    where: {
      email: { not: KEEP_ADMIN_EMAIL },
    },
  });
  console.log(`✅ Deleted ${users} test user account(s)  (admin preserved)`);

  // ── Summary ─────────────────────────────────────────────────────────
  console.log('\n─────────────────────────────────────────────');
  console.log('📊 Cleanup Summary:');
  console.log(`   Reviews deleted        : ${reviews}`);
  console.log(`   Email queue cleared    : ${emails}`);
  console.log(`   Audit logs cleared     : ${auditLogs}`);
  console.log(`   Payments deleted       : ${payments}`);
  console.log(`   Appointments deleted   : ${appointments}`);
  console.log(`   Test users deleted     : ${users}`);
  console.log('─────────────────────────────────────────────');

  // ── Verify what remains ─────────────────────────────────────────────
  const [svcCount, staffCount, couponCount, adminCount] = await Promise.all([
    prisma.service.count(),
    prisma.staff.count(),
    prisma.coupon.count(),
    prisma.user.count({ where: { email: KEEP_ADMIN_EMAIL } }),
  ]);

  console.log('\n✅ Preserved data:');
  console.log(`   Services  : ${svcCount}`);
  console.log(`   Staff     : ${staffCount}`);
  console.log(`   Coupons   : ${couponCount}`);
  console.log(`   Admin     : ${adminCount} (${KEEP_ADMIN_EMAIL})`);
  console.log('\n🎉 Database is clean and ready for production!\n');
}

cleanup()
  .catch((e) => {
    console.error('\n❌ Cleanup failed:', e.message);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
