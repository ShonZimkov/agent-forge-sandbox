import express from 'express';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const pkg = require('./package.json');

const app = express();
const PORT = 3000;

const tasks = [];
let nextId = 1;

const notes = [];
let nextNoteId = 1;

const normalizeTags = (tags) => [...new Set(tags.map(t => t.trim().toLowerCase()).filter(Boolean))];

app.use(express.json());

app.get('/', (req, res) => {
  res.json({ message: 'Agent Forge Sandbox - test project for AI agents' });
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok', uptime: process.uptime() });
});

app.get('/version', (req, res) => {
  res.json({ version: pkg.version, name: pkg.name });
});

app.post('/tasks', (req, res) => {
  const { title, description } = req.body;
  const task = {
    id: nextId++,
    title,
    description,
    completed: false,
    createdAt: new Date().toISOString(),
  };
  tasks.push(task);
  res.status(201).json(task);
});

app.get('/tasks', (req, res) => {
  res.json(tasks);
});

// --- Notes CRUD ---

const validateNoteId = (id) => {
  const parsed = Number(id);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
};

const validateTags = (tags) => {
  if (!Array.isArray(tags)) return false;
  return tags.every(t => typeof t === 'string');
};

app.post('/notes', (req, res) => {
  const { title, body, tags, pinned } = req.body;

  if (title === undefined || title === null || typeof title !== 'string' || title.trim() === '') {
    return res.status(400).json({ error: 'Title is required' });
  }
  if (title.length > 200) {
    return res.status(400).json({ error: 'Title must not exceed 200 characters' });
  }
  if (tags !== undefined && !validateTags(tags)) {
    return res.status(400).json({ error: 'Tags must be an array of strings' });
  }

  const now = new Date().toISOString();
  const note = {
    id: nextNoteId++,
    title: title.trim(),
    body: body !== undefined && body !== null ? String(body) : '',
    tags: tags ? normalizeTags(tags) : [],
    pinned: false,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
  };
  notes.push(note);
  res.status(201).json(note);
});

app.get('/notes/:id', (req, res) => {
  const id = validateNoteId(req.params.id);
  if (id === null) {
    return res.status(400).json({ error: 'Invalid note ID' });
  }

  const note = notes.find(n => n.id === id);
  if (!note || note.deletedAt !== null) {
    return res.status(404).json({ error: 'Note not found' });
  }

  res.json(note);
});

app.put('/notes/:id', (req, res) => {
  const id = validateNoteId(req.params.id);
  if (id === null) {
    return res.status(400).json({ error: 'Invalid note ID' });
  }

  const note = notes.find(n => n.id === id);
  if (!note || note.deletedAt !== null) {
    return res.status(404).json({ error: 'Note not found' });
  }

  const { title, body, tags } = req.body;

  if (title !== undefined) {
    if (typeof title !== 'string' || title.trim() === '') {
      return res.status(400).json({ error: 'Title is required' });
    }
    if (title.length > 200) {
      return res.status(400).json({ error: 'Title must not exceed 200 characters' });
    }
    note.title = title.trim();
  }

  if (tags !== undefined) {
    if (!validateTags(tags)) {
      return res.status(400).json({ error: 'Tags must be an array of strings' });
    }
    note.tags = normalizeTags(tags);
  }

  if (body !== undefined) {
    note.body = String(body);
  }

  note.updatedAt = new Date().toISOString();
  res.json(note);
});

app.delete('/notes/:id', (req, res) => {
  const id = validateNoteId(req.params.id);
  if (id === null) {
    return res.status(400).json({ error: 'Invalid note ID' });
  }

  const note = notes.find(n => n.id === id);
  if (!note || note.deletedAt !== null) {
    return res.status(404).json({ error: 'Note not found' });
  }

  note.deletedAt = new Date().toISOString();
  res.json({ message: 'Note deleted' });
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
