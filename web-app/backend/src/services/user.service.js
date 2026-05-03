/**
 * User Service — Factory function implementing Dependency Inversion.
 *
 * @param {import('@prisma/client').PrismaClient} db - Injected data access layer
 * @returns {object} User service methods
 *
 * SOLID: Dependency Inversion Principle (Martin, 2017)
 */
const bcrypt = require('bcryptjs');
const AppError = require('../utils/AppError');

function createUserService(db) {
  async function createUser({ name, email, password, phone, role, age, parent, parentPhone, startOfDate }) {
    if (!name || !email || !role) throw new AppError('Ad, email ve rol gereklidir.', 400);

    const roleMap = { student: 'STUDENT', teacher: 'TEACHER', admin: 'ADMIN' };
    const userRole = roleMap[role.toLowerCase()];
    if (!userRole) throw new AppError('Geçersiz rol.', 400);

    const existing = await db.user.findUnique({ where: { email } });
    if (existing) throw new AppError('Bu email adresi zaten kayıtlı.', 409);

    const hashedPassword = await bcrypt.hash(password || 'password123', 10);

    const user = await db.$transaction(async (tx) => {
      const newUser = await tx.user.create({
        data: { name, email, password: hashedPassword, phone: phone || null, role: userRole },
      });
      if (userRole === 'ADMIN') await tx.admin.create({ data: { id: newUser.id } });
      else if (userRole === 'TEACHER') await tx.teacher.create({ data: { id: newUser.id, startOfDate: startOfDate ? new Date(startOfDate) : new Date() } });
      else if (userRole === 'STUDENT') await tx.student.create({ data: { id: newUser.id, age: age ? parseInt(age) : null, parent: parent || null, parentPhone: parentPhone || null } });
      return newUser;
    });

    return { id: user.id, name: user.name, email: user.email, role: user.role };
  }

  async function updateUser(id, { name, email, phone, age, parent, parentPhone, startOfDate }) {
    const userData = {};
    if (name) userData.name = name;
    if (email) userData.email = email;
    if (phone !== undefined) userData.phone = phone;

    const user = await db.user.update({ where: { id }, data: userData, include: { student: true, teacher: true } });

    if (user.role === 'STUDENT' && user.student) {
      const studentData = {};
      if (age !== undefined) studentData.age = age ? parseInt(age) : null;
      if (parent !== undefined) studentData.parent = parent;
      if (parentPhone !== undefined) studentData.parentPhone = parentPhone;
      if (Object.keys(studentData).length > 0) await db.student.update({ where: { id }, data: studentData });
    }
    if (user.role === 'TEACHER' && user.teacher) {
      if (startOfDate !== undefined) await db.teacher.update({ where: { id }, data: { startOfDate: new Date(startOfDate) } });
    }
  }

  async function deleteUser(id) {
    const user = await db.user.findUnique({ where: { id }, include: { student: true, teacher: true, admin: true } });
    if (!user) throw new AppError('Kullanıcı bulunamadı.', 404);

    await db.$transaction(async (tx) => {
      if (user.student) {
        await tx.studentGroup.deleteMany({ where: { studentId: id } });
        await tx.studentEvaluation.deleteMany({ where: { studentId: id } });
        await tx.survey.deleteMany({ where: { studentId: id } });
        await tx.reportStudent.deleteMany({ where: { studentId: id } });
        await tx.student.delete({ where: { id } });
      }
      if (user.teacher) {
        await tx.teacherCourse.deleteMany({ where: { teacherId: id } });
        await tx.reportTeacher.deleteMany({ where: { teacherId: id } });
        await tx.group.updateMany({ where: { teacherId: id }, data: { teacherId: id } });
        await tx.teacher.delete({ where: { id } });
      }
      if (user.admin) {
        await tx.admin.delete({ where: { id } });
      }
      await tx.user.delete({ where: { id } });
    });
  }

  async function getStudents() {
    const students = await db.student.findMany({
      include: {
        user: { select: { id: true, name: true, email: true, phone: true } },
        studentGroups: { include: { group: { include: { course: true } } } },
      },
    });
    return students.map(s => ({
      id: s.id, name: s.user.name, email: s.user.email, phone: s.user.phone,
      age: s.age, parent: s.parent, parentPhone: s.parentPhone,
      groups: s.studentGroups.map(sg => ({ groupId: sg.groupId, courseName: sg.group.course.course, schedule: sg.group.schedule })),
    }));
  }

  async function assignStudentToGroup(studentId, groupId) {
    if (!studentId || !groupId) throw new AppError('studentId ve groupId gereklidir.', 400);

    const student = await db.student.findUnique({ where: { id: studentId } });
    if (!student) throw new AppError('Öğrenci bulunamadı.', 404);
    const group = await db.group.findUnique({ where: { id: groupId } });
    if (!group) throw new AppError('Grup bulunamadı.', 404);

    const existing = await db.studentGroup.findUnique({ where: { studentId_groupId: { studentId, groupId } } });
    if (existing) throw new AppError('Öğrenci zaten bu gruba kayıtlı.', 409);

    await db.studentGroup.create({ data: { studentId, groupId } });
  }

  async function removeStudentFromGroup(studentId, groupId) {
    if (!studentId || !groupId) throw new AppError('studentId ve groupId gereklidir.', 400);
    await db.studentGroup.delete({ where: { studentId_groupId: { studentId, groupId } } });
  }

  return { createUser, updateUser, deleteUser, getStudents, assignStudentToGroup, removeStudentFromGroup };
}

module.exports = createUserService;
