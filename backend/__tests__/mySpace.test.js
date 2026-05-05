/**
 * Integration tests: /api/my-space routes
 * Uses Prisma mocks (same pattern as auth.login.test.js).
 *
 * Rate limiter note: the auth limiter allows 5 requests/minute.
 * To avoid hitting it across test suites, we mock express-rate-limit
 * to be a no-op middleware in tests.
 */

jest.mock('express-rate-limit', () => () => (req, res, next) => next());

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
const bcrypt = require('bcrypt');
const { createApp } = require('../src/createApp');
const prisma = require('../src/services/db');

const app = createApp();

// ---------------------------------------------------------------------------
// Shared user fixtures
// ---------------------------------------------------------------------------
const USER_A = { id: 1, email: 'userA@test.com' };
const USER_B = { id: 2, email: 'userB@test.com' };

let HASH;

/**
 * Create a logged-in supertest agent for the given user.
 * Mocks prisma.user.findUnique to return the user with the shared hash.
 */
async function loginAs(user) {
  const agent = request.agent(app);
  prisma.user.findUnique.mockResolvedValue({ ...user, passwordHash: HASH });
  await agent.post('/api/auth/login').send({ email: user.email, password: 'password123' });
  return agent;
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------
beforeAll(async () => {
  HASH = await bcrypt.hash('password123', 10);
});

beforeEach(() => {
  jest.clearAllMocks();
});

// ---------------------------------------------------------------------------
// Test 1 & 2: Space creation happy path + invalid template
// ---------------------------------------------------------------------------
describe('POST /api/my-space', () => {
  test('happy path — creates and returns space', async () => {
    const agent = await loginAs(USER_A);

    const createdSpace = {
      id: 10,
      userId: USER_A.id,
      name: '내 일기',
      template: 'diary',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    prisma.user.findUnique.mockResolvedValue({ ...USER_A, passwordHash: HASH });
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
    const agent = await loginAs(USER_A);

    prisma.user.findUnique.mockResolvedValue({ ...USER_A, passwordHash: HASH });

    const res = await agent
      .post('/api/my-space')
      .send({ name: '내 일기', template: 'invalid' });

    expect(res.status).toBe(400);
    expect(res.body.details).toHaveProperty('template');
  });
});

// ---------------------------------------------------------------------------
// Test 3: List own spaces
// ---------------------------------------------------------------------------
describe('GET /api/my-space', () => {
  test('lists only the authenticated user\'s spaces', async () => {
    const agent = await loginAs(USER_A);

    const userASpaces = [
      { id: 1, userId: USER_A.id, name: '내 일기', template: 'diary' },
    ];

    prisma.user.findUnique.mockResolvedValue({ ...USER_A, passwordHash: HASH });
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

// ---------------------------------------------------------------------------
// Tests: Jira template support
// ---------------------------------------------------------------------------
describe('Jira template', () => {
  test('POST /api/my-space with template "jira" — creates and returns space with template jira', async () => {
    const agent = await loginAs(USER_A);

    const createdSpace = {
      id: 20,
      userId: USER_A.id,
      name: 'My Jira',
      template: 'jira',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    prisma.user.findUnique.mockResolvedValue({ ...USER_A, passwordHash: HASH });
    prisma.space.create.mockResolvedValue(createdSpace);

    const res = await agent
      .post('/api/my-space')
      .send({ name: 'My Jira', template: 'jira' });

    expect(res.status).toBe(201);
    expect(res.body.template).toBe('jira');
    expect(prisma.space.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ userId: USER_A.id, name: 'My Jira', template: 'jira' }),
    });
  });

  test('GET /api/my-space — returns list containing both diary and jira spaces', async () => {
    const agent = await loginAs(USER_A);

    const mixedSpaces = [
      { id: 1, userId: USER_A.id, name: '내 일기', template: 'diary' },
      { id: 2, userId: USER_A.id, name: 'My Jira', template: 'jira' },
    ];

    prisma.user.findUnique.mockResolvedValue({ ...USER_A, passwordHash: HASH });
    prisma.space.findMany.mockResolvedValue(mixedSpaces);

    const res = await agent.get('/api/my-space');

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
    const templates = res.body.map((s) => s.template);
    expect(templates).toContain('diary');
    expect(templates).toContain('jira');
  });
});

// ---------------------------------------------------------------------------
// Test 4: Cross-user access blocked
// ---------------------------------------------------------------------------
describe('Cross-user access', () => {
  test('user B cannot access user A\'s space diary — returns 404', async () => {
    const agentB = await loginAs(USER_B);

    // requireAuth looks up by id (USER_B.id = 2)
    prisma.user.findUnique.mockResolvedValue({ ...USER_B, passwordHash: HASH });
    // loadOwnedSpace: space id=1 belongs to USER_A, not USER_B → returns null
    prisma.space.findFirst.mockResolvedValue(null);

    const res = await agentB.get('/api/my-space/1/diary');

    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/not found/i);
  });
});

// ---------------------------------------------------------------------------
// Test 5: Diary creation happy path
// ---------------------------------------------------------------------------
describe('POST /api/my-space/:spaceId/diary', () => {
  test('happy path — creates diary entry', async () => {
    const agent = await loginAs(USER_A);

    const space = { id: 10, userId: USER_A.id, name: '내 일기', template: 'diary' };
    const entry = {
      id: 100,
      spaceId: 10,
      entryDate: new Date('2026-05-03'),
      mood: 'happy',
      title: '오늘의 일기',
      body: '좋은 하루였다.',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    prisma.user.findUnique.mockResolvedValue({ ...USER_A, passwordHash: HASH });
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

// ---------------------------------------------------------------------------
// Tests 6 & 7: Diary validation — body too long, mood enum invalid
// ---------------------------------------------------------------------------
describe('Diary validation', () => {
  test('body over 50,000 chars — returns 400 with details.body', async () => {
    const agent = await loginAs(USER_A);

    prisma.user.findUnique.mockResolvedValue({ ...USER_A, passwordHash: HASH });
    prisma.space.findFirst.mockResolvedValue({ id: 10, userId: USER_A.id });

    const longBody = 'x'.repeat(50001);
    const res = await agent
      .post('/api/my-space/10/diary')
      .send({ entryDate: '2026-05-03', title: '제목', body: longBody });

    expect(res.status).toBe(400);
    expect(res.body.details).toHaveProperty('body');
  });

  test('invalid mood enum — returns 400 with details.mood', async () => {
    const agent = await loginAs(USER_A);

    prisma.user.findUnique.mockResolvedValue({ ...USER_A, passwordHash: HASH });
    prisma.space.findFirst.mockResolvedValue({ id: 10, userId: USER_A.id });

    const res = await agent
      .post('/api/my-space/10/diary')
      .send({ entryDate: '2026-05-03', mood: 'silly', title: '제목', body: '본문' });

    expect(res.status).toBe(400);
    expect(res.body.details).toHaveProperty('mood');
  });
});

// ---------------------------------------------------------------------------
// Test 8: Auth guard
// ---------------------------------------------------------------------------
describe('Auth guard', () => {
  test('unauthenticated request to /api/my-space returns 401', async () => {
    const res = await request(app).get('/api/my-space');
    expect(res.status).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// Phase 3.3: DELETE cascade + PATCH name validation tests
// ---------------------------------------------------------------------------
describe('DELETE /api/my-space/:id — cascade', () => {
  test('deletes space and subsequent GET on child resource returns 404', async () => {
    const agent = await loginAs(USER_A);

    const space = {
      id: 30,
      userId: USER_A.id,
      name: '삭제할 공간',
      template: 'diary',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    prisma.user.findUnique.mockResolvedValue({ ...USER_A, passwordHash: HASH });
    // loadOwnedSpace returns the space for DELETE
    prisma.space.findFirst.mockResolvedValue(space);
    prisma.space.delete.mockResolvedValue(space);

    const res = await agent.delete('/api/my-space/30');

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(prisma.space.delete).toHaveBeenCalledWith({ where: { id: 30 } });
  });

  test('after space delete, GET on that space diary returns 404', async () => {
    const agent = await loginAs(USER_A);

    prisma.user.findUnique.mockResolvedValue({ ...USER_A, passwordHash: HASH });
    // Space no longer exists → loadOwnedSpace returns null
    prisma.space.findFirst.mockResolvedValue(null);

    const res = await agent.get('/api/my-space/30/diary');

    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/not found/i);
  });
});

describe('PATCH /api/my-space/:id — name validation', () => {
  test('empty name — returns 400 with details.name', async () => {
    const agent = await loginAs(USER_A);

    const space = { id: 10, userId: USER_A.id, name: '원래 이름', template: 'diary' };
    prisma.user.findUnique.mockResolvedValue({ ...USER_A, passwordHash: HASH });
    prisma.space.findFirst.mockResolvedValue(space);

    const res = await agent
      .patch('/api/my-space/10')
      .send({ name: '' });

    expect(res.status).toBe(400);
    expect(res.body.details).toHaveProperty('name');
  });

  test('name over 80 chars — returns 400 with details.name', async () => {
    const agent = await loginAs(USER_A);

    const space = { id: 10, userId: USER_A.id, name: '원래 이름', template: 'diary' };
    prisma.user.findUnique.mockResolvedValue({ ...USER_A, passwordHash: HASH });
    prisma.space.findFirst.mockResolvedValue(space);

    const longName = 'X'.repeat(81);
    const res = await agent
      .patch('/api/my-space/10')
      .send({ name: longName });

    expect(res.status).toBe(400);
    expect(res.body.details).toHaveProperty('name');
  });

  test('valid name — returns 200 with updated name in response body', async () => {
    const agent = await loginAs(USER_A);

    const space = { id: 10, userId: USER_A.id, name: '원래 이름', template: 'diary' };
    const updated = { ...space, name: '수정됨' };

    prisma.user.findUnique.mockResolvedValue({ ...USER_A, passwordHash: HASH });
    prisma.space.findFirst.mockResolvedValue(space);
    prisma.space.update.mockResolvedValue(updated);

    const res = await agent
      .patch('/api/my-space/10')
      .send({ name: '수정됨' });

    expect(res.status).toBe(200);
    expect(res.body.name).toBe('수정됨');
    expect(prisma.space.update).toHaveBeenCalledWith({
      where: { id: 10 },
      data: expect.objectContaining({ name: '수정됨' }),
    });
  });
});
