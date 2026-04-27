/**
 * Integration tests: POST /api/auth/register
 * Mocks Prisma and crypto so no real DB or env vars are required.
 */

// Must mock before requiring the app
jest.mock('../src/services/db', () => ({
  user: {
    count: jest.fn(),
    create: jest.fn(),
    findUnique: jest.fn(),
  },
}));

// Mock crypto to avoid ENCRYPTION_KEY env var requirement
jest.mock('../src/utils/crypto', () => ({
  encrypt: jest.fn((v) => `enc:${v}`),
  decrypt: jest.fn((v) => v.replace('enc:', '')),
}));

// Mock agentLoader to avoid filesystem scans in tests
jest.mock('../src/agentLoader', () => ({
  loadAgents: jest.fn(),
  getAgent: jest.fn(),
  listAgents: jest.fn(() => []),
}));

const request = require('supertest');
const { createApp } = require('../src/createApp');
const prisma = require('../src/services/db');

const app = createApp();

beforeEach(() => {
  jest.clearAllMocks();
});

describe('POST /api/auth/register', () => {
  test('happy path — creates user and returns id/email', async () => {
    prisma.user.create.mockResolvedValue({ id: 'user-1', email: 'new@test.com' });

    const res = await request(app)
      .post('/api/auth/register')
      .send({ email: 'new@test.com', password: 'password123' });

    expect(res.status).toBe(200);
    expect(res.body.email).toBe('new@test.com');
    expect(res.body.id).toBe('user-1');
    expect(prisma.user.create).toHaveBeenCalledTimes(1);
  });

  test('short password — returns 400', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ email: 'short@test.com', password: 'abc' });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/8자/);
    expect(prisma.user.create).not.toHaveBeenCalled();
  });

  test('missing fields — returns 400', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ email: 'only@test.com' });

    expect(res.status).toBe(400);
    expect(prisma.user.create).not.toHaveBeenCalled();
  });

  test('duplicate email (P2002) — returns 409', async () => {
    const dupError = new Error('Unique constraint');
    dupError.code = 'P2002';
    prisma.user.create.mockRejectedValue(dupError);

    const res = await request(app)
      .post('/api/auth/register')
      .send({ email: 'dup@test.com', password: 'password123' });

    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/이미 사용/);
  });
});
