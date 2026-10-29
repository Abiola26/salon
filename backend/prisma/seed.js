'use strict';

const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function main() {
  // Never seed the default credential in production.
  // Pass ALLOW_PROD_SEED=1 plus a strong ADMIN_PASSWORD explicitly if unavoidable.
  const isProd = process.env.NODE_ENV === 'production';
  const allowProdSeed = process.env.ALLOW_PROD_SEED === '1';

  if (isProd && !allowProdSeed) {
    console.error(
      'Refusing to seed in production. Set ALLOW_PROD_SEED=1 and ADMIN_PASSWORD to override.'
    );
    process.exit(1);
  }

  const adminEmail = process.env.ADMIN_EMAIL || 'admin@salon.com';
  const adminPassword = process.env.ADMIN_PASSWORD || 'Admin@123456';

  if (isProd && adminPassword === 'Admin@123456') {
    console.error('Refusing to seed the default admin password in production.');
    process.exit(1);
  }

  if (adminPassword.length < 12) {
    console.error('ADMIN_PASSWORD must be at least 12 characters.');
    process.exit(1);
  }

  console.log('🌱 Starting database seed...');

  const passwordHash = await bcrypt.hash(adminPassword, 12);
  const admin = await prisma.user.upsert({
    where: { email: adminEmail },
    update: {},
    create: {
      name: 'Salon Admin',
      email: adminEmail,
      password: passwordHash,
      phoneNumber: '+2349062380588',
      role: 'ADMIN',
    },
  });
  console.log(`✅ Admin created: ${admin.email}`);
  console.log('\n🎉 Database seeded successfully!');
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
