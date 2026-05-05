/**
 * Admin API Integration Tests — Validates RBAC, CRUD, and Zod validation.
 */
const request = require('supertest');
const app = require('../src/app');
const { seedTestData, cleanup } = require('./setup');

let tokens, ids;

beforeAll(async () => {
  const data = await seedTestData();
  tokens = data.tokens;
  ids = data.ids;
});

afterAll(async () => {
  await cleanup();
});

// ── RBAC ─────────────────────────────────────────────────────
describe('Admin RBAC (roleGuard)', () => {
  test('student cannot access admin endpoints', async () => {
    const res = await request(app)
      .get('/api/admin/stats')
      .set('Authorization', `Bearer ${tokens.student}`);
    expect(res.status).toBe(403);
  });

  test('teacher cannot access admin endpoints', async () => {
    const res = await request(app)
      .get('/api/admin/stats')
      .set('Authorization', `Bearer ${tokens.teacher}`);
    expect(res.status).toBe(403);
  });

  test('unauthenticated request returns 401', async () => {
    const res = await request(app).get('/api/admin/stats');
    expect(res.status).toBe(401);
  });
});

// ── Stats ────────────────────────────────────────────────────
describe('GET /api/admin/stats', () => {
  test('returns institution statistics for admin', async () => {
    const res = await request(app)
      .get('/api/admin/stats')
      .set('Authorization', `Bearer ${tokens.admin}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('activeTeachers');
    expect(res.body).toHaveProperty('totalStudents');
    expect(res.body).toHaveProperty('totalLessons');
    expect(res.body).toHaveProperty('pendingAnalysis');
    expect(typeof res.body.activeTeachers).toBe('number');
  });
});

// ── Teachers ─────────────────────────────────────────────────
describe('GET /api/admin/teachers', () => {
  test('returns teacher list with report info', async () => {
    const res = await request(app)
      .get('/api/admin/teachers')
      .set('Authorization', `Bearer ${tokens.admin}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThanOrEqual(1);
    expect(res.body[0]).toHaveProperty('name');
    expect(res.body[0]).toHaveProperty('reportCount');
  });
});

// ── Courses CRUD ─────────────────────────────────────────────
describe('Courses CRUD', () => {
  let createdCourseId;

  test('GET /api/admin/courses — lists all courses', async () => {
    const res = await request(app)
      .get('/api/admin/courses')
      .set('Authorization', `Bearer ${tokens.admin}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  test('POST /api/admin/courses — creates a new course', async () => {
    const res = await request(app)
      .post('/api/admin/courses')
      .set('Authorization', `Bearer ${tokens.admin}`)
      .send({ course: 'Unity Game Dev', age: '12-14', lessonSize: 90, moduleNum: 2, moduleSize: 4 });
    expect(res.status).toBe(201);
    expect(res.body.course).toBe('Unity Game Dev');
    createdCourseId = res.body.id;
  });

  test('POST /api/admin/courses — Zod rejects missing fields', async () => {
    const res = await request(app)
      .post('/api/admin/courses')
      .set('Authorization', `Bearer ${tokens.admin}`)
      .send({ course: '', age: '' });
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('details');
  });

  test('DELETE /api/admin/courses/:id — deletes course', async () => {
    if (!createdCourseId) return;
    const res = await request(app)
      .delete(`/api/admin/courses/${createdCourseId}`)
      .set('Authorization', `Bearer ${tokens.admin}`);
    expect(res.status).toBe(200);
  });
});

// ── Groups CRUD ──────────────────────────────────────────────
describe('Groups CRUD', () => {
  test('GET /api/admin/groups — lists all groups', async () => {
    const res = await request(app)
      .get('/api/admin/groups')
      .set('Authorization', `Bearer ${tokens.admin}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    if (res.body.length > 0) {
      expect(res.body[0]).toHaveProperty('teacherName');
      expect(res.body[0]).toHaveProperty('studentCount');
    }
  });

  test('POST /api/admin/groups — Zod rejects missing courseId', async () => {
    const res = await request(app)
      .post('/api/admin/groups')
      .set('Authorization', `Bearer ${tokens.admin}`)
      .send({ teacherId: ids.teacher });
    expect(res.status).toBe(400);
  });
});

// ── Report Draft ─────────────────────────────────────────────
describe('GET /api/admin/analysis/draft/:jobId', () => {
  test('returns draft report details', async () => {
    const res = await request(app)
      .get(`/api/admin/analysis/draft/${ids.draftReport}`)
      .set('Authorization', `Bearer ${tokens.admin}`);
    expect(res.status).toBe(200);
    expect(res.body.jobId).toBe(ids.draftReport);
    expect(res.body.status).toBe('DRAFT');
    expect(res.body.draftReport).toHaveProperty('overallScore');
  });

  test('returns 404 for non-existent report', async () => {
    const res = await request(app)
      .get('/api/admin/analysis/draft/00000000-0000-0000-0000-000000000000')
      .set('Authorization', `Bearer ${tokens.admin}`);
    expect(res.status).toBe(404);
  });
});

// ── Teacher Reports & Progress ───────────────────────────────
describe('Teacher Reports & Progress', () => {
  test('GET /api/admin/teacher/:id/reports — returns teacher reports', async () => {
    const res = await request(app)
      .get(`/api/admin/teacher/${ids.teacher}/reports`)
      .set('Authorization', `Bearer ${tokens.admin}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('teacher');
    expect(res.body).toHaveProperty('reports');
    expect(res.body.teacher.name).toBe('Test Teacher');
  });

  test('GET /api/admin/teacher/:id/progress — returns progress data', async () => {
    const res = await request(app)
      .get(`/api/admin/teacher/${ids.teacher}/progress`)
      .set('Authorization', `Bearer ${tokens.admin}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });
});

// ── Health Check ─────────────────────────────────────────────
describe('GET /health', () => {
  test('returns ok', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });
});
