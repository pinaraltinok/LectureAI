/**
 * Smart sync: Map local user IDs → production user IDs by email.
 * Create missing users with original IDs (e.g., Kağan keeps 3db079b7...).
 * Handle FK cascades properly.
 */
const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const https = require('https');

const local = new PrismaClient();

function fixDates(obj) {
  const result = { ...obj };
  for (const key of Object.keys(result)) {
    if (result[key] instanceof Date) {
      result[key] = result[key].toISOString();
    }
  }
  return result;
}

async function main() {
  // Get local data
  const users = await local.user.findMany();
  const students = await local.student.findMany();
  const teachers = await local.teacher.findMany();
  const courses = await local.course.findMany();
  const groups = await local.group.findMany();
  const studentGroups = await local.studentGroup.findMany();
  const lessons = await local.lesson.findMany();
  const reports = await local.report.findMany();
  const reportStudents = await local.reportStudent.findMany();
  await local.$disconnect();

  // Build payload with explicit ID mappings for the server-side to handle
  const data = {
    users: users.map(fixDates),
    students: students.map(fixDates),
    teachers: teachers.map(fixDates),
    courses: courses.map(fixDates),
    groups: groups.map(fixDates),
    studentGroups: studentGroups.map(fixDates),
    lessons: lessons.map(fixDates),
    reports: reports.map(fixDates),
    reportStudents: reportStudents.map(fixDates),
    _smartSync: true,  // Signal server to do email-based user matching
  };

  const jsonStr = JSON.stringify(data);
  console.log(`Sending ${(Buffer.byteLength(jsonStr) / 1024).toFixed(1)} KB...`);

  const url = new URL('/api/admin/import-data', 'https://lectureai.online');
  const options = {
    hostname: url.hostname, port: 443, path: url.pathname, method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer lectureai-pipeline-secret-2026',
      'Content-Length': Buffer.byteLength(jsonStr),
    },
    timeout: 120000,
  };

  const req = https.request(options, (res) => {
    let body = '';
    res.on('data', chunk => body += chunk);
    res.on('end', () => {
      console.log(`Status: ${res.statusCode}`);
      try {
        const r = JSON.parse(body);
        console.log(`✅ Created: ${r.created}, Skipped: ${r.skipped}`);
        if (r.errors?.length > 0) {
          console.log(`⚠️ Errors (${r.errors.length}):`);
          r.errors.forEach(e => console.log(`  - ${e.substring(0, 150)}`));
        }
        if (r.idMap) console.log('ID Map:', JSON.stringify(r.idMap, null, 2));
      } catch { console.log('Response:', body.substring(0, 1000)); }
    });
  });
  req.on('error', e => console.log('❌', e.message));
  req.write(jsonStr);
  req.end();
}

main();
