const fs = require("fs").promises;
const path = require("path");
const { google } = require("googleapis");
const { authenticate } = require("@google-cloud/local-auth");
const SCOPES = ["https://www.googleapis.com/auth/calendar.readonly"];
const TOKEN_PATH = path.join(process.cwd(), "token.json");
const CREDENTIALS_PATH = path.join(process.cwd(), "credentials.json");
async function authorize() {
  try { return google.auth.fromJSON(JSON.parse(await fs.readFile(TOKEN_PATH))); } catch (_) {}
  const auth = await authenticate({ scopes: SCOPES, keyfilePath: CREDENTIALS_PATH });
  const keys = JSON.parse(await fs.readFile(CREDENTIALS_PATH)); const key = keys.installed || keys.web;
  await fs.writeFile(TOKEN_PATH, JSON.stringify({ type: "authorized_user", client_id: key.client_id, client_secret: key.client_secret, refresh_token: auth.credentials.refresh_token }));
  return auth;
}
async function list(params) {
  const calendar = google.calendar({ version: "v3", auth: await authorize() }); let pageToken; const records = []; let nextSyncToken;
  do { const { data } = await calendar.events.list({ calendarId: "primary", showDeleted: true, ...params, pageToken }); records.push(...(data.items || [])); pageToken = data.nextPageToken; nextSyncToken = data.nextSyncToken || nextSyncToken; } while (pageToken);
  return { records, cursor: nextSyncToken };
}
function fetchAll() { return list({ singleEvents: true, maxResults: 2500 }); }
function fetchSince(cursor) { return cursor ? list({ syncToken: cursor }) : fetchAll(); }
async function fetchCalendarEvents() { return (await fetchAll()).records; }
module.exports = { fetchAll, fetchSince, fetchCalendarEvents };
