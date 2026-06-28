/**
 * Unit tests for services/tradeCalculations.js
 *
 * Covers the pure math that underpins order execution, TP/SL detection,
 * and pending-order triggers.
 *
 * Requirements covered:
 *   FR4 — Market / Limit / Stop order execution (entry math + triggers)
 *   FR5 — TP/SL placement
 *   FR6 — Auto-close on TP/SL hit (evaluateTakeProfitStopLoss)
 *   FR7 — Modify TP/SL on open positions (validation math)
 */

const {
  calculateMargin,
  calculateProfit,
  evaluateTakeProfitStopLoss,
  evaluatePendingOrderTrigger,
} = require("../services/tradeCalculations");

describe("tradeCalculations — calculateMargin [FR4]", () => {
  it("should compute margin as (lotSize * price) / leverage [FR4]", () => {
    expect(calculateMargin(10_000, 1.1, 50)).toBeCloseTo(220, 4);
  });

  it("should scale linearly with lot size [FR4]", () => {
    const base = calculateMargin(10_000, 1.1, 50);
    expect(calculateMargin(20_000, 1.1, 50)).toBeCloseTo(base * 2, 4);
  });

  it("should scale inversely with leverage [FR4]", () => {
    const x50 = calculateMargin(10_000, 1.1, 50);
    const x100 = calculateMargin(10_000, 1.1, 100);
    expect(x100).toBeCloseTo(x50 / 2, 4);
  });
});

describe("tradeCalculations — calculateProfit [FR4, FR8]", () => {
  it("should return positive P&L when a BUY closes above entry on a USD-quote pair [FR8]", () => {
    const trade = { entryPrice: 1.1, lotSize: 10_000, orderType: "buy", symbol: "EURUSD" };
    expect(calculateProfit(trade, 1.11)).toBeCloseTo(100, 4);
  });

  it("should return negative P&L when a BUY closes below entry [FR8]", () => {
    const trade = { entryPrice: 1.1, lotSize: 10_000, orderType: "buy", symbol: "EURUSD" };
    expect(calculateProfit(trade, 1.09)).toBeCloseTo(-100, 4);
  });

  it("should invert the sign convention for SELL trades [FR8]", () => {
    const trade = { entryPrice: 1.1, lotSize: 10_000, orderType: "sell", symbol: "EURUSD" };
    expect(calculateProfit(trade, 1.09)).toBeCloseTo(100, 4);
  });

  it("should divide raw P&L by exit price for USD-base pairs (USDJPY) [FR8]", () => {
    const trade = { entryPrice: 150.0, lotSize: 10_000, orderType: "buy", symbol: "USDJPY" };
    // raw = (151 - 150) * 10000 = 10000 JPY; USD = 10000 / 151
    expect(calculateProfit(trade, 151)).toBeCloseTo(10_000 / 151, 4);
  });

  it("should not divide P&L by exit price for USD-quote pairs (GBPUSD) [FR8]", () => {
    const trade = { entryPrice: 1.25, lotSize: 10_000, orderType: "buy", symbol: "GBPUSD" };
    expect(calculateProfit(trade, 1.26)).toBeCloseTo(100, 4);
  });

  it("should return zero P&L when exit equals entry [FR8]", () => {
    const trade = { entryPrice: 1.1, lotSize: 10_000, orderType: "buy", symbol: "EURUSD" };
    expect(calculateProfit(trade, 1.1)).toBe(0);
  });
});

describe("tradeCalculations — evaluateTakeProfitStopLoss [FR5, FR6]", () => {
  it("should signal take_profit for a BUY when bid rises to the TP level [FR6]", () => {
    const trade = { orderType: "buy", tpPrice: 1.12, slPrice: 1.09 };
    const result = evaluateTakeProfitStopLoss(trade, 1.12);
    expect(result).toEqual({ hit: true, reason: "take_profit", price: 1.12 });
  });

  it("should signal stop_loss for a BUY when bid falls to the SL level [FR6]", () => {
    const trade = { orderType: "buy", tpPrice: 1.12, slPrice: 1.09 };
    const result = evaluateTakeProfitStopLoss(trade, 1.09);
    expect(result).toEqual({ hit: true, reason: "stop_loss", price: 1.09 });
  });

  it("should signal take_profit for a SELL when ask drops to the TP level [FR6]", () => {
    const trade = { orderType: "sell", tpPrice: 1.09, slPrice: 1.12 };
    const result = evaluateTakeProfitStopLoss(trade, 1.09);
    expect(result).toEqual({ hit: true, reason: "take_profit", price: 1.09 });
  });

  it("should signal stop_loss for a SELL when ask rises to the SL level [FR6]", () => {
    const trade = { orderType: "sell", tpPrice: 1.09, slPrice: 1.12 };
    const result = evaluateTakeProfitStopLoss(trade, 1.12);
    expect(result).toEqual({ hit: true, reason: "stop_loss", price: 1.12 });
  });

  it("should not fire when price sits between TP and SL [FR6]", () => {
    const trade = { orderType: "buy", tpPrice: 1.12, slPrice: 1.09 };
    expect(evaluateTakeProfitStopLoss(trade, 1.1).hit).toBe(false);
  });

  it("should ignore unset TP/SL levels [FR5]", () => {
    const trade = { orderType: "buy", tpPrice: null, slPrice: null };
    expect(evaluateTakeProfitStopLoss(trade, 1.5).hit).toBe(false);
  });

  it("should prefer TP when the same tick technically hits both [FR6]", () => {
    // If TP and SL were equal (pathological), TP is checked first.
    const trade = { orderType: "buy", tpPrice: 1.1, slPrice: 1.1 };
    const result = evaluateTakeProfitStopLoss(trade, 1.1);
    expect(result.reason).toBe("take_profit");
  });
});

describe("tradeCalculations — evaluatePendingOrderTrigger [FR4]", () => {
  describe("limit orders", () => {
    it("should trigger a LIMIT BUY when ask drops to/below the limit price [FR4]", () => {
      const order = { executionType: "limit", orderType: "buy", limitPrice: 1.1 };
      const { triggered, entryPrice } = evaluatePendingOrderTrigger(order, { ask: 1.1, bid: 1.0999 });
      expect(triggered).toBe(true);
      expect(entryPrice).toBe(1.1);
    });

    it("should NOT trigger a LIMIT BUY when ask is above the limit [FR4]", () => {
      const order = { executionType: "limit", orderType: "buy", limitPrice: 1.1 };
      expect(evaluatePendingOrderTrigger(order, { ask: 1.11, bid: 1.1098 }).triggered).toBe(false);
    });

    it("should trigger a LIMIT SELL when bid rises to/above the limit price [FR4]", () => {
      const order = { executionType: "limit", orderType: "sell", limitPrice: 1.2 };
      const { triggered, entryPrice } = evaluatePendingOrderTrigger(order, { ask: 1.2002, bid: 1.2 });
      expect(triggered).toBe(true);
      expect(entryPrice).toBe(1.2);
    });
  });

  describe("stop orders", () => {
    it("should trigger a STOP BUY when ask breaks up through the stop level [FR4]", () => {
      const order = { executionType: "stop", orderType: "buy", limitPrice: 1.1 };
      const { triggered, entryPrice } = evaluatePendingOrderTrigger(order, { ask: 1.1001, bid: 1.1 });
      expect(triggered).toBe(true);
      expect(entryPrice).toBe(1.1001);
    });

    it("should trigger a STOP SELL when bid breaks down through the stop level [FR4]", () => {
      const order = { executionType: "stop", orderType: "sell", limitPrice: 1.2 };
      const { triggered, entryPrice } = evaluatePendingOrderTrigger(order, { ask: 1.2, bid: 1.1999 });
      expect(triggered).toBe(true);
      expect(entryPrice).toBe(1.1999);
    });

    it("should NOT trigger a STOP BUY when ask remains below the stop [FR4]", () => {
      const order = { executionType: "stop", orderType: "buy", limitPrice: 1.1 };
      expect(evaluatePendingOrderTrigger(order, { ask: 1.099, bid: 1.098 }).triggered).toBe(false);
    });
  });
});
