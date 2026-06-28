const express = require("express");
const router = express.Router();

const {
  createTrade,
  getUserTrades,
  getTrade,
  updateTradeLevels,
  closeTradeManually,
  cancelPendingOrder,
  checkTradeTPSL,
} = require("../controllers/tradeController");

const {
  getTradeHistory,
  getOpenTrades,
} = require("../controllers/tradeDataController");

//READ ROUTES
router.get("/user/:userId/history", getTradeHistory);
router.get("/user/:userId/open", getOpenTrades);
router.get("/user/:userId", getUserTrades);

//WRITE ROUTES
router.post("/", createTrade);
router.get("/:tradeId", getTrade);
router.patch("/:tradeId/levels", updateTradeLevels);
router.post("/:tradeId/close", closeTradeManually);
router.post("/:tradeId/cancel", cancelPendingOrder);
router.get("/:tradeId/check", checkTradeTPSL);

module.exports = router;
