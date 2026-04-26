const express = require('express');
const { getAgent, listAgents } = require('../agentLoader');

const router = express.Router();

router.get('/', (req, res) => {
  res.json(listAgents());
});

router.post('/:name/preview', async (req, res) => {
  const agent = getAgent(req.params.name);
  if (!agent) return res.status(404).json({ error: `Agent "${req.params.name}" not found` });

  try {
    const result = await agent.preview(req.body);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/:name/run', async (req, res) => {
  const agent = getAgent(req.params.name);
  if (!agent) return res.status(404).json({ error: `Agent "${req.params.name}" not found` });

  try {
    const result = await agent.run(req.body);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
