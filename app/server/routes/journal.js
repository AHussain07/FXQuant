const express = require("express");
const router = express.Router();
const journalController = require("../controllers/journalController");
const {
  requireAuth,
  requireSelfParam,
  forceSelfBody,
  requireTradeOwnership,
} = require("../middleware/auth");

// Journal entries are private. Entries are keyed by the trade they describe,
// so "do you own this entry" is really "do you own this trade".
router.use(requireAuth);

router.post("/", forceSelfBody, journalController.createJournalEntry);
router.get("/user/:userId", requireSelfParam, journalController.getJournalEntries);
router.get("/trade/:tradeId", requireTradeOwnership, journalController.getJournalByTradeId);
router.put("/:tradeId", requireTradeOwnership, journalController.updateJournalEntry);

module.exports = router;
