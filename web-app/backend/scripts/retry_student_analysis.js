const { PrismaClient } = require('@prisma/client');
const { PubSub } = require('@google-cloud/pubsub');
const path = require('path');

const p = new PrismaClient();

// GCP credentials
const keyFilePath = path.resolve(__dirname, '../../../senior-design-488908-1d5d3e1681ee.json');
const pubsub = new PubSub({ projectId: 'senior-design-488908', keyFilename: keyFilePath });

(async () => {
  const jobId = '9a3476c8-b3a2-4dfd-9989-d574436c7fd3';

  const report = await p.report.findUnique({
    where: { id: jobId },
    select: { draftReport: true },
  });

  if (!report) {
    console.log('❌ Job bulunamadı');
    await p.$disconnect();
    return;
  }

  const dr = report.draftReport || {};
  const videoUrl = dr._videoUrl;
  const studentName = dr._studentName;
  const referenceAudioBlob = dr._referenceAudioBlob;
  const videoId = videoUrl.split('/').pop().replace(/\.[^.]+$/, '');

  console.log('📋 Job bilgileri:');
  console.log(`   Video ID: ${videoId}`);
  console.log(`   Student:  ${studentName}`);
  console.log(`   Ref Audio: ${referenceAudioBlob}`);

  // Update status to PROCESSING
  await p.report.update({
    where: { id: jobId },
    data: { status: 'PROCESSING', adminFeedback: null },
  });

  // Publish to PubSub
  const topic = pubsub.topic('student-analysis-requested');
  const payload = JSON.stringify({
    video_id: videoId,
    student_name: studentName,
    reference_audio_blob: referenceAudioBlob,
    video_uri: videoUrl,
  });

  const messageId = await topic.publishMessage({ data: Buffer.from(payload) });
  console.log(`\n✅ PubSub mesajı gönderildi! MessageId: ${messageId}`);
  console.log(`   Topic: student-analysis-requested`);
  console.log(`   Status: PROCESSING`);

  await p.$disconnect();
})();
