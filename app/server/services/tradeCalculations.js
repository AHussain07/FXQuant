/**
 * Pure trade math helpers. No I/O, no DB — easy to unit test in isolation.
 *
 * Covers:
 *   - margin required to open a position
 *   - realized P&L on close (with USD-base pair conversion)
 *   - TP/SL hit detection for an open trade
 *   - trigger detection for a pending limit / stop order
 */

/**
 * Margin required to hold a position, in the user's account currency (USD).
 *
 * @param {number} lotSize  position size in units
 * @param {number} price    entry (or reference) price
 * @param {number} leverage e.g. 50 means 50:1
 * @returns {number} margin in USD
 */
const calculateMargin = (lotSize, price, leverage) => {
  return (lotSize * price) / leverage;
};

/**
 * Realized profit / loss for a closed trade, expressed in USD.
 *
 * For USD-quote pairs (EURUSD, GBPUSD, ...) the raw P&L is already in USD.
 * For USD-base pairs (USDJPY, USDCAD, USDCHF) the raw P&L lands in the quote
 * currency, so we divide by the exit price to convert back to USD.
 *
 * @param {{entryPrice:number, lotSize:number, orderType:'buy'|'sell', symbol:string}} trade
 * @param {number} exitPrice
 * @returns {number} profit in USD (negative for a loss)
 */
const calculateProfit = (trade, exitPrice) => {
  const { entryPrice, lotSize, orderType, symbol } = trade;
  const priceDifference =
    orderType === "buy" ? exitPrice - entryPrice : entryPrice - exitPrice;
  const rawProfit = priceDifference * lotSize;

  if (symbol && symbol.startsWith("USD")) {
    return rawProfit / exitPrice;
  }
  return rawProfit;
};

/**
 * Decide whether an open trade has hit its take-profit or stop-loss.
 *
 * The returned `price` is the *current* tick price, not the TP/SL level —
 * so a tick that gaps past the level fills at the gapped price, matching
 * how a real broker would settle the leg.
 *
 * @param {{orderType:'buy'|'sell', tpPrice:?number, slPrice:?number}} trade
 * @param {number} currentExitPrice  bid for buys, ask for sells
 * @returns {{hit:boolean, reason?:'take_profit'|'stop_loss', price?:number}}
 */
const evaluateTakeProfitStopLoss = (trade, currentExitPrice) => {
  const { orderType, tpPrice, slPrice } = trade;
  const isBuy = orderType === "buy";

  if (tpPrice && (isBuy ? currentExitPrice >= tpPrice : currentExitPrice <= tpPrice)) {
    return { hit: true, reason: "take_profit", price: currentExitPrice };
  }
  if (slPrice && (isBuy ? currentExitPrice <= slPrice : currentExitPrice >= slPrice)) {
    return { hit: true, reason: "stop_loss", price: currentExitPrice };
  }
  return { hit: false };
};

/**
 * Decide whether a pending limit/stop order should fire against the latest tick.
 *
 * Limit buy  — triggers when ask drops to / below limit (buy cheaper)
 * Limit sell — triggers when bid rises to / above limit (sell dearer)
 * Stop buy   — triggers when ask breaks up through stop (buy breakout)
 * Stop sell  — triggers when bid breaks down through stop (sell breakdown)
 *
 * @param {{executionType:'limit'|'stop', orderType:'buy'|'sell', limitPrice:number}} order
 * @param {{bid:number, ask:number}} priceData
 * @returns {{triggered:boolean, entryPrice?:number}}
 */
const evaluatePendingOrderTrigger = (order, priceData) => {
  const { executionType, orderType, limitPrice } = order;
  const isBuy = orderType === "buy";

  if (executionType === "limit") {
    if (isBuy && priceData.ask <= limitPrice) return { triggered: true, entryPrice: priceData.ask };
    if (!isBuy && priceData.bid >= limitPrice) return { triggered: true, entryPrice: priceData.bid };
  } else if (executionType === "stop") {
    if (isBuy && priceData.ask >= limitPrice) return { triggered: true, entryPrice: priceData.ask };
    if (!isBuy && priceData.bid <= limitPrice) return { triggered: true, entryPrice: priceData.bid };
  }
  return { triggered: false };
};

module.exports = {
  calculateMargin,
  calculateProfit,
  evaluateTakeProfitStopLoss,
  evaluatePendingOrderTrigger,
};
