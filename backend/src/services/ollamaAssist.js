'use strict';

const axios = require('axios');

const RECIPE_SCHEMA = `{
  "name": "레시피 이름 (한국어, 80자 이내)",
  "category": "한식 또는 양식 또는 디저트 또는 기타",
  "difficulty": "easy 또는 medium 또는 hard",
  "cookTimeMin": 조리시간_분_숫자_또는_null,
  "servings": 인분_숫자_또는_null,
  "description": "레시피 한 줄 설명 또는 null",
  "videoUrl": "유튜브 URL (https://youtu.be/... 형식) 또는 null",
  "ingredients": [{ "name": "재료명", "amount": "양 (예: 400g)" }],
  "steps": [{ "order": 1, "text": "조리 단계 설명" }]
}`;

const DIARY_SCHEMA = `{
  "title": "일기 제목 (한국어, 120자 이내) 또는 null",
  "mood": "happy 또는 sad 또는 anxious 또는 angry 또는 neutral 중 하나",
  "body": "정리된 일기 본문 (원문 의미 보존)"
}`;

async function callOllama(prompt) {
  const ollamaHost = process.env.OLLAMA_HOST || 'http://localhost:11434';
  const model = process.env.OLLAMA_MODEL || 'gemma4:e4b';

  const response = await axios.post(
    `${ollamaHost}/api/generate`,
    { model, prompt, stream: false },
    { timeout: 120000 },
  );

  const raw = response.data.response.trim();
  const stripped = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  const match = stripped.match(/\{[\s\S]*\}/);
  if (!match) throw new Error('LLM 응답에서 JSON을 파싱할 수 없습니다.');

  try {
    return JSON.parse(match[0]);
  } catch (e) {
    throw new Error(`LLM JSON 파싱 실패: ${e.message}`);
  }
}

async function extractRecipeFields(text) {
  const prompt = `다음 텍스트를 분석해서 레시피 필드를 아래 JSON 형식으로만 응답해. 다른 설명 없이 JSON만:
${RECIPE_SCHEMA}

텍스트:
${text}`;

  const parsed = await callOllama(prompt);

  const validCategories = ['한식', '양식', '디저트', '기타'];
  const validDifficulties = ['easy', 'medium', 'hard'];

  if (!validCategories.includes(parsed.category)) parsed.category = '기타';
  if (!validDifficulties.includes(parsed.difficulty)) parsed.difficulty = 'medium';
  if (typeof parsed.cookTimeMin !== 'number') parsed.cookTimeMin = null;
  if (typeof parsed.servings !== 'number') parsed.servings = null;
  if (typeof parsed.videoUrl !== 'string' || !parsed.videoUrl) parsed.videoUrl = null;
  if (!Array.isArray(parsed.ingredients)) parsed.ingredients = [];
  if (!Array.isArray(parsed.steps)) parsed.steps = [];

  return parsed;
}

async function extractDiaryFields(text) {
  const prompt = `다음 텍스트를 분석해서 일기 필드를 아래 JSON 형식으로만 응답해. 다른 설명 없이 JSON만:
${DIARY_SCHEMA}

텍스트:
${text}`;

  const parsed = await callOllama(prompt);

  const validMoods = ['happy', 'sad', 'anxious', 'angry', 'neutral'];
  if (!validMoods.includes(parsed.mood)) parsed.mood = 'neutral';
  if (!parsed.body) parsed.body = text;

  return parsed;
}

module.exports = { extractRecipeFields, extractDiaryFields };
