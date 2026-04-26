const express = require('express');
const prisma = require('../services/db');
const { encrypt, decrypt } = require('../utils/crypto');

const router = express.Router();

const SENSITIVE_RE = /token|secret|password/i;
const SENSITIVE_KEYS = new Set(['jira_api_token']);

function maskValue(value) {
  if (value.length <= 4) return '●'.repeat(8);
  return '●'.repeat(8) + value.slice(-4);
}

router.get('/', async (req, res, next) => {
  try {
    const settings = await prisma.userSetting.findMany({
      where: { userId: req.user.id },
    });

    const result = {};
    for (const s of settings) {
      if (s.encrypted) {
        const raw = decrypt(s.value);
        result[s.key] = maskValue(raw);
      } else {
        result[s.key] = s.value;
      }
    }
    res.json(result);
  } catch (err) {
    next(err);
  }
});

router.put('/', async (req, res, next) => {
  try {
    const body = req.body;
    if (typeof body !== 'object' || Array.isArray(body)) {
      return res.status(400).json({ error: '요청 형식이 올바르지 않습니다.' });
    }

    for (const [key, value] of Object.entries(body)) {
      if (typeof value !== 'string') continue;

      if (value === '') {
        await prisma.userSetting.deleteMany({ where: { userId: req.user.id, key } });
        continue;
      }

      const isSensitive = SENSITIVE_RE.test(key) || SENSITIVE_KEYS.has(key);
      const stored = isSensitive ? encrypt(value) : value;

      await prisma.userSetting.upsert({
        where: { userId_key: { userId: req.user.id, key } },
        update: { value: stored, encrypted: isSensitive },
        create: { userId: req.user.id, key, value: stored, encrypted: isSensitive },
      });
    }

    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
