jest.mock('express-rate-limit', () => () => (req, res, next) => next());

jest.mock('../src/services/db', () => ({
  user: { findUnique: jest.fn() },
}));

jest.mock('../src/agentLoader', () => ({
  loadAgents: jest.fn(),
  getAgent: jest.fn(),
  listAgents: jest.fn(() => []),
}));

jest.mock('../src/utils/crypto', () => ({
  encrypt: jest.fn((v) => `enc:${v}`),
  decrypt: jest.fn((v) => v.replace('enc:', '')),
}));

jest.mock('../src/services/ollamaAssist', () => ({
  extractRecipeFields: jest.fn(),
  extractDiaryFields: jest.fn(),
}));

const request = require('supertest');
const bcrypt = require('bcrypt');
const { createApp } = require('../src/createApp');
const prisma = require('../src/services/db');
const ollamaAssist = require('../src/services/ollamaAssist');

const app = createApp();
const USER = { id: 1, email: 'test@test.com' };
let HASH;

async function loginAs(user) {
  const agent = request.agent(app);
  prisma.user.findUnique.mockResolvedValue({ ...user, passwordHash: HASH });
  await agent.post('/api/auth/login').send({ email: user.email, password: 'password123' });
  return agent;
}

beforeAll(async () => {
  HASH = await bcrypt.hash('password123', 10);
});

beforeEach(() => {
  jest.clearAllMocks();
});

// ---------------------------------------------------------------------------
// POST /api/ai/assist/recipe
// ---------------------------------------------------------------------------

describe('POST /api/ai/assist/recipe', () => {
  it('returns 401 without auth', async () => {
    const res = await request(app)
      .post('/api/ai/assist/recipe')
      .send({ text: '닭갈비 레시피' });
    expect(res.status).toBe(401);
  });

  it('returns 400 when text is missing', async () => {
    const agent = await loginAs(USER);
    const res = await agent.post('/api/ai/assist/recipe').send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/텍스트/);
  });

  it('returns 400 when text exceeds 5000 chars', async () => {
    const agent = await loginAs(USER);
    const res = await agent
      .post('/api/ai/assist/recipe')
      .send({ text: 'a'.repeat(5001) });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/5000자/);
  });

  it('returns extracted recipe fields on success', async () => {
    const mockFields = {
      name: '닭갈비볶음',
      category: '한식',
      difficulty: 'medium',
      cookTimeMin: 20,
      servings: 2,
      description: null,
      ingredients: [{ name: '닭가슴살', amount: '400g' }],
      steps: [{ order: 1, text: '재료 손질' }],
    };
    ollamaAssist.extractRecipeFields.mockResolvedValue(mockFields);

    const agent = await loginAs(USER);
    const res = await agent
      .post('/api/ai/assist/recipe')
      .send({ text: '닭가슴살 400g으로 2인분 닭갈비볶음' });

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual(mockFields);
    expect(ollamaAssist.extractRecipeFields).toHaveBeenCalledWith('닭가슴살 400g으로 2인분 닭갈비볶음');
  });

  it('returns 503 when Ollama is unreachable', async () => {
    const connErr = new Error('connect ECONNREFUSED');
    connErr.code = 'ECONNREFUSED';
    ollamaAssist.extractRecipeFields.mockRejectedValue(connErr);

    const agent = await loginAs(USER);
    const res = await agent
      .post('/api/ai/assist/recipe')
      .send({ text: '닭갈비 레시피 알려줘' });

    expect(res.status).toBe(503);
    expect(res.body.error).toMatch(/AI 서버/);
  });
});

// ---------------------------------------------------------------------------
// POST /api/ai/assist/diary
// ---------------------------------------------------------------------------

describe('POST /api/ai/assist/diary', () => {
  it('returns 401 without auth', async () => {
    const res = await request(app)
      .post('/api/ai/assist/diary')
      .send({ text: '오늘 기분이 좋았다' });
    expect(res.status).toBe(401);
  });

  it('returns 400 when text is missing', async () => {
    const agent = await loginAs(USER);
    const res = await agent.post('/api/ai/assist/diary').send({ text: '' });
    expect(res.status).toBe(400);
  });

  it('returns 400 when text exceeds 5000 chars', async () => {
    const agent = await loginAs(USER);
    const res = await agent
      .post('/api/ai/assist/diary')
      .send({ text: 'a'.repeat(5001) });
    expect(res.status).toBe(400);
  });

  it('returns extracted diary fields on success', async () => {
    const mockFields = {
      title: '즐거운 하루',
      mood: 'happy',
      body: '오늘은 정말 즐거운 하루였다.',
    };
    ollamaAssist.extractDiaryFields.mockResolvedValue(mockFields);

    const agent = await loginAs(USER);
    const res = await agent
      .post('/api/ai/assist/diary')
      .send({ text: '오늘 친구들이랑 놀아서 기분이 너무 좋았다.' });

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual(mockFields);
    expect(ollamaAssist.extractDiaryFields).toHaveBeenCalledWith('오늘 친구들이랑 놀아서 기분이 너무 좋았다.');
  });

  it('returns 503 when Ollama is unreachable', async () => {
    const connErr = new Error('connect ETIMEDOUT');
    connErr.code = 'ETIMEDOUT';
    ollamaAssist.extractDiaryFields.mockRejectedValue(connErr);

    const agent = await loginAs(USER);
    const res = await agent
      .post('/api/ai/assist/diary')
      .send({ text: '오늘 일기' });

    expect(res.status).toBe(503);
    expect(res.body.error).toMatch(/AI 서버/);
  });
});
