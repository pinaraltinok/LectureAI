/**
 * Export local DB data as a JSON file, then import via backend /api/admin endpoint
 * or direct Cloud SQL connection from within Cloud Run.
 */
const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const local = new PrismaClient();

async function main() {
  const data = {};

  // 1. Users (only those NOT in production - filter by email later)
  data.users = await local.user.findMany();
  
  // 2. Students
  data.students = await local.student.findMany();
  
  // 3. Teachers
  data.teachers = await local.teacher.findMany();
  
  // 4. Courses
  data.courses = await local.course.findMany();
  
  // 5. Groups
  data.groups = await local.group.findMany();
  
  // 6. StudentGroups
  data.studentGroups = await local.studentGroup.findMany();
  
  // 7. Lessons
  data.lessons = await local.lesson.findMany();
  
  // 8. Reports
  data.reports = await local.report.findMany();
  
  // 9. ReportStudents
  data.reportStudents = await local.reportStudent.findMany();

  const outPath = './scripts/_local_dump.json';
  fs.writeFileSync(outPath, JSON.stringify(data, null, 2), 'utf-8');
  console.log(`✅ Exported ${Object.keys(data).length} tables to ${outPath}`);
  Object.entries(data).forEach(([k, v]) => console.log(`  ${k}: ${v.length} records`));

  await local.$disconnect();
}

main().catch(console.error);
