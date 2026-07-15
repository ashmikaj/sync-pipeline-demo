const { fetchCalendarEvents } = require("./src/connectors/calender");

(async () => {
  const events = await fetchCalendarEvents();

  console.dir(events, {
    depth: null,
  });
})();