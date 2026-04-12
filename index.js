import express from 'express';

const app = express();
const PORT = 3000;

app.get('/', (req, res) => {
  res.json({ message: 'Agent Forge Sandbox - test project for AI agents' });
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok', uptime: process.uptime() });
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
