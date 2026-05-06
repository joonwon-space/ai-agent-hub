/**
 * Integration tests: recipe cover upload/delete routes (Phase 3.1)
 *
 * POST   /api/my-space/:spaceId/recipes/:recipeId/cover
 * DELETE /api/my-space/:spaceId/recipes/:recipeId/cover
 *
 * Uses RECIPE_COVERS_DIR env override pointing to os.tmpdir()/test-covers.
 * Stubs fs.promises.writeFile, fs.promises.unlink, fs.promises.mkdir,
 * and sharp to avoid native binary calls + disk I/O in unit tests.
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

// Mock sharp to avoid native binary dependency in tests
jest.mock('sharp', () => {
  const mockInstance = {
    rotate: jest.fn().mockReturnThis(),
    resize: jest.fn().mockReturnThis(),
    webp: jest.fn().mockReturnThis(),
    toBuffer: jest.fn().mockResolvedValue(Buffer.from('fake-webp-content')),
  };
  return jest.fn(() => mockInstance);
});

// Mock fs.promises for file operations
jest.mock('fs', () => {
  const original = jest.requireActual('fs');
  return {
    ...original,
    promises: {
      ...original.promises,
      writeFile: jest.fn().mockResolvedValue(undefined),
      unlink: jest.fn().mockResolvedValue(undefined),
      mkdir: jest.fn().mockResolvedValue(undefined),
    },
  };
});

const os = require('os');
const path = require('path');

// Set covers directory to temp dir for tests
process.env.RECIPE_COVERS_DIR = path.join(os.tmpdir(), 'test-covers');

const request = require('supertest');
const bcrypt = require('bcrypt');
const { createApp } = require('../src/createApp');
const prisma = require('../src/services/db');
const fs = require('fs');

const app = createApp();

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------

const USER_A = { id: 1, email: 'userA@test.com' };
const USER_B = { id: 2, email: 'userB@test.com' };
const SPACE_A = { id: 10, userId: USER_A.id, name: '내 레시피', template: 'recipe' };
const RECIPE_A = {
  id: 100,
  spaceId: SPACE_A.id,
  name: '된장찌개',
  category: '한식',
  difficulty: 'easy',
  cookTimeMin: 30,
  servings: 2,
  description: null,
  ingredients: [],
  steps: [],
  coverImage: null,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

let HASH;

async function loginAs(user) {
  const agent = request.agent(app);
  prisma.user.findUnique.mockResolvedValue({ ...user, passwordHash: HASH });
  await agent.post('/api/auth/login').send({ email: user.email, password: 'password123' });
  return agent;
}

// Minimal valid JPEG buffer (FF D8 FF E0 + JFIF header + EOI)
const VALID_JPEG = Buffer.from([
  0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46, 0x00, 0x01,
  0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00, 0xFF, 0xD9,
]);

// Minimal valid PNG buffer (8-byte PNG signature)
const VALID_PNG = Buffer.from([
  0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A,
  0x00, 0x00, 0x00, 0x0D, // IHDR chunk length
]);

// Fake file that looks like text but claims to be JPEG
const FAKE_JPEG = Buffer.from('This is not a JPEG file, just plain text content');

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
// Test 1: Happy path — valid JPEG buffer → 200 + URL
// ---------------------------------------------------------------------------

describe('POST /api/my-space/:spaceId/recipes/:recipeId/cover', () => {
  test('happy path: valid jpeg upload → 200 + URL matching /uploads/recipes/*.webp', async () => {
    const agent = await loginAs(USER_A);

    prisma.user.findUnique.mockResolvedValue({ ...USER_A, passwordHash: HASH });
    prisma.space.findFirst.mockResolvedValue(SPACE_A);
    prisma.recipe.findFirst.mockResolvedValue({ ...RECIPE_A, coverImage: null });
    prisma.recipe.update.mockResolvedValue({ ...RECIPE_A, coverImage: '/uploads/recipes/1-10-100-123.webp' });

    const res = await agent
      .post('/api/my-space/10/recipes/100/cover')
      .attach('cover', VALID_JPEG, { filename: 'test.jpg', contentType: 'image/jpeg' });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('url');
    expect(res.body.url).toMatch(/^\/uploads\/recipes\/.+\.webp$/);
    expect(prisma.recipe.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: RECIPE_A.id },
        data: expect.objectContaining({ coverImage: expect.stringMatching(/\.webp$/) }),
      }),
    );
  });

  // -------------------------------------------------------------------------
  // Test 2: Multer 413 or 400 for files > 5MB
  // -------------------------------------------------------------------------
  test('file > 5MB → 413 (multer) or 400', async () => {
    const agent = await loginAs(USER_A);

    prisma.user.findUnique.mockResolvedValue({ ...USER_A, passwordHash: HASH });
    prisma.space.findFirst.mockResolvedValue(SPACE_A);
    prisma.recipe.findFirst.mockResolvedValue(RECIPE_A);

    // Create a buffer > 5MB
    const bigBuffer = Buffer.alloc(5 * 1024 * 1024 + 1, 0xFF);
    // First 3 bytes set to valid JPEG magic to pass magic check (if it got that far)
    bigBuffer[0] = 0xFF;
    bigBuffer[1] = 0xD8;
    bigBuffer[2] = 0xFF;

    const res = await agent
      .post('/api/my-space/10/recipes/100/cover')
      .attach('cover', bigBuffer, { filename: 'big.jpg', contentType: 'image/jpeg' });

    expect([400, 413]).toContain(res.status);
  });

  // -------------------------------------------------------------------------
  // Test 3: text/plain MIME disguised as image/jpeg (magic byte mismatch) → 400
  // -------------------------------------------------------------------------
  test('text/plain content with image/jpeg mime → 400 with details.magic', async () => {
    const agent = await loginAs(USER_A);

    prisma.user.findUnique.mockResolvedValue({ ...USER_A, passwordHash: HASH });
    prisma.space.findFirst.mockResolvedValue(SPACE_A);
    prisma.recipe.findFirst.mockResolvedValue(RECIPE_A);

    const res = await agent
      .post('/api/my-space/10/recipes/100/cover')
      .attach('cover', FAKE_JPEG, { filename: 'fake.jpg', contentType: 'image/jpeg' });

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('details');
    expect(res.body.details).toHaveProperty('magic');
  });

  // -------------------------------------------------------------------------
  // Test 4: image/svg+xml MIME → 400 (not in allowlist)
  // -------------------------------------------------------------------------
  test('svg+xml mimetype → 400', async () => {
    const agent = await loginAs(USER_A);

    prisma.user.findUnique.mockResolvedValue({ ...USER_A, passwordHash: HASH });
    prisma.space.findFirst.mockResolvedValue(SPACE_A);
    prisma.recipe.findFirst.mockResolvedValue(RECIPE_A);

    const svgBuffer = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>');

    const res = await agent
      .post('/api/my-space/10/recipes/100/cover')
      .attach('cover', svgBuffer, { filename: 'icon.svg', contentType: 'image/svg+xml' });

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
  });

  // -------------------------------------------------------------------------
  // Test 5: Other user's recipeId → 404
  // -------------------------------------------------------------------------
  test("other user's recipe → 404", async () => {
    const agentB = await loginAs(USER_B);

    prisma.user.findUnique.mockResolvedValue({ ...USER_B, passwordHash: HASH });
    // space not owned by USER_B
    prisma.space.findFirst.mockResolvedValue(null);

    const res = await agentB
      .post('/api/my-space/10/recipes/100/cover')
      .attach('cover', VALID_JPEG, { filename: 'test.jpg', contentType: 'image/jpeg' });

    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/not found/i);
  });

  // -------------------------------------------------------------------------
  // Test 6: Valid PNG upload → 200 + URL
  // -------------------------------------------------------------------------
  test('valid PNG upload → 200 + URL', async () => {
    const agent = await loginAs(USER_A);

    prisma.user.findUnique.mockResolvedValue({ ...USER_A, passwordHash: HASH });
    prisma.space.findFirst.mockResolvedValue(SPACE_A);
    prisma.recipe.findFirst.mockResolvedValue({ ...RECIPE_A, coverImage: null });
    prisma.recipe.update.mockResolvedValue({ ...RECIPE_A, coverImage: '/uploads/recipes/1-10-100-456.webp' });

    const res = await agent
      .post('/api/my-space/10/recipes/100/cover')
      .attach('cover', VALID_PNG, { filename: 'test.png', contentType: 'image/png' });

    expect(res.status).toBe(200);
    expect(res.body.url).toMatch(/^\/uploads\/recipes\/.+\.webp$/);
  });
});

// ---------------------------------------------------------------------------
// Test 7: DELETE happy path
// ---------------------------------------------------------------------------

describe('DELETE /api/my-space/:spaceId/recipes/:recipeId/cover', () => {
  test('happy path — deletes cover, returns { ok: true }', async () => {
    const agent = await loginAs(USER_A);

    const existingCover = '/uploads/recipes/1-10-100-789.webp';
    const recipeWithCover = { ...RECIPE_A, coverImage: existingCover };

    prisma.user.findUnique.mockResolvedValue({ ...USER_A, passwordHash: HASH });
    prisma.space.findFirst.mockResolvedValue(SPACE_A);
    prisma.recipe.findFirst.mockResolvedValue(recipeWithCover);
    prisma.recipe.update.mockResolvedValue({ ...RECIPE_A, coverImage: null });

    const res = await agent.delete('/api/my-space/10/recipes/100/cover');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
    expect(prisma.recipe.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: RECIPE_A.id },
        data: { coverImage: null },
      }),
    );
    // fs.promises.unlink should have been called for old file
    expect(fs.promises.unlink).toHaveBeenCalled();
  });

  test('DELETE on recipe with no cover — returns { ok: true } gracefully', async () => {
    const agent = await loginAs(USER_A);

    prisma.user.findUnique.mockResolvedValue({ ...USER_A, passwordHash: HASH });
    prisma.space.findFirst.mockResolvedValue(SPACE_A);
    prisma.recipe.findFirst.mockResolvedValue({ ...RECIPE_A, coverImage: null });
    prisma.recipe.update.mockResolvedValue({ ...RECIPE_A, coverImage: null });

    const res = await agent.delete('/api/my-space/10/recipes/100/cover');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });
});
