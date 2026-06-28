/**
 * HTTP handlers for the /api/trades endpoints.
 *
 * This file is deliberately thin: it validates requests, orchestrates calls
 * into the trade engine + calculation services, and shapes HTTP responses.
 * Business rules live in:
 *   - services/tradeCalculations.js  (pure math: P&L, margin, TP/SL, triggers)
 *   - services/challengeService.js   (prop-challenge pass/fail side effects)
 *   - services/tradeEngine.js        (in-memory monitoring + cache mutators)
 */

const Trade = require("../models/Trade");
const User = require("../models/User");
const { v4: uuidv4 } = require("uuid");

const { getPriceForSymbol } = require("./priceController");
const {
  calculateMargin,
  calculateProfit,
  evaluateTakeProfitStopLoss,
} = require("../services/tradeCalculations");
const {
  finalizeTradeClose,
  autoCloseTrade,
  addActiveTrade,
  addPendingOrder,
  removeActiveTrade,
  removePendingOrder,
  updateCachedLevels,
} = require("../services/tradeEngine");

const LEVERAGE = 50;
const VALID_EXECUTION_TYPES = ["market", "limit", "stop"];

/**
 * Validate that take-profit / stop-loss levels sit on the correct side of
 * a given reference price. Returns an error message string, or null if OK.
 */
const validateTpSlAgainstPrice = (orderType, referencePrice, tp, sl) => {
  const isBuy = orderType === "buy";
  if (tp !== null) {
    if (isBuy && tp <= referencePrice) return "TP must be above entry for BUY";
    if (!isBuy && tp >= referencePrice) return "TP must be below entry for SELL";
  }
  if (sl !== null) {
    if (isBuy && sl >= referencePrice) return "SL must be below entry for BUY";
    if (!isBuy && sl <= referencePrice) return "SL must be above entry for SELL";
  }
  return null;
};

/**
 * Validate that a limit/stop price sits on the correct side of the current
 * market. Returns an error message string, or null if OK.
 */
const validatePendingPrice = (executionType, orderType, limitPrice, priceData) => {
  const isBuy = orderType === "buy";
  if (executionType === "limit") {
    if (isBuy && limitPrice >= priceData.ask) return "Limit BUY price must be below current ask price";
    if (!isBuy && limitPrice <= priceData.bid) return "Limit SELL price must be above current bid price";
  } else if (executionType === "stop") {
    if (isBuy && limitPrice <= priceData.ask) return "Stop BUY price must be above current ask price";
    if (!isBuy && limitPrice >= priceData.bid) return "Stop SELL price must be below current bid price";
  }
  return null;
};

/**
 * POST /api/trades
 * Place a market, limit, or stop order. Rejects if the user already has an
 * open or pending trade (one-at-a-time is a product rule, not a DB constraint).
 */
const createTrade = async (req, res) => {
  try {
    const {
      userId,
      symbol,
      tpPrice,
      slPrice,
      orderType,
      lotSize,
      executionType = "market",
      limitPrice,
    } = req.body;

    if (!userId || !symbol || !orderType || !lotSize) {
      return res.status(400).json({ message: "userId, symbol, orderType, and lotSize are required" });
    }
    if (!VALID_EXECUTION_TYPES.includes(executionType)) {
      return res.status(400).json({ message: "executionType must be market, limit, or stop" });
    }
    if ((executionType === "limit" || executionType === "stop") && !limitPrice) {
      return res.status(400).json({ message: `${executionType} orders require a limitPrice` });
    }

    const user = await User.findOne({ userId });
    if (!user) return res.status(404).json({ message: "User not found" });

    const existingTrade = await Trade.findOne({
      userId: user._id,
      status: { $in: ["open", "pending"] },
    });
    if (existingTrade) {
      return res.status(400).json({
        message: existingTrade.status === "pending"
          ? "You have a pending order. Cancel it first."
          : "You already have an open trade. Close it first.",
        existingTrade,
      });
    }

    const priceData = await getPriceForSymbol(symbol);
    if (!priceData.success) {
      return res.status(503).json({ message: priceData.error || "Market data unavailable" });
    }

    const units = parseFloat(lotSize);
    if (units <= 0) {
      return res.status(400).json({ message: "Lot size must be greater than 0" });
    }

    const normalizedOrderType = orderType.toLowerCase();
    const tp = tpPrice ? parseFloat(tpPrice) : null;
    const sl = slPrice ? parseFloat(slPrice) : null;

    if (executionType === "market") {
      return createMarketOrder(res, { user, symbol, normalizedOrderType, units, tp, sl, priceData });
    }
    return createPendingOrder(res, {
      user, symbol, normalizedOrderType, units, tp, sl,
      executionType, limitPrice: parseFloat(limitPrice), priceData,
    });
  } catch (error) {
    console.error("Create trade error:", error);
    res.status(400).json({ message: error.message });
  }
};

const createMarketOrder = async (res, ctx) => {
  const { user, symbol, normalizedOrderType, units, tp, sl, priceData } = ctx;
  const entryPrice = normalizedOrderType === "buy" ? priceData.ask : priceData.bid;

  const tpSlError = validateTpSlAgainstPrice(normalizedOrderType, entryPrice, tp, sl);
  if (tpSlError) return res.status(400).json({ message: tpSlError });

  const margin = calculateMargin(units, entryPrice, LEVERAGE);
  if (margin > user.accountBalance) {
    return res.status(400).json({
      message: `Insufficient margin. Required: $${margin.toFixed(2)}, Available: $${user.accountBalance.toFixed(2)}`,
    });
  }

  console.log(`[Trade] Opening MARKET ${normalizedOrderType.toUpperCase()} on ${symbol} @ ${entryPrice}`);

  const trade = new Trade({
    tradeId: uuidv4(),
    userId: user._id,
    symbol,
    executionType: "market",
    entryPrice: parseFloat(entryPrice.toFixed(5)),
    tpPrice: tp,
    slPrice: sl,
    orderType: normalizedOrderType,
    lotSize: units,
    leverage: LEVERAGE,
    status: "open",
    profit: 0,
  });

  const newTrade = await trade.save();
  addActiveTrade(newTrade);

  res.status(201).json({
    trade: newTrade,
    message: "Market order executed",
    accountBalance: user.accountBalance,
    margin: margin.toFixed(2),
  });
};

const createPendingOrder = async (res, ctx) => {
  const { user, symbol, normalizedOrderType, units, tp, sl, executionType, limitPrice, priceData } = ctx;

  const priceError = validatePendingPrice(executionType, normalizedOrderType, limitPrice, priceData);
  if (priceError) return res.status(400).json({ message: priceError });

  const margin = calculateMargin(units, limitPrice, LEVERAGE);
  if (margin > user.accountBalance) {
    return res.status(400).json({
      message: `Insufficient margin. Required: $${margin.toFixed(2)}, Available: $${user.accountBalance.toFixed(2)}`,
    });
  }

  console.log(`[Trade] Placing ${executionType.toUpperCase()} ${normalizedOrderType.toUpperCase()} on ${symbol} @ ${limitPrice}`);

  const trade = new Trade({
    tradeId: uuidv4(),
    userId: user._id,
    symbol,
    executionType,
    limitPrice,
    entryPrice: null,
    tpPrice: tp,
    slPrice: sl,
    orderType: normalizedOrderType,
    lotSize: units,
    leverage: LEVERAGE,
    status: "pending",
    profit: 0,
  });

  const newTrade = await trade.save();
  addPendingOrder(newTrade);

  res.status(201).json({
    trade: newTrade,
    message: `${executionType.charAt(0).toUpperCase() + executionType.slice(1)} order placed`,
    accountBalance: user.accountBalance,
    margin: margin.toFixed(2),
  });
};

/** POST /api/trades/:tradeId/cancel — cancel a still-pending limit/stop order. */
const cancelPendingOrder = async (req, res) => {
  try {
    const { tradeId } = req.params;
    const trade = await Trade.findOne({ tradeId });

    if (!trade) return res.status(404).json({ message: "Order not found" });
    if (trade.status !== "pending") {
      return res.status(400).json({ message: "Only pending orders can be cancelled" });
    }

    trade.status = "closed";
    trade.closeReason = "manual";
    trade.closedAt = new Date();
    await trade.save();
    removePendingOrder(tradeId);

    res.json({ message: "Pending order cancelled", trade });
  } catch (error) {
    console.error("Cancel order error:", error);
    res.status(500).json({ message: error.message });
  }
};

/**
 * POST /api/trades/:tradeId/close
 * Close an open trade at the live market price, or cancel it if still pending.
 */
const closeTradeManually = async (req, res) => {
  try {
    const { tradeId } = req.params;
    const trade = await Trade.findOne({ tradeId });

    if (!trade) return res.status(404).json({ message: "Trade not found" });
    if (trade.status === "closed") {
      return res.status(400).json({ message: "Trade is already closed" });
    }

    if (trade.status === "pending") {
      trade.status = "closed";
      trade.closeReason = "manual";
      trade.closedAt = new Date();
      await trade.save();
      removePendingOrder(tradeId);
      return res.json({ message: "Pending order cancelled", trade, profit: 0 });
    }

    const priceData = await getPriceForSymbol(trade.symbol);
    if (!priceData.success) {
      return res.status(503).json({ message: "Failed to fetch current price for closing" });
    }

    const exitPrice = trade.orderType === "buy" ? priceData.bid : priceData.ask;
    const user = await User.findById(trade.userId);
    if (!user) return res.status(404).json({ message: "User not found" });

    const result = await finalizeTradeClose(trade, exitPrice, "manual", user);
    removeActiveTrade(tradeId);

    res.json({
      ...result,
      message: "Trade closed manually",
      challengeResult: result.challengeResult,
    });
  } catch (error) {
    console.error("Close trade error:", error);
    res.status(500).json({ message: error.message });
  }
};

/**
 * PATCH /api/trades/:tradeId/levels
 * Update take-profit / stop-loss on an open or pending trade. For open trades
 * we validate against the existing entry price; pending trades are validated
 * later when they activate.
 */
const updateTradeLevels = async (req, res) => {
  try {
    const { tradeId } = req.params;
    const { tpPrice, slPrice } = req.body;

    const trade = await Trade.findOne({ tradeId });
    if (!trade) return res.status(404).json({ message: "Trade not found" });
    if (trade.status === "closed") {
      return res.status(400).json({ message: "Cannot update closed trade" });
    }

    const parseOptionalNumber = (v) =>
      v !== undefined && v !== null && v !== "" ? parseFloat(v) : null;
    const tp = parseOptionalNumber(tpPrice);
    const sl = parseOptionalNumber(slPrice);

    if (trade.status === "open" && trade.entryPrice) {
      const error = validateTpSlAgainstPrice(trade.orderType, trade.entryPrice, tp, sl);
      if (error) return res.status(400).json({ message: error });
    }

    trade.tpPrice = tp;
    trade.slPrice = sl;
    await trade.save();
    updateCachedLevels(tradeId, tp, sl);

    res.json({ trade, message: "Trade levels updated" });
  } catch (error) {
    console.error("Update levels error:", error);
    res.status(500).json({ message: error.message });
  }
};

/**
 * GET /api/trades/:tradeId/check
 * Poll endpoint used by the UI to re-check TP/SL on demand and to surface
 * current unrealised P&L for an open trade.
 */
const checkTradeTPSL = async (req, res) => {
  try {
    const { tradeId } = req.params;
    const trade = await Trade.findOne({ tradeId });

    if (!trade) return res.status(404).json({ message: "Trade not found" });
    if (trade.status === "closed") {
      return res.json({ trade, stillOpen: false, message: "Closed" });
    }
    if (trade.status === "pending") {
      return res.json({ trade, stillOpen: true, isPending: true });
    }

    const priceData = await getPriceForSymbol(trade.symbol);
    if (!priceData.success) {
      return res.status(503).json({ message: "Price unavailable" });
    }

    const currentExitPrice = trade.orderType === "buy" ? priceData.bid : priceData.ask;
    const check = evaluateTakeProfitStopLoss(trade, currentExitPrice);

    if (check.hit) {
      const challengeResult = await autoCloseTrade(trade.tradeId, check.price, check.reason);
      return res.json({ stillOpen: false, closeReason: check.reason, challengeResult });
    }

    res.json({
      trade,
      currentExitPrice,
      stillOpen: true,
      unrealizedPnL: calculateProfit(trade, currentExitPrice),
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

/** GET /api/trades/user/:userId — full trade history for a user, newest first. */
const getUserTrades = async (req, res) => {
  try {
    const user = await User.findOne({ userId: req.params.userId });
    if (!user) return res.status(404).json({ message: "User not found" });

    const trades = await Trade.find({ userId: user._id })
      .sort({ createdAt: -1 })
      .populate("userId", "gmail accountBalance");
    res.json(trades);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// TODO: getOpenTrades here is dead code — routes/trades.js imports the same
// handler from tradeDataController.js. Confirm no other caller and remove.
const getOpenTrades = async (req, res) => {
  try {
    const user = await User.findOne({ userId: req.params.userId });
    if (!user) return res.status(404).json({ message: "User not found" });

    const trades = await Trade.find({
      userId: user._id,
      status: { $in: ["open", "pending"] },
    })
      .sort({ createdAt: -1 })
      .populate("userId", "gmail accountBalance");
    res.json(trades);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

/** GET /api/trades/:tradeId — fetch a single trade with populated user summary. */
const getTrade = async (req, res) => {
  try {
    const trade = await Trade.findOne({ tradeId: req.params.tradeId })
      .populate("userId", "gmail accountBalance");
    if (!trade) return res.status(404).json({ message: "Trade not found" });
    res.json(trade);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

module.exports = {
  getUserTrades,
  getOpenTrades,
  createTrade,
  closeTradeManually,
  cancelPendingOrder,
  checkTradeTPSL,
  getTrade,
  updateTradeLevels,
};
