'use strict';

const express = require('express');
const { requireAuth } = require('../middleware/auth');
const { extractRecipeFields, extractDiaryFields } = require('../services/ollamaAssist');

const OLLAMA_ERROR_CODES = new Set([
  'ECONNREFUSED', 'ENOTFOUND', 'ETIMEDOUT', 'ECONNABORTED',
  'ECONNRESET', 'ERR_NETWORK', 'ERR_CANCELED',
]);

function isOllamaUnreachable(err) {
  if (OLLAMA_ERROR_CODES.has(err.code)) return true;
  // axios network error: request sent but no response received
  if (err.request && !err.response) return true;
  return false;
}

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
    if (isOllamaUnreachable(err)) {
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
    if (isOllamaUnreachable(err)) {
      return res.status(503).json({ error: 'AI 서버에 연결할 수 없습니다.' });
    }
    next(err);
  }
});

module.exports = router;
