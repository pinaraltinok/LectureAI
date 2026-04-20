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

describe('Auth Endpoints', () => {
  // ─── POST /api/auth/login ──────────────────────────────────
  describe('POST /api/auth/login', () => {
    it('should login with valid credentials', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: 'admin@test.com', password: 'test123' });

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('token');
      expect(res.body).toHaveProperty('role', 'ADMIN');
      expect(res.body).toHaveProperty('userId');
      expect(res.body).toHaveProperty('name', 'Test Admin');
    });

    it('should reject invalid password', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: 'admin@test.com', password: 'wrong' });

      expect(res.status).toBe(401);
      expect(res.body).toHaveProperty('error');
    });

    it('should reject non-existent email', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: 'nobody@test.com', password: 'test123' });

      expect(res.status).toBe(401);
    });

    it('should reject missing fields', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: 'admin@test.com' });

      expect(res.status).toBe(400);
    });
  });

  // ─── GET /api/auth/me ──────────────────────────────────────
  describe('GET /api/auth/me', () => {
    it('should return user profile with valid token', async () => {
      const res = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${tokens.admin}`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('userId');
      expect(res.body).toHaveProperty('email', 'admin@test.com');
      expect(res.body).toHaveProperty('role', 'ADMIN');
    });

    it('should reject request without token', async () => {
      const res = await request(app).get('/api/auth/me');
      expect(res.status).toBe(401);
    });

    it('should reject invalid token', async () => {
      const res = await request(app)
        .get('/api/auth/me')
        .set('Authorization', 'Bearer invalidtoken123');

      expect(res.status).toBe(401);
    });
  });

  // ─── POST /api/auth/logout ─────────────────────────────────
  describe('POST /api/auth/logout', () => {
    it('should logout successfully', async () => {
      const res = await request(app)
        .post('/api/auth/logout')
        .set('Authorization', `Bearer ${tokens.admin}`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('message');
    });
  });
});
