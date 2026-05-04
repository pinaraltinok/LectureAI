const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

(async () => {
  // Fix: remove bucket prefix from referenceAudioUrl
  const result = await p.student.update({
    where: { id: '3db079b7-4979-4cf7-9ff7-4927a9a04c80' },
    data: { referenceAudioUrl: 'kaganefetezcan.mp3' }
  });
  console.log('Updated referenceAudioUrl:', result.referenceAudioUrl);

  // Also fix the report's draftReport
  const report = await p.report.findUnique({
    where: { id: '9a3476c8-b3a2-4dfd-9989-d574436c7fd3' },
    select: { draftReport: true }
  });
  const dr = report.draftReport || {};
  dr._referenceAudioBlob = 'kaganefetezcan.mp3';
  await p.report.update({
    where: { id: '9a3476c8-b3a2-4dfd-9989-d574436c7fd3' },
    data: { draftReport: dr, status: 'PROCESSING' }
  });
  console.log('Updated report draftReport._referenceAudioBlob');

  await p.$disconnect();
})();
