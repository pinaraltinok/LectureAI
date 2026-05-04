const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

(async () => {
  const result = await p.student.update({
    where: { id: '3db079b7-4979-4cf7-9ff7-4927a9a04c80' },
    data: { referenceAudioUrl: 'lectureai_student_audios/kaganefetezcan.mp3' }
  });
  console.log('Updated:', JSON.stringify(result, null, 2));
  await p.$disconnect();
})();
