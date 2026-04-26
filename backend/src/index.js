require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { loadAgents } = require('./agentLoader');
const agentsRouter = require('./routes/agents');
const uploadRouter = require('./routes/upload');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors({
  origin: process.env.CORS_ORIGIN || 'http://localhost',
  methods: ['GET', 'POST'],
}));
app.use(express.json({ limit: '15mb' }));

loadAgents();

app.use('/api/agents', agentsRouter);
app.use('/api/upload', uploadRouter);

app.listen(PORT, () => {
  console.log(`AI Agent Hub backend running on http://localhost:${PORT}`);
});
