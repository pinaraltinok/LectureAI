/**
 * Update the draftReport with GCS JSON data (manually, using gcloud CLI output)
 */
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const report = await prisma.report.findFirst({
    where: { draftReport: { path: ['_analysisType'], equals: 'student_voice' } },
  });

  if (!report) {
    console.log('No student voice report found');
    return;
  }

  const gcsData = {
    "_analysisType": "student_voice",
    "_studentName": "Kağan Efe Tezcan",
    "_videoId": "1777882338202___3L1_Flask-Sanal_ortam___yap__land__rma",
    "_speakerId": "A",
    "_completedAt": "2026-05-04T11:38:56Z",
    "student_name": "Kağan Efe Tezcan",
    "video_id": "1777882338202___3L1_Flask-Sanal_ortam___yap__land__rma",
    "speaker_id": "A",
    "biometric_score": 0.4185,
    "all_speaker_scores": { "A": 0.4185, "B": 0.3898, "C": 0.3617, "D": 0.3354 },
  };

  const existingDraft = (typeof report.draftReport === 'object' && report.draftReport) || {};
  const merged = { ...existingDraft, ...gcsData };

  await prisma.report.update({
    where: { id: report.id },
    data: {
      draftReport: merged,
      status: 'DRAFT',
      updatedAt: new Date(),
    },
  });

  console.log(`✅ Report ${report.id} draftReport updated with GCS data`);
  console.log('   Fields:', Object.keys(merged).join(', '));
  await prisma.$disconnect();
}

main().catch(console.error);
