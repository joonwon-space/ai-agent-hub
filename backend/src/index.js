require('dotenv').config();
const express = require('express');
const cors = require('cors');
const session = require('express-session');
const PgSession = require('connect-pg-simple')(session);
const { loadAgents } = require('./agentLoader');
const agentsRouter = require('./routes/agents');
const uploadRouter = require('./routes/upload');
const authRouter = require('./routes/auth');
const settingsRouter = require('./routes/settings');
const { requireAuth } = require('./middleware/auth');

if (!process.env.SESSION_SECRET) {
  console.error('SESSION_SECRET 환경변수가 필요합니다. openssl rand -hex 32 로 생성하세요.');
  process.exit(1);
}

// Validate ENCRYPTION_KEY on startup (crypto module throws if missing/invalid)
try {
  require('./utils/crypto');
} catch (err) {
  console.error(err.message);
  process.exit(1);
}

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors({
  origin: process.env.CORS_ORIGIN || 'http://localhost',
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  credentials: true,
}));
app.use(express.json({ limit: '15mb' }));

app.use(session({
  store: new PgSession({
    conString: process.env.DATABASE_URL,
    tableName: 'Session',
    createTableIfMissing: false,
  }),
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7일
  },
}));

loadAgents();

app.use('/api/auth', authRouter);
app.use('/api/agents', requireAuth, agentsRouter);
app.use('/api/upload', requireAuth, uploadRouter);
app.use('/api/settings', requireAuth, settingsRouter);

app.listen(PORT, () => {
  console.log(`AI Agent Hub backend running on http://localhost:${PORT}`);
});
