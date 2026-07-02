import React, { useState, useEffect } from "react";
import { useAuth } from "../context/AuthContext";
import { getDashboardStats } from "../services/api";
import Nav from "../components/layout/Nav";
import StatCard from "../components/dashboard/StatCard";
import EquityCurveChart from "../components/dashboard/EquityCurveChart";
import ConfluencesCard from "../components/dashboard/ConfluencesCard";
import TradingPairsCard from "../components/dashboard/TradingPairsCard";
import InfoTooltip from "../components/common/InfoTooltip";
import useOnboardingTour from "../hooks/useOnboardingTour";
import "../styles/dashboard.css";
import "../styles/onboarding.css";

const Dashboard = () => {
  const { currentUser, dbUser } = useAuth();
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [timeframe, setTimeframe] = useState("all");

  // Onboarding tour — only triggers on first-ever login
  useOnboardingTour(currentUser?.uid, "dashboard");

  useEffect(() => {
    const loadStats = async () => {
      if (!currentUser) return;

      setLoading(true);
      try {
        const data = await getDashboardStats(currentUser.uid, timeframe);
        setStats(data);
        setError(null);
      } catch (err) {
        console.error("Failed to load dashboard stats:", err);
        setError("Failed to load dashboard data");
      } finally {
        setLoading(false);
      }
    };

    loadStats();
  }, [currentUser, timeframe]);

  const formatCurrency = (amount) => {
    const absAmount = Math.abs(amount);
    const formattedAmount = absAmount.toFixed(2);
    return amount >= 0 ? `$${formattedAmount}` : `-$${formattedAmount}`;
  };

  const formatForexPair = (symbol) => {
    if (!symbol) return "N/A";
    if (symbol.length === 6) {
      return `${symbol.slice(0, 3)}/${symbol.slice(3)}`;
    }
    return symbol;
  };

  if (loading) {
    return (
      <div className="dashboard-page">
        <Nav showLinks={true} />
        <div className="dashboard-container">
          <div className="loading-state">Loading dashboard...</div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="dashboard-page">
        <Nav showLinks={true} />
        <div className="dashboard-container">
          <div className="error-state">{error}</div>
        </div>
      </div>
    );
  }

  const hasTrades = stats && stats.totalTrades > 0;

  return (
    <div className="dashboard-page">
      <Nav showLinks={true} />

      <div className="dashboard-container">
        <div className="dashboard-filters" id="tour-filters">
          <div className="filter-group">
            <label htmlFor="timeframe">Time Period</label>
            <select
              id="timeframe"
              value={timeframe}
              onChange={(e) => setTimeframe(e.target.value)}
              className="timeframe-select"
            >
              <option value="all">All Time</option>
              <option value="year">Last Year</option>
              <option value="month">Last Month</option>
              <option value="week">Last Week</option>
            </select>
          </div>
        </div>

        {!hasTrades ? (
          <div className="empty-dashboard">
            <h2>No Trading Data Yet</h2>
            <p>
              {timeframe === "all"
                ? "Start trading to see your performance statistics here."
                : "No trades found for this time period. Try selecting a different range above."}
            </p>
          </div>
        ) : (
        <>
        <div className="stats-grid" id="tour-stats-grid">
          <StatCard title="Total Trades" value={stats.totalTrades} />
          <StatCard
            title="Win Rate"
            tooltip="The percentage of your trades that closed at a profit. A win rate above 50% means more trades won than lost."
            value={`${stats.winRate.toFixed(1)}%`}
            subtitle={`${stats.winningTrades} wins / ${stats.losingTrades} losses`}
            trend={stats.winRate >= 50 ? "up" : "down"}
          />
          <StatCard
            title="Most Profitable Pair"
            tooltip="The currency pair (e.g. EUR/USD) that has generated the most total profit across all your trades."
            value={formatForexPair(stats.mostProfitablePair?.symbol)}
            subtitle={
              stats.mostProfitablePair
                ? formatCurrency(stats.mostProfitablePair.profit)
                : "No data"
            }
          />
          <StatCard
            title="Avg Risk:Reward"
            tooltip="For every $1 you risked on a trade, how much did you aim to gain on average. A ratio of 1:2 means you targeted $2 profit for every $1 at risk."
            value={`1:${stats.avgRiskReward.toFixed(2)}`}
          />
        </div>

        <div className="charts-section" id="tour-charts-section">
          <div className="chart-card">
            <h2>
              Equity Curve
              <InfoTooltip text="A line chart showing how your account balance has changed over time. A rising line means you are growing your account; a falling line means you are losing money." direction="below" />
            </h2>
            <EquityCurveChart data={stats.equityCurve} />
          </div>

          {dbUser && dbUser.accountType && dbUser.accountType !== "live" && dbUser.initialBalance && dbUser.profitTarget && dbUser.maxLoss ? (
            <div className="chart-card">
              <h2>Challenge Progress</h2>
              <div className="challenge-progress">
                {(() => {
                  const currentPnL = dbUser.accountBalance - dbUser.initialBalance;
                  const profitTarget = dbUser.profitTarget;
                  const maxLoss = dbUser.maxLoss;
                  const progressPercent = Math.max(0, Math.min(100, (currentPnL / profitTarget) * 100));
                  const lossPercent = Math.max(0, Math.min(100, (Math.abs(Math.min(0, currentPnL)) / maxLoss) * 100));
                  const isProfitable = currentPnL >= 0;

                  return (
                    <>
                      <div className="challenge-progress-header">
                        <span className="challenge-account-label">
                          {dbUser.accountType === "prop_50k" ? "$50K" : dbUser.accountType === "prop_100k" ? "$100K" : "$150K"} Challenge
                        </span>
                        <span className={`challenge-pnl ${isProfitable ? "positive" : "negative"}`}>
                          {formatCurrency(currentPnL)}
                        </span>
                      </div>

                      <div className="challenge-target-section">
                        <div className="challenge-target-header">
                          <span className="challenge-target-label">
                            Profit Target
                            <InfoTooltip text="The amount of profit you need to make to pass the challenge. Once your account reaches this amount of gain, you pass." direction="below" />
                          </span>
                          <span className="challenge-target-value">
                            {formatCurrency(currentPnL)} / {formatCurrency(profitTarget)}
                          </span>
                        </div>
                        <div className="challenge-bar">
                          <div
                            className="challenge-bar-fill challenge-bar-profit"
                            style={{ width: `${progressPercent}%` }}
                          />
                        </div>
                      </div>

                      <div className="challenge-target-section">
                        <div className="challenge-target-header">
                          <span className="challenge-target-label">
                            Max Loss
                            <InfoTooltip text="The maximum amount you are allowed to lose before the challenge ends. If your losses reach this limit, the challenge is over." direction="below" />
                          </span>
                          <span className="challenge-target-value">
                            {formatCurrency(Math.abs(Math.min(0, currentPnL)))} / {formatCurrency(maxLoss)}
                          </span>
                        </div>
                        <div className="challenge-bar">
                          <div
                            className="challenge-bar-fill challenge-bar-loss"
                            style={{ width: `${lossPercent}%` }}
                          />
                        </div>
                      </div>

                      <div className="challenge-balance-row">
                        <span className="challenge-balance-label">Current Balance</span>
                        <span className="challenge-balance-value">
                          ${dbUser.accountBalance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </span>
                      </div>
                    </>
                  );
                })()}
              </div>
            </div>
          ) : (
            <div className="chart-card">
              <h2>Performance Summary</h2>
              <div className="performance-summary">
                <div className="performance-item">
                  <span className="performance-label">
                    Gross Profit
                    <InfoTooltip text="The total amount earned from all your winning trades added together, before subtracting any losses." />
                  </span>
                  <span className="performance-value positive">
                    {formatCurrency(stats.grossProfit)}
                  </span>
                </div>
                <div className="performance-item">
                  <span className="performance-label">
                    Gross Loss
                    <InfoTooltip text="The total amount lost across all your losing trades added together, before accounting for your profits." />
                  </span>
                  <span className="performance-value negative">
                    {formatCurrency(-stats.grossLoss)}
                  </span>
                </div>
                <div className="performance-item">
                  <span className="performance-label">Win Rate</span>
                  <span className="performance-value">
                    {stats.winRate.toFixed(1)}%
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="bottom-section">
          <TradingPairsCard mostTraded={stats.mostTradedPairs} />
          <ConfluencesCard confluences={stats.topConfluences} />
        </div>
        </>
        )}
      </div>
    </div>
  );
};

export default Dashboard;
