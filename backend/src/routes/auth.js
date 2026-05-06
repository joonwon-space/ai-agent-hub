const express = require('express');
const bcrypt = require('bcrypt');
const rateLimit = require('express-rate-limit');
const prisma = require('../services/db');

const router = express.Router();
const SALT_ROUNDS = 12;

const authLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: '요청이 너무 많습니다. 잠시 후 다시 시도해주세요.' },
});

router.get('/setup-required', async (req, res) => {
  const count = await prisma.user.count();
  res.json({ setupRequired: count === 0 });
});

router.post('/register', authLimiter, async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: '이메일과 비밀번호를 입력해주세요.' });
  }
  if (password.length < 8) {
    return res.status(400).json({ error: '비밀번호는 8자 이상이어야 합니다.' });
  }

  try {
    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
    const user = await prisma.user.create({ data: { email, passwordHash } });
    await new Promise((resolve, reject) => {
      req.session.regenerate((err) => (err ? reject(err) : resolve()));
    });
    req.session.userId = user.id;
    res.json({ id: user.id, email: user.email });
  } catch (err) {
    if (err.code === 'P2002') {
      return res.status(409).json({ error: '이미 사용 중인 이메일입니다.' });
    }
    throw err;
  }
});

router.post('/login', authLimiter, async (req, res, next) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: '이메일과 비밀번호를 입력해주세요.' });
  }

  try {
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      return res.status(401).json({ error: '이메일 또는 비밀번호가 올바르지 않습니다.' });
    }

    const match = await bcrypt.compare(password, user.passwordHash);
    if (!match) {
      return res.status(401).json({ error: '이메일 또는 비밀번호가 올바르지 않습니다.' });
    }

    await new Promise((resolve, reject) => {
      req.session.regenerate((err) => (err ? reject(err) : resolve()));
    });
    req.session.userId = user.id;
    res.json({ id: user.id, email: user.email });
  } catch (err) {
    next(err);
  }
});

router.post('/logout', (req, res) => {
  req.session.destroy(() => {
    res.clearCookie('connect.sid');
    res.json({ ok: true });
  });
});

router.get('/me', async (req, res, next) => {
  // W-6: returns 200 + null when no session, instead of 401, so the login page
  // (and any unauthenticated landing) doesn't generate noisy 401s in browser
  // network/console. Frontend getMe() treats null as "not logged in".
  if (!req.session?.userId) {
    return res.status(200).json(null);
  }
  try {
    const user = await prisma.user.findUnique({ where: { id: req.session.userId } });
    if (!user) return res.status(200).json(null);
    res.json({ id: user.id, email: user.email });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
