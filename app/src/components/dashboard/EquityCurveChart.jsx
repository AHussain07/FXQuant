import React from "react";
import "../../styles/dashboard.css";

function EquityCurveChart({ data }) {
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

  return (
    <div className="equity-chart">
      <svg
        width="100%"
        height="250"
        viewBox="0 0 800 250"
        preserveAspectRatio="none"
      >
        <defs>
          <linearGradient id="equityGradient" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop
              offset="0%"
              stopColor={totalChange >= 0 ? "#10b981" : "#ef4444"}
              stopOpacity="0.3"
            />
            <stop
              offset="100%"
              stopColor={totalChange >= 0 ? "#10b981" : "#ef4444"}
              stopOpacity="0"
            />
          </linearGradient>
        </defs>

        {/* Grid lines */}
        <line
          x1="0"
          y1="60"
          x2="800"
          y2="60"
          stroke="rgba(255,255,255,0.1)"
          strokeWidth="1"
        />
        <line
          x1="0"
          y1="125"
          x2="800"
          y2="125"
          stroke="rgba(255,255,255,0.1)"
          strokeWidth="1"
        />
        <line
          x1="0"
          y1="190"
          x2="800"
          y2="190"
          stroke="rgba(255,255,255,0.1)"
          strokeWidth="1"
        />

        {/* Area under curve */}
        <path
          d={`M 0,240 ${data
            .map((d, i) => {
              const x = (i / (data.length - 1)) * 800;
              const y = 230 - ((d.balance - minBalance) / range) * 210;
              return `L ${x},${y}`;
            })
            .join(" ")} L 800,240 Z`}
          fill="url(#equityGradient)"
        />

        {/* Line */}
        <path
          d={data
            .map((d, i) => {
              const x = (i / (data.length - 1)) * 800;
              const y = 230 - ((d.balance - minBalance) / range) * 210;
              return `${i === 0 ? "M" : "L"} ${x},${y}`;
            })
            .join(" ")}
          fill="none"
          stroke={totalChange >= 0 ? "#10b981" : "#ef4444"}
          strokeWidth="3"
        />
      </svg>

      <div className="chart-stats">
        <div className="chart-stat">
          <span className="chart-stat-label">Starting Balance</span>
          <span className="chart-stat-value">
            {formatCurrency(startBalance)}
          </span>
        </div>
        <div className="chart-stat">
          <span className="chart-stat-label">Current Balance</span>
          <span className="chart-stat-value">
            {formatCurrency(currentBalance)}
          </span>
        </div>
        <div className="chart-stat">
          <span className="chart-stat-label">Total Change</span>
          <span
            className={`chart-stat-value ${
              totalChange >= 0 ? "positive" : "negative"
            }`}
          >
            {formatCurrency(totalChange)}
          </span>
        </div>
      </div>
    </div>
  );
}

export default EquityCurveChart;
