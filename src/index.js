require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const multer = require('multer');
const pdfParse = require('pdf-parse');
const { loadAgents, getAgent, listAgents } = require('./agentLoader');

const app = express();
const PORT = process.env.PORT || 3100;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
});

app.use(cors());
app.use(express.json({ limit: '15mb' }));
app.use(express.static(path.join(__dirname, '../static')));

loadAgents();

app.get('/api/agents', (req, res) => {
  res.json(listAgents());
});

app.post('/api/upload', upload.single('file'), async (req, res) => {
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

    // txt, md 등 텍스트
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

app.post('/api/agents/:name/preview', async (req, res) => {
  const agent = getAgent(req.params.name);
  if (!agent) return res.status(404).json({ error: `Agent "${req.params.name}" not found` });

  try {
    const result = await agent.preview(req.body);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/agents/:name/run', async (req, res) => {
  const agent = getAgent(req.params.name);
  if (!agent) return res.status(404).json({ error: `Agent "${req.params.name}" not found` });

  try {
    const result = await agent.run(req.body);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`AI Agent Hub running on http://localhost:${PORT}`);
});
