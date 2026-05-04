/**
 * Integration tests: /api/my-space/:spaceId/recipes routes (Phase 1.5)
 *
 * Covers:
 *   - Recipe create happy path
 *   - Recipe list (2 items)
 *   - Category filter (한식 only returns 1/2)
 *   - Recipe update happy path
 *   - Recipe delete happy path
 *   - Cross-user 404
 *   - Validation failures: difficulty='extreme', ingredients length 51, steps[0].text length 1001
 *
 * Pattern matches mySpace.test.js — same mock approach.
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
const SPACE_A = { id: 10, userId: USER_A.id, name: '내 레시피', template: 'recipe' };

const RECIPE_BASE = {
  name: '된장찌개',
  category: '한식',
  difficulty: 'easy',
  cookTimeMin: 30,
  servings: 2,
  description: '간단한 된장찌개',
  ingredients: [
    { name: '된장', amount: '2큰술' },
    { name: '두부', amount: '1/2모' },
  ],
  steps: [
    { order: 1, text: '물을 끓인다.' },
    { order: 2, text: '된장을 푼다.' },
  ],
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
// Test 1: Recipe create happy path
// ---------------------------------------------------------------------------
describe('POST /api/my-space/:spaceId/recipes', () => {
  test('happy path — creates and returns recipe (201)', async () => {
    const agent = await loginAs(USER_A);

    const created = {
      id: 100,
      spaceId: SPACE_A.id,
      ...RECIPE_BASE,
      coverImage: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    prisma.user.findUnique.mockResolvedValue({ ...USER_A, passwordHash: HASH });
    prisma.space.findFirst.mockResolvedValue(SPACE_A);
    prisma.recipe.create.mockResolvedValue(created);

    const res = await agent
      .post('/api/my-space/10/recipes')
      .send(RECIPE_BASE);

    expect(res.status).toBe(201);
    expect(res.body.id).toBe(100);
    expect(res.body.name).toBe('된장찌개');
    expect(res.body.category).toBe('한식');
    expect(prisma.recipe.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ spaceId: SPACE_A.id, category: '한식' }),
      }),
    );
  });
});

// ---------------------------------------------------------------------------
// Test 2: Recipe list (2 items)
// ---------------------------------------------------------------------------
describe('GET /api/my-space/:spaceId/recipes', () => {
  test('returns all recipes when no category filter', async () => {
    const agent = await loginAs(USER_A);

    const recipes = [
      { id: 100, spaceId: SPACE_A.id, name: '된장찌개', category: '한식', difficulty: 'easy' },
      { id: 101, spaceId: SPACE_A.id, name: '파스타', category: '양식', difficulty: 'medium' },
    ];

    prisma.user.findUnique.mockResolvedValue({ ...USER_A, passwordHash: HASH });
    prisma.space.findFirst.mockResolvedValue(SPACE_A);
    prisma.recipe.findMany.mockResolvedValue(recipes);

    const res = await agent.get('/api/my-space/10/recipes');

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
    expect(prisma.recipe.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { spaceId: SPACE_A.id } }),
    );
  });
});

// ---------------------------------------------------------------------------
// Test 3: Category filter — 한식 only returns 1/2
// ---------------------------------------------------------------------------
describe('GET /api/my-space/:spaceId/recipes?category=한식', () => {
  test('category filter returns only matching recipes', async () => {
    const agent = await loginAs(USER_A);

    const hansiikOnly = [
      { id: 100, spaceId: SPACE_A.id, name: '된장찌개', category: '한식', difficulty: 'easy' },
    ];

    prisma.user.findUnique.mockResolvedValue({ ...USER_A, passwordHash: HASH });
    prisma.space.findFirst.mockResolvedValue(SPACE_A);
    prisma.recipe.findMany.mockResolvedValue(hansiikOnly);

    const res = await agent.get('/api/my-space/10/recipes?category=한식');

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].category).toBe('한식');
    // Verify the where clause includes the category filter
    expect(prisma.recipe.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { spaceId: SPACE_A.id, category: '한식' },
      }),
    );
  });
});

// ---------------------------------------------------------------------------
// Test 4: Recipe update happy path
// ---------------------------------------------------------------------------
describe('PATCH /api/my-space/:spaceId/recipes/:id', () => {
  test('happy path — updates and returns recipe', async () => {
    const agent = await loginAs(USER_A);

    const existing = { id: 100, spaceId: SPACE_A.id, ...RECIPE_BASE };
    const updated = { ...existing, name: '순두부찌개', cookTimeMin: 25 };

    prisma.user.findUnique.mockResolvedValue({ ...USER_A, passwordHash: HASH });
    prisma.space.findFirst.mockResolvedValue(SPACE_A);
    prisma.recipe.findFirst.mockResolvedValue(existing);
    prisma.recipe.update.mockResolvedValue(updated);

    const res = await agent
      .patch('/api/my-space/10/recipes/100')
      .send({ name: '순두부찌개', cookTimeMin: 25 });

    expect(res.status).toBe(200);
    expect(res.body.name).toBe('순두부찌개');
    expect(res.body.cookTimeMin).toBe(25);
    expect(prisma.recipe.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 100 },
        data: expect.objectContaining({ name: '순두부찌개' }),
      }),
    );
  });
});

// ---------------------------------------------------------------------------
// Test 5: Recipe delete happy path
// ---------------------------------------------------------------------------
describe('DELETE /api/my-space/:spaceId/recipes/:id', () => {
  test('happy path — deletes recipe and returns { ok: true }', async () => {
    const agent = await loginAs(USER_A);

    const existing = { id: 100, spaceId: SPACE_A.id, ...RECIPE_BASE };

    prisma.user.findUnique.mockResolvedValue({ ...USER_A, passwordHash: HASH });
    prisma.space.findFirst.mockResolvedValue(SPACE_A);
    prisma.recipe.findFirst.mockResolvedValue(existing);
    prisma.recipe.delete.mockResolvedValue(existing);

    const res = await agent.delete('/api/my-space/10/recipes/100');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
    expect(prisma.recipe.delete).toHaveBeenCalledWith({ where: { id: 100 } });
  });
});

// ---------------------------------------------------------------------------
// Test 6: Cross-user 404
// ---------------------------------------------------------------------------
describe('Cross-user access on recipes', () => {
  test('user B cannot access user A\'s recipe space — returns 404', async () => {
    const agentB = await loginAs(USER_B);

    prisma.user.findUnique.mockResolvedValue({ ...USER_B, passwordHash: HASH });
    // loadOwnedSpace returns null because space belongs to USER_A, not USER_B
    prisma.space.findFirst.mockResolvedValue(null);

    const res = await agentB.get('/api/my-space/10/recipes');

    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/not found/i);
  });
});

// ---------------------------------------------------------------------------
// Tests 7–9: Validation failures
// ---------------------------------------------------------------------------
describe('Recipe validation failures', () => {
  async function postRecipe(agent, payload) {
    prisma.user.findUnique.mockResolvedValue({ ...USER_A, passwordHash: HASH });
    prisma.space.findFirst.mockResolvedValue(SPACE_A);
    return agent
      .post('/api/my-space/10/recipes')
      .send({ ...RECIPE_BASE, ...payload });
  }

  test('difficulty="extreme" — returns 400 with details.difficulty', async () => {
    const agent = await loginAs(USER_A);
    const res = await postRecipe(agent, { difficulty: 'extreme' });

    expect(res.status).toBe(400);
    expect(res.body.details).toHaveProperty('difficulty');
  });

  test('ingredients length 51 — returns 400 with details.ingredients', async () => {
    const agent = await loginAs(USER_A);
    const tooMany = Array.from({ length: 51 }, (_, i) => ({ name: `재료${i}`, amount: '1g' }));
    const res = await postRecipe(agent, { ingredients: tooMany });

    expect(res.status).toBe(400);
    expect(res.body.details).toHaveProperty('ingredients');
  });

  test('steps[0].text length 1001 — returns 400 with details.steps', async () => {
    const agent = await loginAs(USER_A);
    const longText = 'x'.repeat(1001);
    const res = await postRecipe(agent, {
      steps: [{ order: 1, text: longText }],
    });

    expect(res.status).toBe(400);
    expect(res.body.details).toHaveProperty('steps');
  });
});
