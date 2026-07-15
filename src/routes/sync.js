const express = require("express");
const { syncAll } = require("../services/sync");
const router = express.Router();
router.post("/", async (_req, res) => {
  const results = await syncAll();
  res.status(results.some((result) => result.status === "failed") ? 207 : 200).json({ results });
});
module.exports = router;
