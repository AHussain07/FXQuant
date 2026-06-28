/**
 * Unit tests for controllers/tradeController.js
 *
 * We test the controller handlers directly by passing in mock `req` / `res`
 * objects, rather than going through Express. Mongoose models, price feed,
 * and the trade engine are all mocked at the module boundary.
 *
 * Requirements covered:
 *   FR4 — Place Market / Limit / Stop orders on supported pairs
 *   FR5 — Set TP / SL on each order (validation)
 *   FR7 — Modify TP / SL on open positions
 *   FR8 — Close positions manually before TP / SL triggers
 *   NFR1 — Trade placement responds within one second (sanity check)
 */

jest.mock("../models/Trade");
jest.mock("../models/User");
jest.mock("uuid", () => ({ v4: () => "fixed-uuid-1" }));

jest.mock("../controllers/priceController", () => ({
  getPriceForSymbol: jest.fn(),
  priceEvents: { on: jest.fn(), emit: jest.fn() },
}));

jest.mock("../services/tradeEngine", () => ({
  finalizeTradeClose: jest.fn(),
  autoCloseTrade: jest.fn(),
  addActiveTrade: jest.fn(),
  addPendingOrder: jest.fn(),
  removeActiveTrade: jest.fn(),
  removePendingOrder: jest.fn(),
  updateCachedLevels: jest.fn(),
}));

const Trade = require("../models/Trade");
const User = require("../models/User");
const { getPriceForSymbol } = require("../controllers/priceController");
const engine = require("../services/tradeEngine");
const controller = require("../controllers/tradeController");

const makeRes = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

// Model "constructor" that returns a doc with .save() returning itself.
const mockTradeConstructor = () => {
  Trade.mockImplementation(function (fields) {
    Object.assign(this, fields);
    this.save = jest.fn().mockResolvedValue(this);
  });
};

beforeEach(() => {
  jest.clearAllMocks();
  mockTradeConstructor();
});

// ─────────────────────────────────────────────────────────────────────────
// createTrade — market orders [FR4, FR5]
// ─────────────────────────────────────────────────────────────────────────
describe("createTrade — market orders [FR4, FR5]", () => {
  const validBody = {
    userId: "user-1",
    symbol: "EURUSD",
    orderType: "buy",
    lotSize: 10_000,
    tpPrice: 1.12,
    slPrice: 1.09,
    executionType: "market",
  };

  it("should place a Market order on a valid forex pair [FR4]", async () => {
    User.findOne.mockResolvedValue({ _id: "u1", accountBalance: 100_000 });
    Trade.findOne.mockResolvedValue(null);
    getPriceForSymbol.mockResolvedValue({ success: true, bid: 1.0999, ask: 1.1 });

    const res = makeRes();
    await controller.createTrade({ body: validBody }, res);

    expect(res.status).toHaveBeenCalledWith(201);
    expect(engine.addActiveTrade).toHaveBeenCalled();
    const payload = res.json.mock.calls[0][0];
    expect(payload.trade.executionType).toBe("market");
    expect(payload.trade.entryPrice).toBeCloseTo(1.1, 5);
  });

  it("should reject a Market order when required fields are missing [FR4]", async () => {
    const res = makeRes();
    await controller.createTrade({ body: { userId: "u1" } }, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it("should reject a Market order if the user already has an open trade [FR4]", async () => {
    User.findOne.mockResolvedValue({ _id: "u1", accountBalance: 100_000 });
    Trade.findOne.mockResolvedValue({ status: "open" });

    const res = makeRes();
    await controller.createTrade({ body: validBody }, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json.mock.calls[0][0].message).toMatch(/already have an open trade/i);
  });

  it("should reject when the price feed is unavailable [NFR1]", async () => {
    User.findOne.mockResolvedValue({ _id: "u1", accountBalance: 100_000 });
    Trade.findOne.mockResolvedValue(null);
    getPriceForSymbol.mockResolvedValue({ success: false, error: "no feed" });

    const res = makeRes();
    await controller.createTrade({ body: validBody }, res);
    expect(res.status).toHaveBeenCalledWith(503);
  });

  it("should reject a BUY Market order whose TP is at or below entry [FR5]", async () => {
    User.findOne.mockResolvedValue({ _id: "u1", accountBalance: 100_000 });
    Trade.findOne.mockResolvedValue(null);
    getPriceForSymbol.mockResolvedValue({ success: true, bid: 1.0999, ask: 1.1 });

    const res = makeRes();
    await controller.createTrade(
      { body: { ...validBody, tpPrice: 1.05 } },
      res
    );
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json.mock.calls[0][0].message).toMatch(/TP must be above entry/i);
  });

  it("should reject a BUY Market order whose SL is at or above entry [FR5]", async () => {
    User.findOne.mockResolvedValue({ _id: "u1", accountBalance: 100_000 });
    Trade.findOne.mockResolvedValue(null);
    getPriceForSymbol.mockResolvedValue({ success: true, bid: 1.0999, ask: 1.1 });

    const res = makeRes();
    await controller.createTrade(
      { body: { ...validBody, slPrice: 1.2 } },
      res
    );
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json.mock.calls[0][0].message).toMatch(/SL must be below entry/i);
  });

  it("should reject if margin exceeds the user's available balance [FR4]", async () => {
    User.findOne.mockResolvedValue({ _id: "u1", accountBalance: 10 });
    Trade.findOne.mockResolvedValue(null);
    getPriceForSymbol.mockResolvedValue({ success: true, bid: 1.0999, ask: 1.1 });

    const res = makeRes();
    await controller.createTrade({ body: validBody }, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json.mock.calls[0][0].message).toMatch(/insufficient margin/i);
  });

  it("should respond in well under 1 second for a happy-path market order [NFR1]", async () => {
    User.findOne.mockResolvedValue({ _id: "u1", accountBalance: 100_000 });
    Trade.findOne.mockResolvedValue(null);
    getPriceForSymbol.mockResolvedValue({ success: true, bid: 1.0999, ask: 1.1 });

    const res = makeRes();
    const t0 = Date.now();
    await controller.createTrade({ body: validBody }, res);
    expect(Date.now() - t0).toBeLessThan(1000);
  });
});

// ─────────────────────────────────────────────────────────────────────────
// createTrade — limit / stop [FR4]
// ─────────────────────────────────────────────────────────────────────────
describe("createTrade — limit & stop orders [FR4]", () => {
  it("should place a Limit BUY below the current ask [FR4]", async () => {
    User.findOne.mockResolvedValue({ _id: "u1", accountBalance: 100_000 });
    Trade.findOne.mockResolvedValue(null);
    getPriceForSymbol.mockResolvedValue({ success: true, bid: 1.0999, ask: 1.1 });

    const res = makeRes();
    await controller.createTrade(
      {
        body: {
          userId: "u1",
          symbol: "EURUSD",
          orderType: "buy",
          lotSize: 10_000,
          executionType: "limit",
          limitPrice: 1.09,
        },
      },
      res
    );

    expect(res.status).toHaveBeenCalledWith(201);
    expect(engine.addPendingOrder).toHaveBeenCalled();
  });

  it("should reject a Limit BUY whose price is at/above the current ask [FR4]", async () => {
    User.findOne.mockResolvedValue({ _id: "u1", accountBalance: 100_000 });
    Trade.findOne.mockResolvedValue(null);
    getPriceForSymbol.mockResolvedValue({ success: true, bid: 1.0999, ask: 1.1 });

    const res = makeRes();
    await controller.createTrade(
      {
        body: {
          userId: "u1",
          symbol: "EURUSD",
          orderType: "buy",
          lotSize: 10_000,
          executionType: "limit",
          limitPrice: 1.15,
        },
      },
      res
    );
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json.mock.calls[0][0].message).toMatch(/Limit BUY.*below/i);
  });

  it("should reject a Stop SELL whose price is at/above the current bid [FR4]", async () => {
    User.findOne.mockResolvedValue({ _id: "u1", accountBalance: 100_000 });
    Trade.findOne.mockResolvedValue(null);
    getPriceForSymbol.mockResolvedValue({ success: true, bid: 1.0999, ask: 1.1 });

    const res = makeRes();
    await controller.createTrade(
      {
        body: {
          userId: "u1",
          symbol: "EURUSD",
          orderType: "sell",
          lotSize: 10_000,
          executionType: "stop",
          limitPrice: 1.15,
        },
      },
      res
    );
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it("should reject a limit order that omits limitPrice [FR4]", async () => {
    const res = makeRes();
    await controller.createTrade(
      {
        body: {
          userId: "u1",
          symbol: "EURUSD",
          orderType: "buy",
          lotSize: 10_000,
          executionType: "limit",
        },
      },
      res
    );
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it("should reject an unknown executionType [FR4]", async () => {
    const res = makeRes();
    await controller.createTrade(
      {
        body: {
          userId: "u1",
          symbol: "EURUSD",
          orderType: "buy",
          lotSize: 10_000,
          executionType: "trailing-stop",
        },
      },
      res
    );
    expect(res.status).toHaveBeenCalledWith(400);
  });
});

// ─────────────────────────────────────────────────────────────────────────
// updateTradeLevels [FR7]
// ─────────────────────────────────────────────────────────────────────────
describe("updateTradeLevels [FR7]", () => {
  it("should update TP / SL on an open trade and sync the cache [FR7]", async () => {
    const trade = {
      tradeId: "t-1",
      status: "open",
      orderType: "buy",
      entryPrice: 1.1,
      save: jest.fn().mockResolvedValue(undefined),
    };
    Trade.findOne.mockResolvedValue(trade);

    const res = makeRes();
    await controller.updateTradeLevels(
      { params: { tradeId: "t-1" }, body: { tpPrice: 1.15, slPrice: 1.08 } },
      res
    );

    expect(trade.tpPrice).toBe(1.15);
    expect(trade.slPrice).toBe(1.08);
    expect(trade.save).toHaveBeenCalled();
    expect(engine.updateCachedLevels).toHaveBeenCalledWith("t-1", 1.15, 1.08);
  });

  it("should reject an update where the new TP violates the BUY side rule [FR7]", async () => {
    Trade.findOne.mockResolvedValue({
      tradeId: "t-1",
      status: "open",
      orderType: "buy",
      entryPrice: 1.1,
      save: jest.fn(),
    });

    const res = makeRes();
    await controller.updateTradeLevels(
      { params: { tradeId: "t-1" }, body: { tpPrice: 1.05, slPrice: null } },
      res
    );
    expect(res.status).toHaveBeenCalledWith(400);
    expect(engine.updateCachedLevels).not.toHaveBeenCalled();
  });

  it("should refuse to update a closed trade [FR7]", async () => {
    Trade.findOne.mockResolvedValue({ tradeId: "t-1", status: "closed" });
    const res = makeRes();
    await controller.updateTradeLevels(
      { params: { tradeId: "t-1" }, body: { tpPrice: 1.2 } },
      res
    );
    expect(res.status).toHaveBeenCalledWith(400);
  });
});

// ─────────────────────────────────────────────────────────────────────────
// closeTradeManually [FR8]
// ─────────────────────────────────────────────────────────────────────────
describe("closeTradeManually [FR8]", () => {
  it("should close an open trade at the live bid for a BUY and evict from cache [FR8]", async () => {
    const trade = { tradeId: "t-1", status: "open", symbol: "EURUSD", orderType: "buy", userId: "u-oid" };
    Trade.findOne.mockResolvedValue(trade);
    User.findById.mockResolvedValue({ _id: "u-oid", accountBalance: 100_000 });
    getPriceForSymbol.mockResolvedValue({ success: true, bid: 1.11, ask: 1.1102 });
    engine.finalizeTradeClose.mockResolvedValue({
      trade,
      profit: 100,
      newBalance: 100_100,
      challengeResult: null,
    });

    const res = makeRes();
    await controller.closeTradeManually({ params: { tradeId: "t-1" } }, res);

    expect(engine.finalizeTradeClose).toHaveBeenCalledWith(
      trade,
      1.11, // bid used for BUY close
      "manual",
      expect.any(Object)
    );
    expect(engine.removeActiveTrade).toHaveBeenCalledWith("t-1");
    expect(res.json).toHaveBeenCalled();
  });

  it("should cancel (not close) a still-pending order [FR8]", async () => {
    const trade = {
      tradeId: "t-pending",
      status: "pending",
      save: jest.fn().mockResolvedValue(undefined),
    };
    Trade.findOne.mockResolvedValue(trade);

    const res = makeRes();
    await controller.closeTradeManually({ params: { tradeId: "t-pending" } }, res);

    expect(trade.status).toBe("closed");
    expect(trade.closeReason).toBe("manual");
    expect(engine.removePendingOrder).toHaveBeenCalledWith("t-pending");
    expect(engine.finalizeTradeClose).not.toHaveBeenCalled();
  });

  it("should refuse to close an already-closed trade [FR8]", async () => {
    Trade.findOne.mockResolvedValue({ tradeId: "t-1", status: "closed" });
    const res = makeRes();
    await controller.closeTradeManually({ params: { tradeId: "t-1" } }, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it("should 404 when tradeId doesn't exist [FR8]", async () => {
    Trade.findOne.mockResolvedValue(null);
    const res = makeRes();
    await controller.closeTradeManually({ params: { tradeId: "ghost" } }, res);
    expect(res.status).toHaveBeenCalledWith(404);
  });
});
