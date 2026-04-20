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

describe('Parent Endpoints', () => {
  // ─── GET /api/parent/student/overview ──────────────────────
  describe('GET /api/parent/student/overview', () => {
    it('should return student overview with badges', async () => {
      const res = await request(app)
        .get('/api/parent/student/overview')
        .set('Authorization', `Bearer ${tokens.parent}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBeGreaterThanOrEqual(1);
      expect(res.body[0]).toHaveProperty('studentId');
      expect(res.body[0]).toHaveProperty('studentName');
      expect(res.body[0]).toHaveProperty('engagementLevel');
      expect(res.body[0]).toHaveProperty('badges');
      expect(Array.isArray(res.body[0].badges)).toBe(true);
    });

    it('should reject non-parent role', async () => {
      const res = await request(app)
        .get('/api/parent/student/overview')
        .set('Authorization', `Bearer ${tokens.student}`);

      expect(res.status).toBe(403);
    });
  });

  // ─── GET /api/parent/student/mentor-notes ──────────────────
  describe('GET /api/parent/student/mentor-notes', () => {
    it('should return mentor notes about child', async () => {
      const res = await request(app)
        .get('/api/parent/student/mentor-notes')
        .set('Authorization', `Bearer ${tokens.parent}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBeGreaterThanOrEqual(1);
      expect(res.body[0]).toHaveProperty('teacherName');
      expect(res.body[0]).toHaveProperty('note');
      expect(res.body[0]).toHaveProperty('studentName');
    });
  });

  // ─── GET /api/parent/quality-approvals ─────────────────────
  describe('GET /api/parent/quality-approvals', () => {
    it('should return quality approval status', async () => {
      const res = await request(app)
        .get('/api/parent/quality-approvals')
        .set('Authorization', `Bearer ${tokens.parent}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBeGreaterThanOrEqual(1);
      expect(res.body[0]).toHaveProperty('lessonTitle');
      expect(res.body[0]).toHaveProperty('moduleCode');
      expect(res.body[0]).toHaveProperty('status');
    });
  });
});
