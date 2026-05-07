const { PrismaClient } = require('@prisma/client');

const prodUrl = 'postgresql://postgres:kYERU8%285qt%2C%3E5UT%7B@34.12.29.49:5432/lectureai?sslmode=prefer';
const prisma = new PrismaClient({ datasources: { db: { url: prodUrl } } });

(async () => {
  try {
    const students = await prisma.student.findMany({
      include: {
        user: { select: { id: true, name: true, email: true, phone: true, createdAt: true } },
        studentGroups: {
          include: {
            group: {
              include: { course: { select: { course: true } } },
            },
          },
        },
      },
    });

    console.log(`\n=== Canli DB: ${students.length} ogrenci ===\n`);

    students.forEach((s, i) => {
      const courses = s.studentGroups.map(sg => sg.group?.course?.course || '-').join(', ');
      console.log(`${i + 1}. ${s.user?.name || 'Isimsiz'}`);
      console.log(`   Email: ${s.user?.email || '-'}`);
      console.log(`   Telefon: ${s.user?.phone || '-'}`);
      console.log(`   StudentId: ${s.id}`);
      console.log(`   UserId: ${s.userId}`);
      console.log(`   Dersler: ${courses || '-'}`);
      console.log(`   ReferenceAudioUrl: ${s.referenceAudioUrl || '-'}`);
      console.log(`   Kayit: ${s.user?.createdAt || '-'}`);
      console.log('');
    });
  } catch (err) {
    console.error('Error:', err.message);
  }
  await prisma.$disconnect();
})();
