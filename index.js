import express from 'express';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const pkg = require('./package.json');

const app = express();
const PORT = 3000;

app.get('/', (req, res) => {
  res.json({ message: 'Agent Forge Sandbox - test project for AI agents' });
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok', uptime: process.uptime() });
});

app.get('/version', (req, res) => {
  res.json({ version: pkg.version, name: pkg.name });
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
