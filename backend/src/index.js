require('dotenv').config();
const session = require('express-session');
const PgSession = require('connect-pg-simple')(session);
const { createApp } = require('./createApp');

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

const PORT = process.env.PORT || 3000;

const pgStore = new PgSession({
  conString: process.env.DATABASE_URL,
  tableName: 'Session',
  createTableIfMissing: false,
});

const app = createApp({ sessionStore: pgStore });

app.listen(PORT, () => {
  console.log(`AI Agent Hub backend running on http://localhost:${PORT}`);
});
