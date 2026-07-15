const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const dbPath = path.join(os.tmpdir(), `sync-pipeline-${process.pid}.sqlite`);
process.env.SYNC_DB_PATH = dbPath;
const db = require("../src/db/database");
const { syncAll } = require("../src/services/sync");
const all = (sql) => new Promise((resolve, reject) => db.all(sql, (err, rows) => err ? reject(err) : resolve(rows)));

const contacts = [{ id: "c1", properties: { firstname: "Ada", lastname: "Lovelace", email: "ada@example.test", hs_lastmodifieddate: "2026-01-01T00:00:00Z" } }];
const payments = [{ transaction_id: "p1", customer_name: "Ada", customer_email: "ada@example.test", amount_cents: 1250, currency: "USD", updated_at: "2026-01-02T00:00:00Z" }];
const events = [{ id: "e1", summary: "Demo", start: { dateTime: "2026-02-01T09:00:00Z" }, end: { dateTime: "2026-02-01T10:00:00Z" }, updated: "2026-01-03T00:00:00Z" }];
const connector = (records, cursor) => ({ fetchAll: async () => ({ records, cursor }), fetchSince: async () => ({ records, cursor }) });

test("normalizes sources, is idempotent, falls back, and isolates failures", async () => {
  const sources = { hubspot: connector(contacts, 1), payments: connector(payments, 2), calendar: connector(events, "sync-1") };
  const first = await syncAll(sources); assert.equal(first.filter((r) => r.status === "success").length, 3);
  await syncAll(sources); assert.equal((await all("SELECT * FROM records")).length, 3);
  const stale = { fetchAll: async () => ({ records: events, cursor: "fresh" }), fetchSince: async () => { const err = new Error("sync token expired"); err.code = 410; throw err; } };
  const results = await syncAll({ hubspot: { fetchAll: async () => { throw new Error("down"); } }, payments: connector([...payments, "garbage"], 3), calendar: stale });
  assert.equal(results.find((r) => r.source === "hubspot").status, "failed");
  assert.equal(results.find((r) => r.source === "calendar").mode, "backfill_after_stale_cursor");
  assert.equal(results.find((r) => r.source === "payments").rejected, 1);
  assert.equal((await all("SELECT * FROM records")).length, 3);
});

test.after(async () => { await new Promise((resolve) => db.close(resolve)); fs.rmSync(dbPath, { force: true }); });
