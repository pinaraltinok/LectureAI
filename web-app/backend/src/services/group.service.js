/**
 * Group Service — Factory function implementing Dependency Inversion.
 *
 * @param {import('@prisma/client').PrismaClient} db - Injected data access layer
 * @returns {object} Group service methods
 *
 * SOLID: Dependency Inversion Principle (Martin, 2017)
 */
const AppError = require('../utils/AppError');

function createGroupService(db) {
  async function getGroups() {
    const groups = await db.group.findMany({
      include: {
        course: true,
        teacher: { include: { user: { select: { name: true } } } },
        studentGroups: { select: { studentId: true } },
      },
    });
    return groups.map(g => ({
      id: g.id, name: g.name, courseId: g.courseId, courseName: g.course.course,
      teacherId: g.teacherId, teacherName: g.teacher.user.name,
      schedule: g.schedule, studentCount: g.studentGroups.length,
    }));
  }

  async function createGroup({ courseId, teacherId, schedule, name }) {
    if (!courseId || !teacherId) throw new AppError('courseId ve teacherId gereklidir.', 400);
    const course = await db.course.findUnique({ where: { id: courseId } });
    if (!course) throw new AppError('Kurs bulunamadı.', 404);
    const teacher = await db.teacher.findUnique({ where: { id: teacherId } });
    if (!teacher) throw new AppError('Eğitmen bulunamadı.', 404);
    return db.group.create({ data: { courseId, teacherId, schedule: schedule || null, name: name || null } });
  }

  async function updateGroup(id, { teacherId, schedule, name }) {
    const data = {};
    if (teacherId !== undefined) data.teacherId = teacherId;
    if (schedule !== undefined) data.schedule = schedule;
    if (name !== undefined) data.name = name;
    if (Object.keys(data).length === 0) throw new AppError('Güncellenecek alan belirtilmedi.', 400);
    return db.group.update({ where: { id }, data });
  }

  async function deleteGroup(id) {
    await db.studentGroup.deleteMany({ where: { groupId: id } });
    await db.lesson.deleteMany({ where: { groupId: id } });
    await db.group.delete({ where: { id } });
  }

  return { getGroups, createGroup, updateGroup, deleteGroup };
}

module.exports = createGroupService;
