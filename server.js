const express = require('express');
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

const app = express();
const PORT = process.env.PORT || 3000;
const ADMIN_KEY = process.env.ADMIN_KEY || 'SPX2026';
const DATA_DIR = path.join(__dirname, 'data');
const LOCAL_FILE = path.join(DATA_DIR, 'config.json');

app.use(express.json({ limit: '8mb' }));
app.use(express.static(path.join(__dirname, 'public')));

let pool = null;
if (process.env.DATABASE_URL) {
  pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
  });
}

const defaultConfig = {
  title: 'Ruta de las Palabras',
  theme: 'clasico',
  background: '',
  questions: []
};

function readLocal() {
  try {
    if (!fs.existsSync(LOCAL_FILE)) return { ...defaultConfig };
    return JSON.parse(fs.readFileSync(LOCAL_FILE, 'utf8'));
  } catch (e) {
    return { ...defaultConfig };
  }
}

function writeLocal(config) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(LOCAL_FILE, JSON.stringify(config, null, 2), 'utf8');
}

async function initDb() {
  if (!pool) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS game_config (
      id INTEGER PRIMARY KEY,
      title TEXT NOT NULL,
      theme TEXT NOT NULL,
      background TEXT NOT NULL DEFAULT '',
      questions JSONB NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  const result = await pool.query('SELECT id FROM game_config WHERE id = 1');
  if (result.rowCount === 0) {
    const local = readLocal();
    await pool.query(
      'INSERT INTO game_config (id,title,theme,background,questions) VALUES (1,$1,$2,$3,$4)',
      [local.title, local.theme, local.background, JSON.stringify(local.questions)]
    );
  }
}

async function getConfig() {
  if (pool) {
    const { rows } = await pool.query('SELECT title,theme,background,questions FROM game_config WHERE id=1');
    if (rows[0]) return rows[0];
  }
  return readLocal();
}

async function saveConfig(config) {
  const clean = {
    title: String(config.title || 'Ruta de las Palabras').slice(0, 60),
    theme: ['clasico','aventura','espacio','neon','medieval','naturaleza'].includes(config.theme) ? config.theme : 'clasico',
    background: typeof config.background === 'string' ? config.background : '',
    questions: Array.isArray(config.questions) ? config.questions : []
  };
  if (pool) {
    await pool.query(
      `UPDATE game_config SET title=$1,theme=$2,background=$3,questions=$4,updated_at=NOW() WHERE id=1`,
      [clean.title, clean.theme, clean.background, JSON.stringify(clean.questions)]
    );
  } else {
    writeLocal(clean);
  }
  return clean;
}

function isAdmin(req) {
  return req.get('x-admin-key') === ADMIN_KEY;
}

app.get('/api/health', async (req, res) => {
  res.json({ ok: true, storage: pool ? 'postgres' : 'local-file' });
});

app.get('/api/config', async (req, res) => {
  try {
    res.json(await getConfig());
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'No se pudo cargar la configuración.' });
  }
});

app.put('/api/config', async (req, res) => {
  if (!isAdmin(req)) return res.status(401).json({ error: 'No autorizado.' });
  try {
    const saved = await saveConfig(req.body || {});
    res.json({ ok: true, config: saved });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'No se pudo guardar la configuración.' });
  }
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

initDb()
  .then(() => app.listen(PORT, () => console.log(`Ruta de las Palabras ejecutándose en puerto ${PORT}`)))
  .catch(err => {
    console.error('Error inicializando:', err);
    process.exit(1);
  });
