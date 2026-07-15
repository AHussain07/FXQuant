import React from "react";
import "../../styles/dashboard.css";

function TradingPairsCard({ mostTraded }) {
  if (!mostTraded || mostTraded.length === 0) {
    return (
      <div className="info-card">
        <h3>Most traded pairs</h3>
        <div className="empty-state">No trading data available yet.</div>
      </div>
    );
  }

  const maxCount = mostTraded[0].count;

  return (
    <div className="info-card">
      <h3>Most traded pairs</h3>
      <div className="pairs-list">
        {mostTraded.map((pair, index) => (
          <div key={index} className="pair-item">
            <div className="pair-header">
              <span className="pair-symbol">
                {pair.symbol && pair.symbol.length === 6
                  ? `${pair.symbol.slice(0, 3)}/${pair.symbol.slice(3)}`
                  : pair.symbol}
              </span>
              <span className="pair-count">{pair.count} trades</span>
            </div>
            <div className="pair-bar">
              <div
                className="pair-bar-fill"
                style={{ width: `${(pair.count / maxCount) * 100}%` }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default TradingPairsCard;
