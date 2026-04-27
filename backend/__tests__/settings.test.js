/**
 * Integration tests: GET|PUT /api/settings
 * Mocks Prisma, crypto, and auth middleware so no real DB is required.
 */

jest.mock('../src/services/db', () => ({
  user: {
    count: jest.fn(),
    create: jest.fn(),
    findUnique: jest.fn(),
  },
  userSetting: {
    findMany: jest.fn(),
    upsert: jest.fn(),
    deleteMany: jest.fn(),
  },
}));

// Mock crypto with deterministic encrypt/decrypt
jest.mock('../src/utils/crypto', () => ({
  encrypt: jest.fn((v) => `enc:${v}`),
  decrypt: jest.fn((v) => v.replace(/^enc:/, '')),
}));

jest.mock('../src/agentLoader', () => ({
  loadAgents: jest.fn(),
  getAgent: jest.fn(),
  listAgents: jest.fn(() => []),
}));

const request = require('supertest');
const { createApp } = require('../src/createApp');
const prisma = require('../src/services/db');

// Build an app and inject an authenticated user into each request
const app = createApp();

// Inject req.user and req.session.userId before requireAuth runs
app.use((req, _res, next) => {
  req.user = { id: 'user-1', email: 'test@test.com' };
  if (req.session) req.session.userId = 'user-1';
  next();
});

// Mount settings router directly without requireAuth for test isolation
const settingsRouter = require('../src/routes/settings');
app.use('/api/test/settings', settingsRouter);

beforeEach(() => {
  jest.clearAllMocks();
});

describe('GET /api/test/settings', () => {
  test('returns plain values as-is', async () => {
    prisma.userSetting.findMany.mockResolvedValue([
      { key: 'jira_base_url', value: 'https://example.atlassian.net', encrypted: false },
      { key: 'jira_email', value: 'user@example.com', encrypted: false },
    ]);

    const res = await request(app).get('/api/test/settings');

    expect(res.status).toBe(200);
    expect(res.body.jira_base_url).toBe('https://example.atlassian.net');
    expect(res.body.jira_email).toBe('user@example.com');
  });

  test('masks encrypted values (shows last 4 chars only)', async () => {
    prisma.userSetting.findMany.mockResolvedValue([
      { key: 'jira_api_token', value: 'enc:ABCD1234EFGH5678', encrypted: true },
    ]);

    const res = await request(app).get('/api/test/settings');

    expect(res.status).toBe(200);
    // decrypt returns 'ABCD1234EFGH5678', mask shows ●×8 + last 4
    expect(res.body.jira_api_token).toMatch(/●+5678$/);
  });

  test('returns empty object when no settings exist', async () => {
    prisma.userSetting.findMany.mockResolvedValue([]);

    const res = await request(app).get('/api/test/settings');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({});
  });
});

describe('PUT /api/test/settings', () => {
  test('upserts a plain (non-sensitive) value', async () => {
    prisma.userSetting.upsert.mockResolvedValue({});

    const res = await request(app)
      .put('/api/test/settings')
      .send({ jira_base_url: 'https://myorg.atlassian.net' });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(prisma.userSetting.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ encrypted: false }),
      })
    );
  });

  test('encrypts sensitive key (jira_api_token)', async () => {
    prisma.userSetting.upsert.mockResolvedValue({});

    const res = await request(app)
      .put('/api/test/settings')
      .send({ jira_api_token: 'my-secret-token' });

    expect(res.status).toBe(200);
    expect(prisma.userSetting.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          value: 'enc:my-secret-token',
          encrypted: true,
        }),
      })
    );
  });

  test('deletes setting when value is empty string', async () => {
    prisma.userSetting.deleteMany.mockResolvedValue({ count: 1 });

    const res = await request(app)
      .put('/api/test/settings')
      .send({ jira_api_token: '' });

    expect(res.status).toBe(200);
    expect(prisma.userSetting.deleteMany).toHaveBeenCalledWith({
      where: { userId: 'user-1', key: 'jira_api_token' },
    });
    expect(prisma.userSetting.upsert).not.toHaveBeenCalled();
  });

  test('rejects non-object body with 400', async () => {
    const res = await request(app)
      .put('/api/test/settings')
      .send([{ key: 'val' }]);

    expect(res.status).toBe(400);
  });
});
