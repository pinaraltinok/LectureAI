const { PrismaClient } = require('@prisma/client');

// Local DB
const local = new PrismaClient();

(async () => {
  try {
    // Users
    const users = await local.user.findMany({ orderBy: { createdAt: 'asc' } });
    console.log(`\n=== USERS (${users.length}) ===`);
    users.forEach(u => console.log(`  ${u.name} | ${u.email} | role=${u.role} | id=${u.id}`));

    // Students
    const students = await local.student.findMany({ include: { user: { select: { name: true, email: true } } } });
    console.log(`\n=== STUDENTS (${students.length}) ===`);
    students.forEach(s => console.log(`  ${s.user?.name} | ${s.user?.email} | refAudio=${s.referenceAudioUrl || '-'} | id=${s.id}`));

    // Teachers
    const teachers = await local.teacher.findMany({ include: { user: { select: { name: true } } } });
    console.log(`\n=== TEACHERS (${teachers.length}) ===`);
    teachers.forEach(t => console.log(`  ${t.user?.name} | id=${t.id}`));

    // Courses
    const courses = await local.course.findMany();
    console.log(`\n=== COURSES (${courses.length}) ===`);
    courses.forEach(c => console.log(`  ${c.course} | id=${c.id}`));

    // Groups
    const groups = await local.group.findMany({ include: { course: { select: { course: true } } } });
    console.log(`\n=== GROUPS (${groups.length}) ===`);
    groups.forEach(g => console.log(`  ${g.course?.course} | teacherId=${g.teacherId} | id=${g.id}`));

    // StudentGroups
    const sg = await local.studentGroup.findMany();
    console.log(`\n=== STUDENT_GROUPS (${sg.length}) ===`);
    sg.forEach(s => console.log(`  studentId=${s.studentId} | groupId=${s.groupId}`));

    // Lessons
    const lessons = await local.lesson.findMany();
    console.log(`\n=== LESSONS (${lessons.length}) ===`);
    lessons.forEach(l => console.log(`  lessonNo=${l.lessonNo} | videoUrl=${(l.videoUrl||'').substring(0,60)}... | groupId=${l.groupId} | id=${l.id}`));

    // Reports
    const reports = await local.report.findMany();
    console.log(`\n=== REPORTS (${reports.length}) ===`);
    reports.forEach(r => console.log(`  status=${r.status} | lessonId=${r.lessonId} | type=${r.draftReport?._analysisType || 'standard'} | id=${r.id}`));

    // ReportStudents
    const rs = await local.reportStudent.findMany();
    console.log(`\n=== REPORT_STUDENTS (${rs.length}) ===`);
    rs.forEach(r => console.log(`  reportId=${r.reportId} | studentId=${r.studentId}`));

  } catch (err) {
    console.error('Error:', err.message);
  }
  await local.$disconnect();
})();
