const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

(async () => {
  const result = await p.report.updateMany({
    where: { draftReport: { path: ['_analysisType'], equals: 'student_voice' } },
    data: { status: 'PROCESSING' },
  });
  console.log('Updated:', result.count);
  await p.$disconnect();
})();
