const db = require("./database");

function initialize() {
  return new Promise((resolve, reject) => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS records (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        source TEXT NOT NULL,
        source_id TEXT NOT NULL,
        record_type TEXT NOT NULL,
        name TEXT,
        email TEXT,
        amount REAL,
        currency TEXT,
        event_start TEXT,
        event_end TEXT,
        updated_at TEXT,
        deleted INTEGER NOT NULL DEFAULT 0,
        raw_data TEXT NOT NULL,
        ingested_at TEXT NOT NULL,
        UNIQUE(source, source_id)
      );
      CREATE TABLE IF NOT EXISTS sync_checkpoints (
        source TEXT PRIMARY KEY,
        cursor TEXT,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS sync_runs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        source TEXT NOT NULL,
        mode TEXT NOT NULL,
        status TEXT NOT NULL,
        received INTEGER NOT NULL DEFAULT 0,
        written INTEGER NOT NULL DEFAULT 0,
        rejected INTEGER NOT NULL DEFAULT 0,
        error TEXT,
        started_at TEXT NOT NULL,
        finished_at TEXT
      );
    `, (err) => {
      if (err) return reject(err);
      db.all("PRAGMA table_info(records)", (columnErr, columns) => {
        if (columnErr) return reject(columnErr);
        const existing = new Set(columns.map((column) => column.name));
        const migrations = [
          ["currency", "TEXT"], ["deleted", "INTEGER NOT NULL DEFAULT 0"],
          ["ingested_at", "TEXT"],
        ].filter(([name]) => !existing.has(name));
        let remaining = migrations.length;
        if (!remaining) return resolve();
        migrations.forEach(([name, type]) => db.run(`ALTER TABLE records ADD COLUMN ${name} ${type}`, (migrationErr) => {
          if (migrationErr) return reject(migrationErr);
          if (!--remaining) resolve();
        }));
      });
    });
  });
}

module.exports = { initialize };
