/**
 * Sync local DB → Production DB
 * Preserves ALL original IDs. Uses upsert (skip if exists).
 * Dependency order: Users → Teachers/Students → Courses → Groups → StudentGroups → Lessons → Reports → ReportStudents
 */
const { PrismaClient } = require('@prisma/client');

const local = new PrismaClient();
const prodUrl = 'postgresql://postgres:kYERU8%285qt%2C%3E5UT%7B@34.12.29.49:5432/lectureai?connection_limit=1&connect_timeout=30';
const prod = new PrismaClient({ datasources: { db: { url: prodUrl } } });

let created = 0, skipped = 0;

async function upsertUser(u) {
  const exists = await prod.user.findUnique({ where: { id: u.id } });
  if (exists) { skipped++; return; }
  // Also check by email to avoid unique constraint violation
  const byEmail = await prod.user.findUnique({ where: { email: u.email } });
  if (byEmail) { console.log(`  [SKIP] User email conflict: ${u.email} (local id=${u.id}, prod id=${byEmail.id})`); skipped++; return; }
  await prod.user.create({ data: { ...u } });
  created++;
  console.log(`  [+] User: ${u.name} (${u.email})`);
}

async function upsertTeacher(t) {
  const exists = await prod.teacher.findUnique({ where: { id: t.id } });
  if (exists) { skipped++; return; }
  await prod.teacher.create({ data: { id: t.id, userId: t.userId } });
  created++;
  console.log(`  [+] Teacher: ${t.id}`);
}

async function upsertStudent(s) {
  const exists = await prod.student.findUnique({ where: { id: s.id } });
  if (exists) { skipped++; return; }
  await prod.student.create({ data: { id: s.id, userId: s.userId, referenceAudioUrl: s.referenceAudioUrl } });
  created++;
  console.log(`  [+] Student: ${s.id}`);
}

async function upsertCourse(c) {
  const exists = await prod.course.findUnique({ where: { id: c.id } });
  if (exists) { skipped++; return; }
  await prod.course.create({ data: { ...c } });
  created++;
  console.log(`  [+] Course: ${c.course}`);
}

async function upsertGroup(g) {
  const exists = await prod.group.findUnique({ where: { id: g.id } });
  if (exists) { skipped++; return; }
  await prod.group.create({ data: { id: g.id, courseId: g.courseId, teacherId: g.teacherId } });
  created++;
  console.log(`  [+] Group: ${g.id}`);
}

async function upsertStudentGroup(sg) {
  const exists = await prod.studentGroup.findFirst({ where: { studentId: sg.studentId, groupId: sg.groupId } });
  if (exists) { skipped++; return; }
  await prod.studentGroup.create({ data: { studentId: sg.studentId, groupId: sg.groupId } });
  created++;
  console.log(`  [+] StudentGroup: student=${sg.studentId.substring(0,8)}... → group=${sg.groupId.substring(0,8)}...`);
}

async function upsertLesson(l) {
  const exists = await prod.lesson.findUnique({ where: { id: l.id } });
  if (exists) { skipped++; return; }
  await prod.lesson.create({ data: { ...l } });
  created++;
  console.log(`  [+] Lesson: no=${l.lessonNo} id=${l.id}`);
}

async function upsertReport(r) {
  const exists = await prod.report.findUnique({ where: { id: r.id } });
  if (exists) { skipped++; return; }
  await prod.report.create({ data: { ...r } });
  created++;
  console.log(`  [+] Report: ${r.status} id=${r.id}`);
}

async function upsertReportStudent(rs) {
  const exists = await prod.reportStudent.findFirst({ where: { reportId: rs.reportId, studentId: rs.studentId } });
  if (exists) { skipped++; return; }
  await prod.reportStudent.create({ data: { reportId: rs.reportId, studentId: rs.studentId } });
  created++;
  console.log(`  [+] ReportStudent: report=${rs.reportId.substring(0,8)}... → student=${rs.studentId.substring(0,8)}...`);
}

async function main() {
  console.log('\n🔄 Starting local → production sync...\n');

  // 1. Users
  console.log('── Users ──');
  const users = await local.user.findMany();
  for (const u of users) await upsertUser(u);

  // 2. Teachers
  console.log('\n── Teachers ──');
  const teachers = await local.teacher.findMany();
  for (const t of teachers) await upsertTeacher(t);

  // 3. Students (IDs preserved!)
  console.log('\n── Students ──');
  const students = await local.student.findMany();
  for (const s of students) await upsertStudent(s);

  // 4. Courses
  console.log('\n── Courses ──');
  const courses = await local.course.findMany();
  for (const c of courses) await upsertCourse(c);

  // 5. Groups
  console.log('\n── Groups ──');
  const groups = await local.group.findMany();
  for (const g of groups) await upsertGroup(g);

  // 6. StudentGroups
  console.log('\n── StudentGroups ──');
  const sgs = await local.studentGroup.findMany();
  for (const sg of sgs) await upsertStudentGroup(sg);

  // 7. Lessons
  console.log('\n── Lessons ──');
  const lessons = await local.lesson.findMany();
  for (const l of lessons) await upsertLesson(l);

  // 8. Reports
  console.log('\n── Reports ──');
  const reports = await local.report.findMany();
  for (const r of reports) await upsertReport(r);

  // 9. ReportStudents
  console.log('\n── ReportStudents ──');
  const rss = await local.reportStudent.findMany();
  for (const rs of rss) await upsertReportStudent(rs);

  console.log(`\n✅ Sync complete: ${created} created, ${skipped} skipped (already existed)\n`);

  await local.$disconnect();
  await prod.$disconnect();
}

main().catch(err => {
  console.error('❌ Sync failed:', err.message);
  process.exit(1);
});
