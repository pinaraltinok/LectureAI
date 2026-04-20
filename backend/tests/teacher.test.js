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

describe('Teacher Endpoints', () => {
  // ─── Mentorluk & Geri Bildirim ─────────────────────────────

  describe('GET /api/teacher/lessons/:lessonId/students', () => {
    it('should return enrolled students', async () => {
      const res = await request(app)
        .get(`/api/teacher/lessons/${ids.lesson}/students`)
        .set('Authorization', `Bearer ${tokens.teacher}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBeGreaterThanOrEqual(1);
      expect(res.body[0]).toHaveProperty('id');
      expect(res.body[0]).toHaveProperty('name');
    });

    it('should return 404 for non-owned lesson', async () => {
      const res = await request(app)
        .get('/api/teacher/lessons/00000000-0000-0000-0000-000000000000/students')
        .set('Authorization', `Bearer ${tokens.teacher}`);

      expect(res.status).toBe(404);
    });

    it('should reject student role', async () => {
      const res = await request(app)
        .get(`/api/teacher/lessons/${ids.lesson}/students`)
        .set('Authorization', `Bearer ${tokens.student}`);

      expect(res.status).toBe(403);
    });
  });

  describe('POST /api/teacher/mentor-feedback', () => {
    it('should create mentor feedback', async () => {
      const res = await request(app)
        .post('/api/teacher/mentor-feedback')
        .set('Authorization', `Bearer ${tokens.teacher}`)
        .send({
          studentId: ids.student,
          lessonId: ids.lesson,
          note: 'Harika ilerleme kaydediyorsun!',
        });

      expect(res.status).toBe(201);
      expect(res.body).toHaveProperty('id');
      expect(res.body).toHaveProperty('message');
    });

    it('should reject without studentId', async () => {
      const res = await request(app)
        .post('/api/teacher/mentor-feedback')
        .set('Authorization', `Bearer ${tokens.teacher}`)
        .send({ note: 'Test' });

      expect(res.status).toBe(400);
    });

    it('should reject non-existent student', async () => {
      const res = await request(app)
        .post('/api/teacher/mentor-feedback')
        .set('Authorization', `Bearer ${tokens.teacher}`)
        .send({
          studentId: '00000000-0000-0000-0000-000000000000',
          note: 'Test',
        });

      expect(res.status).toBe(404);
    });
  });

  describe('GET /api/teacher/my-feedbacks', () => {
    it('should return teacher feedbacks', async () => {
      const res = await request(app)
        .get('/api/teacher/my-feedbacks')
        .set('Authorization', `Bearer ${tokens.teacher}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBeGreaterThanOrEqual(1);
      expect(res.body[0]).toHaveProperty('note');
      expect(res.body[0]).toHaveProperty('studentName');
    });
  });

  // ─── Raporlar & İçgörüler ─────────────────────────────────

  describe('GET /api/teacher/reports', () => {
    it('should return finalized reports', async () => {
      const res = await request(app)
        .get('/api/teacher/reports')
        .set('Authorization', `Bearer ${tokens.teacher}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
    });
  });

  describe('GET /api/teacher/reports/:lessonId/surveys', () => {
    it('should return aggregated survey results', async () => {
      const res = await request(app)
        .get(`/api/teacher/reports/${ids.lesson}/surveys`)
        .set('Authorization', `Bearer ${tokens.teacher}`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('lessonId');
      expect(res.body).toHaveProperty('totalResponses');
      expect(res.body).toHaveProperty('averages');
    });
  });

  describe('GET /api/teacher/personal-notes', () => {
    it('should return personal notes', async () => {
      const res = await request(app)
        .get('/api/teacher/personal-notes')
        .set('Authorization', `Bearer ${tokens.teacher}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
    });
  });

  describe('POST /api/teacher/personal-notes', () => {
    it('should create a personal note', async () => {
      const res = await request(app)
        .post('/api/teacher/personal-notes')
        .set('Authorization', `Bearer ${tokens.teacher}`)
        .send({ content: 'Yarınki derste integral konusuna geç.', lessonTag: 'TEST101' });

      expect(res.status).toBe(201);
      expect(res.body).toHaveProperty('id');
      expect(res.body).toHaveProperty('content');
    });

    it('should reject empty content', async () => {
      const res = await request(app)
        .post('/api/teacher/personal-notes')
        .set('Authorization', `Bearer ${tokens.teacher}`)
        .send({ lessonTag: 'TEST101' });

      expect(res.status).toBe(400);
    });
  });
});
