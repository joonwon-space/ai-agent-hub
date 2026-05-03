/**
 * createApp — builds and returns an Express app without starting the HTTP server.
 * Accepts optional overrides for testing (e.g. an in-memory session store).
 */
const express = require('express');
const cors = require('cors');
const session = require('express-session');
const { loadAgents } = require('./agentLoader');
const agentsRouter = require('./routes/agents');
const uploadRouter = require('./routes/upload');
const authRouter = require('./routes/auth');
const settingsRouter = require('./routes/settings');
const mySpaceRouter = require('./routes/mySpace');
const { requireAuth } = require('./middleware/auth');

/**
 * @param {{ sessionStore?: import('express-session').Store }} [opts]
 */
function createApp(opts = {}) {
  const app = express();

  app.use(cors({
    origin: process.env.CORS_ORIGIN || 'http://localhost',
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
    credentials: true,
  }));
  app.use(express.json({ limit: '15mb' }));

  app.use(session({
    store: opts.sessionStore, // undefined → default MemoryStore (fine for tests)
    secret: process.env.SESSION_SECRET || 'test-secret',
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: false,
      maxAge: 7 * 24 * 60 * 60 * 1000,
    },
  }));

  loadAgents();

  app.use('/api/auth', authRouter);
  app.use('/api/agents', requireAuth, agentsRouter);
  app.use('/api/upload', requireAuth, uploadRouter);
  app.use('/api/settings', requireAuth, settingsRouter);
  app.use('/api/my-space', requireAuth, mySpaceRouter);

  // Global error handler
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    console.error('[error]', err.message);
    const status = err.status || err.statusCode || 500;
    res.status(status).json({ error: 'Internal server error' });
  });

  return app;
}

module.exports = { createApp };
