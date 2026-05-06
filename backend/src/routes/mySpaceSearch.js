/**
 * mySpaceSearch.js — Unified search across diary / recipe / freeform note.
 *
 * Route: GET /api/my-space/search?q=<query>&limit=<10>
 *
 * All results are scoped to the authenticated user's owned spaces
 * via `space: { userId: req.user.id }` — cross-user data never leaks.
 *
 * Response envelope:
 * {
 *   query: string,
 *   total: number,
 *   groups: { diary: [...], recipe: [...], note: [...] }
 * }
 */

'use strict';

const { Router } = require('express');
const prisma = require('../services/db');
const { extractSnippet } = require('../services/searchSnippet');

const router = Router();

/**
 * Validate and parse search query parameters.
 * Returns { q, limit } on success, or { validationError } on failure.
 *
 * @param {import('express').Request} req
 * @returns {{ q?: string, limit?: number, validationError?: object }}
 */
function parseSearchParams(req) {
  const details = {};
  let { q, limit } = req.query;

  if (typeof q !== 'string' || q.trim().length < 1) {
    details.q = 'q is required and must be at least 1 character';
  } else if (q.trim().length > 100) {
    details.q = 'q must be at most 100 characters';
  }

  let parsedLimit = 10;
  if (limit !== undefined) {
    parsedLimit = parseInt(limit, 10);
    if (Number.isNaN(parsedLimit) || parsedLimit < 1 || parsedLimit > 50) {
      details.limit = 'limit must be an integer between 1 and 50';
    }
  }

  if (Object.keys(details).length > 0) {
    return { validationError: { error: 'Validation failed', details } };
  }

  return { q: q.trim(), limit: parsedLimit };
}

/**
 * GET /search?q=...&limit=10
 * Search across DiaryEntry, Recipe, and FreeformNote for the current user.
 */
router.get('/search', async (req, res, next) => {
  try {
    const { q, limit, validationError } = parseSearchParams(req);

    if (validationError) {
      return res.status(400).json(validationError);
    }

    const userId = req.user.id;
    const ownerFilter = { space: { userId } };
    const containsQ = (field) => ({ [field]: { contains: q, mode: 'insensitive' } });

    const [diaryRows, recipeRows, noteRows] = await Promise.all([
      prisma.diaryEntry.findMany({
        where: {
          ...ownerFilter,
          OR: [containsQ('title'), containsQ('body')],
        },
        orderBy: { updatedAt: 'desc' },
        take: limit,
        include: { space: { select: { id: true, name: true } } },
      }),
      prisma.recipe.findMany({
        where: {
          ...ownerFilter,
          OR: [containsQ('name'), containsQ('description')],
        },
        orderBy: { updatedAt: 'desc' },
        take: limit,
        include: { space: { select: { id: true, name: true } } },
      }),
      prisma.freeformNote.findMany({
        where: {
          ...ownerFilter,
          OR: [containsQ('title'), containsQ('body')],
        },
        orderBy: { updatedAt: 'desc' },
        take: limit,
        include: { space: { select: { id: true, name: true } } },
      }),
    ]);

    const diary = diaryRows.map((entry) => ({
      id: entry.id,
      spaceId: entry.spaceId,
      spaceName: entry.space.name,
      title: entry.title,
      snippet: extractSnippet(entry.body, q),
      updatedAt: entry.updatedAt,
    }));

    const recipe = recipeRows.map((r) => ({
      id: r.id,
      spaceId: r.spaceId,
      spaceName: r.space.name,
      name: r.name,
      snippet: extractSnippet(r.description || r.name, q),
      updatedAt: r.updatedAt,
    }));

    const note = noteRows.map((n) => ({
      id: n.id,
      spaceId: n.spaceId,
      spaceName: n.space.name,
      title: n.title,
      snippet: extractSnippet(n.body, q),
      updatedAt: n.updatedAt,
    }));

    return res.json({
      query: q,
      total: diary.length + recipe.length + note.length,
      groups: { diary, recipe, note },
    });
  } catch (err) {
    return next(err);
  }
});

module.exports = router;
