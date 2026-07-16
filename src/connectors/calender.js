const { google } = require("googleapis");

const SCOPES = ["https://www.googleapis.com/auth/calendar.readonly"];

async function authorize() {
  if (!process.env.GOOGLE_AUTH_JSON) {
    throw new Error("GOOGLE_AUTH_JSON is not configured");
  }

  const credentials = JSON.parse(process.env.GOOGLE_AUTH_JSON);

  const auth = new google.auth.OAuth2(
    credentials.client_id,
    credentials.client_secret
  );

  auth.setCredentials({
    refresh_token: credentials.refresh_token,
  });

  return auth;
}

async function list(params) {
  const auth = await authorize();

  const calendar = google.calendar({
    version: "v3",
    auth,
  });

  let pageToken;
  const records = [];
  let nextSyncToken;

  do {
    const { data } = await calendar.events.list({
      calendarId: "primary",
      showDeleted: true,
      ...params,
      pageToken,
    });

    records.push(...(data.items || []));
    pageToken = data.nextPageToken;
    nextSyncToken = data.nextSyncToken || nextSyncToken;
  } while (pageToken);

  return {
    records,
    cursor: nextSyncToken,
  };
}

async function fetchAll() {
  return list({
    singleEvents: true,
    maxResults: 2500,
  });
}

async function fetchSince(cursor) {
  if (!cursor) {
    return fetchAll();
  }

  return list({
    syncToken: cursor,
  });
}

async function fetchCalendarEvents() {
  const { records } = await fetchAll();
  return records;
}

module.exports = {
  fetchAll,
  fetchSince,
  fetchCalendarEvents,
};