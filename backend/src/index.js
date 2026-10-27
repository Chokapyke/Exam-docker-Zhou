const express = require('express');
const fs = require('fs');
const { Pool } = require('pg');

// Le mot de passe vient d'un secret Docker (fichier), jamais d'une variable en clair
const password = process.env.DB_PASSWORD_FILE
  ? fs.readFileSync(process.env.DB_PASSWORD_FILE, 'utf8').trim()
  : process.env.DB_PASSWORD;

const pool = new Pool({
  host: process.env.DB_HOST || 'db',
  port: Number(process.env.DB_PORT || 5432),
  database: process.env.DB_NAME || 'appdb',
  user: process.env.DB_USER || 'appuser',
  password,
});

const app = express();
app.use(express.json());

// Liveness : ne dépend pas de la DB
app.get('/health', (_req, res) => res.json({ status: 'ok' }));

// Readiness : vérifie la communication backend -> DB
app.get('/api/health', async (_req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'ok', db: 'up' });
  } catch (e) {
    res.status(503).json({ status: 'error', db: 'down', message: e.message });
  }
});

app.get('/api/notes', async (_req, res) => {
  const { rows } = await pool.query('SELECT id, content, created_at FROM notes ORDER BY id DESC LIMIT 50');
  res.json(rows);
});

app.post('/api/notes', async (req, res) => {
  const content = ((req.body && req.body.content) || '').toString().trim();
  if (!content) return res.status(400).json({ error: 'content requis' });
  const { rows } = await pool.query('INSERT INTO notes(content) VALUES($1) RETURNING id, content, created_at', [content]);
  res.status(201).json(rows[0]);
});

async function init(retries = 20) {
  for (let i = 0; i < retries; i++) {
    try {
      await pool.query('CREATE TABLE IF NOT EXISTS notes (id SERIAL PRIMARY KEY, content TEXT NOT NULL, created_at TIMESTAMPTZ DEFAULT now())');
      return;
    } catch (e) {
      console.log(`DB pas prête (${e.message}), nouvel essai...`);
      await new Promise(r => setTimeout(r, 2000));
    }
  }
  throw new Error('Impossible de joindre la DB');
}

init().then(() => app.listen(3000, '0.0.0.0', () => console.log('Backend sur :3000')))
  .catch(e => { console.error(e); process.exit(1); });
