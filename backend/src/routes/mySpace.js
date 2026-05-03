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

module.exports = router;
