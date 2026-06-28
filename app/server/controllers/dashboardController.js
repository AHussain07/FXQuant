/**
 * Dashboard statistics endpoint.
 *
 * Produces the aggregate numbers the dashboard page plots: win rate, P&L,
 * equity curve, most-traded pairs, most-used confluences, average R:R.
 *
 * All stats are scoped to the user's CURRENT challenge (trades opened after
 * `challengeStartedAt`). An optional `?timeframe=week|month|year|all` query
 * param further narrows which closed trades contribute.
 */

const Trade = require("../models/Trade");
const User = require("../models/User");
const JournalEntry = require("../models/JournalEntry");

const DEFAULT_STARTING_BALANCE = 100000;
const TOP_PAIRS_LIMIT = 5;
const TOP_CONFLUENCES_LIMIT = 5;

/**
 * Translate a ?timeframe= query value into a `closedAt: { $gte: ... }` filter.
 * Returns {} for "all" / missing / unrecognised values.
 */
const buildTimeframeFilter = (timeframe) => {
  if (!timeframe || timeframe === "all") return {};

  const now = new Date();
  let startDate = null;
  switch (timeframe) {
    case "week":  startDate = new Date(now.setDate(now.getDate() - 7)); break;
    case "month": startDate = new Date(now.setMonth(now.getMonth() - 1)); break;
    case "year":  startDate = new Date(now.setFullYear(now.getFullYear() - 1)); break;
    default:      return {};
  }
  return { closedAt: { $gte: startDate } };
};

/** All-zero stats object returned when the user has no closed trades yet. */
const emptyStats = () => ({
  totalTrades: 0,
  winningTrades: 0,
  losingTrades: 0,
  winRate: 0,
  mostProfitablePair: null,
  avgRiskReward: 0,
  grossProfit: 0,
  grossLoss: 0,
  equityCurve: [],
  mostTradedPairs: [],
  topConfluences: [],
});

/**
 * Win/loss counts, gross P&L, and best-performing pair.
 */
const computeTradeTotals = (trades) => {
  const totalTrades = trades.length;
  const winningTrades = trades.filter((t) => t.profit > 0).length;
  const losingTrades = trades.filter((t) => t.profit < 0).length;
  const winRate = (winningTrades / totalTrades) * 100;

  const grossProfit = trades.filter((t) => t.profit > 0).reduce((sum, t) => sum + t.profit, 0);
  const grossLoss = Math.abs(
    trades.filter((t) => t.profit < 0).reduce((sum, t) => sum + t.profit, 0)
  );

  const pairProfits = {};
  trades.forEach((t) => {
    pairProfits[t.symbol] = (pairProfits[t.symbol] || 0) + (t.profit || 0);
  });
  const mostProfitablePair =
    Object.entries(pairProfits)
      .sort((a, b) => b[1] - a[1])
      .map(([symbol, profit]) => ({ symbol, profit }))[0] || null;

  return { totalTrades, winningTrades, losingTrades, winRate, grossProfit, grossLoss, mostProfitablePair };
};

/**
 * Average realised R:R across trades that had both TP and SL set. Trades
 * without a defined SL are excluded rather than counted as infinite.
 */
const computeAverageRiskReward = (trades) => {
  const ratios = trades
    .filter((t) => t.entryPrice && t.tpPrice && t.slPrice != null)
    .map((t) => {
      const reward = Math.abs(t.tpPrice - t.entryPrice);
      const risk = Math.abs(t.slPrice - t.entryPrice);
      return risk > 0 ? reward / risk : 0;
    });
  if (ratios.length === 0) return 0;
  return ratios.reduce((sum, r) => sum + r, 0) / ratios.length;
};

/**
 * Running-balance time series for the equity curve plot.
 *
 * When a timeframe filter is active we need to start from the balance the
 * user had at the *start* of that window, not the initial balance — hence
 * the extra query for trades that closed before the window.
 */
const computeEquityCurve = async (trades, user, hasTimeframeFilter) => {
  const startingBalance = user.initialBalance || DEFAULT_STARTING_BALANCE;
  let runningBalance = startingBalance;

  if (hasTimeframeFilter) {
    const priorFilter = {
      userId: user._id,
      status: "closed",
      closedAt: { $lt: trades[0]?.closedAt || new Date() },
    };
    if (user.challengeStartedAt) {
      priorFilter.createdAt = { $gte: user.challengeStartedAt };
    }
    const priorTrades = await Trade.find(priorFilter);
    runningBalance = startingBalance + priorTrades.reduce((s, t) => s + (t.profit || 0), 0);
  }

  return [
    { date: trades[0].openedAt || trades[0].closedAt, balance: runningBalance },
    ...trades.map((t) => {
      runningBalance += t.profit || 0;
      return { date: t.closedAt, balance: runningBalance };
    }),
  ];
};

/** Top-N most traded symbols by count. */
const computeMostTradedPairs = (trades) => {
  const counts = {};
  trades.forEach((t) => {
    counts[t.symbol] = (counts[t.symbol] || 0) + 1;
  });
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, TOP_PAIRS_LIMIT)
    .map(([symbol, count]) => ({ symbol, count }));
};

/**
 * Top-N most-used trade-setup confluences, aggregated across journal entries.
 * Accepts confluences stored as plain strings or as `{ name }` objects.
 */
const computeTopConfluences = async (userObjectId, challengeStartedAt, dateFilter) => {
  const query = { userId: userObjectId };
  if (challengeStartedAt) query.createdAt = { $gte: challengeStartedAt };
  if (dateFilter.closedAt) {
    query.createdAt = { ...query.createdAt, ...dateFilter.closedAt };
  }

  const journals = await JournalEntry.find(query);
  const counts = {};
  journals.forEach((j) => {
    if (!Array.isArray(j.confluences)) return;
    j.confluences.forEach((c) => {
      const name = typeof c === "string" ? c : c.name || c;
      if (name && name.trim()) counts[name] = (counts[name] || 0) + 1;
    });
  });

  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, TOP_CONFLUENCES_LIMIT)
    .map(([name, count]) => ({ name, count }));
};

/**
 * GET /api/dashboard/:userId?timeframe=week|month|year|all
 * Returns the full set of dashboard metrics in one payload.
 */
const getDashboardStats = async (req, res) => {
  try {
    const { userId } = req.params;
    const { timeframe } = req.query;

    const user = await User.findOne({ userId });
    if (!user) return res.status(404).json({ message: "User not found" });

    const challengeFilter = user.challengeStartedAt
      ? { createdAt: { $gte: user.challengeStartedAt } }
      : {};
    const timeframeFilter = buildTimeframeFilter(timeframe);

    const trades = await Trade.find({
      userId: user._id,
      status: "closed",
      ...challengeFilter,
      ...timeframeFilter,
    }).sort({ closedAt: 1 });

    if (trades.length === 0) return res.json(emptyStats());

    const totals = computeTradeTotals(trades);
    const avgRiskReward = computeAverageRiskReward(trades);
    const equityCurve = await computeEquityCurve(
      trades,
      user,
      Boolean(timeframeFilter.closedAt)
    );
    const mostTradedPairs = computeMostTradedPairs(trades);
    const topConfluences = await computeTopConfluences(
      user._id,
      user.challengeStartedAt,
      timeframeFilter
    );

    res.json({
      ...totals,
      avgRiskReward,
      equityCurve,
      mostTradedPairs,
      topConfluences,
    });
  } catch (error) {
    console.error("Dashboard stats error:", error);
    res.status(500).json({ message: error.message });
  }
};

module.exports = { getDashboardStats };
