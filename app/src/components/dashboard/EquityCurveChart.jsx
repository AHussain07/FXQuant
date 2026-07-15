import React from "react";
import "../../styles/dashboard.css";

/**
 * The dashboard's centerpiece: the landing page promises an equity curve
 * being plotted, and this is that curve with the user's real trades on it.
 * It draws itself once per load — the only motion on the page.
 */
function EquityCurveChart({ data, totalTrades, netPL }) {
  if (!data || data.length === 0) {
    return <div className="chart-empty">No equity data available</div>;
  }

  const maxBalance = Math.max(...data.map((d) => d.balance));
  const minBalance = Math.min(...data.map((d) => d.balance));
  const range = maxBalance - minBalance || 1;

  const formatCurrency = (amount) => {
    const absAmount = Math.abs(amount);
    const formattedAmount = absAmount.toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
    return amount >= 0 ? `$${formattedAmount}` : `-$${formattedAmount}`;
  };

  const startBalance = data[0]?.balance || 0;
  const currentBalance = data[data.length - 1]?.balance || 0;
  const totalChange = currentBalance - startBalance;
  const isUp = totalChange >= 0;
  const stroke = isUp ? "#3d7bff" : "#d0455c";

  const points = data.map((d, i) => {
    const x = data.length > 1 ? (i / (data.length - 1)) * 800 : 800;
    const y = 216 - ((d.balance - minBalance) / range) * 192;
    return { x, y };
  });
  const lineD = points
    .map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(1)},${p.y.toFixed(1)}`)
    .join(" ");
  const areaD = `M 0,228 ${points
    .map((p) => `L ${p.x.toFixed(1)},${p.y.toFixed(1)}`)
    .join(" ")} L 800,228 Z`;

  return (
    <div className="equity-chart">
      <div className="equity-figure">
        <span className="equity-balance">{formatCurrency(currentBalance)}</span>
        <span className={`equity-delta ${isUp ? "positive" : "negative"}`}>
          {isUp ? "+" : ""}
          {formatCurrency(totalChange)}
        </span>
      </div>

      {/* key forces a re-draw when the dataset (timeframe) changes */}
      <svg
        key={`${data.length}-${currentBalance}`}
        className="equity-svg"
        viewBox="0 0 800 228"
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        <defs>
          <linearGradient id="equityGradient" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor={stroke} stopOpacity="0.24" />
            <stop offset="100%" stopColor={stroke} stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* Plotting grid: the graph paper the curve is drawn on */}
        {[57, 114, 171].map((y) => (
          <line
            key={y}
            x1="0"
            y1={y}
            x2="800"
            y2={y}
            stroke="#131a25"
            strokeWidth="1"
          />
        ))}

        <path className="equity-fill" d={areaD} fill="url(#equityGradient)" />
        <path
          className="equity-line"
          d={lineD}
          pathLength="1"
          fill="none"
          stroke={stroke}
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>

      <div className="chart-stats">
        <div className="chart-stat">
          <span className="chart-stat-label">Start balance</span>
          <span className="chart-stat-value">
            {formatCurrency(startBalance)}
          </span>
        </div>
        <div className="chart-stat">
          <span className="chart-stat-label">Net P/L</span>
          <span
            className={`chart-stat-value ${isUp ? "positive" : "negative"}`}
          >
            {isUp ? "+" : ""}
            {formatCurrency(netPL != null ? netPL : totalChange)}
          </span>
        </div>
        <div className="chart-stat">
          <span className="chart-stat-label">Trades</span>
          <span className="chart-stat-value">{totalTrades ?? data.length - 1}</span>
        </div>
      </div>
    </div>
  );
}

export default EquityCurveChart;
