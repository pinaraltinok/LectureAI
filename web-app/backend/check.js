const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const bcrypt = require('bcryptjs');

async function check() {
  const admin = await prisma.user.findUnique({ where: { email: 'admin@lectureai.com' } });
  console.log('Admin:', admin);
  if (admin) {
    const isValid = await bcrypt.compare('password123', admin.password);
    console.log('Is password123 valid?:', isValid);
  }
  const allUsers = await prisma.user.findMany();
  console.log('All users:', allUsers.map(u => u.email));
}

check().catch(console.error).finally(() => prisma.$disconnect());
