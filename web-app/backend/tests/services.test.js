/**
 * Service Layer Unit Tests — Verifies DIP (Dependency Inversion).
 *
 * Tests service functions with MOCK database objects,
 * proving that the factory injection pattern works correctly.
 * No real database connection is needed.
 *
 * SOLID: Dependency Inversion Principle (Martin, 2017)
 *   "High-level modules should not depend on low-level modules."
 */

const createReportService = require('../src/services/report.service');
const createUserService = require('../src/services/user.service');
const createCourseService = require('../src/services/course.service');
const createGroupService = require('../src/services/group.service');

// ═══════════════════════════════════════════════════════════
// REPORT SERVICE
// ═══════════════════════════════════════════════════════════
describe('ReportService (DIP — mock db)', () => {
  const mockReport = {
    id: 'rpt-1', status: 'DRAFT',
    draftReport: { overallScore: 85, genel_sonuc: 'İyi' },
    reportTeachers: [{ teacherId: 't1', teacher: { user: { name: 'Ali' } } }],
    lesson: { group: { course: { course: 'Test' } } },
  };

  const mockDb = {
    report: {
      findUnique: jest.fn().mockResolvedValue(mockReport),
      update: jest.fn().mockResolvedValue({ ...mockReport, status: 'FINALIZED' }),
    },
    teacher: {
      findUnique: jest.fn().mockResolvedValue({ id: 't1', user: { name: 'Ali' } }),
    },
    reportTeacher: {
      findMany: jest.fn().mockResolvedValue([]),
    },
  };

  const reportService = createReportService(mockDb);

  test('getDraft — calls db.report.findUnique with correct id', async () => {
    const result = await reportService.getDraft('rpt-1');
    expect(mockDb.report.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'rpt-1' } })
    );
    expect(result.id).toBe('rpt-1');
    expect(result.draftReport.overallScore).toBe(85);
  });

  test('getDraft — throws AppError 404 when report not found', async () => {
    mockDb.report.findUnique.mockResolvedValueOnce(null);
    await expect(reportService.getDraft('nonexistent'))
      .rejects.toMatchObject({ statusCode: 404, message: 'Rapor bulunamadı.' });
  });

  test('finalize — throws AppError 400 when jobId missing', async () => {
    await expect(reportService.finalize(null, 'admin1'))
      .rejects.toMatchObject({ statusCode: 400 });
  });

  test('finalize — updates status to FINALIZED', async () => {
    const result = await reportService.finalize('rpt-1', 'admin1');
    expect(mockDb.report.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'rpt-1' },
        data: expect.objectContaining({ status: 'FINALIZED' }),
      })
    );
    expect(result.status).toBe('FINALIZED');
  });

  test('regenerate — sets status to PROCESSING', async () => {
    mockDb.report.findUnique.mockResolvedValueOnce(mockReport);
    mockDb.report.update.mockResolvedValueOnce({ ...mockReport, status: 'PROCESSING' });
    const result = await reportService.regenerate('rpt-1', 'Daha detaylı analiz yap');
    expect(result.status).toBe('PROCESSING');
  });

  test('getTeacherReports — throws 404 for unknown teacher', async () => {
    mockDb.teacher.findUnique.mockResolvedValueOnce(null);
    await expect(reportService.getTeacherReports('unknown'))
      .rejects.toMatchObject({ statusCode: 404 });
  });

  test('extractScore — handles various score formats', () => {
    expect(reportService.extractScore({ score: 4.5, report: { finalReport: {}, draftReport: {} } })).toBe(4.5);
    expect(reportService.extractScore({ score: null, report: { finalReport: { overallScore: 3.8 }, draftReport: {} } })).toBe(3.8);
    expect(reportService.extractScore({ score: null, report: { finalReport: { yeterlilikler: 'iyi' }, draftReport: {} } })).toBe(4);
    expect(reportService.extractScore({ score: null, report: { finalReport: {}, draftReport: {} } })).toBe(3); // default
    expect(reportService.extractScore({ score: 90, report: { finalReport: {}, draftReport: {} } })).toBe(4.5); // 90/20
  });
});

// ═══════════════════════════════════════════════════════════
// COURSE SERVICE
// ═══════════════════════════════════════════════════════════
describe('CourseService (DIP — mock db)', () => {
  const mockDb = {
    course: {
      findMany: jest.fn().mockResolvedValue([{ id: 'c1', course: 'Roblox', age: '8-9' }]),
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({ id: 'c2', course: 'Python', age: '10-12' }),
      update: jest.fn().mockResolvedValue({ id: 'c1', course: 'Updated' }),
      delete: jest.fn().mockResolvedValue({}),
    },
    group: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    teacherCourse: {
      findMany: jest.fn().mockResolvedValue([]),
      deleteMany: jest.fn().mockResolvedValue({}),
      createMany: jest.fn().mockResolvedValue({}),
    },
  };

  const courseService = createCourseService(mockDb);

  test('getCourses — returns all courses', async () => {
    const result = await courseService.getCourses();
    expect(Array.isArray(result)).toBe(true);
    expect(result[0].course).toBe('Roblox');
  });

  test('createCourse — validates required fields', async () => {
    await expect(courseService.createCourse({ course: '', age: '' }))
      .rejects.toMatchObject({ statusCode: 400 });
  });

  test('createCourse — creates with valid data', async () => {
    const result = await courseService.createCourse({ course: 'Python', age: '10-12' });
    expect(result.course).toBe('Python');
    expect(mockDb.course.create).toHaveBeenCalled();
  });

  test('deleteCourse — blocks deletion when groups exist', async () => {
    mockDb.group.findMany.mockResolvedValueOnce([{ id: 'g1' }]);
    await expect(courseService.deleteCourse('c1'))
      .rejects.toMatchObject({ statusCode: 409 });
  });

  test('setTeacherCourses — validates input', async () => {
    await expect(courseService.setTeacherCourses(null, []))
      .rejects.toMatchObject({ statusCode: 400 });
  });
});

// ═══════════════════════════════════════════════════════════
// GROUP SERVICE
// ═══════════════════════════════════════════════════════════
describe('GroupService (DIP — mock db)', () => {
  const mockDb = {
    group: {
      findMany: jest.fn().mockResolvedValue([{
        id: 'g1', name: 'A grubu', courseId: 'c1', teacherId: 't1',
        course: { course: 'Test' }, teacher: { user: { name: 'Ali' } },
        studentGroups: [{ studentId: 's1' }], schedule: 'Pzt',
      }]),
      create: jest.fn().mockResolvedValue({ id: 'g2', name: 'B grubu' }),
      update: jest.fn().mockResolvedValue({ id: 'g1', name: 'Updated' }),
      delete: jest.fn().mockResolvedValue({}),
    },
    course: { findUnique: jest.fn().mockResolvedValue({ id: 'c1' }) },
    teacher: { findUnique: jest.fn().mockResolvedValue({ id: 't1' }) },
    studentGroup: { deleteMany: jest.fn().mockResolvedValue({}) },
    lesson: { deleteMany: jest.fn().mockResolvedValue({}) },
  };

  const groupService = createGroupService(mockDb);

  test('getGroups — maps groups with studentCount', async () => {
    const result = await groupService.getGroups();
    expect(result[0].studentCount).toBe(1);
    expect(result[0].teacherName).toBe('Ali');
  });

  test('createGroup — validates required fields', async () => {
    await expect(groupService.createGroup({ courseId: null, teacherId: null }))
      .rejects.toMatchObject({ statusCode: 400 });
  });

  test('updateGroup — throws when no fields provided', async () => {
    await expect(groupService.updateGroup('g1', {}))
      .rejects.toMatchObject({ statusCode: 400, message: expect.stringContaining('alan') });
  });
});

// ═══════════════════════════════════════════════════════════
// USER SERVICE
// ═══════════════════════════════════════════════════════════
describe('UserService (DIP — mock db)', () => {
  const mockDb = {
    user: {
      findUnique: jest.fn().mockResolvedValue(null), // No existing user
      create: jest.fn().mockResolvedValue({ id: 'u1', name: 'New User', email: 'new@test.com', role: 'STUDENT' }),
      update: jest.fn().mockResolvedValue({ id: 'u1', role: 'STUDENT', student: {} }),
      delete: jest.fn().mockResolvedValue({}),
    },
    admin: { create: jest.fn() },
    teacher: { create: jest.fn(), update: jest.fn() },
    student: {
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
      findUnique: jest.fn().mockResolvedValue({ id: 's1' }),
    },
    group: {
      findUnique: jest.fn().mockResolvedValue({ id: 'g1' }),
      updateMany: jest.fn(),
    },
    studentGroup: {
      findUnique: jest.fn().mockResolvedValue(null),
      create: jest.fn(),
      delete: jest.fn(),
      deleteMany: jest.fn(),
    },
    studentEvaluation: { deleteMany: jest.fn() },
    survey: { deleteMany: jest.fn() },
    reportStudent: { deleteMany: jest.fn() },
    reportTeacher: { deleteMany: jest.fn() },
    teacherCourse: { deleteMany: jest.fn() },
    $transaction: jest.fn(async (cb) => cb(mockDb)),
  };

  const userService = createUserService(mockDb);

  test('createUser — validates required fields', async () => {
    await expect(userService.createUser({ name: '', email: '', role: '' }))
      .rejects.toMatchObject({ statusCode: 400 });
  });

  test('createUser — rejects invalid role', async () => {
    await expect(userService.createUser({ name: 'X', email: 'x@x.com', role: 'INVALID' }))
      .rejects.toMatchObject({ statusCode: 400, message: expect.stringContaining('Geçersiz') });
  });

  test('createUser — detects duplicate email', async () => {
    mockDb.user.findUnique.mockResolvedValueOnce({ id: 'existing' });
    await expect(userService.createUser({ name: 'X', email: 'dup@test.com', role: 'student' }))
      .rejects.toMatchObject({ statusCode: 409 });
  });

  test('assignStudentToGroup — validates both IDs', async () => {
    await expect(userService.assignStudentToGroup(null, null))
      .rejects.toMatchObject({ statusCode: 400 });
  });

  test('assignStudentToGroup — detects already assigned', async () => {
    mockDb.studentGroup.findUnique.mockResolvedValueOnce({ studentId: 's1', groupId: 'g1' });
    await expect(userService.assignStudentToGroup('s1', 'g1'))
      .rejects.toMatchObject({ statusCode: 409 });
  });

  test('getStudents — returns mapped student list', async () => {
    mockDb.student.findMany.mockResolvedValueOnce([{
      id: 's1', age: 12, parent: 'Veli', parentPhone: '555',
      user: { id: 's1', name: 'Ali', email: 'ali@test.com', phone: null },
      studentGroups: [{ groupId: 'g1', group: { course: { course: 'Python' }, schedule: 'Pzt' } }],
    }]);
    const result = await userService.getStudents();
    expect(result[0].name).toBe('Ali');
    expect(result[0].groups[0].courseName).toBe('Python');
  });
});
