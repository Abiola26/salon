'use strict';

const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting database seed...');

  // ─── Admin User ─────────────────────────────────────────────────────────────
  const adminPassword = await bcrypt.hash('Admin@123456', 12);
  const admin = await prisma.user.upsert({
    where: { email: 'admin@salon.com' },
    update: {},
    create: {
      name: 'Salon Admin',
      email: 'admin@salon.com',
      password: adminPassword,
      phone: '+1234567890',
      role: 'ADMIN',
    },
  });
  console.log(`✅ Admin created: ${admin.email}`);

  // ─── Demo Customer ───────────────────────────────────────────────────────────
  const customerPassword = await bcrypt.hash('Customer@123', 12);
  const customer = await prisma.user.upsert({
    where: { email: 'jane@example.com' },
    update: {},
    create: {
      name: 'Jane Doe',
      email: 'jane@example.com',
      password: customerPassword,
      phone: '+0987654321',
      role: 'CUSTOMER',
    },
  });
  console.log(`✅ Customer created: ${customer.email}`);

  // ─── Services ────────────────────────────────────────────────────────────────
  const services = [
    {
      name: 'Classic Haircut',
      description: 'A timeless cut tailored to your face shape. Includes wash and blow-dry.',
      duration: 45,
      price: 35.00,
      image: 'https://images.unsplash.com/photo-1562322140-8baeececf3df?w=800',
    },
    {
      name: 'Hair Coloring',
      description: 'Full color treatment with premium salon-grade dye. Includes toning and gloss.',
      duration: 120,
      price: 95.00,
      image: 'https://images.unsplash.com/photo-1600948836101-f9ffda59d250?w=800',
    },
    {
      name: 'Brazilian Blowout',
      description: 'Smoothing treatment that eliminates frizz and adds shine for up to 12 weeks.',
      duration: 150,
      price: 180.00,
      image: 'https://images.unsplash.com/photo-1522337360788-8b13dee7a37e?w=800',
    },
    {
      name: 'Deep Conditioning Treatment',
      description: 'Intensive moisture and protein treatment to repair and strengthen damaged hair.',
      duration: 60,
      price: 55.00,
      image: 'https://images.unsplash.com/photo-1560066984-138dadb4c035?w=800',
    },
    {
      name: 'Highlights & Balayage',
      description: 'Hand-painted highlights for a natural, sun-kissed look with seamless blending.',
      duration: 180,
      price: 145.00,
      image: 'https://images.unsplash.com/photo-1519699047748-de8e457a634e?w=800',
    },
    {
      name: 'Scalp Treatment',
      description: 'Therapeutic scalp massage and treatment to promote healthy hair growth.',
      duration: 30,
      price: 40.00,
      image: 'https://images.unsplash.com/photo-1540555700478-4be289fbecef?w=800',
    },
  ];

  for (const service of services) {
    const created = await prisma.service.upsert({
      where: { id: (await prisma.service.findFirst({ where: { name: service.name } }))?.id || '00000000-0000-0000-0000-000000000000' },
      update: service,
      create: service,
    });
    console.log(`✅ Service seeded: ${created.name} — $${created.price}`);
  }

  console.log('\n🎉 Database seeded successfully!');
  console.log('\n📋 Demo Credentials:');
  console.log('   Admin  → admin@salon.com   / Admin@123456');
  console.log('   Customer → jane@example.com / Customer@123');
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
