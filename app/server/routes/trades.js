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

const {
  requireAuth,
  requireSelfParam,
  forceSelfBody,
  requireTradeOwnership,
} = require("../middleware/auth");

// Every trade route is private: you may only ever touch your own trades.
router.use(requireAuth);

//READ ROUTES
router.get("/user/:userId/history", requireSelfParam, getTradeHistory);
router.get("/user/:userId/open", requireSelfParam, getOpenTrades);
router.get("/user/:userId", requireSelfParam, getUserTrades);

//WRITE ROUTES
router.post("/", forceSelfBody, createTrade);
router.get("/:tradeId", requireTradeOwnership, getTrade);
router.patch("/:tradeId/levels", requireTradeOwnership, updateTradeLevels);
router.post("/:tradeId/close", requireTradeOwnership, closeTradeManually);
router.post("/:tradeId/cancel", requireTradeOwnership, cancelPendingOrder);
router.get("/:tradeId/check", requireTradeOwnership, checkTradeTPSL);

module.exports = router;
