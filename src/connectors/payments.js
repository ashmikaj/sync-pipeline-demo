// Adapter for the fake payments sandbox exposing GET /payments.
// Set PAYMENTS_API_URL to the sandbox endpoint if needed; otherwise it defaults to the provided fake API.
const axios = require("axios");

function client() {
  const baseURL = process.env.PAYMENTS_API_URL || "https://fakestoreapi.noksha.dev/api";
  return axios.create({
    baseURL,
    timeout: 15000,
    headers: process.env.PAYMENTS_API_TOKEN ? { Authorization: `Bearer ${process.env.PAYMENTS_API_TOKEN}` } : {},
  });
}

async function fetchAll() {
  return fetch();
}

async function fetchSince(cursor) {
  return fetch(cursor);
}

async function fetch(cursor) {
  const { data } = await client().get("/payments", {
    params: cursor ? { updated_since: cursor } : {},
  });

  const payload = data && typeof data === "object" ? data : { data: [] };
  const records = Array.isArray(payload) ? payload : payload.data || payload.results || [];

  if (!Array.isArray(records)) {
    throw new Error("payments response is not a record array");
  }

  const newest = records.reduce((max, record) => {
    const time = Date.parse(record.updated_at || record.updatedAt || record.created_at || record.createdAt || "");
    return Number.isFinite(time) ? Math.max(max, time) : max;
  }, 0);

  return { records, cursor: newest || cursor || null };
}

module.exports = { fetchAll, fetchSince };
