const express = require("express");
const router = express.Router();
const journalController = require("../controllers/journalController");

router.post("/", journalController.createJournalEntry);
router.get("/user/:userId", journalController.getJournalEntries);
router.get("/trade/:tradeId", journalController.getJournalByTradeId);
router.put("/:tradeId", journalController.updateJournalEntry);

module.exports = router;
