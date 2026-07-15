const { fetchHubSpotContacts } = require("./src/connectors/hubspot");

(async () => {
  const contacts = await fetchHubSpotContacts();
  console.dir(contacts, { depth: null });
})();