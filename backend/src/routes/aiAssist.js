'use strict';

const express = require('express');
const { requireAuth } = require('../middleware/auth');
const { extractRecipeFields, extractDiaryFields } = require('../services/ollamaAssist');

const OLLAMA_TIMEOUT_CODES = new Set(['ECONNABORTED', 'ETIMEDOUT', 'ERR_CANCELED']);
const OLLAMA_CONN_CODES = new Set(['ECONNREFUSED', 'ENOTFOUND', 'ECONNRESET', 'ERR_NETWORK']);

function classifyOllamaError(err) {
  if (OLLAMA_TIMEOUT_CODES.has(err.code)) return 'timeout';
  if (OLLAMA_CONN_CODES.has(err.code)) return 'unreachable';
  // axios network error: request sent but no response received
  if (err.request && !err.response) return 'unreachable';
  return null;
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
    const kind = classifyOllamaError(err);
    if (kind === 'timeout') return res.status(503).json({ error: 'AI 응답 시간이 초과됐습니다. 다시 시도해주세요.' });
    if (kind === 'unreachable') return res.status(503).json({ error: 'AI 서버에 연결할 수 없습니다.' });
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
    const kind = classifyOllamaError(err);
    if (kind === 'timeout') return res.status(503).json({ error: 'AI 응답 시간이 초과됐습니다. 다시 시도해주세요.' });
    if (kind === 'unreachable') return res.status(503).json({ error: 'AI 서버에 연결할 수 없습니다.' });
    next(err);
  }
});

module.exports = router;
