import express from 'express';
import { createRequire } from 'module';
import { fetchIssues, fetchPullRequests, fetchRecentEvents } from './github.js';

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

// --- Dashboard ---

function parseCheckboxes(body) {
  if (!body) {
    return { done: 0, total: 0, percent: 0, subtasks: [] };
  }

  const matches = [...body.matchAll(/- \[(x| )\]\s*(.*)/g)];
  const subtasks = matches.map(m => ({
    title: m[2].trim(),
    completed: m[1] === 'x',
  }));

  const total = subtasks.length;
  const done = subtasks.filter(s => s.completed).length;
  const percent = total > 0 ? Math.round((done / total) * 100) : 0;

  return { done, total, percent, subtasks };
}

function isFeature(issue) {
  const hasFeatureLabel = issue.labels.some(
    l => l.name.toLowerCase() === 'feature'
  );
  const hasCheckboxes = issue.body && /- \[(x| )\]/.test(issue.body);
  return hasFeatureLabel || hasCheckboxes;
}

function mapStatus(issue) {
  if (issue.state === 'closed') return 'completed';

  const hasInProgressLabel = issue.labels.some(
    l => l.name.toLowerCase() === 'in progress' || l.name.toLowerCase() === 'in-progress'
  );
  if (issue.assignee || hasInProgressLabel) return 'in_progress';

  return 'upcoming';
}

function buildFeature(issue) {
  const { done, total, percent, subtasks } = parseCheckboxes(issue.body);
  return {
    id: issue.id,
    number: issue.number,
    title: issue.title,
    status: mapStatus(issue),
    html_url: issue.html_url,
    labels: issue.labels.map(l => l.name),
    progress: { done, total, percent },
    subtasks,
    assignee: issue.assignee ? issue.assignee.login : null,
    updatedAt: issue.updated_at,
  };
}

function describeEvent(event) {
  const actor = event.actor?.login ?? 'unknown';
  const repo = event.repo?.name ?? '';

  switch (event.type) {
    case 'IssuesEvent': {
      const action = event.payload?.action ?? 'updated';
      const title = event.payload?.issue?.title ?? '';
      return {
        type: 'IssuesEvent',
        actor,
        description: `${actor} ${action} issue "${title}"`,
        url: event.payload?.issue?.html_url ?? null,
        timestamp: event.created_at,
      };
    }
    case 'PullRequestEvent': {
      const action = event.payload?.action ?? 'updated';
      const title = event.payload?.pull_request?.title ?? '';
      return {
        type: 'PullRequestEvent',
        actor,
        description: `${actor} ${action} PR "${title}"`,
        url: event.payload?.pull_request?.html_url ?? null,
        timestamp: event.created_at,
      };
    }
    case 'PushEvent': {
      const count = event.payload?.size ?? 0;
      return {
        type: 'PushEvent',
        actor,
        description: `${actor} pushed ${count} commit${count !== 1 ? 's' : ''} to ${repo}`,
        url: null,
        timestamp: event.created_at,
      };
    }
    case 'IssueCommentEvent': {
      const title = event.payload?.issue?.title ?? '';
      return {
        type: 'IssueCommentEvent',
        actor,
        description: `${actor} commented on "${title}"`,
        url: event.payload?.comment?.html_url ?? null,
        timestamp: event.created_at,
      };
    }
    default:
      return {
        type: event.type ?? 'UnknownEvent',
        actor,
        description: `${actor} performed ${event.type ?? 'an action'} on ${repo}`,
        url: null,
        timestamp: event.created_at,
      };
  }
}

app.get('/api/dashboard', async (req, res) => {
  try {
    const [issues, pullRequests, events] = await Promise.all([
      fetchIssues(),
      fetchPullRequests(),
      fetchRecentEvents(),
    ]);

    const features = issues.filter(isFeature).map(buildFeature);

    const grouped = {
      inProgress: features.filter(f => f.status === 'in_progress'),
      completed: features.filter(f => f.status === 'completed'),
      upcoming: features.filter(f => f.status === 'upcoming'),
    };

    const activity = events
      .map(describeEvent)
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
      .slice(0, 15);

    res.json({
      features: grouped,
      activity,
      fetchedAt: new Date().toISOString(),
    });
  } catch (err) {
    res.status(502).json({
      error: 'Failed to fetch data from GitHub',
      details: err.message,
    });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
