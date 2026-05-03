/**
 * mySpace.js — Express router for /api/my-space
 *
 * All routes require authentication (requireAuth applied at router level via createApp).
 * Owner-check: spaceId is verified to belong to req.user.id on every sub-resource route.
 * Not-found OR not-owned → 404 (information-leak prevention per PRD §7).
 *
 * Response envelope (matches existing routes):
 *   success → raw object/array
 *   failure → { error: string, details?: {...} }
 */

'use strict';

const express = require('express');
const prisma = require('../services/db');
const {
  assertTemplate,
  assertSpaceName,
  assertEntryDate,
  assertMood,
  assertDiaryTitle,
  assertDiaryBody,
  assertCategory,
  assertDifficulty,
  assertCookTime,
  assertServings,
  assertIngredients,
  assertSteps,
  assertNoteTitle,
  assertNoteBody,
  assertPinned,
} = require('../services/mySpaceValidation');

const router = express.Router();

// ---------------------------------------------------------------------------
// Helper: load space owned by the current user, or return null.
// ---------------------------------------------------------------------------
async function loadOwnedSpace(spaceId, userId) {
  const id = parseInt(spaceId, 10);
  if (isNaN(id)) return null;
  return prisma.space.findFirst({ where: { id, userId } });
}

// ---------------------------------------------------------------------------
// Space CRUD
// ---------------------------------------------------------------------------

// GET /api/my-space — list current user's spaces
router.get('/', async (req, res, next) => {
  try {
    const spaces = await prisma.space.findMany({
      where: { userId: req.user.id },
      orderBy: { createdAt: 'asc' },
    });
    res.json(spaces);
  } catch (err) {
    next(err);
  }
});

// POST /api/my-space — create a new space
router.post('/', async (req, res, next) => {
  try {
    const { name, template } = req.body || {};

    assertSpaceName(name);
    assertTemplate(template);

    const space = await prisma.space.create({
      data: {
        userId: req.user.id,
        name: name.trim(),
        template,
      },
    });
    res.status(201).json(space);
  } catch (err) {
    if (err.status === 400) {
      return res.status(400).json({ error: err.message, details: err.details });
    }
    next(err);
  }
});

// PATCH /api/my-space/:id — update space name
router.patch('/:id', async (req, res, next) => {
  try {
    const space = await loadOwnedSpace(req.params.id, req.user.id);
    if (!space) return res.status(404).json({ error: 'Space not found' });

    const { name } = req.body || {};
    if (name !== undefined) {
      assertSpaceName(name);
    }

    const updated = await prisma.space.update({
      where: { id: space.id },
      data: { name: name !== undefined ? name.trim() : space.name },
    });
    res.json(updated);
  } catch (err) {
    if (err.status === 400) {
      return res.status(400).json({ error: err.message, details: err.details });
    }
    next(err);
  }
});

// DELETE /api/my-space/:id — delete space (cascade handled by DB)
router.delete('/:id', async (req, res, next) => {
  try {
    const space = await loadOwnedSpace(req.params.id, req.user.id);
    if (!space) return res.status(404).json({ error: 'Space not found' });

    await prisma.space.delete({ where: { id: space.id } });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// Diary CRUD
// ---------------------------------------------------------------------------

// GET /api/my-space/:spaceId/diary — list diary entries (cursor pagination)
router.get('/:spaceId/diary', async (req, res, next) => {
  try {
    const space = await loadOwnedSpace(req.params.spaceId, req.user.id);
    if (!space) return res.status(404).json({ error: 'Space not found' });

    const limit = Math.min(parseInt(req.query.limit, 10) || 20, 100);
    const cursor = req.query.cursor ? parseInt(req.query.cursor, 10) : undefined;

    const entries = await prisma.diaryEntry.findMany({
      where: { spaceId: space.id },
      orderBy: { entryDate: 'desc' },
      take: limit,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    res.json(entries);
  } catch (err) {
    next(err);
  }
});

// POST /api/my-space/:spaceId/diary — create diary entry
router.post('/:spaceId/diary', async (req, res, next) => {
  try {
    const space = await loadOwnedSpace(req.params.spaceId, req.user.id);
    if (!space) return res.status(404).json({ error: 'Space not found' });

    const { entryDate, mood, title, body } = req.body || {};

    assertEntryDate(entryDate);
    assertMood(mood);
    assertDiaryTitle(title);
    assertDiaryBody(body !== undefined ? body : '');

    const entry = await prisma.diaryEntry.create({
      data: {
        spaceId: space.id,
        entryDate: new Date(entryDate),
        mood: mood || null,
        title: title.trim(),
        body: body || '',
      },
    });
    res.status(201).json(entry);
  } catch (err) {
    if (err.status === 400) {
      return res.status(400).json({ error: err.message, details: err.details });
    }
    next(err);
  }
});

// GET /api/my-space/:spaceId/diary/:id — single diary entry
router.get('/:spaceId/diary/:id', async (req, res, next) => {
  try {
    const space = await loadOwnedSpace(req.params.spaceId, req.user.id);
    if (!space) return res.status(404).json({ error: 'Space not found' });

    const entryId = parseInt(req.params.id, 10);
    if (isNaN(entryId)) return res.status(404).json({ error: 'Diary entry not found' });

    const entry = await prisma.diaryEntry.findFirst({
      where: { id: entryId, spaceId: space.id },
    });
    if (!entry) return res.status(404).json({ error: 'Diary entry not found' });

    res.json(entry);
  } catch (err) {
    next(err);
  }
});

// PATCH /api/my-space/:spaceId/diary/:id — update diary entry (autosave caller)
router.patch('/:spaceId/diary/:id', async (req, res, next) => {
  try {
    const space = await loadOwnedSpace(req.params.spaceId, req.user.id);
    if (!space) return res.status(404).json({ error: 'Space not found' });

    const entryId = parseInt(req.params.id, 10);
    if (isNaN(entryId)) return res.status(404).json({ error: 'Diary entry not found' });

    const existing = await prisma.diaryEntry.findFirst({
      where: { id: entryId, spaceId: space.id },
    });
    if (!existing) return res.status(404).json({ error: 'Diary entry not found' });

    const { entryDate, mood, title, body } = req.body || {};
    const updateData = {};

    if (entryDate !== undefined) {
      assertEntryDate(entryDate);
      updateData.entryDate = new Date(entryDate);
    }
    if (mood !== undefined) {
      assertMood(mood);
      updateData.mood = mood || null;
    }
    if (title !== undefined) {
      assertDiaryTitle(title);
      updateData.title = title.trim();
    }
    if (body !== undefined) {
      assertDiaryBody(body);
      updateData.body = body;
    }

    const updated = await prisma.diaryEntry.update({
      where: { id: existing.id },
      data: updateData,
    });
    res.json(updated);
  } catch (err) {
    if (err.status === 400) {
      return res.status(400).json({ error: err.message, details: err.details });
    }
    next(err);
  }
});

// DELETE /api/my-space/:spaceId/diary/:id — delete diary entry
router.delete('/:spaceId/diary/:id', async (req, res, next) => {
  try {
    const space = await loadOwnedSpace(req.params.spaceId, req.user.id);
    if (!space) return res.status(404).json({ error: 'Space not found' });

    const entryId = parseInt(req.params.id, 10);
    if (isNaN(entryId)) return res.status(404).json({ error: 'Diary entry not found' });

    const existing = await prisma.diaryEntry.findFirst({
      where: { id: entryId, spaceId: space.id },
    });
    if (!existing) return res.status(404).json({ error: 'Diary entry not found' });

    await prisma.diaryEntry.delete({ where: { id: existing.id } });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// Recipe CRUD
// ---------------------------------------------------------------------------

// GET /api/my-space/:spaceId/recipes — list recipes (optional ?category= filter)
router.get('/:spaceId/recipes', async (req, res, next) => {
  try {
    const space = await loadOwnedSpace(req.params.spaceId, req.user.id);
    if (!space) return res.status(404).json({ error: 'Space not found' });

    const where = { spaceId: space.id };
    if (req.query.category) {
      where.category = req.query.category;
    }

    const recipes = await prisma.recipe.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });
    res.json(recipes);
  } catch (err) {
    next(err);
  }
});

// POST /api/my-space/:spaceId/recipes — create recipe
router.post('/:spaceId/recipes', async (req, res, next) => {
  try {
    const space = await loadOwnedSpace(req.params.spaceId, req.user.id);
    if (!space) return res.status(404).json({ error: 'Space not found' });

    const {
      name,
      category,
      difficulty,
      cookTimeMin,
      servings,
      description,
      ingredients,
      steps,
      coverImage,
    } = req.body || {};

    assertSpaceName(name);
    assertCategory(category);
    assertDifficulty(difficulty);
    assertCookTime(cookTimeMin !== undefined ? cookTimeMin : null);
    assertServings(servings !== undefined ? servings : null);
    assertIngredients(ingredients || []);
    assertSteps(steps || []);

    const recipe = await prisma.recipe.create({
      data: {
        spaceId: space.id,
        name: name.trim(),
        category,
        difficulty,
        cookTimeMin: cookTimeMin !== undefined ? cookTimeMin : null,
        servings: servings !== undefined ? servings : null,
        description: description || null,
        ingredients: ingredients || [],
        steps: steps || [],
        coverImage: coverImage || null,
      },
    });
    res.status(201).json(recipe);
  } catch (err) {
    if (err.status === 400) {
      return res.status(400).json({ error: err.message, details: err.details });
    }
    next(err);
  }
});

// GET /api/my-space/:spaceId/recipes/:id — single recipe
router.get('/:spaceId/recipes/:id', async (req, res, next) => {
  try {
    const space = await loadOwnedSpace(req.params.spaceId, req.user.id);
    if (!space) return res.status(404).json({ error: 'Space not found' });

    const recipeId = parseInt(req.params.id, 10);
    if (isNaN(recipeId)) return res.status(404).json({ error: 'Recipe not found' });

    const recipe = await prisma.recipe.findFirst({
      where: { id: recipeId, spaceId: space.id },
    });
    if (!recipe) return res.status(404).json({ error: 'Recipe not found' });

    res.json(recipe);
  } catch (err) {
    next(err);
  }
});

// PATCH /api/my-space/:spaceId/recipes/:id — update recipe (autosave caller)
router.patch('/:spaceId/recipes/:id', async (req, res, next) => {
  try {
    const space = await loadOwnedSpace(req.params.spaceId, req.user.id);
    if (!space) return res.status(404).json({ error: 'Space not found' });

    const recipeId = parseInt(req.params.id, 10);
    if (isNaN(recipeId)) return res.status(404).json({ error: 'Recipe not found' });

    const existing = await prisma.recipe.findFirst({
      where: { id: recipeId, spaceId: space.id },
    });
    if (!existing) return res.status(404).json({ error: 'Recipe not found' });

    const {
      name,
      category,
      difficulty,
      cookTimeMin,
      servings,
      description,
      ingredients,
      steps,
      coverImage,
    } = req.body || {};

    const updateData = {};

    if (name !== undefined) {
      assertSpaceName(name);
      updateData.name = name.trim();
    }
    if (category !== undefined) {
      assertCategory(category);
      updateData.category = category;
    }
    if (difficulty !== undefined) {
      assertDifficulty(difficulty);
      updateData.difficulty = difficulty;
    }
    if (cookTimeMin !== undefined) {
      assertCookTime(cookTimeMin);
      updateData.cookTimeMin = cookTimeMin;
    }
    if (servings !== undefined) {
      assertServings(servings);
      updateData.servings = servings;
    }
    if (description !== undefined) {
      updateData.description = description || null;
    }
    if (ingredients !== undefined) {
      assertIngredients(ingredients);
      updateData.ingredients = ingredients;
    }
    if (steps !== undefined) {
      assertSteps(steps);
      updateData.steps = steps;
    }
    if (coverImage !== undefined) {
      updateData.coverImage = coverImage || null;
    }

    const updated = await prisma.recipe.update({
      where: { id: existing.id },
      data: updateData,
    });
    res.json(updated);
  } catch (err) {
    if (err.status === 400) {
      return res.status(400).json({ error: err.message, details: err.details });
    }
    next(err);
  }
});

// DELETE /api/my-space/:spaceId/recipes/:id — delete recipe
router.delete('/:spaceId/recipes/:id', async (req, res, next) => {
  try {
    const space = await loadOwnedSpace(req.params.spaceId, req.user.id);
    if (!space) return res.status(404).json({ error: 'Space not found' });

    const recipeId = parseInt(req.params.id, 10);
    if (isNaN(recipeId)) return res.status(404).json({ error: 'Recipe not found' });

    const existing = await prisma.recipe.findFirst({
      where: { id: recipeId, spaceId: space.id },
    });
    if (!existing) return res.status(404).json({ error: 'Recipe not found' });

    await prisma.recipe.delete({ where: { id: existing.id } });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// FreeformNote CRUD (Phase 2)
// ---------------------------------------------------------------------------

// GET /api/my-space/:spaceId/notes — list notes (pinned desc, updatedAt desc, cursor pagination)
router.get('/:spaceId/notes', async (req, res, next) => {
  try {
    const space = await loadOwnedSpace(req.params.spaceId, req.user.id);
    if (!space) return res.status(404).json({ error: 'Space not found' });

    const limit = Math.min(parseInt(req.query.limit, 10) || 20, 100);
    const cursor = req.query.cursor ? parseInt(req.query.cursor, 10) : undefined;

    const notes = await prisma.freeformNote.findMany({
      where: { spaceId: space.id },
      orderBy: [{ pinned: 'desc' }, { updatedAt: 'desc' }],
      take: limit,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    res.json(notes);
  } catch (err) {
    next(err);
  }
});

// POST /api/my-space/:spaceId/notes — create note
router.post('/:spaceId/notes', async (req, res, next) => {
  try {
    const space = await loadOwnedSpace(req.params.spaceId, req.user.id);
    if (!space) return res.status(404).json({ error: 'Space not found' });

    const { title, body, pinned } = req.body || {};

    assertNoteTitle(title);
    assertNoteBody(body !== undefined ? body : '');
    assertPinned(pinned);

    const note = await prisma.freeformNote.create({
      data: {
        spaceId: space.id,
        title: title.trim(),
        body: body || '',
        pinned: pinned === true,
      },
    });
    res.status(201).json(note);
  } catch (err) {
    if (err.status === 400) {
      return res.status(400).json({ error: err.message, details: err.details });
    }
    next(err);
  }
});

// GET /api/my-space/:spaceId/notes/:id — single note
router.get('/:spaceId/notes/:id', async (req, res, next) => {
  try {
    const space = await loadOwnedSpace(req.params.spaceId, req.user.id);
    if (!space) return res.status(404).json({ error: 'Space not found' });

    const noteId = parseInt(req.params.id, 10);
    if (isNaN(noteId)) return res.status(404).json({ error: 'Note not found' });

    const note = await prisma.freeformNote.findFirst({
      where: { id: noteId, spaceId: space.id },
    });
    if (!note) return res.status(404).json({ error: 'Note not found' });

    res.json(note);
  } catch (err) {
    next(err);
  }
});

// PATCH /api/my-space/:spaceId/notes/:id — update note (autosave caller)
router.patch('/:spaceId/notes/:id', async (req, res, next) => {
  try {
    const space = await loadOwnedSpace(req.params.spaceId, req.user.id);
    if (!space) return res.status(404).json({ error: 'Space not found' });

    const noteId = parseInt(req.params.id, 10);
    if (isNaN(noteId)) return res.status(404).json({ error: 'Note not found' });

    const existing = await prisma.freeformNote.findFirst({
      where: { id: noteId, spaceId: space.id },
    });
    if (!existing) return res.status(404).json({ error: 'Note not found' });

    const { title, body, pinned } = req.body || {};
    const updateData = {};

    if (title !== undefined) {
      assertNoteTitle(title);
      updateData.title = title.trim();
    }
    if (body !== undefined) {
      assertNoteBody(body);
      updateData.body = body;
    }
    if (pinned !== undefined) {
      assertPinned(pinned);
      updateData.pinned = pinned === true;
    }

    const updated = await prisma.freeformNote.update({
      where: { id: existing.id },
      data: updateData,
    });
    res.json(updated);
  } catch (err) {
    if (err.status === 400) {
      return res.status(400).json({ error: err.message, details: err.details });
    }
    next(err);
  }
});

// DELETE /api/my-space/:spaceId/notes/:id — delete note
router.delete('/:spaceId/notes/:id', async (req, res, next) => {
  try {
    const space = await loadOwnedSpace(req.params.spaceId, req.user.id);
    if (!space) return res.status(404).json({ error: 'Space not found' });

    const noteId = parseInt(req.params.id, 10);
    if (isNaN(noteId)) return res.status(404).json({ error: 'Note not found' });

    const existing = await prisma.freeformNote.findFirst({
      where: { id: noteId, spaceId: space.id },
    });
    if (!existing) return res.status(404).json({ error: 'Note not found' });

    await prisma.freeformNote.delete({ where: { id: existing.id } });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
