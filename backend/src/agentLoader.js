const fs = require('fs');
const path = require('path');

const agentsDir = path.join(__dirname, 'agents');
const registry = new Map();

function loadAgents() {
  // Clear registry before re-scanning to prevent double-registration on hot reload
  registry.clear();

  const files = fs.readdirSync(agentsDir).filter(
    (f) => f.endsWith('.js') && f !== 'base.js'
  );

  for (const file of files) {
    const AgentClass = require(path.join(agentsDir, file));
    const agent = new AgentClass();
    if (!agent.name) {
      console.warn(`[agentLoader] ${file} has no name, skipping.`);
      continue;
    }
    registry.set(agent.name, agent);
    console.log(`[agentLoader] Loaded agent: ${agent.name}`);
  }
}

function getAgent(name) {
  return registry.get(name) || null;
}

function listAgents() {
  return Array.from(registry.values()).map((a) => a.toJSON());
}

module.exports = { loadAgents, getAgent, listAgents };
