'use strict';

const express = require('express');
const { requireAuth } = require('../middleware/auth');
const { extractRecipeFields, extractDiaryFields } = require('../services/ollamaAssist');

const router = express.Router();

router.post('/assist/recipe', requireAuth, async (req, res, next) => {
  try {
    const { text } = req.body;
    if (!text || typeof text !== 'string' || text.trim().length === 0) {
      return res.status(400).json({ error: '텍스트를 입력해주세요.' });
    }
    if (text.length > 5000) {
      return res.status(400).json({ error: '텍스트는 5000자 이하여야 합니다.' });
    }

    const fields = await extractRecipeFields(text.trim());
    res.json({ data: fields });
  } catch (err) {
    if (err.code === 'ECONNREFUSED' || err.code === 'ENOTFOUND' || err.code === 'ETIMEDOUT') {
      return res.status(503).json({ error: 'AI 서버에 연결할 수 없습니다.' });
    }
    next(err);
  }
});

router.post('/assist/diary', requireAuth, async (req, res, next) => {
  try {
    const { text } = req.body;
    if (!text || typeof text !== 'string' || text.trim().length === 0) {
      return res.status(400).json({ error: '텍스트를 입력해주세요.' });
    }
    if (text.length > 5000) {
      return res.status(400).json({ error: '텍스트는 5000자 이하여야 합니다.' });
    }

    const fields = await extractDiaryFields(text.trim());
    res.json({ data: fields });
  } catch (err) {
    if (err.code === 'ECONNREFUSED' || err.code === 'ENOTFOUND' || err.code === 'ETIMEDOUT') {
      return res.status(503).json({ error: 'AI 서버에 연결할 수 없습니다.' });
    }
    next(err);
  }
});

module.exports = router;
