/**
 * mySpaceValidation.js — Pure validation helpers for My Space routes.
 *
 * On failure: throws an Error with .status = 400 and .details = { field: 'reason' }.
 * Routes convert this to: res.status(400).json({ error: 'Validation failed', details })
 */

'use strict';

const VALID_TEMPLATES = new Set(['diary', 'recipe', 'freeform', 'jira']);
const VALID_MOODS = new Set(['happy', 'sad', 'angry', 'tired']);
const VALID_DIFFICULTIES = new Set(['easy', 'medium', 'hard']);

/**
 * Build a 400 error with field-level details.
 */
function validationError(field, reason) {
  const err = new Error('Validation failed');
  err.status = 400;
  err.details = { [field]: reason };
  return err;
}

/**
 * Assert template is one of 'diary' | 'recipe' | 'freeform' | 'jira'.
 */
function assertTemplate(value) {
  if (!VALID_TEMPLATES.has(value)) {
    throw validationError(
      'template',
      `template must be one of: ${[...VALID_TEMPLATES].join(', ')}`,
    );
  }
}

/**
 * Assert space name: 1–80 characters.
 */
function assertSpaceName(value) {
  if (typeof value !== 'string' || value.trim().length < 1) {
    throw validationError('name', 'name is required');
  }
  if (value.trim().length > 80) {
    throw validationError('name', 'name must be 80 characters or fewer');
  }
}

/**
 * Assert entryDate: ISO date string (yyyy-MM-dd), not more than 365 days in the future.
 */
function assertEntryDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw validationError('entryDate', 'entryDate must be an ISO date string (yyyy-MM-dd)');
  }
  const date = new Date(value);
  if (isNaN(date.getTime())) {
    throw validationError('entryDate', 'entryDate is not a valid date');
  }
  const maxFuture = new Date();
  maxFuture.setDate(maxFuture.getDate() + 365);
  if (date > maxFuture) {
    throw validationError('entryDate', 'entryDate must be within 365 days in the future');
  }
}

/**
 * Assert mood: nullable, must be one of the valid enum values if provided.
 */
function assertMood(value) {
  if (value === null || value === undefined || value === '') return;
  if (!VALID_MOODS.has(value)) {
    throw validationError(
      'mood',
      `mood must be one of: ${[...VALID_MOODS].join(', ')}`,
    );
  }
}

/**
 * Assert diary title: 1–120 characters.
 */
function assertDiaryTitle(value) {
  if (typeof value !== 'string' || value.trim().length < 1) {
    throw validationError('title', 'title is required');
  }
  if (value.trim().length > 120) {
    throw validationError('title', 'title must be 120 characters or fewer');
  }
}

/**
 * Assert diary body: 0–50,000 characters.
 */
function assertDiaryBody(value) {
  if (typeof value !== 'string') {
    throw validationError('body', 'body must be a string');
  }
  if (value.length > 50000) {
    throw validationError('body', 'body must be 50,000 characters or fewer');
  }
}

/**
 * Assert recipe cookTimeMin: null or integer 0–6000.
 */
function assertCookTime(value) {
  if (value === null || value === undefined) return;
  if (!Number.isInteger(value) || value < 0 || value > 6000) {
    throw validationError('cookTimeMin', 'cookTimeMin must be null or an integer between 0 and 6000');
  }
}

/**
 * Assert recipe servings: null or integer 1–99.
 */
function assertServings(value) {
  if (value === null || value === undefined) return;
  if (!Number.isInteger(value) || value < 1 || value > 99) {
    throw validationError('servings', 'servings must be null or an integer between 1 and 99');
  }
}

/**
 * Assert recipe category: 1–24 characters.
 */
function assertCategory(value) {
  if (typeof value !== 'string' || value.trim().length < 1) {
    throw validationError('category', 'category is required');
  }
  if (value.trim().length > 24) {
    throw validationError('category', 'category must be 24 characters or fewer');
  }
}

/**
 * Assert recipe difficulty: 'easy' | 'medium' | 'hard'.
 */
function assertDifficulty(value) {
  if (!VALID_DIFFICULTIES.has(value)) {
    throw validationError(
      'difficulty',
      `difficulty must be one of: ${[...VALID_DIFFICULTIES].join(', ')}`,
    );
  }
}

const { randomUUID } = require('crypto');

/**
 * Assert that an optional id field is a 1-64 char string if present.
 */
function assertOptionalEntryId(field, item, idx) {
  if (item.id === undefined || item.id === null) return;
  if (typeof item.id !== 'string' || item.id.length < 1 || item.id.length > 64) {
    throw validationError(field, `item[${idx}].id must be a 1-64 character string when provided`);
  }
}

/**
 * Assert ingredients: array of { id?: string, name: 1-80 chars, amount: 0-40 chars }, max 50 items.
 */
function assertIngredients(value) {
  if (!Array.isArray(value)) {
    throw validationError('ingredients', 'ingredients must be an array');
  }
  if (value.length > 50) {
    throw validationError('ingredients', 'ingredients must have 50 or fewer items');
  }
  for (let i = 0; i < value.length; i++) {
    const item = value[i];
    if (typeof item !== 'object' || item === null) {
      throw validationError('ingredients', `item[${i}] must be an object`);
    }
    assertOptionalEntryId('ingredients', item, i);
    if (typeof item.name !== 'string' || item.name.trim().length < 1 || item.name.trim().length > 80) {
      throw validationError('ingredients', `item[${i}].name must be 1-80 characters`);
    }
    if (typeof item.amount !== 'string' || item.amount.length > 40) {
      throw validationError('ingredients', `item[${i}].amount must be 0-40 characters`);
    }
  }
}

/**
 * Assert steps: array of { id?: string, order: int>=1, text: 1-1000 chars }, max 50 items.
 */
function assertSteps(value) {
  if (!Array.isArray(value)) {
    throw validationError('steps', 'steps must be an array');
  }
  if (value.length > 50) {
    throw validationError('steps', 'steps must have 50 or fewer items');
  }
  for (let i = 0; i < value.length; i++) {
    const item = value[i];
    if (typeof item !== 'object' || item === null) {
      throw validationError('steps', `item[${i}] must be an object`);
    }
    assertOptionalEntryId('steps', item, i);
    if (!Number.isInteger(item.order) || item.order < 1) {
      throw validationError('steps', `item[${i}].order must be an integer >= 1`);
    }
    if (typeof item.text !== 'string' || item.text.trim().length < 1 || item.text.trim().length > 1000) {
      throw validationError('steps', `item[${i}].text must be 1-1000 characters`);
    }
  }
}

/**
 * Ensure each entry has a stable id; auto-fill missing ids in place.
 * Returns a new array with id-stamped entries (does not mutate input).
 */
function withStableIds(items) {
  if (!Array.isArray(items)) return items;
  return items.map((item) => (item && typeof item === 'object' && !item.id)
    ? { ...item, id: randomUUID() }
    : item);
}

// ---------------------------------------------------------------------------
// FreeformNote validators (Phase 2)
// ---------------------------------------------------------------------------

/**
 * Assert note title: 1–120 characters.
 */
function assertNoteTitle(value) {
  if (typeof value !== 'string' || value.trim().length < 1) {
    throw validationError('title', 'title is required');
  }
  if (value.trim().length > 120) {
    throw validationError('title', 'title must be 120 characters or fewer');
  }
}

/**
 * Assert note body: 0–50,000 characters (markdown content).
 */
function assertNoteBody(value) {
  if (typeof value !== 'string') {
    throw validationError('body', 'body must be a string');
  }
  if (value.length > 50000) {
    throw validationError('body', 'body must be 50,000 characters or fewer');
  }
}

/**
 * Assert pinned: boolean or undefined/null (optional field).
 */
function assertPinned(value) {
  if (value === undefined || value === null) return;
  if (typeof value !== 'boolean') {
    throw validationError('pinned', 'pinned must be a boolean');
  }
}

module.exports = {
  assertTemplate,
  assertSpaceName,
  assertEntryDate,
  assertMood,
  assertDiaryTitle,
  assertDiaryBody,
  assertCookTime,
  assertServings,
  assertCategory,
  assertDifficulty,
  assertIngredients,
  assertSteps,
  withStableIds,
  assertNoteTitle,
  assertNoteBody,
  assertPinned,
};
