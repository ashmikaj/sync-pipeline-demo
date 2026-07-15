require("dotenv").config();
const axios = require("axios");

const client = axios.create({ baseURL: "https://api.hubapi.com", timeout: 15000 });
const headers = () => ({ Authorization: `Bearer ${process.env.HUBSPOT_TOKEN}` });

async function fetchAll() {
  const results = []; let after;
  do {
    const { data } = await client.get("/crm/v3/objects/contacts", { headers: headers(), params: { limit: 100, after, properties: "firstname,lastname,email,phone,hs_lastmodifieddate" } });
    results.push(...(data.results || [])); after = data.paging?.next?.after;
  } while (after);
  return { records: results, cursor: latest(results) };
}

async function fetchSince(cursor) {
  if (!cursor) return fetchAll();
  const { data } = await client.post("/crm/v3/objects/contacts/search", {
    filterGroups: [{ filters: [{ propertyName: "hs_lastmodifieddate", operator: "GT", value: cursor }] }],
    properties: ["firstname", "lastname", "email", "phone", "hs_lastmodifieddate"], limit: 100,
  }, { headers: headers() });
  const records = data.results || [];
  return { records, cursor: latest(records) || cursor };
}

function latest(records) { return records.reduce((max, r) => Math.max(max, Date.parse(r.properties?.hs_lastmodifieddate || r.updatedAt) || 0), 0) || null; }
async function fetchHubSpotContacts() { return (await fetchAll()).records; }
module.exports = { fetchAll, fetchSince, fetchHubSpotContacts };
