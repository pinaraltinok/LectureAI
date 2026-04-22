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

describe('Admin Endpoints', () => {
  // ─── GET /api/admin/stats ──────────────────────────────────
  describe('GET /api/admin/stats', () => {
    it('should return institution stats for admin', async () => {
      const res = await request(app)
        .get('/api/admin/stats')
        .set('Authorization', `Bearer ${tokens.admin}`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('institutionScore');
      expect(res.body).toHaveProperty('activeTeachers');
      expect(res.body).toHaveProperty('pendingAnalysis');
      expect(res.body).toHaveProperty('totalStudents');
      expect(res.body).toHaveProperty('totalLessons');
    });

    it('should reject non-admin user', async () => {
      const res = await request(app)
        .get('/api/admin/stats')
        .set('Authorization', `Bearer ${tokens.teacher}`);

      expect(res.status).toBe(403);
    });
  });

  // ─── GET /api/admin/teachers ───────────────────────────────
  describe('GET /api/admin/teachers', () => {
    it('should return teacher list', async () => {
      const res = await request(app)
        .get('/api/admin/teachers')
        .set('Authorization', `Bearer ${tokens.admin}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBeGreaterThanOrEqual(1);
      expect(res.body[0]).toHaveProperty('id');
      expect(res.body[0]).toHaveProperty('name');
      expect(res.body[0]).toHaveProperty('branch');
    });
  });

  // ─── POST /api/admin/analysis/upload ───────────────────────
  describe('POST /api/admin/analysis/upload', () => {
    it('should upload analysis with videoUrl', async () => {
      const res = await request(app)
        .post('/api/admin/analysis/upload')
        .set('Authorization', `Bearer ${tokens.admin}`)
        .send({ videoUrl: 'https://test.com/new-video.mp4' });

      expect(res.status).toBe(201);
      expect(res.body).toHaveProperty('jobId');
      expect(res.body).toHaveProperty('status', 'PENDING');
    });

    it('should reject without video', async () => {
      const res = await request(app)
        .post('/api/admin/analysis/upload')
        .set('Authorization', `Bearer ${tokens.admin}`)
        .send({});

      expect(res.status).toBe(400);
    });
  });

  // ─── POST /api/admin/analysis/assign ───────────────────────
  describe('POST /api/admin/analysis/assign', () => {
    it('should assign analysis to teacher and lesson', async () => {
      // First create a job
      const uploadRes = await request(app)
        .post('/api/admin/analysis/upload')
        .set('Authorization', `Bearer ${tokens.admin}`)
        .send({ videoUrl: 'https://test.com/assign-test.mp4' });

      const res = await request(app)
        .post('/api/admin/analysis/assign')
        .set('Authorization', `Bearer ${tokens.admin}`)
        .send({
          jobId: uploadRes.body.jobId,
          teacherId: ids.teacher,
          lessonId: ids.lesson,
        });

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('status', 'PROCESSING');
    });

    it('should reject missing fields', async () => {
      const res = await request(app)
        .post('/api/admin/analysis/assign')
        .set('Authorization', `Bearer ${tokens.admin}`)
        .send({ jobId: ids.draftJob });

      expect(res.status).toBe(400);
    });
  });

  // ─── GET /api/admin/analysis/draft/:jobId ──────────────────
  describe('GET /api/admin/analysis/draft/:jobId', () => {
    it('should return draft report', async () => {
      const res = await request(app)
        .get(`/api/admin/analysis/draft/${ids.draftJob}`)
        .set('Authorization', `Bearer ${tokens.admin}`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('jobId', ids.draftJob);
      expect(res.body).toHaveProperty('draftReport');
      expect(res.body.draftReport).toHaveProperty('overallScore');
    });

    it('should return 404 for non-existent job', async () => {
      const res = await request(app)
        .get('/api/admin/analysis/draft/00000000-0000-0000-0000-000000000000')
        .set('Authorization', `Bearer ${tokens.admin}`);

      expect(res.status).toBe(404);
    });
  });

  // ─── POST /api/admin/analysis/regenerate ───────────────────
  describe('POST /api/admin/analysis/regenerate', () => {
    it('should queue report regeneration', async () => {
      const res = await request(app)
        .post('/api/admin/analysis/regenerate')
        .set('Authorization', `Bearer ${tokens.admin}`)
        .send({ jobId: ids.draftJob, feedback: 'Daha detaylı analiz gerekli.' });

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('status', 'PROCESSING');
    });
  });

  // ─── POST /api/admin/analysis/finalize ─────────────────────
  describe('POST /api/admin/analysis/finalize', () => {
    it('should finalize a draft report', async () => {
      // Reset the draft job status first (regenerate changed it to PROCESSING)
      const { prisma } = require('./setup');
      await prisma.analysisJob.update({
        where: { id: ids.draftJob },
        data: {
          status: 'DRAFT',
          draftReport: { overallScore: 88, engagement: 'Yüksek' },
        },
      });

      const res = await request(app)
        .post('/api/admin/analysis/finalize')
        .set('Authorization', `Bearer ${tokens.admin}`)
        .send({ jobId: ids.draftJob });

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('status', 'FINALIZED');
    });

    it('should reject missing jobId', async () => {
      const res = await request(app)
        .post('/api/admin/analysis/finalize')
        .set('Authorization', `Bearer ${tokens.admin}`)
        .send({});

      expect(res.status).toBe(400);
    });
  });
});
