/**
 * Unit tests for controllers/dashboardController.js
 *
 * Requirements covered:
 *   FR10 — Dashboard displays win rate, total P&L, equity curve, pair breakdown
 *   FR11 — Stats filterable by week, month, year, all
 *   FR12 — Confluence tag frequency
 *   FR13 — Closed trade history is the input (shape check)
 */

const makeMongooseChain = (resolved) => {
  const chain = {};
  chain.sort = jest.fn().mockReturnValue(Promise.resolve(resolved));
  chain.limit = jest.fn().mockReturnValue(chain);
  return chain;
};

jest.mock("../models/Trade", () => ({
  find: jest.fn(),
}));

jest.mock("../models/User", () => ({
  findOne: jest.fn(),
}));

jest.mock("../models/JournalEntry", () => ({
  find: jest.fn(),
}));

const Trade = require("../models/Trade");
const User = require("../models/User");
const JournalEntry = require("../models/JournalEntry");
const { getDashboardStats } = require("../controllers/dashboardController");

const makeRes = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

const sampleTrades = [
  { symbol: "EURUSD", profit:  100, entryPrice: 1.10, tpPrice: 1.12, slPrice: 1.09, closedAt: new Date("2026-01-02") },
  { symbol: "EURUSD", profit: -50,  entryPrice: 1.11, tpPrice: 1.13, slPrice: 1.10, closedAt: new Date("2026-01-03") },
  { symbol: "GBPUSD", profit:  200, entryPrice: 1.25, tpPrice: 1.27, slPrice: 1.24, closedAt: new Date("2026-01-04") },
  { symbol: "GBPUSD", profit: -80,  entryPrice: 1.26, tpPrice: 1.28, slPrice: 1.25, closedAt: new Date("2026-01-05") },
];

beforeEach(() => jest.clearAllMocks());

describe("getDashboardStats — empty state [FR10]", () => {
  it("should return a zeroed stats object when the user has no closed trades [FR10]", async () => {
    User.findOne.mockResolvedValue({ _id: "u-oid", userId: "u1", initialBalance: 100_000 });
    Trade.find.mockReturnValue(makeMongooseChain([]));

    const res = makeRes();
    await getDashboardStats({ params: { userId: "u1" }, query: {} }, res);

    const body = res.json.mock.calls[0][0];
    expect(body.totalTrades).toBe(0);
    expect(body.winRate).toBe(0);
    expect(body.equityCurve).toEqual([]);
    expect(body.mostTradedPairs).toEqual([]);
  });
});

describe("getDashboardStats — core metrics [FR10]", () => {
  it("should compute win rate, gross profit, gross loss, and equity curve [FR10]", async () => {
    User.findOne.mockResolvedValue({
      _id: "u-oid",
      userId: "u1",
      initialBalance: 10_000,
      challengeStartedAt: null,
    });
    Trade.find.mockReturnValue(makeMongooseChain(sampleTrades));
    JournalEntry.find.mockResolvedValue([]);

    const res = makeRes();
    await getDashboardStats({ params: { userId: "u1" }, query: {} }, res);

    const body = res.json.mock.calls[0][0];
    expect(body.totalTrades).toBe(4);
    expect(body.winningTrades).toBe(2);
    expect(body.losingTrades).toBe(2);
    expect(body.winRate).toBe(50);
    expect(body.grossProfit).toBe(300);
    expect(body.grossLoss).toBe(130);
    // Equity curve has N+1 points (opening balance + one per close).
    expect(body.equityCurve).toHaveLength(5);
    expect(body.equityCurve[0].balance).toBe(10_000);
    expect(body.equityCurve[body.equityCurve.length - 1].balance).toBe(10_170);
  });

  it("should surface the most profitable pair [FR10]", async () => {
    User.findOne.mockResolvedValue({ _id: "u-oid", userId: "u1", initialBalance: 10_000 });
    Trade.find.mockReturnValue(makeMongooseChain(sampleTrades));
    JournalEntry.find.mockResolvedValue([]);

    const res = makeRes();
    await getDashboardStats({ params: { userId: "u1" }, query: {} }, res);
    expect(res.json.mock.calls[0][0].mostProfitablePair).toEqual({
      symbol: "GBPUSD",
      profit: 120,
    });
  });

  it("should include most-traded pairs ordered by count [FR10]", async () => {
    User.findOne.mockResolvedValue({ _id: "u-oid", userId: "u1", initialBalance: 10_000 });
    Trade.find.mockReturnValue(makeMongooseChain(sampleTrades));
    JournalEntry.find.mockResolvedValue([]);

    const res = makeRes();
    await getDashboardStats({ params: { userId: "u1" }, query: {} }, res);
    const pairs = res.json.mock.calls[0][0].mostTradedPairs;
    expect(pairs[0].count).toBe(2);
    expect(pairs).toHaveLength(2);
  });

  it("should compute avg risk-reward only over trades that had both TP + SL [FR10]", async () => {
    // First trade: reward=0.02, risk=0.01 → R:R = 2
    // Second: reward=0.02, risk=0.01 → R:R = 2
    // Third: reward=0.02, risk=0.01 → R:R = 2
    // Fourth: reward=0.02, risk=0.01 → R:R = 2
    User.findOne.mockResolvedValue({ _id: "u-oid", userId: "u1", initialBalance: 10_000 });
    Trade.find.mockReturnValue(makeMongooseChain(sampleTrades));
    JournalEntry.find.mockResolvedValue([]);

    const res = makeRes();
    await getDashboardStats({ params: { userId: "u1" }, query: {} }, res);
    expect(res.json.mock.calls[0][0].avgRiskReward).toBeCloseTo(2, 1);
  });
});

describe("getDashboardStats — timeframe filter [FR11]", () => {
  it.each([
    ["week",  7],
    ["month", 31],
    ["year",  366],
  ])("should apply a closedAt lower-bound for timeframe=%s [FR11]", async (tf, maxDays) => {
    User.findOne.mockResolvedValue({ _id: "u-oid", userId: "u1", initialBalance: 10_000 });
    Trade.find.mockReturnValue(makeMongooseChain([]));

    const res = makeRes();
    await getDashboardStats({ params: { userId: "u1" }, query: { timeframe: tf } }, res);

    const queryArg = Trade.find.mock.calls[0][0];
    expect(queryArg.closedAt).toBeDefined();
    const lowerBound = queryArg.closedAt.$gte;
    const diffDays = (Date.now() - lowerBound.getTime()) / (1000 * 60 * 60 * 24);
    expect(diffDays).toBeGreaterThan(0);
    expect(diffDays).toBeLessThanOrEqual(maxDays + 1);
  });

  it("should apply NO timeframe filter when query omits it or sends 'all' [FR11]", async () => {
    User.findOne.mockResolvedValue({ _id: "u-oid", userId: "u1", initialBalance: 10_000 });
    Trade.find.mockReturnValue(makeMongooseChain([]));

    const res = makeRes();
    await getDashboardStats({ params: { userId: "u1" }, query: { timeframe: "all" } }, res);
    expect(Trade.find.mock.calls[0][0].closedAt).toBeUndefined();
  });
});

describe("getDashboardStats — confluence frequency [FR12]", () => {
  it("should count confluence tags aggregated across journal entries [FR12]", async () => {
    User.findOne.mockResolvedValue({ _id: "u-oid", userId: "u1", initialBalance: 10_000 });
    Trade.find.mockReturnValue(makeMongooseChain(sampleTrades));
    JournalEntry.find.mockResolvedValue([
      { confluences: ["FVG", "BOS", "Asia Sweep"] },
      { confluences: ["FVG", "BOS"] },
      { confluences: ["FVG"] },
    ]);

    const res = makeRes();
    await getDashboardStats({ params: { userId: "u1" }, query: {} }, res);
    const tags = res.json.mock.calls[0][0].topConfluences;
    expect(tags[0]).toEqual({ name: "FVG", count: 3 });
    expect(tags.find((t) => t.name === "BOS")).toEqual({ name: "BOS", count: 2 });
  });

  it("should handle both string and object confluence shapes [FR12]", async () => {
    User.findOne.mockResolvedValue({ _id: "u-oid", userId: "u1", initialBalance: 10_000 });
    Trade.find.mockReturnValue(makeMongooseChain(sampleTrades));
    JournalEntry.find.mockResolvedValue([
      { confluences: [{ name: "FVG" }, "BOS"] },
      { confluences: ["FVG"] },
    ]);

    const res = makeRes();
    await getDashboardStats({ params: { userId: "u1" }, query: {} }, res);
    const tags = res.json.mock.calls[0][0].topConfluences;
    expect(tags.find((t) => t.name === "FVG").count).toBe(2);
  });
});
