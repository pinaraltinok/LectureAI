require('dotenv').config();
const prisma = require('./src/config/db');

async function check() {
  const r = await prisma.report.findFirst({
    orderBy: { createdAt: 'desc' },
    include: { lesson: true }
  });
  const dr = (typeof r.draftReport === 'object' && r.draftReport) || {};
  
  console.log('=== Latest Report ===');
  console.log('ID:', r.id);
  console.log('Status:', r.status);
  console.log('LessonID:', r.lessonId);
  console.log('');
  console.log('--- lesson table ---');
  console.log('lesson.videoUrl:', r.lesson?.videoUrl || 'NULL');
  console.log('lesson.videoFilename:', r.lesson?.videoFilename || 'NULL');
  console.log('');
  console.log('--- draftReport fields ---');
  console.log('dr._videoUrl:', dr._videoUrl || 'NULL');
  console.log('dr._localVideoUrl:', dr._localVideoUrl || 'NULL');
  console.log('dr._videoFilename:', dr._videoFilename || 'NULL');
  console.log('');
  
  // What getDraft would return:
  const videoUrl = r.lesson?.videoUrl || dr._videoUrl || null;
  const localVideoUrl = dr._localVideoUrl || null;
  console.log('=== getDraft would return ===');
  console.log('videoUrl:', videoUrl);
  console.log('localVideoUrl:', localVideoUrl);
  
  await prisma.$disconnect();
}
check();
