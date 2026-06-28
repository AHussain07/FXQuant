/**
 * Live FX price feed.
 *
 * Maintains a Finnhub WebSocket subscription for the supported OANDA symbols,
 * derives a synthetic bid/ask from the mid price using a fixed spread, caches
 * the latest tick per symbol, and re-emits every tick via the `priceEvents`
 * EventEmitter so other modules (notably tradeEngine) can react to price
 * movement without polling.
 *
 * The module connects on load and auto-reconnects with a 5-second backoff.
 */

const WebSocket = require("ws");
const EventEmitter = require("events");

const priceEvents = new EventEmitter();

const FINNHUB_API_KEY = process.env.FINNHUB_API_KEY;
if (!FINNHUB_API_KEY) {
  throw new Error(
    "FINNHUB_API_KEY is not set. Add it to .env before starting the server."
  );
}

// Synthetic spread applied on top of the mid price (half added to ask, half
// subtracted from bid). 0.00015 ≈ 1.5 pips for a 4-decimal pair.
const SPREAD_PIPS = 0.00015;

const RECONNECT_DELAY_MS = 5000;

// Map our internal symbol names → Finnhub's OANDA symbol format.
const INTERNAL_TO_OANDA = {
  EURUSD: "OANDA:EUR_USD",
  GBPUSD: "OANDA:GBP_USD",
  USDJPY: "OANDA:USD_JPY",
  AUDUSD: "OANDA:AUD_USD",
  USDCAD: "OANDA:USD_CAD",
  USDCHF: "OANDA:USD_CHF",
  NZDUSD: "OANDA:NZD_USD",
};

const OANDA_TO_INTERNAL = Object.fromEntries(
  Object.entries(INTERNAL_TO_OANDA).map(([k, v]) => [v, k])
);

const latestPrices = {};
let socket = null;

/**
 * Open the Finnhub WebSocket, subscribe to every symbol in INTERNAL_TO_OANDA,
 * and wire up message / error / close handlers. On close, schedules a reconnect.
 */
const initWebSocket = () => {
  socket = new WebSocket(`wss://ws.finnhub.io?token=${FINNHUB_API_KEY}`);

  socket.on("open", () => {
    console.log("[PriceController] Connected to Finnhub OANDA WebSocket");
    Object.values(INTERNAL_TO_OANDA).forEach((symbol) => {
      socket.send(JSON.stringify({ type: "subscribe", symbol }));
    });
  });

  socket.on("message", (data) => {
    try {
      const message = JSON.parse(data);
      if (message.type !== "trade") return;

      message.data.forEach((tick) => {
        const internalSymbol = OANDA_TO_INTERNAL[tick.s];
        if (!internalSymbol) return;

        const mid = tick.p;
        const priceData = {
          symbol: internalSymbol,
          mid,
          bid: parseFloat((mid - SPREAD_PIPS / 2).toFixed(5)),
          ask: parseFloat((mid + SPREAD_PIPS / 2).toFixed(5)),
          timestamp: new Date().toISOString(),
        };

        latestPrices[internalSymbol] = priceData;
        priceEvents.emit("priceUpdate", priceData);
      });
    } catch (error) {
      console.error("[PriceController] Error parsing WS message:", error);
    }
  });

  socket.on("error", (error) => {
    console.error("[PriceController] WebSocket Error:", error);
  });

  socket.on("close", () => {
    console.log(`[PriceController] Disconnected. Reconnecting in ${RECONNECT_DELAY_MS / 1000}s...`);
    setTimeout(initWebSocket, RECONNECT_DELAY_MS);
  });
};

initWebSocket();

/**
 * Non-HTTP lookup used by the trade controller and engine.
 * Returns `{ success:false, status:503 }` if the price stream hasn't yet
 * delivered a tick for the requested symbol.
 */
const getPriceForSymbol = async (symbol) => {
  const priceData = latestPrices[symbol];
  if (!priceData) {
    return {
      success: false,
      error: "Price not yet available. Waiting for stream...",
      status: 503,
    };
  }
  return {
    success: true,
    price: priceData.mid,
    bid: priceData.bid,
    ask: priceData.ask,
    symbol,
    timestamp: priceData.timestamp,
  };
};

/** GET /api/prices/:symbol — same data as getLivePrice; kept for route compat. */
const getCurrentPrice = (req, res) => {
  const { symbol } = req.params;
  if (!symbol) return res.status(400).json({ error: "Symbol required" });

  const priceData = latestPrices[symbol];
  if (!priceData) {
    return res.status(503).json({ error: `Price data not yet available for ${symbol}` });
  }
  res.json({
    symbol,
    price: priceData.mid,
    bid: priceData.bid,
    ask: priceData.ask,
    timestamp: priceData.timestamp,
  });
};

/** GET /api/prices/live/:symbol — returns the structured `getPriceForSymbol` payload. */
const getLivePrice = async (req, res) => {
  const result = await getPriceForSymbol(req.params.symbol);
  if (!result.success) return res.status(result.status).json({ message: result.error });
  res.json(result);
};

module.exports = {
  getCurrentPrice,
  getLivePrice,
  getPriceForSymbol,
  priceEvents,
};
