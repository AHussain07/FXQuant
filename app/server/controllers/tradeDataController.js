/**
 * Read-only HTTP handlers for trade history and the open-trades list.
 *
 * Kept separate from tradeController.js because these are pure queries with
 * no side effects on the trade engine / caches. Filter params are documented
 * inline on each handler.
 */

const Trade = require("../models/Trade");
const User = require("../models/User");
const JournalEntry = require("../models/JournalEntry");

/**
 * Translate ?timeframe= into a `closedAt: { $gte }` filter. Returns {} for
 * "all" / missing / unrecognised values so callers can spread it safely.
 */
const buildTimeframeFilter = (timeframe) => {
  if (!timeframe || timeframe === "all") return {};
  const now = new Date();
  const start = new Date();
  if (timeframe === "week") start.setDate(now.getDate() - 7);
  else if (timeframe === "month") start.setMonth(now.getMonth() - 1);
  else if (timeframe === "year") start.setFullYear(now.getFullYear() - 1);
  else return {};
  return { closedAt: { $gte: start } };
};

/**
 * GET /api/trades/user/:userId/history?timeframe=&outcome=&confluence=
 * Closed trades for the user, filtered by optional timeframe, outcome
 * (win/loss), and confluence tag. Each result has a `hasJournal` flag so
 * the UI can show a "journal it" prompt for trades missing an entry.
 */
const getTradeHistory = async (req, res) => {
  try {
    const { userId } = req.params;
    const { timeframe, outcome, confluence } = req.query;

    const user = await User.findOne({ userId });
    if (!user) return res.status(404).json({ message: "User not found" });

    const query = {
      userId: user._id,
      status: "closed",
      ...buildTimeframeFilter(timeframe),
    };

    if (outcome === "win") query.profit = { $gt: 0 };
    else if (outcome === "loss") query.profit = { $lte: 0 };

    if (confluence && confluence !== "all") {
      const matching = await JournalEntry.find({ confluences: confluence }).select("tradeId");
      query.tradeId = { $in: matching.map((j) => j.tradeId) };
    }

    const trades = await Trade.find(query).sort({ closedAt: -1 });

    const tradesWithJournalStatus = await Promise.all(
      trades.map(async (trade) => {
        const journalEntry = await JournalEntry.findOne({ tradeId: trade.tradeId });
        return { ...trade.toObject(), hasJournal: !!journalEntry };
      })
    );

    res.json(tradesWithJournalStatus);
  } catch (error) {
    console.error("Get trade history error:", error);
    res.status(500).json({ message: error.message });
  }
};

/**
 * GET /api/trades/user/:userId/open
 * Currently-open trades only. Note: this intentionally excludes "pending"
 * orders — use getUserTrades (tradeController) if you need both.
 */
const getOpenTrades = async (req, res) => {
  try {
    const { userId } = req.params;
    const user = await User.findOne({ userId });
    if (!user) return res.status(404).json({ error: "User not found" });

    const trades = await Trade.find({
      userId: user._id,
      status: "open",
    }).sort({ createdAt: -1 });

    res.status(200).json(trades);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

module.exports = {
  getTradeHistory,
  getOpenTrades,
};
