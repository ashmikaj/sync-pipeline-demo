require("./src/db/schema");

const db = require("./src/db/database");

db.run(
  "INSERT INTO users (name) VALUES (?)",
  ["Ashmika"],
  function (err) {
    if (err) {
      console.error(err);
      return;
    }

    console.log("Inserted user with ID:", this.lastID);

    db.all("SELECT * FROM users", [], (err, rows) => {
      if (err) {
        console.error(err);
        return;
      }

      console.log(rows);
      db.close();
    });
  }
);