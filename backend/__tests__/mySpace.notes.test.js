/**
 * Integration tests: /api/my-space/:spaceId/notes routes (Phase 2)
 *
 * Covers:
 *   - Note create happy path
 *   - Note get (single)
 *   - Note update happy path
 *   - Note delete happy path
 *   - Pinned ordering (pinned note returned before regular note)
 *   - Cross-user 404
 *   - Validation: empty title → 400
 *
 * Pattern matches mySpace.recipes.test.js — same mock approach.
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
  recipe: {
    findMany: jest.fn(),
    findFirst: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
  freeformNote: {
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

async function loginAs(user) {
  const agent = request.agent(app);
  prisma.user.findUnique.mockResolvedValue({ ...user, passwordHash: HASH });
  await agent.post('/api/auth/login').send({ email: user.email, password: 'password123' });
  return agent;
}

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------
const SPACE_A = { id: 20, userId: USER_A.id, name: '내 메모장', template: 'freeform' };

const NOTE_BASE = {
  title: '첫 번째 노트',
  body: '# 헤더\n\n**굵게** 텍스트',
  pinned: false,
};

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
// Test 1: Note create happy path
// ---------------------------------------------------------------------------
describe('POST /api/my-space/:spaceId/notes', () => {
  test('happy path — creates and returns note (201)', async () => {
    const agent = await loginAs(USER_A);

    const created = {
      id: 200,
      spaceId: SPACE_A.id,
      ...NOTE_BASE,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    prisma.user.findUnique.mockResolvedValue({ ...USER_A, passwordHash: HASH });
    prisma.space.findFirst.mockResolvedValue(SPACE_A);
    prisma.freeformNote.create.mockResolvedValue(created);

    const res = await agent
      .post('/api/my-space/20/notes')
      .send(NOTE_BASE);

    expect(res.status).toBe(201);
    expect(res.body.id).toBe(200);
    expect(res.body.title).toBe('첫 번째 노트');
    expect(res.body.pinned).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Test 2: Note get single
// ---------------------------------------------------------------------------
describe('GET /api/my-space/:spaceId/notes/:id', () => {
  test('happy path — returns single note', async () => {
    const agent = await loginAs(USER_A);

    const existing = {
      id: 200,
      spaceId: SPACE_A.id,
      ...NOTE_BASE,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    prisma.user.findUnique.mockResolvedValue({ ...USER_A, passwordHash: HASH });
    prisma.space.findFirst.mockResolvedValue(SPACE_A);
    prisma.freeformNote.findFirst.mockResolvedValue(existing);

    const res = await agent.get('/api/my-space/20/notes/200');

    expect(res.status).toBe(200);
    expect(res.body.id).toBe(200);
    expect(res.body.title).toBe('첫 번째 노트');
  });
});

// ---------------------------------------------------------------------------
// Test 3: Note update happy path
// ---------------------------------------------------------------------------
describe('PATCH /api/my-space/:spaceId/notes/:id', () => {
  test('happy path — updates title and pinned', async () => {
    const agent = await loginAs(USER_A);

    const existing = {
      id: 200,
      spaceId: SPACE_A.id,
      title: '첫 번째 노트',
      body: '본문',
      pinned: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const updated = {
      ...existing,
      title: '수정된 노트',
      pinned: true,
      updatedAt: new Date().toISOString(),
    };

    prisma.user.findUnique.mockResolvedValue({ ...USER_A, passwordHash: HASH });
    prisma.space.findFirst.mockResolvedValue(SPACE_A);
    prisma.freeformNote.findFirst.mockResolvedValue(existing);
    prisma.freeformNote.update.mockResolvedValue(updated);

    const res = await agent
      .patch('/api/my-space/20/notes/200')
      .send({ title: '수정된 노트', pinned: true });

    expect(res.status).toBe(200);
    expect(res.body.title).toBe('수정된 노트');
    expect(res.body.pinned).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Test 4: Note delete happy path
// ---------------------------------------------------------------------------
describe('DELETE /api/my-space/:spaceId/notes/:id', () => {
  test('happy path — deletes note and returns { ok: true }', async () => {
    const agent = await loginAs(USER_A);

    const existing = {
      id: 200,
      spaceId: SPACE_A.id,
      ...NOTE_BASE,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    prisma.user.findUnique.mockResolvedValue({ ...USER_A, passwordHash: HASH });
    prisma.space.findFirst.mockResolvedValue(SPACE_A);
    prisma.freeformNote.findFirst.mockResolvedValue(existing);
    prisma.freeformNote.delete.mockResolvedValue(existing);

    const res = await agent.delete('/api/my-space/20/notes/200');

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Test 5: Pinned ordering — pinned note returned before regular
// ---------------------------------------------------------------------------
describe('GET /api/my-space/:spaceId/notes (list)', () => {
  test('pinned ordering — pinned note listed first', async () => {
    const agent = await loginAs(USER_A);

    const regularNote = {
      id: 201,
      spaceId: SPACE_A.id,
      title: '일반 노트',
      body: '본문',
      pinned: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const pinnedNote = {
      id: 202,
      spaceId: SPACE_A.id,
      title: '고정된 노트',
      body: '고정 본문',
      pinned: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    // DB returns pinned first due to orderBy [pinned desc, updatedAt desc]
    prisma.user.findUnique.mockResolvedValue({ ...USER_A, passwordHash: HASH });
    prisma.space.findFirst.mockResolvedValue(SPACE_A);
    prisma.freeformNote.findMany.mockResolvedValue([pinnedNote, regularNote]);

    const res = await agent.get('/api/my-space/20/notes');

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBe(2);
    expect(res.body[0].pinned).toBe(true);
    expect(res.body[0].title).toBe('고정된 노트');
    expect(res.body[1].pinned).toBe(false);
    expect(res.body[1].title).toBe('일반 노트');
  });
});

// ---------------------------------------------------------------------------
// Test 6: Cross-user 404
// ---------------------------------------------------------------------------
describe('Cross-user access', () => {
  test('user B cannot access user A\'s note space — returns 404', async () => {
    const agent = await loginAs(USER_B);

    // loadOwnedSpace returns null for user B trying to access user A's space
    prisma.user.findUnique.mockResolvedValue({ ...USER_B, passwordHash: HASH });
    prisma.space.findFirst.mockResolvedValue(null);

    const res = await agent.get('/api/my-space/20/notes');

    expect(res.status).toBe(404);
    expect(res.body.error).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// Test 7: Validation — empty title → 400
// ---------------------------------------------------------------------------
describe('POST /api/my-space/:spaceId/notes — validation', () => {
  test('empty title — returns 400 with details.title', async () => {
    const agent = await loginAs(USER_A);

    prisma.user.findUnique.mockResolvedValue({ ...USER_A, passwordHash: HASH });
    prisma.space.findFirst.mockResolvedValue(SPACE_A);

    const res = await agent
      .post('/api/my-space/20/notes')
      .send({ title: '', body: '본문' });

    expect(res.status).toBe(400);
    expect(res.body.details).toBeDefined();
    expect(res.body.details.title).toBeDefined();
  });
});
