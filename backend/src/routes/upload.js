const express = require('express');
const multer = require('multer');
const pdfParse = require('pdf-parse');

const router = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
});

router.post('/', upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: '파일이 없습니다.' });

  const { mimetype, originalname, buffer } = req.file;

  try {
    if (mimetype.startsWith('image/')) {
      return res.json({
        type: 'image',
        mimeType: mimetype,
        filename: originalname,
        content: buffer.toString('base64'),
      });
    }

    if (mimetype === 'application/pdf') {
      const data = await pdfParse(buffer);
      return res.json({
        type: 'pdf',
        mimeType: mimetype,
        filename: originalname,
        content: data.text,
      });
    }

    return res.json({
      type: 'text',
      mimeType: mimetype,
      filename: originalname,
      content: buffer.toString('utf-8'),
    });
  } catch (err) {
    res.status(500).json({ error: `파일 처리 실패: ${err.message}` });
  }
});

module.exports = router;
