import fs from 'fs';
import path from 'path';
import { env } from '../config/env.js';

const dbFile = path.join(env.dataDir, 'analyses.json');
const dbTempFile = path.join(env.dataDir, 'analyses.json.tmp');
const defaultDb = { analyses: [] };

function ensureDb() {
  fs.mkdirSync(env.dataDir, { recursive: true });
  if (!fs.existsSync(dbFile)) {
    fs.writeFileSync(dbFile, JSON.stringify(defaultDb, null, 2));
  }
}

export function readDb() {
  ensureDb();
  try {
    const raw = fs.readFileSync(dbFile, 'utf-8');
    if (!raw.trim()) {
      return { ...defaultDb };
    }
    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.analyses)) {
      return { ...defaultDb };
    }
    return parsed;
  } catch {
    return { ...defaultDb };
  }
}

export function writeDb(data) {
  ensureDb();
  const payload = JSON.stringify(data, null, 2);
  fs.writeFileSync(dbTempFile, payload);
  fs.renameSync(dbTempFile, dbFile);
}
