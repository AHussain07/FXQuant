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

const TIMEFRAME_LABELS = {
  all: "All time",
  year: "Last year",
  month: "Last month",
  week: "Last week",
};

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
    const formattedAmount = absAmount.toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
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
          <div className="loading-state">Loading dashboard…</div>
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

  // Derived metrics the API doesn't send but the raw totals allow
  const profitFactor =
    hasTrades && stats.grossLoss > 0
      ? stats.grossProfit / stats.grossLoss
      : null;
  const avgWin =
    hasTrades && stats.winningTrades > 0
      ? stats.grossProfit / stats.winningTrades
      : 0;
  const avgLoss =
    hasTrades && stats.losingTrades > 0
      ? stats.grossLoss / stats.losingTrades
      : 0;
  const netPL = hasTrades ? stats.grossProfit - stats.grossLoss : 0;

  return (
    <div className="dashboard-page">
      <Nav showLinks={true} />

      <div className="dashboard-container">
        <div className="dashboard-topbar">
          <div className="dashboard-heading">
            <span className="dash-eyebrow">Your performance</span>
            <h1 className="dash-title">Dashboard</h1>
          </div>

          <div className="dashboard-filters" id="tour-filters">
            <div className="filter-group">
              <label htmlFor="timeframe">Time period</label>
              <select
                id="timeframe"
                value={timeframe}
                onChange={(e) => setTimeframe(e.target.value)}
                className="timeframe-select"
              >
                <option value="all">All time</option>
                <option value="year">Last year</option>
                <option value="month">Last month</option>
                <option value="week">Last week</option>
              </select>
            </div>
          </div>
        </div>

        {!hasTrades ? (
          <div className="empty-dashboard">
            <span className="dash-eyebrow">No data yet</span>
            <h2>Your curve starts at trade one</h2>
            <p>
              {timeframe === "all"
                ? "Place your first trade and this page starts keeping score — equity curve, win rate, and the setups that earn."
                : "No trades closed in this period. Pick a wider range above, or go take the next trade."}
            </p>
          </div>
        ) : (
        <>
        <div className="charts-section" id="tour-charts-section">
          <div className="chart-card equity-card">
            <div className="panel-head">
              <div>
                <span className="panel-tag">
                  Equity curve
                  <InfoTooltip text="A line chart showing how your account balance has changed over time. A rising line means you are growing your account; a falling line means you are losing money." direction="below" />
                </span>
                <span className="panel-sub">
                  {TIMEFRAME_LABELS[timeframe] || "All time"}
                </span>
              </div>
              <span className="panel-chip">
                {stats.totalTrades} {stats.totalTrades === 1 ? "trade" : "trades"}
              </span>
            </div>
            <EquityCurveChart
              data={stats.equityCurve}
              totalTrades={stats.totalTrades}
              netPL={netPL}
            />
          </div>

          {dbUser && dbUser.accountType && dbUser.accountType !== "live" && dbUser.initialBalance && dbUser.profitTarget && dbUser.maxLoss ? (
            <div className="chart-card">
              <div className="panel-head">
                <div>
                  <span className="panel-tag">Challenge progress</span>
                  <span className="panel-sub">
                    {dbUser.accountType === "prop_50k" ? "$50K" : dbUser.accountType === "prop_100k" ? "$100K" : "$150K"} account
                  </span>
                </div>
              </div>
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
                        <span className="challenge-account-label">Challenge P/L</span>
                        <span className={`challenge-pnl ${isProfitable ? "positive" : "negative"}`}>
                          {formatCurrency(currentPnL)}
                        </span>
                      </div>

                      <div className="challenge-target-section">
                        <div className="challenge-target-header">
                          <span className="challenge-target-label">
                            Profit target
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
                            Max loss
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
                        <span className="challenge-balance-label">Current balance</span>
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
              <div className="panel-head">
                <div>
                  <span className="panel-tag">Performance</span>
                  <span className="panel-sub">
                    {TIMEFRAME_LABELS[timeframe] || "All time"}
                  </span>
                </div>
              </div>
              <div className="performance-summary">
                <div className="performance-item performance-net">
                  <span className="performance-label">
                    Net P/L
                    <InfoTooltip text="Your bottom line for this period: all winning trades minus all losing trades." />
                  </span>
                  <span className={`performance-value ${netPL >= 0 ? "positive" : "negative"}`}>
                    {netPL >= 0 ? "+" : ""}{formatCurrency(netPL)}
                  </span>
                </div>
                <div className="performance-item">
                  <span className="performance-label">
                    Gross profit
                    <InfoTooltip text="The total amount earned from all your winning trades added together, before subtracting any losses." />
                  </span>
                  <span className="performance-value positive">
                    {formatCurrency(stats.grossProfit)}
                  </span>
                </div>
                <div className="performance-item">
                  <span className="performance-label">
                    Gross loss
                    <InfoTooltip text="The total amount lost across all your losing trades added together, before accounting for your profits." />
                  </span>
                  <span className="performance-value negative">
                    {formatCurrency(-stats.grossLoss)}
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="stats-grid" id="tour-stats-grid">
          <StatCard
            title="Win rate"
            tooltip="The percentage of your trades that closed at a profit. A win rate above 50% means more trades won than lost."
            value={`${stats.winRate.toFixed(1)}%`}
            subtitle={`${stats.winningTrades} wins / ${stats.losingTrades} losses`}
            trend={stats.winRate >= 50 ? "up" : "down"}
          />
          <StatCard
            title="Profit factor"
            tooltip="Gross profit divided by gross loss. Above 1.0 means your winners earn more than your losers cost — the single best health check for a strategy."
            value={
              profitFactor !== null
                ? profitFactor.toFixed(2)
                : stats.grossProfit > 0
                ? "∞"
                : "—"
            }
            subtitle={`avg win ${formatCurrency(avgWin)} · avg loss ${formatCurrency(avgLoss)}`}
            trend={
              profitFactor === null
                ? stats.grossProfit > 0
                  ? "up"
                  : undefined
                : profitFactor >= 1
                ? "up"
                : "down"
            }
          />
          <StatCard
            title="Avg risk:reward"
            tooltip="For every $1 you risked on a trade, how much did you aim to gain on average. A ratio of 1:2 means you targeted $2 profit for every $1 at risk."
            value={`1:${stats.avgRiskReward.toFixed(2)}`}
          />
          <StatCard
            title="Best pair"
            tooltip="The currency pair (e.g. EUR/USD) that has generated the most total profit across all your trades."
            value={formatForexPair(stats.mostProfitablePair?.symbol)}
            subtitle={
              stats.mostProfitablePair
                ? `${stats.mostProfitablePair.profit >= 0 ? "+" : ""}${formatCurrency(stats.mostProfitablePair.profit)} total`
                : "No data"
            }
          />
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
