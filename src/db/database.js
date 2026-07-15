const sqlite3 = require("sqlite3").verbose();
const path = require("path");

const filename = process.env.SYNC_DB_PATH || path.join(__dirname, "sync.db");
const db = new sqlite3.Database(filename);
db.configure("busyTimeout", 5000);

module.exports = db;
