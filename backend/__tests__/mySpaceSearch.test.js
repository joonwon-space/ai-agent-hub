/**
 * Integration tests: GET /api/my-space/search (Phase 3.2)
 *
 * Covers:
 *   - Basic keyword search returns matching results in all 3 groups
 *   - Case-insensitive matching (mode: 'insensitive')
 *   - Empty q → 400 with details.q
 *   - q over 100 chars → 400 with details.q
 *   - limit cap per group
 *   - Cross-user isolation (USER_B cannot see USER_A content)
 *   - Snippet contains ellipsis when keyword is in middle of long body
 *
 * Pattern matches mySpace.notes.test.js — same mock approach.
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
const DIARY_SPACE_A = { id: 10, userId: USER_A.id, name: '내 일기장', template: 'diary' };
const RECIPE_SPACE_A = { id: 11, userId: USER_A.id, name: '쿠킹', template: 'recipe' };
const NOTE_SPACE_A = { id: 12, userId: USER_A.id, name: '메모장', template: 'freeform' };

function makeDiaryEntry(overrides = {}) {
  return {
    id: 100,
    spaceId: DIARY_SPACE_A.id,
    title: '맛있는 김치찌개',
    body: '오늘 저녁 김치찌개를 만들었다.',
    mood: null,
    entryDate: new Date().toISOString(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    space: { id: DIARY_SPACE_A.id, name: DIARY_SPACE_A.name },
    ...overrides,
  };
}

function makeRecipe(overrides = {}) {
  return {
    id: 200,
    spaceId: RECIPE_SPACE_A.id,
    name: '김치찌개',
    description: '얼큰하고 맛있는 김치찌개 레시피',
    category: '한식',
    difficulty: 'medium',
    ingredients: [],
    steps: [],
    coverImageUrl: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    space: { id: RECIPE_SPACE_A.id, name: RECIPE_SPACE_A.name },
    ...overrides,
  };
}

function makeNote(overrides = {}) {
  return {
    id: 300,
    spaceId: NOTE_SPACE_A.id,
    title: '오늘 저녁 김치찌개',
    body: '오늘은 김치찌개를 끓였다.',
    pinned: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    space: { id: NOTE_SPACE_A.id, name: NOTE_SPACE_A.name },
    ...overrides,
  };
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
// Test 1: Basic keyword search returns 1/1/1
// ---------------------------------------------------------------------------
describe('GET /api/my-space/search — basic keyword', () => {
  test('?q=김치찌개 → groups.diary 1, groups.recipe 1, groups.note 1, total 3', async () => {
    const agent = await loginAs(USER_A);

    prisma.user.findUnique.mockResolvedValue({ ...USER_A, passwordHash: HASH });
    prisma.diaryEntry.findMany.mockResolvedValue([makeDiaryEntry()]);
    prisma.recipe.findMany.mockResolvedValue([makeRecipe()]);
    prisma.freeformNote.findMany.mockResolvedValue([makeNote()]);

    const res = await agent.get('/api/my-space/search?q=김치찌개');

    expect(res.status).toBe(200);
    expect(res.body.query).toBe('김치찌개');
    expect(res.body.total).toBe(3);
    expect(res.body.groups.diary).toHaveLength(1);
    expect(res.body.groups.recipe).toHaveLength(1);
    expect(res.body.groups.note).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// Test 2: Case-insensitive — English "pasta" / "Pasta" / "PASTA"
// ---------------------------------------------------------------------------
describe('GET /api/my-space/search — case insensitive', () => {
  test('PASTA keyword matches diary(Pasta body), recipe(pasta name), note(PASTA title)', async () => {
    const agent = await loginAs(USER_A);

    prisma.user.findUnique.mockResolvedValue({ ...USER_A, passwordHash: HASH });
    prisma.diaryEntry.findMany.mockResolvedValue([
      makeDiaryEntry({ title: '오늘 저녁', body: 'Pasta 먹었다.' }),
    ]);
    prisma.recipe.findMany.mockResolvedValue([
      makeRecipe({ name: 'pasta carbonara', description: '맛있는 파스타' }),
    ]);
    prisma.freeformNote.findMany.mockResolvedValue([
      makeNote({ title: 'PASTA 레시피', body: '메모' }),
    ]);

    const res = await agent.get('/api/my-space/search?q=PASTA');

    expect(res.status).toBe(200);
    expect(res.body.total).toBe(3);
    expect(res.body.groups.diary).toHaveLength(1);
    expect(res.body.groups.recipe).toHaveLength(1);
    expect(res.body.groups.note).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// Test 3: Empty q → 400
// ---------------------------------------------------------------------------
describe('GET /api/my-space/search — validation: empty q', () => {
  test('?q= → 400 with details.q', async () => {
    const agent = await loginAs(USER_A);

    prisma.user.findUnique.mockResolvedValue({ ...USER_A, passwordHash: HASH });

    const res = await agent.get('/api/my-space/search?q=');

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Validation failed');
    expect(res.body.details.q).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// Test 4: q over 100 chars → 400
// ---------------------------------------------------------------------------
describe('GET /api/my-space/search — validation: q too long', () => {
  test('q with 101 chars → 400 with details.q', async () => {
    const agent = await loginAs(USER_A);

    prisma.user.findUnique.mockResolvedValue({ ...USER_A, passwordHash: HASH });

    const longQ = 'A'.repeat(101);
    const res = await agent.get(`/api/my-space/search?q=${longQ}`);

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Validation failed');
    expect(res.body.details.q).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// Test 5: limit=1 caps each group
// ---------------------------------------------------------------------------
describe('GET /api/my-space/search — limit', () => {
  test('?limit=1 → each group has at most 1 item', async () => {
    const agent = await loginAs(USER_A);

    prisma.user.findUnique.mockResolvedValue({ ...USER_A, passwordHash: HASH });
    // The router calls findMany with take: limit — our mock returns at most what we give
    prisma.diaryEntry.findMany.mockResolvedValue([makeDiaryEntry()]);
    prisma.recipe.findMany.mockResolvedValue([makeRecipe()]);
    prisma.freeformNote.findMany.mockResolvedValue([makeNote()]);

    const res = await agent.get('/api/my-space/search?q=김치&limit=1');

    expect(res.status).toBe(200);
    expect(res.body.groups.diary.length).toBeLessThanOrEqual(1);
    expect(res.body.groups.recipe.length).toBeLessThanOrEqual(1);
    expect(res.body.groups.note.length).toBeLessThanOrEqual(1);

    // Also verify prisma was called with take:1
    const diaryCalls = prisma.diaryEntry.findMany.mock.calls;
    expect(diaryCalls[0][0].take).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Test 6: Cross-user isolation — USER_B gets empty groups
// ---------------------------------------------------------------------------
describe('GET /api/my-space/search — cross-user isolation', () => {
  test('USER_B searching same keyword as USER_A sees empty groups', async () => {
    const agent = await loginAs(USER_B);

    prisma.user.findUnique.mockResolvedValue({ ...USER_B, passwordHash: HASH });
    // Simulates DB returning no rows for USER_B (no owned spaces matching)
    prisma.diaryEntry.findMany.mockResolvedValue([]);
    prisma.recipe.findMany.mockResolvedValue([]);
    prisma.freeformNote.findMany.mockResolvedValue([]);

    const res = await agent.get('/api/my-space/search?q=김치찌개');

    expect(res.status).toBe(200);
    expect(res.body.total).toBe(0);
    expect(res.body.groups.diary).toHaveLength(0);
    expect(res.body.groups.recipe).toHaveLength(0);
    expect(res.body.groups.note).toHaveLength(0);

    // Verify that the WHERE clause included correct userId (USER_B.id = 2)
    const diaryCalls = prisma.diaryEntry.findMany.mock.calls;
    expect(diaryCalls[0][0].where.space.userId).toBe(USER_B.id);
  });
});

// ---------------------------------------------------------------------------
// Test 7: Snippet ellipsis when keyword is in middle of long body
// ---------------------------------------------------------------------------
describe('GET /api/my-space/search — snippet extraction', () => {
  test('snippet includes leading and trailing ellipsis for mid-body keyword', async () => {
    const agent = await loginAs(USER_A);

    prisma.user.findUnique.mockResolvedValue({ ...USER_A, passwordHash: HASH });

    // Build 500-char body with keyword in the middle
    const prefix = 'A'.repeat(200);
    const keyword = 'findme';
    const suffix = 'B'.repeat(200);
    const longBody = prefix + keyword + suffix;

    prisma.diaryEntry.findMany.mockResolvedValue([
      makeDiaryEntry({ body: longBody }),
    ]);
    prisma.recipe.findMany.mockResolvedValue([]);
    prisma.freeformNote.findMany.mockResolvedValue([]);

    const res = await agent.get(`/api/my-space/search?q=${keyword}`);

    expect(res.status).toBe(200);
    expect(res.body.groups.diary).toHaveLength(1);

    const snippet = res.body.groups.diary[0].snippet;
    // Should start and end with ellipsis because keyword is far from both ends
    expect(snippet).toMatch(/^…/);
    expect(snippet).toMatch(/…$/);
  });
});
