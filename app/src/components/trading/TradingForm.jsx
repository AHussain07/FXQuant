import React, { useState, useEffect, useCallback } from "react";
import { useAuth } from "../../context/AuthContext";
import InfoTooltip from "../common/InfoTooltip";
import {
  createTrade,
  closeTrade,
  getOpenTrades,
  updateTradeLevels,
  checkTradeTPSL,
  getCurrentPrice,
  cancelPendingOrder,
} from "../../services/api";

const LEVERAGE = 50;

const calculateFloatingPL = (trade, currentPrice) => {
  if (!currentPrice || !trade || !trade.entryPrice) return 0;
  const diff =
    trade.orderType === "buy"
      ? currentPrice - trade.entryPrice
      : trade.entryPrice - currentPrice;
  const rawPL = diff * trade.lotSize;
  // For USD-base pairs (USDJPY, USDCAD, USDCHF) rawPL is in the quote currency.
  // Divide by the current price to convert back to USD.
  if (trade.symbol && trade.symbol.startsWith("USD")) {
    return rawPL / currentPrice;
  }
  return rawPL;
};

const calculateMargin = (units, price) => {
  if (!units || !price) return 0;
  return (units * price) / LEVERAGE;
};

const calculateTradeValue = (units, price) => {
  if (!units || !price) return 0;
  return units * price;
};

const calculatePipValue = (units, symbol) => {
  if (!units) return 0;
  if (symbol && symbol.includes("JPY")) {
    return units * 0.01;
  }
  return units * 0.0001;
};

const sizeToUnits = (value, mode, price, accountBalance) => {
  const v = parseFloat(value);
  if (!v || v <= 0 || !price || price <= 0) return 0;
  if (mode === "units") return v;
  if (mode === "usd") {
    // USD margin amount -> units: margin = (units * price) / leverage
    // units = (margin * leverage) / price
    return (v * LEVERAGE) / price;
  }
  if (mode === "percent") {
    // % of account balance as margin -> units
    const marginAmount = (accountBalance * v) / 100;
    return (marginAmount * LEVERAGE) / price;
  }
  return 0;
};

function SpinnerInput({ value, onChange, step, min, className, placeholder, ...rest }) {
  const numStep = parseFloat(step) || 1;
  const increment = () => {
    const current = parseFloat(value) || 0;
    onChange(String(current + numStep));
  };
  const decrement = () => {
    const current = parseFloat(value) || 0;
    const minVal = parseFloat(min) || 0;
    const next = current - numStep;
    onChange(String(next < minVal ? minVal : next));
  };

  return (
    <div className="tv-input-wrap">
      <input
        type="number"
        step={step}
        min={min}
        className={`tv-input ${className || ""}`}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        {...rest}
      />
      <div className="tv-spinner">
        <button type="button" className="tv-spinner-btn" onClick={increment} tabIndex={-1}>&#x25B2;</button>
        <button type="button" className="tv-spinner-btn" onClick={decrement} tabIndex={-1}>&#x25BC;</button>
      </div>
    </div>
  );
}

function TradingForm({ onCancel, onTradeCompleted, symbol, onChallengeEnd, initialOrderType = "buy" }) {
  const { currentUser, dbUser, refreshUserData } = useAuth();

  // Order form state
  const [executionType, setExecutionType] = useState("market");
  const [orderType, setOrderType] = useState(initialOrderType);
  const [sizeMode, setSizeMode] = useState("units"); // "units" | "usd" | "percent"
  const [sizeValue, setSizeValue] = useState("1000");
  const [limitPrice, setLimitPrice] = useState("");

  // Exits
  const [tpEnabled, setTpEnabled] = useState(false);
  const [slEnabled, setSlEnabled] = useState(false);
  const [takeProfit, setTakeProfit] = useState("");
  const [stopLoss, setStopLoss] = useState("");

  // UI state
  const [errors, setErrors] = useState({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [activeTrade, setActiveTrade] = useState(null);
  const [isClosing, setIsClosing] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [loadingTrade, setLoadingTrade] = useState(true);

  // Edit levels for active trade
  const [editTpEnabled, setEditTpEnabled] = useState(false);
  const [editSlEnabled, setEditSlEnabled] = useState(false);
  const [editTakeProfit, setEditTakeProfit] = useState("");
  const [editStopLoss, setEditStopLoss] = useState("");

  // Live price
  const [bidPrice, setBidPrice] = useState(null);
  const [askPrice, setAskPrice] = useState(null);
  const [currentPrice, setCurrentPrice] = useState(null);

  // Fetch live bid/ask prices
  useEffect(() => {
    const fetchPrice = async () => {
      try {
        const data = await getCurrentPrice(symbol);
        if (data) {
          setBidPrice(data.bid);
          setAskPrice(data.ask);
          setCurrentPrice(data.price || data.bid);
        }
      } catch (e) {
        // quiet
      }
    };

    fetchPrice();
    const interval = setInterval(fetchPrice, 1000);
    return () => clearInterval(interval);
  }, [symbol]);

  // Check for existing open/pending trade
  const checkExistingTrade = useCallback(async () => {
    if (!currentUser) return;
    try {
      setLoadingTrade(true);
      const openTrades = await getOpenTrades(currentUser.uid);
      if (openTrades && openTrades.length > 0) {
        const trade = openTrades[0];
        setActiveTrade(trade);
        setEditTpEnabled(!!trade.tpPrice);
        setEditSlEnabled(!!trade.slPrice);
        setEditTakeProfit(trade.tpPrice ? trade.tpPrice.toString() : "");
        setEditStopLoss(trade.slPrice ? trade.slPrice.toString() : "");
      }
    } catch (error) {
      console.error("Error checking existing trades:", error);
    } finally {
      setLoadingTrade(false);
    }
  }, [currentUser]);

  useEffect(() => {
    checkExistingTrade();
  }, [checkExistingTrade]);

  // Fetch current price for active trade
  useEffect(() => {
    if (!activeTrade || activeTrade.status === "pending") return;

    const fetchPrice = async () => {
      try {
        const data = await getCurrentPrice(activeTrade.symbol);
        if (data && data.price) {
          setCurrentPrice(data.price);
        }
      } catch (e) {
        // quiet
      }
    };

    fetchPrice();
    const interval = setInterval(fetchPrice, 1000);
    return () => clearInterval(interval);
  }, [activeTrade]);

  // Monitor active trade for TP/SL hits
  useEffect(() => {
    let intervalId;
    if (activeTrade) {
      intervalId = setInterval(async () => {
        try {
          const result = await checkTradeTPSL(activeTrade.tradeId);

          // If pending order was executed, refresh
          if (result.trade && result.trade.status === "open" && activeTrade.status === "pending") {
            setActiveTrade(result.trade);
            return;
          }

          if (!result.stillOpen) {
            clearInterval(intervalId);
            await refreshUserData();
            if (result.challengeResult && onChallengeEnd) {
              onChallengeEnd(result.challengeResult);
            } else {
              onCancel();
            }
          }
        } catch (error) {
          console.error("Error monitoring trade:", error);
        }
      }, 2000);
    }
    return () => {
      if (intervalId) clearInterval(intervalId);
    };
  }, [activeTrade, onCancel, refreshUserData, onChallengeEnd]);

  // Set default limit price when switching execution types
  useEffect(() => {
    if (executionType !== "market" && !limitPrice) {
      const price = orderType === "buy" ? bidPrice : askPrice;
      if (price) {
        setLimitPrice(price.toFixed(5));
      }
    }
  }, [executionType, orderType, bidPrice, askPrice, limitPrice]);

  const handleCloseTrade = async () => {
    if (!activeTrade) return;
    setIsClosing(true);

    try {
      // Close a buy at bid, close a sell at ask (same as auto-close logic)
      let priceToClose =
        activeTrade.orderType === "buy" ? bidPrice : askPrice;
      if (!priceToClose) {
        const pData = await getCurrentPrice(activeTrade.symbol);
        priceToClose =
          activeTrade.orderType === "buy" ? pData?.bid : pData?.ask;
      }
      if (!priceToClose) throw new Error("Price unavailable");

      const response = await closeTrade(activeTrade.tradeId, priceToClose);

      if (response.challengeResult && onChallengeEnd) {
        await refreshUserData();
        onChallengeEnd(response.challengeResult);
      } else if (onTradeCompleted) {
        onTradeCompleted({
          tradeId: activeTrade.tradeId,
          symbol: activeTrade.symbol,
          orderType: activeTrade.orderType,
          entryPrice: activeTrade.entryPrice,
          exitPrice: priceToClose,
          profitLoss: response.profit,
          closeReason: "manual",
        });
      } else {
        await refreshUserData();
        onCancel();
      }
    } catch (error) {
      alert("Failed: " + error.message);
    } finally {
      setIsClosing(false);
    }
  };

  const handleCancelPending = async () => {
    if (!activeTrade) return;
    setIsClosing(true);
    try {
      await cancelPendingOrder(activeTrade.tradeId);
      await refreshUserData();
      setActiveTrade(null);
    } catch (error) {
      alert("Failed to cancel: " + error.message);
    } finally {
      setIsClosing(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const newErrors = {};

    const sv = parseFloat(sizeValue);
    if (!sizeValue || isNaN(sv) || sv <= 0) {
      newErrors.sizeValue = sizeMode === "percent"
        ? "Enter a valid percentage"
        : sizeMode === "usd"
        ? "Enter a valid USD amount"
        : "Enter a valid number of units";
    }
    if (sizeMode === "percent" && sv > 100) {
      newErrors.sizeValue = "Percentage cannot exceed 100%";
    }

    if (executionType !== "market") {
      const lp = parseFloat(limitPrice);
      if (!limitPrice || isNaN(lp) || lp <= 0) {
        newErrors.limitPrice = "Enter a valid price";
      }
    }

    if (tpEnabled) {
      const tp = parseFloat(takeProfit);
      if (!takeProfit || isNaN(tp) || tp <= 0) {
        newErrors.takeProfit = "Enter a valid take profit price";
      }
    }

    if (slEnabled) {
      const sl = parseFloat(stopLoss);
      if (!stopLoss || isNaN(sl) || sl <= 0) {
        newErrors.stopLoss = "Enter a valid stop loss price";
      }
    }

    setErrors(newErrors);
    if (Object.keys(newErrors).length > 0) return;

    setIsSubmitting(true);
    try {
      const submitPrice = executionType === "market"
        ? (orderType === "buy" ? askPrice : bidPrice)
        : parseFloat(limitPrice) || 0;
      const balance = dbUser?.accountBalance || 0;
      const computedUnits = Math.round(sizeToUnits(sizeValue, sizeMode, submitPrice, balance));

      if (computedUnits <= 0) {
        setErrors({ general: "Calculated units must be greater than 0" });
        setIsSubmitting(false);
        return;
      }

      const tradeData = {
        userId: currentUser.uid,
        symbol,
        orderType: orderType.toLowerCase(),
        lotSize: computedUnits,
        executionType,
        limitPrice: executionType !== "market" ? parseFloat(limitPrice) : undefined,
        tpPrice: tpEnabled ? parseFloat(takeProfit) : undefined,
        slPrice: slEnabled ? parseFloat(stopLoss) : undefined,
      };

      const response = await createTrade(tradeData);
      await refreshUserData();
      setActiveTrade(response.trade);
      setEditTpEnabled(!!response.trade.tpPrice);
      setEditSlEnabled(!!response.trade.slPrice);
      setEditTakeProfit(response.trade.tpPrice ? response.trade.tpPrice.toString() : "");
      setEditStopLoss(response.trade.slPrice ? response.trade.slPrice.toString() : "");
    } catch (error) {
      setErrors({ general: error.message || "Failed to place order" });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleUpdateLevels = async () => {
    if (!activeTrade) return;
    const newErrors = {};

    if (editTpEnabled) {
      const tp = parseFloat(editTakeProfit);
      if (!editTakeProfit || isNaN(tp) || tp <= 0) {
        newErrors.editTakeProfit = "Enter a valid take profit price";
      } else if (activeTrade.entryPrice) {
        if (activeTrade.orderType === "buy" && tp <= activeTrade.entryPrice)
          newErrors.editTakeProfit = "TP must be above entry for BUY";
        if (activeTrade.orderType === "sell" && tp >= activeTrade.entryPrice)
          newErrors.editTakeProfit = "TP must be below entry for SELL";
      }
    }

    if (editSlEnabled) {
      const sl = parseFloat(editStopLoss);
      if (!editStopLoss || isNaN(sl) || sl <= 0) {
        newErrors.editStopLoss = "Enter a valid stop loss price";
      } else if (activeTrade.entryPrice) {
        if (activeTrade.orderType === "buy" && sl >= activeTrade.entryPrice)
          newErrors.editStopLoss = "SL must be below entry for BUY";
        if (activeTrade.orderType === "sell" && sl <= activeTrade.entryPrice)
          newErrors.editStopLoss = "SL must be above entry for SELL";
      }
    }

    setErrors(newErrors);
    if (Object.keys(newErrors).length > 0) return;

    setIsUpdating(true);
    try {
      const result = await updateTradeLevels(activeTrade.tradeId, {
        tpPrice: editTpEnabled ? parseFloat(editTakeProfit) : null,
        slPrice: editSlEnabled ? parseFloat(editStopLoss) : null,
      });
      setActiveTrade(result.trade);
    } catch (error) {
      setErrors({ general: error.message || "Failed to update levels" });
    } finally {
      setIsUpdating(false);
    }
  };

  // --- LOADING ---
  if (loadingTrade) {
    return (
      <div className="tv-order-panel">
        <div className="tv-order-header">
          <h3 className="tv-order-title">{symbol}</h3>
          <button className="form-close-btn" onClick={onCancel}>&#x2715;</button>
        </div>
        <div className="tv-order-body" style={{ alignItems: "center", justifyContent: "center", minHeight: 200 }}>
          <span style={{ color: "var(--muted-foreground)" }}>Checking for open trades...</span>
        </div>
      </div>
    );
  }

  // --- ACTIVE TRADE / PENDING ORDER VIEW ---
  if (activeTrade) {
    const isPending = activeTrade.status === "pending";
    const pl = isPending ? 0 : calculateFloatingPL(activeTrade, currentPrice);
    const isProfit = pl >= 0;
    const formattedPL = currentPrice && !isPending
      ? `${isProfit ? "+" : "-"}$${Math.abs(pl).toFixed(2)}`
      : "...";

    return (
      <div className="tv-order-panel">
        <div className="tv-order-header">
          <h3 className="tv-order-title">{activeTrade.symbol}</h3>
          <button className="form-close-btn" onClick={onCancel}>&#x2715;</button>
        </div>

        <div className="tv-order-body">
          {/* Status badge */}
          <div className={`tv-status-badge ${activeTrade.orderType}`}>
            <span className={`status-dot ${activeTrade.orderType}`}></span>
            <span>{activeTrade.orderType.toUpperCase()} {isPending ? `(${activeTrade.executionType.toUpperCase()})` : "MARKET"}</span>
            {isPending && <span className="tv-pending-tag">PENDING</span>}
          </div>

          {/* P/L Banner - only for open trades */}
          {!isPending && (
            <div className={`tv-pl-banner ${isProfit ? "profit" : "loss"}`}>
              <div className="tv-pl-label">
                Unrealized P/L
                <InfoTooltip text="The profit or loss you would make if you closed this trade right now. It changes constantly as the market price moves. It only becomes real once you close the trade." />
              </div>
              <div className="tv-pl-value">
                {currentPrice ? formattedPL : <span className="tv-pl-syncing">Syncing...</span>}
              </div>
              {currentPrice && (
                <div className="tv-pl-price">Current: {currentPrice.toFixed(5)}</div>
              )}
            </div>
          )}

          {/* Order info */}
          <div className="tv-order-info">
            <div className="tv-info-row">
              <span className="tv-info-label">{isPending ? "Trigger Price" : "Entry Price"}</span>
              <span className="tv-info-value">
                {isPending ? activeTrade.limitPrice?.toFixed(5) : activeTrade.entryPrice?.toFixed(5)}
              </span>
            </div>
            <div className="tv-info-row">
              <span className="tv-info-label">Units</span>
              <span className="tv-info-value">{activeTrade.lotSize?.toLocaleString()}</span>
            </div>
            <div className="tv-info-row">
              <span className="tv-info-label">
                Leverage
                <InfoTooltip text={`With ${LEVERAGE}:1 leverage, you control a position ${LEVERAGE}x larger than your deposit. This multiplies both your potential profits and your potential losses.`} />
              </span>
              <span className="tv-info-value">{LEVERAGE}:1</span>
            </div>
            {activeTrade.tpPrice && (
              <div className="tv-info-row">
                <span className="tv-info-label">
                  Take Profit
                  <InfoTooltip text="The price at which your trade will automatically close to lock in a profit. When the market reaches this level, the trade closes and your gain is secured." />
                </span>
                <span className="tv-info-value tv-tp">{activeTrade.tpPrice.toFixed(5)}</span>
              </div>
            )}
            {activeTrade.slPrice && (
              <div className="tv-info-row">
                <span className="tv-info-label">
                  Stop Loss
                  <InfoTooltip text="The price at which your trade will automatically close to limit your loss. It acts as a safety net to prevent you from losing more than you are comfortable with." />
                </span>
                <span className="tv-info-value tv-sl">{activeTrade.slPrice.toFixed(5)}</span>
              </div>
            )}
          </div>

          {/* Edit TP/SL Section */}
          <div className="tv-exits-section">
            <div className="tv-exits-header">
              <span className="tv-exits-title">Edit Exits</span>
            </div>

            <div className="tv-exit-row">
              <div className="tv-exit-label-row">
                <span className="tv-exit-label">Take profit</span>
                <label className="tv-toggle">
                  <input
                    type="checkbox"
                    checked={editTpEnabled}
                    onChange={(e) => setEditTpEnabled(e.target.checked)}
                  />
                  <span className="tv-toggle-slider"></span>
                </label>
              </div>
              {editTpEnabled && (
                <div className="tv-exit-input-wrap">
                  <SpinnerInput
                    step="0.00001"
                    min="0"
                    className={errors.editTakeProfit ? "input-error" : ""}
                    value={editTakeProfit}
                    onChange={(val) => setEditTakeProfit(val)}
                    placeholder="Price"
                  />
                  {errors.editTakeProfit && (
                    <span className="error-text">{errors.editTakeProfit}</span>
                  )}
                </div>
              )}
            </div>

            <div className="tv-exit-row">
              <div className="tv-exit-label-row">
                <span className="tv-exit-label">Stop loss</span>
                <label className="tv-toggle">
                  <input
                    type="checkbox"
                    checked={editSlEnabled}
                    onChange={(e) => setEditSlEnabled(e.target.checked)}
                  />
                  <span className="tv-toggle-slider"></span>
                </label>
              </div>
              {editSlEnabled && (
                <div className="tv-exit-input-wrap">
                  <SpinnerInput
                    step="0.00001"
                    min="0"
                    className={errors.editStopLoss ? "input-error" : ""}
                    value={editStopLoss}
                    onChange={(val) => setEditStopLoss(val)}
                    placeholder="Price"
                  />
                  {errors.editStopLoss && (
                    <span className="error-text">{errors.editStopLoss}</span>
                  )}
                </div>
              )}
            </div>

            {errors.general && (
              <div className="form-error-banner">{errors.general}</div>
            )}

            <button
              className="tv-update-btn"
              onClick={handleUpdateLevels}
              disabled={isUpdating}
            >
              {isUpdating ? "Updating..." : "Update TP/SL"}
            </button>
          </div>

          {/* Close / Cancel button */}
          {isPending ? (
            <button
              className="tv-close-btn"
              onClick={handleCancelPending}
              disabled={isClosing}
            >
              {isClosing ? "Cancelling..." : "Cancel Pending Order"}
            </button>
          ) : (
            <button
              className="tv-close-btn"
              onClick={handleCloseTrade}
              disabled={isClosing}
            >
              {isClosing ? "Closing..." : `Close Trade (${formattedPL})`}
            </button>
          )}
        </div>
      </div>
    );
  }

  // --- ORDER PLACEMENT FORM ---
  const priceForCalc = executionType === "market"
    ? (orderType === "buy" ? askPrice : bidPrice)
    : parseFloat(limitPrice) || 0;
  const accountBalance = dbUser?.accountBalance || 0;
  const computedUnits = Math.round(sizeToUnits(sizeValue, sizeMode, priceForCalc, accountBalance));
  const margin = calculateMargin(computedUnits, priceForCalc);
  const tradeValue = calculateTradeValue(computedUnits, priceForCalc);
  const pipValue = calculatePipValue(computedUnits, symbol);

  return (
    <div className="tv-order-panel">
      {/* Header with symbol */}
      <div className="tv-order-header">
        <h3 className="tv-order-title">{symbol}</h3>
        <button className="form-close-btn" onClick={onCancel}>&#x2715;</button>
      </div>

      {/* Sell / Buy price display */}
      <div className="tv-price-bar">
        <button
          className={`tv-price-side tv-sell-side ${orderType === "sell" ? "active" : ""}`}
          onClick={() => setOrderType("sell")}
        >
          <div className="tv-price-side-label">Sell</div>
          <div className="tv-price-side-value">{bidPrice ? bidPrice.toFixed(5) : "..."}</div>
        </button>
        <button
          className={`tv-price-side tv-buy-side ${orderType === "buy" ? "active" : ""}`}
          onClick={() => setOrderType("buy")}
        >
          <div className="tv-price-side-label">Buy</div>
          <div className="tv-price-side-value">{askPrice ? askPrice.toFixed(5) : "..."}</div>
        </button>
      </div>

      {/* Execution type tabs */}
      <div className="tv-exec-tabs">
        {["market", "limit", "stop"].map((type) => (
          <button
            key={type}
            className={`tv-exec-tab ${executionType === type ? "active" : ""}`}
            onClick={() => {
              setExecutionType(type);
              if (type === "market") setLimitPrice("");
            }}
          >
            {type.charAt(0).toUpperCase() + type.slice(1)}
          </button>
        ))}
      </div>

      <form onSubmit={handleSubmit} className="tv-order-body">
        {errors.general && (
          <div className="form-error-banner">{errors.general}</div>
        )}

        {/* Limit/Stop price input */}
        {executionType !== "market" && (
          <div className="tv-field">
            <label className="tv-field-label">
              {executionType === "limit" ? "Limit Price" : "Stop Price"}
            </label>
            <SpinnerInput
              step="0.00001"
              min="0"
              className={errors.limitPrice ? "input-error" : ""}
              value={limitPrice}
              onChange={(val) => setLimitPrice(val)}
              placeholder="0.00000"
            />
            {errors.limitPrice && (
              <span className="error-text">{errors.limitPrice}</span>
            )}
          </div>
        )}

        {/* Size mode selector + input */}
        <div className="tv-field">
          <div className="tv-size-header">
            <div className="tv-size-select-group">
              <select
                className="tv-size-select"
                value={sizeMode}
                onChange={(e) => {
                  setSizeMode(e.target.value);
                  setSizeValue("");
                }}
              >
                <option value="units">Units</option>
                <option value="usd">Margin USD</option>
                <option value="percent">% balance</option>
              </select>
              <InfoTooltip
                text={
                  sizeMode === "units"
                    ? "Enter the raw number of currency units to trade. 1,000 units of EUR/USD means you are buying or selling 1,000 euros."
                    : sizeMode === "usd"
                    ? "Enter the dollar amount to use as your margin deposit. The actual position size will be larger due to leverage."
                    : "Enter what percentage of your account balance to use as margin. For example, 2% of a $10,000 account means $200 in margin."
                }
              />
            </div>
            <span className="tv-margin-hint">
              {margin > 0 ? `${margin.toFixed(2)} USD` : ""}
            </span>
          </div>
          <SpinnerInput
            step={sizeMode === "percent" ? "0.1" : sizeMode === "usd" ? "1" : "100"}
            min={sizeMode === "percent" ? "0.1" : "1"}
            className={errors.sizeValue ? "input-error" : ""}
            value={sizeValue}
            onChange={(val) => setSizeValue(val)}
            placeholder={
              sizeMode === "units" ? "1000" :
              sizeMode === "usd" ? "26.53" :
              "1.0"
            }
          />
          {computedUnits > 0 && sizeMode !== "units" && (
            <span className="tv-computed-units">
              = {computedUnits.toLocaleString()} units
            </span>
          )}
          {errors.sizeValue && (
            <span className="error-text">{errors.sizeValue}</span>
          )}
        </div>

        {/* Exits section */}
        <div className="tv-exits-section">
          <div className="tv-exits-header">
            <span className="tv-exits-title">Exits</span>
          </div>

          {/* Take Profit */}
          <div className="tv-exit-row">
            <div className="tv-exit-label-row">
              <span className="tv-exit-label">
                Take profit, price
                <InfoTooltip text="The price at which your trade automatically closes to lock in a profit. Set it above your entry for a buy, or below for a sell." />
              </span>
              <label className="tv-toggle">
                <input
                  type="checkbox"
                  checked={tpEnabled}
                  onChange={(e) => setTpEnabled(e.target.checked)}
                />
                <span className="tv-toggle-slider"></span>
              </label>
            </div>
            {tpEnabled && (
              <div className="tv-exit-input-wrap">
                <SpinnerInput
                  step="0.00001"
                  min="0"
                  className={errors.takeProfit ? "input-error" : ""}
                  value={takeProfit}
                  onChange={(val) => setTakeProfit(val)}
                  placeholder={orderType === "buy" ? "Above entry" : "Below entry"}
                />
                {errors.takeProfit && (
                  <span className="error-text">{errors.takeProfit}</span>
                )}
              </div>
            )}
          </div>

          {/* Stop Loss */}
          <div className="tv-exit-row">
            <div className="tv-exit-label-row">
              <span className="tv-exit-label">
                Stop loss, price
                <InfoTooltip text="The price at which your trade automatically closes to limit your loss. It acts as a safety net. Set it below your entry for a buy, or above for a sell." />
              </span>
              <label className="tv-toggle">
                <input
                  type="checkbox"
                  checked={slEnabled}
                  onChange={(e) => setSlEnabled(e.target.checked)}
                />
                <span className="tv-toggle-slider"></span>
              </label>
            </div>
            {slEnabled && (
              <div className="tv-exit-input-wrap">
                <SpinnerInput
                  step="0.00001"
                  min="0"
                  className={errors.stopLoss ? "input-error" : ""}
                  value={stopLoss}
                  onChange={(val) => setStopLoss(val)}
                  placeholder={orderType === "buy" ? "Below entry" : "Above entry"}
                />
                {errors.stopLoss && (
                  <span className="error-text">{errors.stopLoss}</span>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Order Info */}
        <div className="tv-order-info">
          <div className="tv-order-info-title">Order info</div>
          <div className="tv-info-row">
            <span className="tv-info-label">
              Margin
              <InfoTooltip text="The portion of your account balance reserved as a deposit to open this trade. It is not a fee but collateral held while the trade is open." />
            </span>
            <span className="tv-info-value">
              {margin > 0 ? `${margin.toFixed(2)} / ${accountBalance.toLocaleString(undefined, { minimumFractionDigits: 2 })}` : "--"}
            </span>
          </div>
          <div className="tv-info-row tv-info-row-bar">
            <div className="tv-margin-bar">
              <div
                className="tv-margin-bar-fill"
                style={{ width: `${Math.min((margin / accountBalance) * 100, 100)}%` }}
              ></div>
            </div>
          </div>
          <div className="tv-info-row">
            <span className="tv-info-label">
              Leverage
              <InfoTooltip text={`With ${LEVERAGE}:1 leverage, your deposit controls a position ${LEVERAGE}x its size. For example, $100 controls $5,000 worth of currency. This amplifies both profits and losses.`} />
            </span>
            <span className="tv-info-value tv-info-bold">{LEVERAGE}:1</span>
          </div>
          <div className="tv-info-row">
            <span className="tv-info-label">
              Pip value
              <InfoTooltip text="How much money you gain or lose for each 0.0001 move in price (called a pip). A higher unit count means a larger pip value and bigger gains or losses per price move." />
            </span>
            <span className="tv-info-value">{pipValue > 0 ? `${pipValue.toFixed(2)} USD` : "--"}</span>
          </div>
          <div className="tv-info-row">
            <span className="tv-info-label">
              Trade value
              <InfoTooltip text="The total value of the position you are controlling, including the leverage multiplier. This is larger than your margin deposit." />
            </span>
            <span className="tv-info-value">{tradeValue > 0 ? `${tradeValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD` : "--"}</span>
          </div>
        </div>

        {/* Submit button */}
        <button
          type="submit"
          className={`tv-submit-btn ${orderType === "buy" ? "tv-btn-buy" : "tv-btn-sell"}`}
          disabled={isSubmitting}
        >
          {isSubmitting
            ? "Placing..."
            : `${orderType === "buy" ? "Buy" : "Sell"} ${computedUnits > 0 ? computedUnits.toLocaleString() : ""} ${symbol} ${executionType.toUpperCase()}`
          }
        </button>
      </form>
    </div>
  );
}

export default TradingForm;
