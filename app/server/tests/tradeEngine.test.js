/**
 * Unit tests for services/tradeEngine.js
 *
 * Covers the auto-close mechanism, pending-order promotion, and cache
 * mutators. External collaborators (Trade/User models, price feed, email)
 * are mocked — no DB, no network.
 *
 * Requirements covered:
 *   FR6 — Backend auto-closes positions when TP/SL is reached
 *   FR7 — TP/SL modifications reflected in the in-memory cache
 *   FR8 — finalizeTradeClose is the shared close path (manual + auto)
 *   FR19 — Challenge outcome is evaluated on every close
 */

// ── Mock all external collaborators BEFORE requiring the engine ──
jest.mock("../models/Trade", () => ({
  find: jest.fn().mockResolvedValue([]),
  findOne: jest.fn(),
  findOneAndUpdate: jest.fn(),
}));

jest.mock("../models/User", () => ({
  findById: jest.fn(),
  findByIdAndUpdate: jest.fn(),
}));

jest.mock("mongoose", () => {
  const startSession = jest.fn();
  return {
    startSession,
    connection: { on: jest.fn() },
  };
});

jest.mock("../controllers/priceController", () => {
  const { EventEmitter } = require("events");
  return { priceEvents: new EventEmitter() };
});

jest.mock("../services/challengeService", () => ({
  evaluateChallengeOutcome: jest.fn().mockResolvedValue(null),
}));

// Now import under test.
const Trade = require("../models/Trade");
const User = require("../models/User");
const mongoose = require("mongoose");
const { priceEvents } = require("../controllers/priceController");
const { evaluateChallengeOutcome } = require("../services/challengeService");

const engine = require("../services/tradeEngine");

// Make every test run through the non-transactional fallback path so we
// don't need a real replica-set-aware Mongo. We simulate the failure mode
// the engine's wrapper is designed to handle.
const installMongooseSessionMock = () => {
  mongoose.startSession.mockRejectedValue(new Error("not running with replica set"));
};

// Utility: build a mock mongoose-style trade doc with a jest save spy.
const makeTradeDoc = (overrides = {}) => ({
  tradeId: "t-1",
  userId: "user-oid",
  symbol: "EURUSD",
  orderType: "buy",
  entryPrice: 1.1,
  tpPrice: 1.12,
  slPrice: 1.09,
  lotSize: 10_000,
  leverage: 50,
  status: "open",
  save: jest.fn().mockResolvedValue(undefined),
  ...overrides,
});

const makeUserDoc = (overrides = {}) => ({
  _id: "user-oid",
  userId: "user-123",
  accountBalance: 100_000,
  accountType: "prop_100k",
  initialBalance: 100_000,
  profitTarget: 6_000,
  maxLoss: 4_000,
  save: jest.fn().mockResolvedValue(undefined),
  ...overrides,
});

// Wire the atomic-claim mocks for the happy path: the trade is currently
// open and gets flipped to closed; the user balance is incremented by $inc.
const wireHappyPath = (trade, user) => {
  Trade.findOneAndUpdate.mockImplementationOnce(async (filter, update) => {
    Object.assign(trade, update.$set);
    return trade;
  });
  User.findByIdAndUpdate.mockImplementationOnce(async (id, update) => {
    user.accountBalance += update.$inc.accountBalance;
    return user;
  });
};

describe("tradeEngine — finalizeTradeClose [FR6, FR8, FR19]", () => {
  beforeEach(() => {
    jest.resetAllMocks();
    installMongooseSessionMock();
  });

  it("should credit a winning trade's profit to the user and mark it closed [FR8]", async () => {
    const trade = makeTradeDoc({ entryPrice: 1.1, orderType: "buy", symbol: "EURUSD" });
    const user = makeUserDoc({ accountBalance: 10_000 });
    wireHappyPath(trade, user);

    const result = await engine.finalizeTradeClose(trade, 1.11, "take_profit", user);

    expect(trade.status).toBe("closed");
    expect(trade.closeReason).toBe("take_profit");
    expect(trade.exitPrice).toBe(1.11);
    expect(trade.profit).toBeCloseTo(100, 2);
    expect(Trade.findOneAndUpdate).toHaveBeenCalledTimes(1);

    expect(user.accountBalance).toBeCloseTo(10_100, 2);
    expect(User.findByIdAndUpdate).toHaveBeenCalledTimes(1);
    expect(result.profit).toBeCloseTo(100, 2);
    expect(result.newBalance).toBeCloseTo(10_100, 2);
  });

  it("should debit the user when the trade is a loss [FR8]", async () => {
    const trade = makeTradeDoc({ entryPrice: 1.1, orderType: "buy" });
    const user = makeUserDoc({ accountBalance: 10_000 });
    wireHappyPath(trade, user);

    await engine.finalizeTradeClose(trade, 1.09, "stop_loss", user);
    expect(user.accountBalance).toBeCloseTo(9_900, 2);
  });

  it("should always consult the challenge service on close [FR19]", async () => {
    evaluateChallengeOutcome.mockResolvedValueOnce("failed");
    const trade = makeTradeDoc();
    const user = makeUserDoc();
    wireHappyPath(trade, user);

    const result = await engine.finalizeTradeClose(trade, 1.09, "stop_loss", user);
    expect(evaluateChallengeOutcome).toHaveBeenCalledWith(user);
    expect(result.challengeResult).toBe("failed");
  });

  it("should stamp closedAt so history queries can sort by it [FR8]", async () => {
    const trade = makeTradeDoc();
    const user = makeUserDoc();
    wireHappyPath(trade, user);

    const before = Date.now();
    await engine.finalizeTradeClose(trade, 1.11, "manual", user);
    expect(trade.closedAt).toBeInstanceOf(Date);
    expect(trade.closedAt.getTime()).toBeGreaterThanOrEqual(before);
  });

  it("should bail out without crediting if the atomic claim returns null (concurrent close) [FR8]", async () => {
    const trade = makeTradeDoc();
    const user = makeUserDoc({ accountBalance: 10_000 });
    Trade.findOneAndUpdate.mockResolvedValueOnce(null);

    const result = await engine.finalizeTradeClose(trade, 1.11, "take_profit", user);

    expect(result).toBeNull();
    expect(User.findByIdAndUpdate).not.toHaveBeenCalled();
    expect(user.accountBalance).toBe(10_000); // untouched
  });
});

describe("tradeEngine — autoCloseTrade [FR6]", () => {
  beforeEach(() => {
    jest.resetAllMocks();
    installMongooseSessionMock();
  });

  it("should auto-close a trade that has hit TP [FR6]", async () => {
    const trade = makeTradeDoc({ tradeId: "auto-tp", status: "open" });
    const user = makeUserDoc();
    Trade.findOne.mockResolvedValueOnce(trade);
    User.findById.mockResolvedValueOnce(user);
    wireHappyPath(trade, user);

    await engine.autoCloseTrade("auto-tp", 1.12, "take_profit");

    expect(trade.status).toBe("closed");
    expect(trade.closeReason).toBe("take_profit");
    expect(Trade.findOneAndUpdate).toHaveBeenCalled();
  });

  it("should be a no-op if the trade is already closed (idempotency guard) [FR6]", async () => {
    const trade = makeTradeDoc({ status: "closed", save: jest.fn() });
    Trade.findOne.mockResolvedValueOnce(trade);

    await engine.autoCloseTrade("already-closed", 1.11, "take_profit");
    expect(Trade.findOneAndUpdate).not.toHaveBeenCalled();
    expect(User.findByIdAndUpdate).not.toHaveBeenCalled();
  });

  it("should return null and not throw when the trade is missing [FR6]", async () => {
    Trade.findOne.mockResolvedValueOnce(null);
    await expect(engine.autoCloseTrade("ghost", 1.11, "take_profit")).resolves.toBeNull();
  });

  it("should swallow DB errors so a failing close never kills the tick loop [FR6]", async () => {
    Trade.findOne.mockRejectedValueOnce(new Error("boom"));
    await expect(engine.autoCloseTrade("t-err", 1.11, "take_profit")).resolves.toBeNull();
  });
});

describe("tradeEngine — cache mutators [FR7]", () => {
  beforeEach(() => {
    jest.resetAllMocks();
    installMongooseSessionMock();
  });

  it("should reflect updated TP/SL levels in the cache [FR7]", async () => {
    // Seed: push a trade into the active cache, then mutate its levels.
    const trade = makeTradeDoc({ tradeId: "upd-1", tpPrice: 1.12, slPrice: 1.09 });
    engine.addActiveTrade(trade);
    engine.updateCachedLevels("upd-1", 1.15, 1.08);

    // Fire a tick that would hit the OLD TP (1.12) but not the NEW one (1.15).
    // If the listener wrongly uses the stale level, autoCloseTrade fires and
    // Trade.findOne is called — assert on that without pre-mocking DB.
    priceEvents.emit("priceUpdate", { symbol: "EURUSD", bid: 1.13, ask: 1.1301 });

    // Flush pending microtasks
    await new Promise((r) => setImmediate(r));
    expect(Trade.findOne).not.toHaveBeenCalled();

    // Cleanup
    engine.removeActiveTrade("upd-1");
  });

  it("should evict a trade from the active cache on removeActiveTrade [FR6]", async () => {
    const trade = makeTradeDoc({ tradeId: "evict-me" });
    engine.addActiveTrade(trade);
    engine.removeActiveTrade("evict-me");

    // If eviction worked, a subsequent TP-hit tick should not trigger a close.
    priceEvents.emit("priceUpdate", { symbol: "EURUSD", bid: 1.12, ask: 1.1202 });
    await new Promise((r) => setImmediate(r));
    expect(Trade.findOne).not.toHaveBeenCalled();
  });
});

describe("tradeEngine — priceEvents listener [FR6]", () => {
  beforeEach(() => {
    jest.resetAllMocks();
    installMongooseSessionMock();
  });

  it("should auto-close an active BUY when bid rises to its TP level [FR6]", async () => {
    const trade = makeTradeDoc({ tradeId: "tick-tp", orderType: "buy", tpPrice: 1.12, slPrice: 1.09 });
    const user = makeUserDoc();
    engine.addActiveTrade(trade);
    Trade.findOne.mockResolvedValueOnce(trade);
    User.findById.mockResolvedValueOnce(user);
    wireHappyPath(trade, user);

    priceEvents.emit("priceUpdate", { symbol: "EURUSD", bid: 1.12, ask: 1.1202 });
    await new Promise((r) => setImmediate(r));

    expect(Trade.findOne).toHaveBeenCalledWith({ tradeId: "tick-tp" });
    expect(trade.status).toBe("closed");
  });

  it("should ignore ticks for symbols that no active trade references [FR6]", async () => {
    const trade = makeTradeDoc({ tradeId: "euronly", symbol: "EURUSD" });
    engine.addActiveTrade(trade);

    priceEvents.emit("priceUpdate", { symbol: "GBPUSD", bid: 1.3, ask: 1.3002 });
    await new Promise((r) => setImmediate(r));
    expect(trade.save).not.toHaveBeenCalled();

    engine.removeActiveTrade("euronly");
  });
});
