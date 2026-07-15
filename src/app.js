const express = require("express");

const app = express();

app.use(express.json());
app.use("/sync", require("./routes/sync"));

app.get("/health", (req, res) => {
    res.send("Server running");
});

const port = Number(process.env.PORT) || 3000;
app.listen(port, "0.0.0.0", () => {
    console.log(`Running on port ${port}`);
})
