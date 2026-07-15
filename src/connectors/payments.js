// Adapter for any payments sandbox exposing GET /payments with updated_since.
// Set PAYMENTS_API_URL (and optionally PAYMENTS_API_TOKEN) to a sandbox endpoint.
const axios = require("axios");

function client() {
  if (!process.env.PAYMENTS_API_URL) throw new Error("PAYMENTS_API_URL is not configured");
  return axios.create({ baseURL: process.env.PAYMENTS_API_URL, timeout: 15000, headers: process.env.PAYMENTS_API_TOKEN ? { Authorization: `Bearer ${process.env.PAYMENTS_API_TOKEN}` } : {} });
}
async function fetchAll() { return fetch(); }
async function fetchSince(cursor) { return fetch(cursor); }
async function fetch(cursor) {
  const { data } = await client().get("/payments", { params: cursor ? { updated_since: cursor } : {} });
  const records = Array.isArray(data) ? data : data?.data || data?.results;
  if (!Array.isArray(records)) throw new Error("payments response is not a record array");
  const newest = records.reduce((m, r) => Math.max(m, Date.parse(r.updated_at || r.updatedAt || r.created_at) || 0), 0);
  return { records, cursor: newest || cursor || null };
}
module.exports = { fetchAll, fetchSince };
