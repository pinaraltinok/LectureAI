const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database...');

  const hash = await bcrypt.hash('password123', 10);

  // ── Only create admin if not exists ──
  const existing = await prisma.user.findUnique({
    where: { email: 'admin@lectureai.com' },
  });

  if (!existing) {
    const adminUser = await prisma.user.create({
      data: {
        email: 'admin@lectureai.com',
        password: hash,
        name: 'Sistem Yöneticisi',
        phone: '0500 000 0000',
        role: 'ADMIN',
      },
    });
    await prisma.admin.create({
      data: { id: adminUser.id },
    });
    console.log('   ✓ Admin user created: admin@lectureai.com');
  } else {
    console.log('   ℹ Admin user already exists, skipping.');
  }

  console.log('\n✅ Seed completed!');
  console.log('   Admin: admin@lectureai.com / password123');
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
