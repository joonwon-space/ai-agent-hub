/**
 * recipeUpload.js — Recipe cover image upload/delete routes.
 *
 * Mounted under /api/my-space (requireAuth already applied at parent level).
 *
 * POST   /:spaceId/recipes/:recipeId/cover — upload & replace cover image
 * DELETE /:spaceId/recipes/:recipeId/cover — remove cover image
 *
 * Validation: 5MB limit, jpeg/png/webp only, magic-byte verification.
 * Processing: sharp resize (max 1200px wide) → webp output.
 * Storage: RECIPE_COVERS_DIR env (default /app/uploads/recipes).
 */

'use strict';

const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const sharp = require('sharp');
const prisma = require('../services/db');

const router = express.Router();

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const ALLOWED_MIMETYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const MAX_SIZE = 5 * 1024 * 1024; // 5MB

function getCoversDir() {
  return process.env.RECIPE_COVERS_DIR || '/app/uploads/recipes';
}

// ---------------------------------------------------------------------------
// Multer — memory storage, 5MB limit
// ---------------------------------------------------------------------------

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_SIZE },
});

// ---------------------------------------------------------------------------
// Magic-byte validation
// ---------------------------------------------------------------------------

/**
 * Validate that the buffer's magic bytes match the declared MIME type.
 * @param {Buffer} buf
 * @param {string} mime
 * @returns {boolean}
 */
function isImageMagicValid(buf, mime) {
  if (!buf || buf.length < 12) return false;

  if (mime === 'image/jpeg') {
    // JPEG: FF D8 FF
    return buf[0] === 0xFF && buf[1] === 0xD8 && buf[2] === 0xFF;
  }

  if (mime === 'image/png') {
    // PNG: 89 50 4E 47 0D 0A 1A 0A
    return (
      buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4E && buf[3] === 0x47 &&
      buf[4] === 0x0D && buf[5] === 0x0A && buf[6] === 0x1A && buf[7] === 0x0A
    );
  }

  if (mime === 'image/webp') {
    // RIFF????WEBP
    const isRiff = buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46;
    const isWebp = buf[8] === 0x57 && buf[9] === 0x45 && buf[10] === 0x42 && buf[11] === 0x50;
    return isRiff && isWebp;
  }

  return false;
}

// ---------------------------------------------------------------------------
// Helper: load space owned by the current user
// ---------------------------------------------------------------------------

async function loadOwnedSpace(spaceId, userId) {
  const id = parseInt(spaceId, 10);
  if (isNaN(id)) return null;
  return prisma.space.findFirst({ where: { id, userId } });
}

// ---------------------------------------------------------------------------
// Helper: delete old cover file gracefully
// ---------------------------------------------------------------------------

async function deleteOldCover(coverImageUrl) {
  if (!coverImageUrl) return;
  try {
    // Extract filename from URL like /uploads/recipes/xxx.webp
    const filename = path.basename(coverImageUrl);
    const filePath = path.join(getCoversDir(), filename);
    await fs.promises.unlink(filePath);
  } catch (_) {
    // Graceful — old file missing is not an error
  }
}

// ---------------------------------------------------------------------------
// POST /:spaceId/recipes/:recipeId/cover
// ---------------------------------------------------------------------------

/**
 * Multer error handler middleware — converts multer LIMIT errors to 400.
 */
function multerErrorHandler(err, req, res, next) {
  if (err && err.code === 'LIMIT_FILE_SIZE') {
    return res.status(400).json({
      error: 'File too large',
      details: { size: 'Maximum file size is 5MB' },
    });
  }
  next(err);
}

router.post(
  '/:spaceId/recipes/:recipeId/cover',
  (req, res, next) => {
    upload.single('cover')(req, res, (err) => {
      if (err) return multerErrorHandler(err, req, res, next);
      next();
    });
  },
  async (req, res, next) => {
    try {
      // Defensive auth check (parent middleware already applied requireAuth)
      if (!req.user || !req.user.id) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      // Owner check
      const space = await loadOwnedSpace(req.params.spaceId, req.user.id);
      if (!space) return res.status(404).json({ error: 'Space not found' });

      // Recipe ownership check
      const recipeId = parseInt(req.params.recipeId, 10);
      if (isNaN(recipeId)) return res.status(404).json({ error: 'Recipe not found' });

      const recipe = await prisma.recipe.findFirst({
        where: { id: recipeId, spaceId: space.id },
      });
      if (!recipe) return res.status(404).json({ error: 'Recipe not found' });

      // File presence
      if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded', details: { file: 'required' } });
      }

      // MIME type validation
      if (!ALLOWED_MIMETYPES.has(req.file.mimetype)) {
        return res.status(400).json({
          error: 'Invalid file type',
          details: { mimetype: `Allowed: jpeg, png, webp. Got: ${req.file.mimetype}` },
        });
      }

      // Magic-byte validation
      if (!isImageMagicValid(req.file.buffer, req.file.mimetype)) {
        return res.status(400).json({
          error: 'File content does not match declared type',
          details: { magic: 'Magic bytes do not match declared MIME type' },
        });
      }

      // Process with sharp:
      //   - rotate(): apply EXIF orientation to pixels then strip the metadata
      //     (prevents portrait photos appearing sideways AND removes any
      //     residual EXIF such as GPS coordinates from the source file)
      //   - resize to max 1200px wide
      //   - re-encode as webp (sharp's default discards metadata; explicit
      //     rotate() upstream guarantees no orientation/GPS/camera fields leak)
      const processed = await sharp(req.file.buffer)
        .rotate()
        .resize({ width: 1200, withoutEnlargement: true })
        .webp({ quality: 82 })
        .toBuffer();

      // Generate filename
      const filename = `${req.user.id}-${space.id}-${recipeId}-${Date.now()}.webp`;
      const savePath = path.join(getCoversDir(), filename);

      // Ensure directory exists
      await fs.promises.mkdir(getCoversDir(), { recursive: true });

      // Write new file
      await fs.promises.writeFile(savePath, processed);

      // Delete old cover if exists
      await deleteOldCover(recipe.coverImage);

      // Update DB
      const coverUrl = `/uploads/recipes/${filename}`;
      await prisma.recipe.update({
        where: { id: recipe.id },
        data: { coverImage: coverUrl },
      });

      res.json({ url: coverUrl });
    } catch (err) {
      next(err);
    }
  },
);

// ---------------------------------------------------------------------------
// DELETE /:spaceId/recipes/:recipeId/cover
// ---------------------------------------------------------------------------

router.delete('/:spaceId/recipes/:recipeId/cover', async (req, res, next) => {
  try {
    // Defensive auth check
    if (!req.user || !req.user.id) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Owner check
    const space = await loadOwnedSpace(req.params.spaceId, req.user.id);
    if (!space) return res.status(404).json({ error: 'Space not found' });

    // Recipe ownership check
    const recipeId = parseInt(req.params.recipeId, 10);
    if (isNaN(recipeId)) return res.status(404).json({ error: 'Recipe not found' });

    const recipe = await prisma.recipe.findFirst({
      where: { id: recipeId, spaceId: space.id },
    });
    if (!recipe) return res.status(404).json({ error: 'Recipe not found' });

    // Unlink existing file gracefully
    await deleteOldCover(recipe.coverImage);

    // Clear DB
    await prisma.recipe.update({
      where: { id: recipe.id },
      data: { coverImage: null },
    });

    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
