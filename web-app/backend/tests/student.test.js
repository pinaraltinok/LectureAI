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

describe('Student Endpoints', () => {
  // ─── GET /api/student/courses ──────────────────────────────
  describe('GET /api/student/courses', () => {
    it('should return enrolled courses', async () => {
      const res = await request(app)
        .get('/api/student/courses')
        .set('Authorization', `Bearer ${tokens.student}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBeGreaterThanOrEqual(1);
      expect(res.body[0]).toHaveProperty('lessonId');
      expect(res.body[0]).toHaveProperty('title');
      expect(res.body[0]).toHaveProperty('moduleCode');
      expect(res.body[0]).toHaveProperty('teacherName');
      expect(res.body[0]).toHaveProperty('hasSurvey');
    });

    it('should reject non-student role', async () => {
      const res = await request(app)
        .get('/api/student/courses')
        .set('Authorization', `Bearer ${tokens.teacher}`);

      expect(res.status).toBe(403);
    });
  });

  // ─── GET /api/student/mentor-notes ─────────────────────────
  describe('GET /api/student/mentor-notes', () => {
    it('should return mentor notes for student', async () => {
      const res = await request(app)
        .get('/api/student/mentor-notes')
        .set('Authorization', `Bearer ${tokens.student}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBeGreaterThanOrEqual(1);
      expect(res.body[0]).toHaveProperty('teacherName');
      expect(res.body[0]).toHaveProperty('note');
    });
  });

  // ─── POST /api/student/survey/submit ───────────────────────
  describe('POST /api/student/survey/submit', () => {
    it('should submit a survey', async () => {
      const res = await request(app)
        .post('/api/student/survey/submit')
        .set('Authorization', `Bearer ${tokens.student}`)
        .send({
          lessonId: ids.lesson,
          contentQuality: 5,
          teachingMethod: 4,
          engagement: 5,
          materials: 4,
          overall: 5,
          anonymousComment: 'Çok güzel bir ders.',
        });

      expect(res.status).toBe(201);
      expect(res.body).toHaveProperty('id');
      expect(res.body).toHaveProperty('message');
    });

    it('should reject duplicate survey', async () => {
      const res = await request(app)
        .post('/api/student/survey/submit')
        .set('Authorization', `Bearer ${tokens.student}`)
        .send({
          lessonId: ids.lesson,
          contentQuality: 3,
          teachingMethod: 3,
          engagement: 3,
          materials: 3,
          overall: 3,
        });

      expect(res.status).toBe(409);
    });

    it('should reject if not enrolled', async () => {
      const res = await request(app)
        .post('/api/student/survey/submit')
        .set('Authorization', `Bearer ${tokens.student2}`)
        .send({
          lessonId: ids.lesson,
          contentQuality: 5,
          teachingMethod: 4,
          engagement: 5,
          materials: 4,
          overall: 5,
        });

      expect(res.status).toBe(403);
    });

    it('should reject invalid scores (out of range)', async () => {
      // Need enrolling student2 first for this test
      const { prisma } = require('./setup');
      await prisma.lessonEnrollment.create({
        data: { lessonId: ids.lesson, studentId: ids.student2 },
      }).catch(() => {}); // ignore if already exists

      const res = await request(app)
        .post('/api/student/survey/submit')
        .set('Authorization', `Bearer ${tokens.student2}`)
        .send({
          lessonId: ids.lesson,
          contentQuality: 6,
          teachingMethod: 4,
          engagement: 5,
          materials: 4,
          overall: 5,
        });

      expect(res.status).toBe(400);
    });

    it('should reject missing fields', async () => {
      const res = await request(app)
        .post('/api/student/survey/submit')
        .set('Authorization', `Bearer ${tokens.student}`)
        .send({ lessonId: ids.lesson });

      expect(res.status).toBe(400);
    });
  });
});
