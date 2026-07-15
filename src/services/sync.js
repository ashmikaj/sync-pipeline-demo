const db = require("../db/database");
const { initialize } = require("../db/schema");
const { normalize } = require("./normalize");
const defaultConnectors = {
  hubspot: require("../connectors/hubspot"),
  payments: require("../connectors/payments"),
  calendar: require("../connectors/calendar"),
};

const run = (sql, params = []) => new Promise((resolve, reject) => db.run(sql, params, function (err) { err ? reject(err) : resolve(this); }));
const get = (sql, params = []) => new Promise((resolve, reject) => db.get(sql, params, (err, row) => err ? reject(err) : resolve(row)));

function staleCursor(error) {
  const status = error.response?.status || error.code;
  return status === 410 || status === 400 || status === "CURSOR_EXPIRED" || /expired|invalid.*(?:cursor|sync.?token)/i.test(error.message || "");
}

async function checkpoint(source) { return (await get("SELECT cursor FROM sync_checkpoints WHERE source = ?", [source]))?.cursor || null; }
async function saveCheckpoint(source, cursor) {
  if (cursor == null) return;
  await run(`INSERT INTO sync_checkpoints(source, cursor, updated_at) VALUES (?, ?, ?)
    ON CONFLICT(source) DO UPDATE SET cursor = excluded.cursor, updated_at = excluded.updated_at`, [source, String(cursor), new Date().toISOString()]);
}
async function upsert(record) {
  const now = new Date().toISOString();
  await run(`INSERT INTO records (source, source_id, record_type, name, email, amount, currency, event_start, event_end, updated_at, deleted, raw_data, ingested_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(source, source_id) DO UPDATE SET record_type=excluded.record_type, name=excluded.name, email=excluded.email,
      amount=excluded.amount, currency=excluded.currency, event_start=excluded.event_start, event_end=excluded.event_end,
      updated_at=excluded.updated_at, deleted=excluded.deleted, raw_data=excluded.raw_data, ingested_at=excluded.ingested_at`,
    [record.source, record.source_id, record.record_type, record.name || null, record.email || null,
      Number.isFinite(record.amount) ? record.amount : null, record.currency || null, record.event_start || null, record.event_end || null,
      record.updated_at || null, record.deleted || 0, record.raw_data, now]);
}

async function syncSource(source, connector) {
  const started = new Date().toISOString(); let mode = "incremental"; let received = 0; let written = 0; let rejected = 0;
  try {
    const cursor = await checkpoint(source);
    let batch;
    try { batch = cursor ? await connector.fetchSince(cursor) : await connector.fetchAll(); mode = cursor ? "incremental" : "backfill"; }
    catch (error) {
      if (!cursor || !staleCursor(error)) throw error;
      mode = "backfill_after_stale_cursor"; batch = await connector.fetchAll();
    }
    if (!batch || !Array.isArray(batch.records)) throw new Error("connector returned an invalid batch");
    received = batch.records.length;
    for (const raw of batch.records) {
      try { await upsert(normalize(source, raw)); written++; }
      catch (error) { rejected++; console.warn(`Rejected ${source} record: ${error.message}`); }
    }
    await saveCheckpoint(source, batch.cursor);
    await run("INSERT INTO sync_runs(source, mode, status, received, written, rejected, started_at, finished_at) VALUES (?, ?, 'success', ?, ?, ?, ?, ?)", [source, mode, received, written, rejected, started, new Date().toISOString()]);
    return { source, status: "success", mode, received, written, rejected };
  } catch (error) {
    await run("INSERT INTO sync_runs(source, mode, status, received, written, rejected, error, started_at, finished_at) VALUES (?, ?, 'failed', ?, ?, ?, ?, ?, ?)", [source, mode, received, written, rejected, error.message, started, new Date().toISOString()]);
    return { source, status: "failed", mode, received, written, rejected, error: error.message };
  }
}

async function syncAll(connectors = defaultConnectors) {
  await initialize();
  return Promise.all(Object.entries(connectors).map(([source, connector]) => syncSource(source, connector)));
}
module.exports = { syncAll, syncSource, staleCursor };
