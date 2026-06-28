/**
 * In-memory trade execution engine.
 *
 * Responsibilities:
 *   1. Keep a live cache of open trades and pending orders, rehydrated from
 *      MongoDB on boot and on every Mongo reconnect.
 *   2. Subscribe to the price feed (`priceEvents.priceUpdate`) and, on every
 *      tick, close any trade that has hit TP/SL and fire any pending order
 *      that has been triggered.
 *   3. Expose a small set of mutators so HTTP controllers can keep the cache
 *      in sync after DB writes (new trade created, manual close, levels
 *      updated, etc.) — controllers must NOT touch the caches directly.
 *
 * Concurrency / atomicity guarantees:
 *   - The `trade.status: open → closed` transition is performed via
 *     `findOneAndUpdate` with a status filter, so two concurrent ticks
 *     cannot both claim the same trade and double-credit the user.
 *   - The user balance update uses `$inc` to avoid the read-modify-save
 *     lost-update race when multiple trades close on the same tick.
 *   - Both writes are wrapped in a Mongoose session/transaction when the
 *     deployment supports them (replica set / cluster). On standalone
 *     MongoDB the transaction is silently skipped and the writes are
 *     issued sequentially — still individually atomic, but with a small
 *     partial-write window between them.
 */

const mongoose = require("mongoose");
const Trade = require("../models/Trade");
const User = require("../models/User");
const { priceEvents } = require("../controllers/priceController");
const {
  calculateMargin,
  calculateProfit,
  evaluateTakeProfitStopLoss,
  evaluatePendingOrderTrigger,
} = require("./tradeCalculations");
const { evaluateChallengeOutcome } = require("./challengeService");

let activeTradesCache = [];
let pendingOrdersCache = [];

const SYNC_RETRY_DELAY_MS = 5000;
let syncRetryTimer = null;

/**
 * Rehydrate caches from the database. Called at module load, after Mongo
 * (re)connects, and as a self-scheduled retry if the find calls fail.
 */
const syncFromDatabase = async () => {
  if (syncRetryTimer) {
    clearTimeout(syncRetryTimer);
    syncRetryTimer = null;
  }
  try {
    activeTradesCache = await Trade.find({ status: "open" });
    pendingOrdersCache = await Trade.find({ status: "pending" });
    console.log(
      `[TradeEngine] Synced ${activeTradesCache.length} active trades, ${pendingOrdersCache.length} pending orders.`
    );
  } catch (error) {
    console.error("[TradeEngine] Sync error, retrying in 5s:", error.message);
    syncRetryTimer = setTimeout(syncFromDatabase, SYNC_RETRY_DELAY_MS);
  }
};

// Re-sync whenever the Mongo connection comes up so the engine recovers
// from a dropped connection without a full process restart.
if (mongoose.connection && typeof mongoose.connection.on === "function") {
  mongoose.connection.on("connected", syncFromDatabase);
  mongoose.connection.on("reconnected", syncFromDatabase);
}

// Cache mutators — use these from controllers instead of poking the arrays.

const addActiveTrade = (trade) => {
  activeTradesCache.push(trade);
};

const addPendingOrder = (trade) => {
  pendingOrdersCache.push(trade);
};

const removeActiveTrade = (tradeId) => {
  activeTradesCache = activeTradesCache.filter((t) => t.tradeId !== tradeId);
};

const removePendingOrder = (tradeId) => {
  pendingOrdersCache = pendingOrdersCache.filter((t) => t.tradeId !== tradeId);
};

/**
 * Reflect a TP/SL update into the caches so the price-tick monitor sees the
 * new levels immediately (the DB was already updated by the caller).
 */
const updateCachedLevels = (tradeId, tpPrice, slPrice) => {
  const cachedActive = activeTradesCache.find((t) => t.tradeId === tradeId);
  if (cachedActive) {
    cachedActive.tpPrice = tpPrice;
    cachedActive.slPrice = slPrice;
  }
  const cachedPending = pendingOrdersCache.find((t) => t.tradeId === tradeId);
  if (cachedPending) {
    cachedPending.tpPrice = tpPrice;
    cachedPending.slPrice = slPrice;
  }
};

/**
 * Run `work` inside a Mongoose transaction if the deployment supports them,
 * otherwise just invoke `work({ session: null })`. Falls back transparently
 * when running against standalone MongoDB (where transactions throw).
 */
const withOptionalTransaction = async (work) => {
  let session = null;
  try {
    session = await mongoose.startSession();
  } catch (_) {
    return work({ session: null });
  }

  try {
    let result;
    await session.withTransaction(async () => {
      result = await work({ session });
    });
    return result;
  } catch (error) {
    if (
      error &&
      (error.code === 20 || // IllegalOperation: transactions not supported
        /Transaction numbers are only allowed/i.test(error.message || "") ||
        /replica set/i.test(error.message || ""))
    ) {
      return work({ session: null });
    }
    throw error;
  } finally {
    if (session && typeof session.endSession === "function") {
      await session.endSession();
    }
  }
};

/**
 * Persist a trade close: mark the trade closed and credit/debit the user.
 *
 * Two MongoDB writes are issued, both atomic and idempotent:
 *   1. `Trade.findOneAndUpdate` flips status open|pending → closed only if
 *      the trade is currently open or pending. A second concurrent caller
 *      sees null and bails out without crediting again.
 *   2. `User.findByIdAndUpdate` with `$inc` applies the P&L to the user's
 *      balance without a read-modify-save race.
 *
 * Both writes are wrapped in a transaction where supported.
 *
 * @returns {?{trade, profit:number, newBalance:number, challengeResult:?string}}
 *          null if the trade was already closed by a concurrent caller.
 */
const finalizeTradeClose = async (trade, exitPrice, closeReason, user) => {
  const profit = calculateProfit(trade, exitPrice);
  const exitPriceRounded = parseFloat(exitPrice.toFixed(5));
  const profitRounded = parseFloat(profit.toFixed(2));
  const closedAt = new Date();

  const { closedTrade, updatedUser } = await withOptionalTransaction(
    async ({ session }) => {
      const opts = session ? { session, new: true } : { new: true };

      const claimed = await Trade.findOneAndUpdate(
        { tradeId: trade.tradeId, status: { $in: ["open", "pending"] } },
        {
          $set: {
            status: "closed",
            exitPrice: exitPriceRounded,
            profit: profitRounded,
            closeReason,
            closedAt,
          },
        },
        opts
      );

      if (!claimed) return { closedTrade: null, updatedUser: null };

      const credited = await User.findByIdAndUpdate(
        user._id,
        { $inc: { accountBalance: profitRounded } },
        opts
      );

      return { closedTrade: claimed, updatedUser: credited };
    }
  );

  if (!closedTrade) return null;

  // Mirror the persisted state onto the caller's in-memory docs so the
  // challenge evaluator and HTTP response see fresh values.
  trade.status = "closed";
  trade.exitPrice = exitPriceRounded;
  trade.profit = profitRounded;
  trade.closeReason = closeReason;
  trade.closedAt = closedAt;

  if (updatedUser) {
    user.accountBalance = updatedUser.accountBalance;
  } else {
    user.accountBalance = (user.accountBalance || 0) + profitRounded;
  }

  const challengeResult = await evaluateChallengeOutcome(user);

  return {
    trade,
    profit: profitRounded,
    newBalance: user.accountBalance,
    challengeResult,
  };
};

/**
 * Automatic close path for TP/SL hits discovered by the price-tick monitor.
 * Looks up the trade + user fresh from the DB (cache entries may be stale),
 * delegates to `finalizeTradeClose`, then evicts the cache entry.
 *
 * @returns {Promise<?string>} challenge outcome if the close triggered one
 */
const autoCloseTrade = async (tradeId, exitPrice, reason) => {
  try {
    const trade = await Trade.findOne({ tradeId });
    if (!trade || trade.status === "closed") {
      removeActiveTrade(tradeId);
      return null;
    }

    const user = await User.findById(trade.userId);
    if (!user) return null;

    const result = await finalizeTradeClose(trade, exitPrice, reason, user);
    removeActiveTrade(tradeId);

    if (!result) return null;

    console.log(
      `[TradeEngine] Auto-closed ${trade.symbol} (${reason}). Profit: ${result.profit}`
    );
    return result.challengeResult;
  } catch (error) {
    console.error(`[TradeEngine] Error auto-closing trade ${tradeId}:`, error);
    return null;
  }
};

/**
 * Promote a pending limit/stop order to an open trade at the given trigger
 * price. If margin no longer covers the position (balance dropped since the
 * order was placed), cancel the order instead.
 *
 * On a stop order, the actual fill price can gap past `limitPrice`. We
 * therefore re-validate TP/SL against the new entry — if they end up on the
 * wrong side, we null them out so the trade isn't auto-closed at a
 * guaranteed loss labelled as take-profit.
 */
const activatePendingOrder = async (order, entryPrice) => {
  try {
    const trade = await Trade.findOne({ tradeId: order.tradeId });
    if (!trade || trade.status !== "pending") {
      removePendingOrder(order.tradeId);
      return;
    }

    const user = await User.findById(trade.userId);
    if (!user) return;

    const margin = calculateMargin(trade.lotSize, entryPrice, trade.leverage);

    if (margin > user.accountBalance) {
      console.log(`[TradeEngine] Insufficient margin for ${trade.tradeId}, cancelling.`);
      trade.status = "closed";
      trade.closeReason = "manual";
      trade.closedAt = new Date();
      await trade.save();
      removePendingOrder(order.tradeId);
      return;
    }

    const isBuy = trade.orderType === "buy";
    let { tpPrice, slPrice } = trade;

    if (tpPrice !== null && tpPrice !== undefined) {
      const tpInvalid = isBuy ? tpPrice <= entryPrice : tpPrice >= entryPrice;
      if (tpInvalid) {
        console.warn(
          `[TradeEngine] Pending ${trade.tradeId} activated at ${entryPrice}; TP ${tpPrice} now on the wrong side — clearing.`
        );
        tpPrice = null;
      }
    }
    if (slPrice !== null && slPrice !== undefined) {
      const slInvalid = isBuy ? slPrice >= entryPrice : slPrice <= entryPrice;
      if (slInvalid) {
        console.warn(
          `[TradeEngine] Pending ${trade.tradeId} activated at ${entryPrice}; SL ${slPrice} now on the wrong side — clearing.`
        );
        slPrice = null;
      }
    }

    trade.status = "open";
    trade.entryPrice = parseFloat(entryPrice.toFixed(5));
    trade.tpPrice = tpPrice;
    trade.slPrice = slPrice;
    await trade.save();

    console.log(
      `[TradeEngine] Activated ${trade.executionType} ${trade.orderType.toUpperCase()} on ${trade.symbol} @ ${entryPrice}`
    );

    removePendingOrder(order.tradeId);
    addActiveTrade(trade);
  } catch (error) {
    console.error(`[TradeEngine] Error activating order ${order.tradeId}:`, error);
  }
};

// Price-tick monitor: runs for every symbol update. For buys we check against
// the bid (the price at which we'd sell to close); for sells, the ask. The
// fill price passed to `autoCloseTrade` is the *gapped-through* tick price,
// not the TP/SL level — so a tick that punches past TP fills at the punch
// price, matching how a real broker would settle the leg.
priceEvents.on("priceUpdate", (priceData) => {
  activeTradesCache
    .filter((t) => t.symbol === priceData.symbol)
    .forEach((trade) => {
      const exitPriceToCheck =
        trade.orderType === "buy" ? priceData.bid : priceData.ask;
      const check = evaluateTakeProfitStopLoss(trade, exitPriceToCheck);
      if (check.hit) {
        autoCloseTrade(trade.tradeId, check.price, check.reason);
      }
    });

  pendingOrdersCache
    .filter((t) => t.symbol === priceData.symbol)
    .forEach((order) => {
      const check = evaluatePendingOrderTrigger(order, priceData);
      if (check.triggered) {
        activatePendingOrder(order, check.entryPrice);
      }
    });
});

syncFromDatabase();

module.exports = {
  finalizeTradeClose,
  autoCloseTrade,
  activatePendingOrder,
  addActiveTrade,
  addPendingOrder,
  removeActiveTrade,
  removePendingOrder,
  updateCachedLevels,
  syncFromDatabase,
};
