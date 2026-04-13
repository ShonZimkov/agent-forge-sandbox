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

const columns = [
  { id: 1, name: 'Ideas', order: 0 },
  { id: 2, name: 'In Progress', order: 1 },
  { id: 3, name: 'Done', order: 2 },
];
let nextColumnId = 4;

const cards = [];
let nextCardId = 1;

const VALID_CARD_COLORS = ['red', 'blue', 'green', 'yellow', 'purple', 'gray'];

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

app.get('/hello', (req, res) => {
  res.json({ message: 'Hello from Agent Forge!' });
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

// --- Board: Columns ---

const validateColumnId = (id) => {
  const parsed = Number(id);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
};

app.get('/board/columns', (req, res) => {
  const sorted = [...columns].sort((a, b) => a.order - b.order);
  res.json({ columns: sorted });
});

app.post('/board/columns', (req, res) => {
  const { name } = req.body;

  if (name === undefined || name === null || typeof name !== 'string' || name.trim() === '') {
    return res.status(400).json({ error: 'Column name is required' });
  }
  if (name.length > 50) {
    return res.status(400).json({ error: 'Column name must not exceed 50 characters' });
  }

  const trimmedName = name.trim();
  const duplicate = columns.find(c => c.name === trimmedName);
  if (duplicate) {
    return res.status(409).json({ error: 'A column with that name already exists' });
  }

  const maxOrder = columns.length > 0 ? Math.max(...columns.map(c => c.order)) : -1;
  const column = {
    id: nextColumnId++,
    name: trimmedName,
    order: maxOrder + 1,
  };
  columns.push(column);
  res.status(201).json(column);
});

app.patch('/board/columns/:id/reorder', (req, res) => {
  const id = validateColumnId(req.params.id);
  if (id === null) {
    return res.status(400).json({ error: 'Invalid column ID' });
  }

  const column = columns.find(c => c.id === id);
  if (!column) {
    return res.status(404).json({ error: 'Column not found' });
  }

  const { order } = req.body;
  if (order === undefined || order === null || typeof order !== 'number' || !Number.isInteger(order) || order < 0) {
    return res.status(400).json({ error: 'Order must be a non-negative integer' });
  }

  const oldOrder = column.order;
  const newOrder = order;

  if (newOrder !== oldOrder) {
    if (newOrder > oldOrder) {
      // Moving down: shift items between old+1..new up by one
      for (const c of columns) {
        if (c.id !== id && c.order > oldOrder && c.order <= newOrder) {
          c.order--;
        }
      }
    } else {
      // Moving up: shift items between new..old-1 down by one
      for (const c of columns) {
        if (c.id !== id && c.order >= newOrder && c.order < oldOrder) {
          c.order++;
        }
      }
    }
    column.order = newOrder;
  }

  const sorted = [...columns].sort((a, b) => a.order - b.order);
  res.json({ columns: sorted });
});

// --- Board: Cards ---

const validateCardId = (id) => {
  const parsed = Number(id);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
};

app.post('/board/cards', (req, res) => {
  const { title, content, column, color, position } = req.body;

  if (title === undefined || title === null || typeof title !== 'string' || title.trim() === '') {
    return res.status(400).json({ error: 'Title is required' });
  }
  if (title.length > 200) {
    return res.status(400).json({ error: 'Title must not exceed 200 characters' });
  }
  if (color !== undefined && !VALID_CARD_COLORS.includes(color)) {
    return res.status(400).json({ error: 'Color must be one of: ' + VALID_CARD_COLORS.join(', ') });
  }

  const cardColumn = column !== undefined ? column : 'Ideas';
  const matchedColumn = columns.find(c => c.name === cardColumn);
  if (!matchedColumn) {
    return res.status(400).json({ error: 'Column does not exist' });
  }

  const cardsInColumn = cards.filter(c => c.column === cardColumn);
  const cardPosition = position !== undefined ? position :
    (cardsInColumn.length > 0 ? Math.max(...cardsInColumn.map(c => c.position)) + 1 : 0);

  const now = new Date().toISOString();
  const card = {
    id: nextCardId++,
    title: title.trim(),
    content: content !== undefined && content !== null ? String(content) : '',
    column: cardColumn,
    color: color !== undefined ? color : 'gray',
    position: cardPosition,
    createdAt: now,
    updatedAt: now,
  };
  cards.push(card);
  res.status(201).json(card);
});

app.get('/board/cards', (req, res) => {
  const grouped = {};
  for (const col of columns) {
    grouped[col.name] = cards
      .filter(c => c.column === col.name)
      .sort((a, b) => a.position - b.position);
  }
  res.json({ columns: grouped });
});

app.patch('/board/cards/:id', (req, res) => {
  const id = validateCardId(req.params.id);
  if (id === null) {
    return res.status(400).json({ error: 'Invalid card ID' });
  }

  const card = cards.find(c => c.id === id);
  if (!card) {
    return res.status(404).json({ error: 'Card not found' });
  }

  const { title, content, column, color, position } = req.body;

  if (title !== undefined) {
    if (typeof title !== 'string' || title.trim() === '') {
      return res.status(400).json({ error: 'Title is required' });
    }
    if (title.length > 200) {
      return res.status(400).json({ error: 'Title must not exceed 200 characters' });
    }
    card.title = title.trim();
  }

  if (color !== undefined) {
    if (!VALID_CARD_COLORS.includes(color)) {
      return res.status(400).json({ error: 'Color must be one of: ' + VALID_CARD_COLORS.join(', ') });
    }
    card.color = color;
  }

  if (column !== undefined) {
    const matchedColumn = columns.find(c => c.name === column);
    if (!matchedColumn) {
      return res.status(400).json({ error: 'Column does not exist' });
    }
    const movingColumns = column !== card.column;
    card.column = column;

    if (movingColumns && position === undefined) {
      // Append to end of target column
      const cardsInTarget = cards.filter(c => c.column === column && c.id !== id);
      card.position = cardsInTarget.length > 0 ? Math.max(...cardsInTarget.map(c => c.position)) + 1 : 0;
    }
  }

  if (content !== undefined) {
    card.content = String(content);
  }

  if (position !== undefined) {
    card.position = position;
  }

  card.updatedAt = new Date().toISOString();
  res.json(card);
});

app.delete('/board/cards/:id', (req, res) => {
  const id = validateCardId(req.params.id);
  if (id === null) {
    return res.status(400).json({ error: 'Invalid card ID' });
  }

  const index = cards.findIndex(c => c.id === id);
  if (index === -1) {
    return res.status(404).json({ error: 'Card not found' });
  }

  cards.splice(index, 1);
  res.status(204).send();
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

// --- HTML Dashboard ---

function buildDashboardHTML() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Agent Forge — Dashboard</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

    :root {
      --color-bg: #f8fafc;
      --color-surface: #ffffff;
      --color-text: #1e293b;
      --color-text-muted: #64748b;
      --color-border: #e2e8f0;
      --color-green: #22c55e;
      --color-yellow: #eab308;
      --color-gray: #9ca3af;
      --color-blue: #3b82f6;
      --color-red: #ef4444;
      --color-purple: #8b5cf6;
      --shadow-sm: 0 1px 2px rgba(0,0,0,0.05);
      --shadow-md: 0 4px 6px -1px rgba(0,0,0,0.07), 0 2px 4px -2px rgba(0,0,0,0.05);
      --radius: 8px;
      --font-stack: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
    }

    body {
      font-family: var(--font-stack);
      background: var(--color-bg);
      color: var(--color-text);
      line-height: 1.6;
      min-height: 100vh;
    }

    .container {
      max-width: 960px;
      margin: 0 auto;
      padding: 24px 16px;
    }

    /* Header */
    .header {
      text-align: center;
      margin-bottom: 32px;
    }
    .header h1 {
      font-size: 1.75rem;
      font-weight: 700;
      margin-bottom: 4px;
    }
    .header .updated {
      color: var(--color-text-muted);
      font-size: 0.85rem;
    }

    /* Loading / Error states */
    .state-message {
      text-align: center;
      padding: 64px 16px;
    }
    .spinner {
      width: 36px;
      height: 36px;
      border: 3px solid var(--color-border);
      border-top-color: var(--color-blue);
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
      margin: 0 auto 16px;
    }
    @keyframes spin { to { transform: rotate(360deg); } }
    .error-text { color: var(--color-red); font-weight: 600; margin-bottom: 12px; }
    .retry-btn {
      padding: 10px 24px;
      background: var(--color-blue);
      color: #fff;
      border: none;
      border-radius: var(--radius);
      font-size: 0.9rem;
      cursor: pointer;
      min-height: 44px;
      min-width: 44px;
    }
    .retry-btn:hover { opacity: 0.9; }

    /* Sections */
    .section { margin-bottom: 32px; }
    .section-title {
      font-size: 1.15rem;
      font-weight: 600;
      margin-bottom: 12px;
      padding-bottom: 8px;
      border-bottom: 2px solid var(--color-border);
    }
    .empty-msg {
      color: var(--color-text-muted);
      font-style: italic;
      padding: 16px 0;
    }

    /* Feature cards */
    .card-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
      gap: 16px;
    }
    .card {
      background: var(--color-surface);
      border: 1px solid var(--color-border);
      border-radius: var(--radius);
      padding: 16px;
      box-shadow: var(--shadow-sm);
      transition: box-shadow 0.15s;
    }
    .card:hover { box-shadow: var(--shadow-md); }
    .card-title a {
      color: var(--color-text);
      text-decoration: none;
      font-weight: 600;
      font-size: 0.95rem;
    }
    .card-title a:hover { color: var(--color-blue); text-decoration: underline; }
    .card-assignee {
      color: var(--color-text-muted);
      font-size: 0.8rem;
      margin-top: 4px;
    }

    /* Progress bar */
    .progress-wrap { margin-top: 10px; }
    .progress-bar-bg {
      width: 100%;
      height: 8px;
      background: var(--color-border);
      border-radius: 4px;
      overflow: hidden;
    }
    .progress-bar-fill {
      height: 100%;
      border-radius: 4px;
      transition: width 0.3s;
    }
    .progress-text {
      font-size: 0.78rem;
      color: var(--color-text-muted);
      margin-top: 4px;
    }

    /* Subtask details */
    .subtask-details {
      margin-top: 10px;
      font-size: 0.85rem;
    }
    .subtask-details summary {
      cursor: pointer;
      color: var(--color-text-muted);
      user-select: none;
      min-height: 44px;
      display: flex;
      align-items: center;
    }
    .subtask-details summary:hover { color: var(--color-text); }
    .subtask-list {
      list-style: none;
      margin-top: 6px;
      padding-left: 4px;
    }
    .subtask-list li {
      padding: 3px 0;
      display: flex;
      align-items: flex-start;
      gap: 6px;
    }
    .subtask-list li.done { color: var(--color-text-muted); text-decoration: line-through; }
    .subtask-check { flex-shrink: 0; }

    /* Activity timeline */
    .timeline { position: relative; padding-left: 28px; }
    .timeline::before {
      content: '';
      position: absolute;
      left: 10px;
      top: 4px;
      bottom: 4px;
      width: 2px;
      background: var(--color-border);
    }
    .timeline-item {
      position: relative;
      padding-bottom: 20px;
    }
    .timeline-icon {
      position: absolute;
      left: -28px;
      top: 2px;
      width: 20px;
      height: 20px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 0.75rem;
      background: var(--color-surface);
      border-radius: 50%;
      z-index: 1;
    }
    .timeline-actor {
      font-weight: 600;
      font-size: 0.85rem;
    }
    .timeline-desc {
      font-size: 0.85rem;
      color: var(--color-text-muted);
      margin-top: 2px;
    }
    .timeline-desc a { color: var(--color-blue); text-decoration: none; }
    .timeline-desc a:hover { text-decoration: underline; }
    .timeline-time {
      font-size: 0.75rem;
      color: var(--color-gray);
      margin-top: 2px;
    }

    /* Responsive */
    @media (max-width: 768px) {
      .card-grid {
        grid-template-columns: 1fr;
      }
      .header h1 { font-size: 1.4rem; }
      .container { padding: 16px 12px; }
    }
  </style>
</head>
<body>
  <div class="container">
    <div id="app">
      <div class="state-message">
        <div class="spinner"></div>
        <p>Loading dashboard\u2026</p>
      </div>
    </div>
  </div>

  <script>
    (function() {
      var REFRESH_MS = 5 * 60 * 1000;
      var appEl = document.getElementById('app');

      function relativeTime(iso) {
        if (!iso) return '';
        var diff = (Date.now() - new Date(iso).getTime()) / 1000;
        if (diff < 0) diff = 0;
        if (diff < 60) return 'just now';
        if (diff < 3600) {
          var m = Math.floor(diff / 60);
          return m + ' minute' + (m !== 1 ? 's' : '') + ' ago';
        }
        if (diff < 86400) {
          var h = Math.floor(diff / 3600);
          return h + ' hour' + (h !== 1 ? 's' : '') + ' ago';
        }
        var d = Math.floor(diff / 86400);
        return d + ' day' + (d !== 1 ? 's' : '') + ' ago';
      }

      function escapeHTML(str) {
        if (!str) return '';
        return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
      }

      function progressColor(percent, total) {
        if (total === 0) return 'var(--color-gray)';
        if (percent > 60) return 'var(--color-green)';
        if (percent >= 30) return 'var(--color-yellow)';
        return 'var(--color-gray)';
      }

      function eventIcon(type) {
        switch (type) {
          case 'IssuesEvent': return '\\u{1F4CB}';
          case 'PullRequestEvent': return '\\u{1F500}';
          case 'PushEvent': return '\\u{1F680}';
          case 'IssueCommentEvent': return '\\u{1F4AC}';
          default: return '\\u{26A1}';
        }
      }

      function renderCard(f) {
        var color = progressColor(f.progress.percent, f.progress.total);
        var assigneeHTML = f.assignee
          ? '<div class="card-assignee">Assigned to ' + escapeHTML(f.assignee) + '</div>'
          : '';

        var progressHTML = '';
        if (f.progress.total > 0) {
          progressHTML = '<div class="progress-wrap">' +
            '<div class="progress-bar-bg"><div class="progress-bar-fill" style="width:' + f.progress.percent + '%;background:' + color + '"></div></div>' +
            '<div class="progress-text">' + f.progress.done + ' of ' + f.progress.total + ' tasks done</div>' +
            '</div>';
        }

        var subtaskHTML = '';
        if (f.subtasks && f.subtasks.length > 0) {
          var items = f.subtasks.map(function(s) {
            var cls = s.completed ? ' class="done"' : '';
            var check = s.completed ? '\\u2611' : '\\u2610';
            return '<li' + cls + '><span class="subtask-check">' + check + '</span> ' + escapeHTML(s.title) + '</li>';
          }).join('');
          subtaskHTML = '<details class="subtask-details"><summary>Show sub-tasks (' + f.subtasks.length + ')</summary><ul class="subtask-list">' + items + '</ul></details>';
        }

        return '<div class="card">' +
          '<div class="card-title"><a href="' + escapeHTML(f.html_url) + '" target="_blank" rel="noopener">' + escapeHTML(f.title) + '</a></div>' +
          assigneeHTML + progressHTML + subtaskHTML +
          '</div>';
      }

      function renderSection(title, features, emptyMsg) {
        var body = '';
        if (features.length === 0) {
          body = '<p class="empty-msg">' + escapeHTML(emptyMsg) + '</p>';
        } else {
          body = '<div class="card-grid">' + features.map(renderCard).join('') + '</div>';
        }
        return '<div class="section"><h2 class="section-title">' + title + '</h2>' + body + '</div>';
      }

      function renderTimeline(activity) {
        if (activity.length === 0) {
          return '<div class="section"><h2 class="section-title">\\u{1F4E1} Recent Activity</h2><p class="empty-msg">No recent activity</p></div>';
        }
        var items = activity.map(function(a) {
          var linkStart = a.url ? '<a href="' + escapeHTML(a.url) + '" target="_blank" rel="noopener">' : '';
          var linkEnd = a.url ? '</a>' : '';
          return '<div class="timeline-item">' +
            '<div class="timeline-icon">' + eventIcon(a.type) + '</div>' +
            '<div class="timeline-actor">' + escapeHTML(a.actor) + '</div>' +
            '<div class="timeline-desc">' + linkStart + escapeHTML(a.description) + linkEnd + '</div>' +
            '<div class="timeline-time">' + relativeTime(a.timestamp) + '</div>' +
            '</div>';
        }).join('');
        return '<div class="section"><h2 class="section-title">\\u{1F4E1} Recent Activity</h2><div class="timeline">' + items + '</div></div>';
      }

      function render(data) {
        var html = '<div class="header"><h1>Agent Forge</h1>' +
          '<p class="updated">Last updated: ' + relativeTime(data.fetchedAt) + '</p></div>';
        html += renderSection('\\u{1F6A7} In Progress', data.features.inProgress, 'No features in progress');
        html += renderSection('\\u2705 Completed', data.features.completed, 'No completed features');
        html += renderSection('\\u{1F4CB} Upcoming', data.features.upcoming, 'No upcoming features');
        html += renderTimeline(data.activity);
        appEl.innerHTML = html;
      }

      function showError(msg) {
        appEl.innerHTML = '<div class="state-message">' +
          '<p class="error-text">' + escapeHTML(msg) + '</p>' +
          '<button class="retry-btn" onclick="window.__dashRetry()">Retry</button>' +
          '</div>';
      }

      function fetchDashboard() {
        fetch('/api/dashboard')
          .then(function(res) {
            if (!res.ok) throw new Error('Server returned ' + res.status);
            return res.json();
          })
          .then(render)
          .catch(function(err) {
            showError('Failed to load dashboard data. ' + (err.message || ''));
          });
      }

      window.__dashRetry = fetchDashboard;
      fetchDashboard();
      setInterval(fetchDashboard, REFRESH_MS);
    })();
  </script>
</body>
</html>`;
}

app.get('/dashboard', (req, res) => {
  res.type('html').send(buildDashboardHTML());
});

function buildBoardHTML() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Collaboration Board</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

    :root {
      --color-bg: #f1f5f9;
      --color-surface: #ffffff;
      --color-text: #1e293b;
      --color-text-muted: #64748b;
      --color-border: #e2e8f0;
      --color-red: #ef4444;
      --color-blue: #3b82f6;
      --color-green: #22c55e;
      --color-yellow: #eab308;
      --color-purple: #8b5cf6;
      --color-gray: #9ca3af;
      --shadow-sm: 0 1px 2px rgba(0,0,0,0.05);
      --shadow-md: 0 4px 6px -1px rgba(0,0,0,0.07), 0 2px 4px -2px rgba(0,0,0,0.05);
      --radius: 8px;
      --font-stack: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
    }

    body {
      font-family: var(--font-stack);
      background: var(--color-bg);
      color: var(--color-text);
      line-height: 1.6;
      min-height: 100vh;
    }

    /* Header */
    .board-header {
      background: #1e293b;
      color: #ffffff;
      padding: 16px 24px;
      font-size: 1.25rem;
      font-weight: 700;
    }

    /* Error banner */
    .error-banner {
      display: none;
      background: #fef2f2;
      border: 1px solid var(--color-red);
      color: #991b1b;
      padding: 12px 24px;
      font-size: 0.95rem;
    }
    .error-banner.visible { display: block; }

    /* Board layout */
    .board-container {
      display: flex;
      gap: 16px;
      padding: 24px;
      overflow-x: auto;
      align-items: flex-start;
      min-height: calc(100vh - 60px);
    }

    /* Column */
    .column {
      background: #e2e8f0;
      border-radius: var(--radius);
      min-width: 280px;
      max-width: 320px;
      flex: 1 0 280px;
      display: flex;
      flex-direction: column;
    }
    .column-header {
      padding: 12px 16px;
      font-weight: 600;
      font-size: 0.95rem;
      color: var(--color-text);
      border-bottom: 1px solid #cbd5e1;
    }
    .column-header .card-count {
      color: var(--color-text-muted);
      font-weight: 400;
    }
    .column-body {
      padding: 8px;
      display: flex;
      flex-direction: column;
      gap: 8px;
      min-height: 60px;
    }

    /* Empty state */
    .empty-placeholder {
      color: var(--color-text-muted);
      font-size: 0.85rem;
      text-align: center;
      padding: 20px 8px;
      font-style: italic;
    }

    /* Card */
    .card {
      background: var(--color-surface);
      border-radius: var(--radius);
      box-shadow: var(--shadow-md);
      padding: 12px 14px;
      border-left: 4px solid var(--color-gray);
    }
    .card[data-color="red"]    { border-left-color: var(--color-red); }
    .card[data-color="blue"]   { border-left-color: var(--color-blue); }
    .card[data-color="green"]  { border-left-color: var(--color-green); }
    .card[data-color="yellow"] { border-left-color: var(--color-yellow); }
    .card[data-color="purple"] { border-left-color: var(--color-purple); }
    .card[data-color="gray"]   { border-left-color: var(--color-gray); }

    .card-title {
      font-weight: 600;
      font-size: 0.9rem;
      margin-bottom: 6px;
      color: var(--color-text);
    }
    .card-content {
      font-size: 0.85rem;
      color: #334155;
      line-height: 1.5;
    }

    /* Markdown content styles */
    .card-content h1, .card-content h2, .card-content h3,
    .card-content h4, .card-content h5, .card-content h6 {
      margin: 8px 0 4px 0;
      line-height: 1.3;
    }
    .card-content h1 { font-size: 1.1rem; }
    .card-content h2 { font-size: 1rem; }
    .card-content h3 { font-size: 0.95rem; }
    .card-content p { margin: 4px 0; }
    .card-content ul, .card-content ol {
      margin: 4px 0;
      padding-left: 20px;
    }
    .card-content a {
      color: var(--color-blue);
      text-decoration: underline;
    }
    .card-content code {
      background: #f1f5f9;
      padding: 1px 4px;
      border-radius: 3px;
      font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace;
      font-size: 0.82rem;
    }
    .card-content pre {
      background: #1e293b;
      color: #e2e8f0;
      padding: 10px 12px;
      border-radius: 6px;
      overflow-x: auto;
      margin: 6px 0;
    }
    .card-content pre code {
      background: none;
      padding: 0;
      color: inherit;
      font-size: 0.8rem;
    }
    .card-content strong { font-weight: 600; }
    .card-content em { font-style: italic; }

    /* Loading state */
    .loading {
      text-align: center;
      padding: 40px;
      color: var(--color-text-muted);
      font-size: 0.95rem;
    }

    /* Clickable card */
    .card { cursor: pointer; transition: box-shadow 0.15s; }
    .card:hover { box-shadow: var(--shadow-md), 0 0 0 2px var(--color-blue); }
    .card.editing { cursor: default; }
    .card.editing:hover { box-shadow: var(--shadow-md); }

    /* Floating action button */
    .fab {
      position: fixed;
      bottom: 24px;
      right: 24px;
      width: 56px;
      height: 56px;
      border-radius: 50%;
      background: var(--color-blue);
      color: #ffffff;
      border: none;
      font-size: 1.8rem;
      line-height: 1;
      cursor: pointer;
      box-shadow: 0 4px 12px rgba(59,130,246,0.4);
      z-index: 100;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: background 0.15s, transform 0.15s;
    }
    .fab:hover { background: #2563eb; transform: scale(1.05); }

    /* Modal overlay */
    .modal-overlay {
      position: fixed;
      inset: 0;
      background: rgba(0,0,0,0.5);
      z-index: 200;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .modal {
      background: var(--color-surface);
      border-radius: var(--radius);
      box-shadow: 0 20px 60px rgba(0,0,0,0.3);
      padding: 24px;
      width: 480px;
      max-width: 90vw;
      max-height: 90vh;
      overflow-y: auto;
    }
    .modal h2 {
      font-size: 1.1rem;
      margin-bottom: 16px;
      color: var(--color-text);
    }
    .modal-field {
      margin-bottom: 14px;
    }
    .modal-field label {
      display: block;
      font-size: 0.85rem;
      font-weight: 600;
      margin-bottom: 4px;
      color: var(--color-text);
    }
    .modal-field input[type="text"],
    .modal-field select,
    .modal-field textarea {
      width: 100%;
      padding: 8px 10px;
      border: 1px solid var(--color-border);
      border-radius: 6px;
      font-size: 0.9rem;
      font-family: var(--font-stack);
      color: var(--color-text);
      background: var(--color-surface);
    }
    .modal-field textarea {
      font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace;
      min-height: 80px;
      resize: vertical;
    }
    .modal-field input:focus,
    .modal-field select:focus,
    .modal-field textarea:focus {
      outline: none;
      border-color: var(--color-blue);
      box-shadow: 0 0 0 2px rgba(59,130,246,0.2);
    }
    .modal-error {
      color: #dc2626;
      font-size: 0.82rem;
      margin-top: 4px;
    }
    .modal-actions {
      display: flex;
      gap: 8px;
      justify-content: flex-end;
      margin-top: 18px;
    }

    /* Color swatches */
    .color-swatches {
      display: flex;
      gap: 8px;
    }
    .color-swatch {
      width: 28px;
      height: 28px;
      border-radius: 50%;
      border: 3px solid transparent;
      cursor: pointer;
      transition: border-color 0.15s, transform 0.15s;
    }
    .color-swatch:hover { transform: scale(1.15); }
    .color-swatch.selected { border-color: var(--color-text); }
    .color-swatch[data-color="red"]    { background: var(--color-red); }
    .color-swatch[data-color="blue"]   { background: var(--color-blue); }
    .color-swatch[data-color="green"]  { background: var(--color-green); }
    .color-swatch[data-color="yellow"] { background: var(--color-yellow); }
    .color-swatch[data-color="purple"] { background: var(--color-purple); }
    .color-swatch[data-color="gray"]   { background: var(--color-gray); }

    /* Buttons */
    .btn {
      padding: 8px 16px;
      border: none;
      border-radius: 6px;
      font-size: 0.85rem;
      font-weight: 600;
      cursor: pointer;
      font-family: var(--font-stack);
      transition: background 0.15s;
    }
    .btn-primary { background: var(--color-blue); color: #fff; }
    .btn-primary:hover { background: #2563eb; }
    .btn-secondary { background: #e2e8f0; color: var(--color-text); }
    .btn-secondary:hover { background: #cbd5e1; }
    .btn-danger { background: var(--color-red); color: #fff; }
    .btn-danger:hover { background: #dc2626; }
    .btn-danger-text { background: none; color: var(--color-red); padding: 4px 8px; font-size: 0.78rem; }
    .btn-danger-text:hover { background: #fef2f2; }

    /* Inline editing */
    .card-edit-title {
      width: 100%;
      padding: 4px 6px;
      border: 1px solid var(--color-border);
      border-radius: 4px;
      font-size: 0.9rem;
      font-weight: 600;
      font-family: var(--font-stack);
      color: var(--color-text);
      margin-bottom: 6px;
    }
    .card-edit-title:focus {
      outline: none;
      border-color: var(--color-blue);
      box-shadow: 0 0 0 2px rgba(59,130,246,0.2);
    }
    .card-edit-textarea {
      width: 100%;
      padding: 8px;
      border: 1px solid var(--color-border);
      border-radius: 4px;
      font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace;
      font-size: 0.82rem;
      color: var(--color-text);
      resize: vertical;
      min-height: 60px;
      line-height: 1.5;
    }
    .card-edit-textarea:focus {
      outline: none;
      border-color: var(--color-blue);
      box-shadow: 0 0 0 2px rgba(59,130,246,0.2);
    }
    .card-edit-actions {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-top: 8px;
    }
    .card-edit-actions .right-actions {
      display: flex;
      gap: 6px;
    }
    .card-edit-error {
      color: #dc2626;
      font-size: 0.78rem;
      margin-top: 4px;
    }
  </style>
</head>
<body>
  <div class="board-header">Collaboration Board</div>
  <div id="error-banner" class="error-banner"></div>
  <div id="board" class="board-container">
    <div class="loading">Loading board\u2026</div>
  </div>
  <button class="fab" id="fab-create" title="Create new card">+</button>

  <script src="https://cdn.jsdelivr.net/npm/marked/marked.min.js"><\/script>
  <script src="https://cdn.jsdelivr.net/npm/dompurify/dist/purify.min.js"><\/script>
  <script>
    (function() {
      var boardEl = document.getElementById('board');
      var errorEl = document.getElementById('error-banner');
      var fabEl = document.getElementById('fab-create');

      // Cached board data for re-rendering and editing
      var cachedColumns = [];
      var cachedCardsByColumn = {};
      var editingCardId = null;

      function showError(msg) {
        errorEl.textContent = msg;
        errorEl.classList.add('visible');
      }

      function hideError() {
        errorEl.classList.remove('visible');
        errorEl.textContent = '';
      }

      function escapeHTML(str) {
        var div = document.createElement('div');
        div.appendChild(document.createTextNode(str));
        return div.innerHTML;
      }

      function renderMarkdown(md) {
        if (!md) return '';
        try {
          var raw = marked.parse(md);
          return DOMPurify.sanitize(raw);
        } catch (e) {
          return escapeHTML(md);
        }
      }

      // Find a card by id across all columns
      function findCard(cardId) {
        for (var colName in cachedCardsByColumn) {
          var cards = cachedCardsByColumn[colName];
          for (var i = 0; i < cards.length; i++) {
            if (cards[i].id === cardId) return cards[i];
          }
        }
        return null;
      }

      // Auto-grow textarea to fit content
      function autoGrow(textarea) {
        textarea.style.height = 'auto';
        textarea.style.height = Math.max(textarea.scrollHeight, 60) + 'px';
      }

      // ── Create Modal ──

      function openCreateModal() {
        // Close any editing card first
        if (editingCardId !== null) {
          cancelEditing();
        }

        var overlay = document.createElement('div');
        overlay.className = 'modal-overlay';
        overlay.id = 'create-modal';

        var modal = document.createElement('div');
        modal.className = 'modal';

        var title = document.createElement('h2');
        title.textContent = 'Create Card';
        modal.appendChild(title);

        // Title field
        var titleField = document.createElement('div');
        titleField.className = 'modal-field';
        var titleLabel = document.createElement('label');
        titleLabel.textContent = 'Title *';
        titleLabel.setAttribute('for', 'create-title');
        var titleInput = document.createElement('input');
        titleInput.type = 'text';
        titleInput.id = 'create-title';
        titleInput.placeholder = 'Card title';
        titleInput.maxLength = 200;
        var titleError = document.createElement('div');
        titleError.className = 'modal-error';
        titleError.id = 'create-title-error';
        titleField.appendChild(titleLabel);
        titleField.appendChild(titleInput);
        titleField.appendChild(titleError);
        modal.appendChild(titleField);

        // Column dropdown
        var colField = document.createElement('div');
        colField.className = 'modal-field';
        var colLabel = document.createElement('label');
        colLabel.textContent = 'Column';
        colLabel.setAttribute('for', 'create-column');
        var colSelect = document.createElement('select');
        colSelect.id = 'create-column';
        cachedColumns.forEach(function(col) {
          var opt = document.createElement('option');
          opt.value = col.name;
          opt.textContent = col.name;
          if (col.name === 'Ideas') opt.selected = true;
          colSelect.appendChild(opt);
        });
        colField.appendChild(colLabel);
        colField.appendChild(colSelect);
        modal.appendChild(colField);

        // Color picker
        var colorField = document.createElement('div');
        colorField.className = 'modal-field';
        var colorLabel = document.createElement('label');
        colorLabel.textContent = 'Color';
        colorField.appendChild(colorLabel);
        var swatches = document.createElement('div');
        swatches.className = 'color-swatches';
        var selectedColor = 'gray';
        var colors = ['red', 'blue', 'green', 'yellow', 'purple', 'gray'];
        colors.forEach(function(c) {
          var sw = document.createElement('div');
          sw.className = 'color-swatch' + (c === selectedColor ? ' selected' : '');
          sw.setAttribute('data-color', c);
          sw.title = c;
          sw.addEventListener('click', function() {
            selectedColor = c;
            swatches.querySelectorAll('.color-swatch').forEach(function(s) {
              s.classList.remove('selected');
            });
            sw.classList.add('selected');
          });
          swatches.appendChild(sw);
        });
        colorField.appendChild(swatches);
        modal.appendChild(colorField);

        // Content textarea
        var contentField = document.createElement('div');
        contentField.className = 'modal-field';
        var contentLabel = document.createElement('label');
        contentLabel.textContent = 'Content (markdown)';
        contentLabel.setAttribute('for', 'create-content');
        var contentInput = document.createElement('textarea');
        contentInput.id = 'create-content';
        contentInput.placeholder = 'Card content (supports markdown)';
        contentInput.rows = 4;
        contentField.appendChild(contentLabel);
        contentField.appendChild(contentInput);
        modal.appendChild(contentField);

        // API error display
        var apiError = document.createElement('div');
        apiError.className = 'modal-error';
        apiError.id = 'create-api-error';
        modal.appendChild(apiError);

        // Actions
        var actions = document.createElement('div');
        actions.className = 'modal-actions';
        var cancelBtn = document.createElement('button');
        cancelBtn.className = 'btn btn-secondary';
        cancelBtn.textContent = 'Cancel';
        cancelBtn.type = 'button';
        cancelBtn.addEventListener('click', closeCreateModal);
        var submitBtn = document.createElement('button');
        submitBtn.className = 'btn btn-primary';
        submitBtn.textContent = 'Create';
        submitBtn.type = 'button';
        submitBtn.addEventListener('click', function() {
          submitCreateForm(titleInput, colSelect, contentInput, selectedColor, apiError, titleError);
        });
        actions.appendChild(cancelBtn);
        actions.appendChild(submitBtn);
        modal.appendChild(actions);

        overlay.appendChild(modal);

        // Click backdrop to close
        overlay.addEventListener('click', function(e) {
          if (e.target === overlay) closeCreateModal();
        });

        document.body.appendChild(overlay);
        titleInput.focus();
      }

      function closeCreateModal() {
        var overlay = document.getElementById('create-modal');
        if (overlay) overlay.remove();
      }

      function submitCreateForm(titleInput, colSelect, contentInput, color, apiError, titleError) {
        // Clear previous errors
        titleError.textContent = '';
        apiError.textContent = '';

        var titleVal = titleInput.value.trim();
        if (!titleVal) {
          titleError.textContent = 'Title is required';
          titleInput.focus();
          return;
        }

        var body = {
          title: titleVal,
          column: colSelect.value,
          color: color
        };
        var contentVal = contentInput.value;
        if (contentVal) {
          body.content = contentVal;
        }

        fetch('/board/cards', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body)
        })
        .then(function(r) {
          if (r.status === 201) {
            closeCreateModal();
            fetchBoard();
            return;
          }
          return r.json().then(function(data) {
            apiError.textContent = data.error || 'Failed to create card';
          });
        })
        .catch(function(err) {
          apiError.textContent = 'Network error: ' + err.message;
        });
      }

      // ── Inline Editing ──

      function startEditing(cardId, cardEl) {
        // Only one card in edit mode at a time
        if (editingCardId !== null && editingCardId !== cardId) {
          cancelEditing();
        }

        var card = findCard(cardId);
        if (!card) return;

        editingCardId = cardId;
        cardEl.classList.add('editing');
        cardEl.innerHTML = '';

        // Editable title
        var titleInput = document.createElement('input');
        titleInput.type = 'text';
        titleInput.className = 'card-edit-title';
        titleInput.value = card.title;
        titleInput.maxLength = 200;
        cardEl.appendChild(titleInput);

        // Editable content textarea
        var textarea = document.createElement('textarea');
        textarea.className = 'card-edit-textarea';
        textarea.value = card.content || '';
        textarea.rows = 3;
        textarea.placeholder = 'Card content (markdown)';
        textarea.addEventListener('input', function() { autoGrow(textarea); });
        cardEl.appendChild(textarea);

        // Error display
        var errorDiv = document.createElement('div');
        errorDiv.className = 'card-edit-error';
        cardEl.appendChild(errorDiv);

        // Actions row
        var actionsRow = document.createElement('div');
        actionsRow.className = 'card-edit-actions';

        // Left: delete button
        var deleteBtn = document.createElement('button');
        deleteBtn.className = 'btn btn-danger-text';
        deleteBtn.textContent = 'Delete';
        deleteBtn.type = 'button';
        deleteBtn.addEventListener('click', function(e) {
          e.stopPropagation();
          deleteCard(cardId);
        });

        // Right: cancel + save
        var rightActions = document.createElement('div');
        rightActions.className = 'right-actions';

        var cancelBtn = document.createElement('button');
        cancelBtn.className = 'btn btn-secondary';
        cancelBtn.textContent = 'Cancel';
        cancelBtn.type = 'button';
        cancelBtn.addEventListener('click', function(e) {
          e.stopPropagation();
          cancelEditing();
        });

        var saveBtn = document.createElement('button');
        saveBtn.className = 'btn btn-primary';
        saveBtn.textContent = 'Save';
        saveBtn.type = 'button';
        saveBtn.addEventListener('click', function(e) {
          e.stopPropagation();
          saveCard(cardId, titleInput, textarea, errorDiv);
        });

        rightActions.appendChild(cancelBtn);
        rightActions.appendChild(saveBtn);
        actionsRow.appendChild(deleteBtn);
        actionsRow.appendChild(rightActions);
        cardEl.appendChild(actionsRow);

        // Auto-grow after rendering
        setTimeout(function() { autoGrow(textarea); }, 0);
        titleInput.focus();
      }

      function cancelEditing() {
        if (editingCardId === null) return;
        var card = findCard(editingCardId);
        editingCardId = null;
        // Re-render the board to restore card views
        renderBoard(cachedColumns, cachedCardsByColumn);
      }

      function saveCard(cardId, titleInput, textarea, errorDiv) {
        errorDiv.textContent = '';
        var card = findCard(cardId);
        if (!card) return;

        var newTitle = titleInput.value.trim();
        if (!newTitle) {
          errorDiv.textContent = 'Title is required';
          titleInput.focus();
          return;
        }

        // Only send changed fields
        var body = {};
        if (newTitle !== card.title) body.title = newTitle;
        if (textarea.value !== (card.content || '')) body.content = textarea.value;

        // Nothing changed
        if (Object.keys(body).length === 0) {
          cancelEditing();
          return;
        }

        fetch('/board/cards/' + cardId, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body)
        })
        .then(function(r) {
          if (r.ok) {
            editingCardId = null;
            fetchBoard();
            return;
          }
          return r.json().then(function(data) {
            errorDiv.textContent = data.error || 'Failed to save card';
          });
        })
        .catch(function(err) {
          errorDiv.textContent = 'Network error: ' + err.message;
        });
      }

      function deleteCard(cardId) {
        if (!confirm('Delete this card? This cannot be undone.')) return;

        fetch('/board/cards/' + cardId, {
          method: 'DELETE'
        })
        .then(function(r) {
          if (r.ok) {
            editingCardId = null;
            fetchBoard();
            return;
          }
          return r.json().then(function(data) {
            showError(data.error || 'Failed to delete card');
          });
        })
        .catch(function(err) {
          showError('Network error: ' + err.message);
        });
      }

      // ── Board Rendering ──

      function renderBoard(columns, cardsByColumn) {
        boardEl.innerHTML = '';
        columns.forEach(function(col) {
          var colCards = cardsByColumn[col.name] || [];
          var colEl = document.createElement('div');
          colEl.className = 'column';

          var header = document.createElement('div');
          header.className = 'column-header';
          header.innerHTML = escapeHTML(col.name) + ' <span class="card-count">(' + colCards.length + ')<\/span>';
          colEl.appendChild(header);

          var body = document.createElement('div');
          body.className = 'column-body';

          if (colCards.length === 0) {
            var placeholder = document.createElement('div');
            placeholder.className = 'empty-placeholder';
            placeholder.textContent = 'No cards yet';
            body.appendChild(placeholder);
          } else {
            colCards.forEach(function(card) {
              var cardEl = document.createElement('div');
              cardEl.className = 'card';
              cardEl.setAttribute('data-color', card.color || 'gray');
              cardEl.setAttribute('data-card-id', card.id);

              // If this card is currently being edited, render edit mode
              if (editingCardId === card.id) {
                cardEl.classList.add('editing');
                body.appendChild(cardEl);
                // Defer startEditing so the element is in the DOM
                (function(id, el) {
                  setTimeout(function() { startEditing(id, el); }, 0);
                })(card.id, cardEl);
                return;
              }

              var titleEl = document.createElement('div');
              titleEl.className = 'card-title';
              titleEl.textContent = card.title;
              cardEl.appendChild(titleEl);

              if (card.content) {
                var contentEl = document.createElement('div');
                contentEl.className = 'card-content';
                contentEl.innerHTML = renderMarkdown(card.content);
                cardEl.appendChild(contentEl);
              }

              // Click handler to enter edit mode
              cardEl.addEventListener('click', function() {
                startEditing(card.id, cardEl);
              });

              body.appendChild(cardEl);
            });
          }

          colEl.appendChild(body);
          boardEl.appendChild(colEl);
        });
      }

      function fetchBoard() {
        Promise.all([
          fetch('/board/columns').then(function(r) {
            if (!r.ok) throw new Error('Failed to load columns (HTTP ' + r.status + ')');
            return r.json();
          }),
          fetch('/board/cards').then(function(r) {
            if (!r.ok) throw new Error('Failed to load cards (HTTP ' + r.status + ')');
            return r.json();
          })
        ])
        .then(function(results) {
          hideError();
          cachedColumns = results[0].columns || [];
          cachedCardsByColumn = results[1].columns || {};
          renderBoard(cachedColumns, cachedCardsByColumn);
        })
        .catch(function(err) {
          showError('Error loading board: ' + err.message);
          boardEl.innerHTML = '';
        });
      }

      // Wire up FAB
      fabEl.addEventListener('click', openCreateModal);

      fetchBoard();
    })();
  <\/script>
</body>
</html>`;
}

app.get('/board', (req, res) => {
  res.type('html').send(buildBoardHTML());
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
