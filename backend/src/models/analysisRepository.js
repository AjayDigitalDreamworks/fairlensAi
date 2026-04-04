import { readDb, writeDb } from '../utils/fsdb.js';

export class AnalysisRepository {
  list() {
    return readDb().analyses.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }

  getById(id) {
    return readDb().analyses.find((item) => item.id === id) || null;
  }

  save(analysis) {
    const db = readDb();
    const idx = db.analyses.findIndex((item) => item.id === analysis.id);
    if (idx >= 0) db.analyses[idx] = analysis;
    else db.analyses.push(analysis);
    writeDb(db);
    return analysis;
  }

  deleteById(id) {
    const db = readDb();
    const existing = db.analyses.find((item) => item.id === id) || null;
    if (!existing) return null;
    db.analyses = db.analyses.filter((item) => item.id !== id);
    writeDb(db);
    return existing;
  }
}
