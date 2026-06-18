const express = require("express");
const router = express.Router();
const { runQuery, getTables } = require("../controllers/queryController");

router.get("/tables", getTables);
router.post("/run", runQuery);

module.exports = router;
