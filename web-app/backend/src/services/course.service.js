/**
 * Course Service — Factory function implementing Dependency Inversion.
 *
 * @param {import('@prisma/client').PrismaClient} db - Injected data access layer
 * @returns {object} Course service methods
 *
 * SOLID: Dependency Inversion Principle (Martin, 2017)
 */
const AppError = require('../utils/AppError');

function createCourseService(db) {
  async function getCourses() {
    return db.course.findMany({ orderBy: { course: 'asc' } });
  }

  async function createCourse({ course, age, lessonSize, moduleNum, moduleSize }) {
    if (!course || !age) throw new AppError('Kurs adı ve yaş grubu gereklidir.', 400);

    const existing = await db.course.findFirst({ where: { course, age } });
    if (existing) throw new AppError('Bu isim ve yaş grubuna sahip kurs zaten mevcut.', 409);

    return db.course.create({
      data: {
        course,
        age,
        lessonSize: lessonSize ? parseInt(lessonSize) : 60,
        moduleNum: moduleNum ? parseInt(moduleNum) : 1,
        moduleSize: moduleSize ? parseInt(moduleSize) : 4,
      },
    });
  }

  async function updateCourse(id, { course, age, lessonSize, moduleNum, moduleSize }) {
    const data = {};
    if (course) data.course = course;
    if (age) data.age = age;
    if (lessonSize !== undefined) data.lessonSize = parseInt(lessonSize);
    if (moduleNum !== undefined) data.moduleNum = parseInt(moduleNum);
    if (moduleSize !== undefined) data.moduleSize = parseInt(moduleSize);

    return db.course.update({ where: { id }, data });
  }

  async function deleteCourse(id) {
    const groups = await db.group.findMany({ where: { courseId: id } });
    if (groups.length > 0) throw new AppError(`Bu kursa bağlı ${groups.length} grup var. Önce grupları silin.`, 409);

    await db.teacherCourse.deleteMany({ where: { courseId: id } });
    await db.course.delete({ where: { id } });
  }

  async function getTeacherCourses(teacherId) {
    const tc = await db.teacherCourse.findMany({ where: { teacherId }, include: { course: true } });
    return tc.map(t => t.course);
  }

  async function setTeacherCourses(teacherId, courseIds) {
    if (!teacherId || !Array.isArray(courseIds)) throw new AppError('teacherId ve courseIds (array) gereklidir.', 400);

    await db.teacherCourse.deleteMany({ where: { teacherId } });
    if (courseIds.length > 0) {
      await db.teacherCourse.createMany({ data: courseIds.map(courseId => ({ teacherId, courseId })) });
    }
    return courseIds.length;
  }

  return { getCourses, createCourse, updateCourse, deleteCourse, getTeacherCourses, setTeacherCourses };
}

module.exports = createCourseService;
