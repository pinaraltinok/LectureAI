/**
 * Query production via import endpoint with a _queryProd flag
 */
const https = require('https');
const { PrismaClient } = require('@prisma/client');
const local = new PrismaClient();

async function main() {
  // Check local courses
  const courses = await local.course.findMany();
  console.log('Local courses:');
  courses.forEach(c => console.log(`  ${c.id} → ${c.course}`));
  
  const groups = await local.group.findMany();
  console.log('\nLocal groups:');
  groups.forEach(g => console.log(`  ${g.id} → course=${g.courseId} teacher=${g.teacherId}`));
  
  const lessons = await local.lesson.findMany();
  console.log('\nLocal lessons:');
  lessons.forEach(l => console.log(`  ${l.id} → group=${l.groupId} no=${l.lessonNo}`));
  
  await local.$disconnect();
}

main();
