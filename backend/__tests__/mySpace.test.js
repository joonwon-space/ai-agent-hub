/**
 * Integration tests: /api/my-space routes
 * Uses Prisma mocks (same pattern as auth.login.test.js).
 */

jest.mock('../src/services/db', () => ({
  user: {
    count: jest.fn(),
    create: jest.fn(),
    findUnique: jest.fn(),
  },
  space: {
    findMany: jest.fn(),
    findFirst: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
  diaryEntry: {
    findMany: jest.fn(),
    findFirst: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
}));

jest.mock('../src/utils/crypto', () => ({
  encrypt: jest.fn((v) => `enc:${v}`),
  decrypt: jest.fn((v) => v.replace('enc:', '')),
}));

jest.mock('../src/agentLoader', () => ({
  loadAgents: jest.fn(),
  getAgent: jest.fn(),
  listAgents: jest.fn(() => []),
}));

const request = require('supertest');
const { createApp } = require('../src/createApp');
const prisma = require('../src/services/db');

const app = createApp();

// ---------------------------------------------------------------------------
// Helper: simulate an authenticated session by mocking prisma.user.findUnique
// to return a user, then logging in via the auth route.
// ---------------------------------------------------------------------------
const USER_A = { id: 1, email: 'userA@test.com', passwordHash: null };
const USER_B = { id: 2, email: 'userB@test.com', passwordHash: null };

/**
 * Obtain a supertest agent with an active session for the given user id/email.
 * We inject the session by using the POST /api/auth/login path — but since we
 * mock prisma.user.findUnique in auth.js and requireAuth also calls it, we have
 * to set up the mock before each request.
 *
 * Simpler approach: call the auth endpoint with a pre-hashed password and
 * capture the cookie for the agent.
 */
const bcrypt = require('bcrypt');

async function makeAgentFor(user) {
  const hash = await bcrypt.hash('password123', 10);
  const agent = request.agent(app);

  prisma.user.findUnique.mockResolvedValue({ ...user, passwordHash: hash });
  await agent
    .post('/api/auth/login')
    .send({ email: user.email, password: 'password123' });

  // After login, requireAuth calls prisma.user.findUnique again.
  // Set up a persistent mock that returns the right user based on the session.
  // Since sessions use user.id, we mock to return the correct user each call.
  prisma.user.findUnique.mockImplementation(({ where }) => {
    if (where.id === USER_A.id) return Promise.resolve({ ...USER_A, passwordHash: hash });
    if (where.id === USER_B.id) return Promise.resolve({ ...USER_B, passwordHash: hash });
    return Promise.resolve(null);
  });

  return agent;
}

beforeEach(() => {
  jest.clearAllMocks();
});

// ---------------------------------------------------------------------------
// Space routes
// ---------------------------------------------------------------------------
describe('POST /api/my-space', () => {
  test('happy path — creates and returns space', async () => {
    const hash = await bcrypt.hash('password123', 10);
    const agent = request.agent(app);

    prisma.user.findUnique.mockResolvedValue({ ...USER_A, passwordHash: hash });
    await agent.post('/api/auth/login').send({ email: USER_A.email, password: 'password123' });

    const createdSpace = {
      id: 10,
      userId: USER_A.id,
      name: '내 일기',
      template: 'diary',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    prisma.user.findUnique.mockResolvedValue({ ...USER_A, passwordHash: hash });
    prisma.space.create.mockResolvedValue(createdSpace);

    const res = await agent
      .post('/api/my-space')
      .send({ name: '내 일기', template: 'diary' });

    expect(res.status).toBe(201);
    expect(res.body.id).toBe(10);
    expect(res.body.template).toBe('diary');
    expect(prisma.space.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ userId: USER_A.id, name: '내 일기', template: 'diary' }),
    });
  });

  test('invalid template — returns 400 with details.template', async () => {
    const hash = await bcrypt.hash('password123', 10);
    const agent = request.agent(app);

    prisma.user.findUnique.mockResolvedValue({ ...USER_A, passwordHash: hash });
    await agent.post('/api/auth/login').send({ email: USER_A.email, password: 'password123' });

    prisma.user.findUnique.mockResolvedValue({ ...USER_A, passwordHash: hash });

    const res = await agent
      .post('/api/my-space')
      .send({ name: '내 일기', template: 'invalid' });

    expect(res.status).toBe(400);
    expect(res.body.details).toHaveProperty('template');
  });
});

describe('GET /api/my-space', () => {
  test('lists only the authenticated user\'s spaces', async () => {
    const hash = await bcrypt.hash('password123', 10);
    const agent = request.agent(app);

    prisma.user.findUnique.mockResolvedValue({ ...USER_A, passwordHash: hash });
    await agent.post('/api/auth/login').send({ email: USER_A.email, password: 'password123' });

    const userASpaces = [
      { id: 1, userId: USER_A.id, name: '내 일기', template: 'diary' },
    ];

    prisma.user.findUnique.mockResolvedValue({ ...USER_A, passwordHash: hash });
    prisma.space.findMany.mockResolvedValue(userASpaces);

    const res = await agent.get('/api/my-space');

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].userId).toBe(USER_A.id);
    expect(prisma.space.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: USER_A.id } }),
    );
  });
});

describe('Cross-user access', () => {
  test('user B cannot access user A\'s space diary — returns 404', async () => {
    const hash = await bcrypt.hash('password123', 10);
    const agentB = request.agent(app);

    // Log in as user B
    prisma.user.findUnique.mockResolvedValue({ ...USER_B, passwordHash: hash });
    await agentB.post('/api/auth/login').send({ email: USER_B.email, password: 'password123' });

    // requireAuth will look up user by session.userId (which is USER_B.id = 2)
    prisma.user.findUnique.mockResolvedValue({ ...USER_B, passwordHash: hash });
    // loadOwnedSpace will look for spaceId=1 with userId=USER_B.id → not found
    prisma.space.findFirst.mockResolvedValue(null);

    const res = await agentB.get('/api/my-space/1/diary');

    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/not found/i);
  });
});

describe('POST /api/my-space/:spaceId/diary', () => {
  test('happy path — creates diary entry', async () => {
    const hash = await bcrypt.hash('password123', 10);
    const agent = request.agent(app);

    prisma.user.findUnique.mockResolvedValue({ ...USER_A, passwordHash: hash });
    await agent.post('/api/auth/login').send({ email: USER_A.email, password: 'password123' });

    const space = { id: 10, userId: USER_A.id, name: '내 일기', template: 'diary' };
    const entry = {
      id: 100,
      spaceId: 10,
      entryDate: new Date('2026-05-03'),
      mood: 'happy',
      title: '오늘의 일기',
      body: '좋은 하루였다.',
    };

    prisma.user.findUnique.mockResolvedValue({ ...USER_A, passwordHash: hash });
    prisma.space.findFirst.mockResolvedValue(space);
    prisma.diaryEntry.create.mockResolvedValue(entry);

    const res = await agent
      .post('/api/my-space/10/diary')
      .send({ entryDate: '2026-05-03', mood: 'happy', title: '오늘의 일기', body: '좋은 하루였다.' });

    expect(res.status).toBe(201);
    expect(res.body.id).toBe(100);
    expect(res.body.mood).toBe('happy');
  });
});

describe('Diary validation', () => {
  let agent;
  let hash;

  beforeEach(async () => {
    hash = await bcrypt.hash('password123', 10);
    agent = request.agent(app);
    prisma.user.findUnique.mockResolvedValue({ ...USER_A, passwordHash: hash });
    await agent.post('/api/auth/login').send({ email: USER_A.email, password: 'password123' });
    prisma.user.findUnique.mockResolvedValue({ ...USER_A, passwordHash: hash });
    prisma.space.findFirst.mockResolvedValue({ id: 10, userId: USER_A.id });
  });

  test('body over 50,000 chars — returns 400 with details.body', async () => {
    const longBody = 'x'.repeat(50001);
    const res = await agent
      .post('/api/my-space/10/diary')
      .send({ entryDate: '2026-05-03', title: '제목', body: longBody });

    expect(res.status).toBe(400);
    expect(res.body.details).toHaveProperty('body');
  });

  test('invalid mood enum — returns 400 with details.mood', async () => {
    const res = await agent
      .post('/api/my-space/10/diary')
      .send({ entryDate: '2026-05-03', mood: 'silly', title: '제목', body: '본문' });

    expect(res.status).toBe(400);
    expect(res.body.details).toHaveProperty('mood');
  });
});

describe('Auth guard', () => {
  test('unauthenticated request to /api/my-space returns 401', async () => {
    const res = await request(app).get('/api/my-space');
    expect(res.status).toBe(401);
  });
});
