import React, { useState, useEffect, useCallback } from "react";
import { useAuth } from "../../context/AuthContext";
import {
  getOpenTrades,
  closeTrade,
  checkTradeTPSL,
  getCurrentPrice,
} from "../../services/api";
import "../../styles/openTrades.css";

function OpenTrades() {
  const { currentUser, refreshUserData } = useAuth();
  const [trades, setTrades] = useState([]);
  const [loading, setLoading] = useState(true);
  const [closingTrade, setClosingTrade] = useState(null);

  const fetchTrades = useCallback(async () => {
    if (!currentUser) return;
    try {
      const openTrades = await getOpenTrades(currentUser.uid);
      setTrades(openTrades);
    } catch (error) {
      console.error("Error fetching trades:", error);
    } finally {
      setLoading(false);
    }
  }, [currentUser]);

  const monitorTrades = useCallback(async () => {
    if (trades.length === 0) return;
    for (const trade of trades) {
      try {
        const result = await checkTradeTPSL(trade.tradeId);
        if (!result.stillOpen) {
          await fetchTrades();
          await refreshUserData();
        }
      } catch (error) {
        /* silent fail */
      }
    }
  }, [trades, fetchTrades, refreshUserData]);

  const handleCloseTrade = async (trade) => {
    if (closingTrade) return;
    setClosingTrade(trade.tradeId);

    try {
      const priceData = await getCurrentPrice(trade.symbol);
      // Close a buy at bid, close a sell at ask (mirrors auto-close TP/SL logic)
      const closePrice =
        trade.orderType === "buy" ? priceData?.bid : priceData?.ask;

      if (!closePrice) throw new Error("Price unavailable");

      const result = await closeTrade(trade.tradeId, closePrice);

      await fetchTrades();
      await refreshUserData();

      alert(`Trade closed! Profit: $${result.profit.toFixed(2)}`);
    } catch (error) {
      console.error("Error closing trade:", error);
      alert("Failed to close trade");
    } finally {
      setClosingTrade(null);
    }
  };

  useEffect(() => {
    fetchTrades();
  }, [fetchTrades]);

  useEffect(() => {
    const interval = setInterval(monitorTrades, 5000);
    return () => clearInterval(interval);
  }, [monitorTrades]);

  if (loading)
    return <div className="open-trades-loading">Loading trades...</div>;
  if (trades.length === 0)
    return (
      <div className="open-trades-empty">
        <p>No open trades</p>
      </div>
    );

  return (
    <div className="open-trades-container">
      <h3 className="open-trades-title">Open Trades ({trades.length})</h3>

      <div className="trades-list">
        {trades.map((trade) => (
          <div
            key={trade.tradeId}
            className={`trade-card trade-${trade.orderType}`}
          >
            <div className="trade-header">
              <span className="trade-symbol">{trade.symbol}</span>
              <span className={`trade-type ${trade.orderType}`}>
                {trade.orderType.toUpperCase()}
              </span>
            </div>

            <div className="trade-details">
              <div className="trade-row">
                <span>Entry</span>
                <span>{trade.entryPrice.toFixed(5)}</span>
              </div>
              <div className="trade-row">
                <span>Lots</span>
                <span>{(trade.lotSize / 100000).toFixed(2)}</span>
              </div>
            </div>

            <button
              className="close-trade-btn"
              onClick={() => handleCloseTrade(trade)}
              disabled={closingTrade === trade.tradeId}
            >
              {closingTrade === trade.tradeId ? "Closing..." : "Close Position"}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

export default OpenTrades;
