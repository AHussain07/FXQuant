import React, { useEffect, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import Nav from "../components/layout/Nav";
import { useAuth } from "../context/AuthContext";
import TradingViewWidget from "../components/trading/TradingViewWidget";
import PriceTickerWidget from "../components/trading/PriceTickerWidget";
import WatchlistWidget from "../components/trading/WatchlistWidget";
import TradingForm from "../components/trading/TradingForm";
import TradeJournalForm from "../components/journal/TradeJournalForm";
import { createJournalEntry, setupAccount } from "../services/api";
import DailyBiasDashboard from "../components/trading/DailyBiasDashboard";
import ForexNewsAlert from "../components/trading/ForexNewsAlert";
import InfoTooltip from "../components/common/InfoTooltip";
import useOnboardingTour from "../hooks/useOnboardingTour";
import "../styles/onboarding.css";

export default function Market() {
  const { currentUser, dbUser, refreshUserData } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [selectedInstrument, setSelectedInstrument] = useState("EURUSD");
  const [isLoading, setIsLoading] = useState(true);
  const [showTradingForm, setShowTradingForm] = useState(false);
  const [showJournalForm, setShowJournalForm] = useState(false);
  const [completedTrade, setCompletedTrade] = useState(null);
  const [setupStep, setSetupStep] = useState(null); // null, "choose", "live_balance"
  const [liveBalance, setLiveBalance] = useState("");
  const [setupError, setSetupError] = useState("");
  const [isSettingUp, setIsSettingUp] = useState(false);
  const [challengeResult, setChallengeResult] = useState(null); // "passed" or "failed"
  const [mobileTab, setMobileTab] = useState("trade"); // small-screen panel tabs

  const needsAccountSetup = dbUser && !dbUser.accountType;

  // Onboarding tour for the market page
  const { advancePhase, phase } = useOnboardingTour(currentUser?.uid, "market");

  // When account setup completes, advance tour to the trading phase
  useEffect(() => {
    if (
      !needsAccountSetup &&
      currentUser?.uid &&
      !dbUser?.hasSeenTutorial &&
      phase === "market_setup"
    ) {
      advancePhase("market_trading");
    }
  }, [
    needsAccountSetup,
    currentUser?.uid,
    dbUser?.hasSeenTutorial,
    phase,
    advancePhase,
  ]);

  useEffect(() => {
    if (location.state?.selectedInstrument) {
      setSelectedInstrument(location.state.selectedInstrument);
      navigate(location.pathname, { replace: true, state: {} });
    }
  }, [location.state, navigate, location.pathname]);

  useEffect(() => {
    if (!currentUser) {
      navigate("/");
    } else {
      setIsLoading(false);
    }
  }, [currentUser, navigate]);

  const handleAccountSetup = async (accountType, balance) => {
    setIsSettingUp(true);
    setSetupError("");
    try {
      await setupAccount(currentUser.uid, accountType, balance);
      await refreshUserData();
      setSetupStep(null);
    } catch (error) {
      setSetupError(error.message || "Failed to set up account");
    } finally {
      setIsSettingUp(false);
    }
  };

  const handleChallengeEnd = (result) => {
    setChallengeResult(result);
    setShowTradingForm(false);
    setShowJournalForm(false);
    setCompletedTrade(null);
  };

  const handleChallengeAcknowledge = async () => {
    setChallengeResult(null);
    await refreshUserData();
  };

  const [initialOrderType, setInitialOrderType] = useState("buy");

  const handleTradeClick = (orderType = "buy") => {
    setInitialOrderType(orderType);
    setShowTradingForm(true);
  };

  const handleCancelTrade = () => {
    setShowTradingForm(false);
  };

  const handleTradeCompleted = (tradeData) => {
    setCompletedTrade(tradeData);
    setShowTradingForm(false);
    setShowJournalForm(true);
  };

  const handleJournalSubmit = async (journalData) => {
    try {
      if (!completedTrade) {
        console.error("No completed trade data available");
        alert("Error: No trade data to save.");
        return;
      }

      const payload = {
        userId: currentUser.uid,
        tradeId: completedTrade.tradeId,
        symbol: completedTrade.symbol,
        profitLoss: completedTrade.profitLoss,
        entryPrice: completedTrade.entryPrice,
        exitPrice: completedTrade.exitPrice,
        notes: journalData.notes,
        confluences: journalData.confluences,
      };

      console.log("Sending Payload:", payload);

      await createJournalEntry(payload);

      setShowJournalForm(false);
      setCompletedTrade(null);
      await refreshUserData();

    } catch (error) {
      console.error("Failed to save journal entry:", error);
      alert(
        "Failed to save journal entry: " +
          (error.response?.data?.error || error.message)
      );
    }
  };

  const handleSkipJournal = () => {
    setShowJournalForm(false);
    setCompletedTrade(null);
  };

  if (!currentUser) return null;

  if (needsAccountSetup) {
    return (
      <div className="market-container">
        <Nav showLinks={true} />
        <main className="account-setup-main">
          <div className="account-setup-wrapper" id="tour-account-setup">
            {setupStep === "live_balance" ? (
              <div className="setup-card">
                <h2 className="setup-title">Set Your Balance</h2>
                <p className="setup-subtitle">
                  Enter your starting balance for your demo live account. No profit targets or loss limits apply.
                </p>
                {setupError && <div className="setup-error">{setupError}</div>}
                <div className="live-balance-input-group">
                  <span className="balance-prefix">$</span>
                  <input
                    type="number"
                    className="live-balance-input"
                    value={liveBalance}
                    onChange={(e) => setLiveBalance(e.target.value)}
                    placeholder="e.g. 10000"
                    min="1"
                    step="any"
                  />
                </div>
                <div className="setup-actions">
                  <button
                    className="setup-btn setup-btn-primary"
                    onClick={() => handleAccountSetup("live", parseFloat(liveBalance))}
                    disabled={isSettingUp || !liveBalance || parseFloat(liveBalance) <= 0}
                  >
                    {isSettingUp ? "Setting up..." : "Start Trading"}
                  </button>
                  <button
                    className="setup-btn setup-btn-secondary"
                    onClick={() => { setSetupStep("choose"); setSetupError(""); }}
                    disabled={isSettingUp}
                  >
                    Back
                  </button>
                </div>
              </div>
            ) : (
              <div className="setup-card">
                <h2 className="setup-title">Choose Your Account</h2>
                <p className="setup-subtitle">
                  Select a prop firm challenge to trade with targets and rules, or set up a free demo live account.
                </p>
                {setupError && <div className="setup-error">{setupError}</div>}

                <div className="setup-section-label">
                  Prop Firm Challenge
                  <InfoTooltip text="A simulated trading test where you must hit a profit target without exceeding a maximum loss. In the real world, passing a prop firm challenge can earn you funding from a trading company to trade with their money." direction="below" />
                </div>
                <div className="prop-options" id="tour-prop-options">
                  {[
                    { type: "prop_50k", balance: 50000, label: "$50K" },
                    { type: "prop_100k", balance: 100000, label: "$100K" },
                    { type: "prop_150k", balance: 150000, label: "$150K" },
                  ].map((option) => (
                    <button
                      key={option.type}
                      className="prop-option-card"
                      onClick={() => handleAccountSetup(option.type)}
                      disabled={isSettingUp}
                    >
                      <span className="prop-balance">{option.label}</span>
                      <span className="prop-label">Account</span>
                      <div className="prop-details">
                        <div className="prop-detail">
                          <span className="prop-detail-label">
                            Profit Target
                            <InfoTooltip text="The amount of profit you need to make to pass the challenge. Once your gains reach this figure, you pass." direction="below" />
                          </span>
                          <span className="prop-detail-value profit">
                            ${(option.balance * 0.06).toLocaleString()}
                          </span>
                        </div>
                        <div className="prop-detail">
                          <span className="prop-detail-label">
                            Max Loss
                            <InfoTooltip text="The maximum amount you are allowed to lose. If your total losses hit this limit, the challenge ends. Keep your losses below this figure to stay in the challenge." direction="below" />
                          </span>
                          <span className="prop-detail-value loss">
                            ${(option.balance * 0.04).toLocaleString()}
                          </span>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>

                <div className="setup-divider">
                  <span>or</span>
                </div>

                <button
                  className="live-option-card"
                  id="tour-live-option"
                  onClick={() => setSetupStep("live_balance")}
                  disabled={isSettingUp}
                >
                  <span className="live-option-title">
                    Demo Live Account
                    <InfoTooltip text="A practice account using simulated money. There are no targets to hit or loss limits to worry about. Great for learning and experimenting freely." direction="below" />
                  </span>
                  <span className="live-option-desc">
                    No profit target or max loss. Set your own balance.
                  </span>
                </button>
              </div>
            )}
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="market-container">
      <Nav showLinks={true} />

      <main className="market-main-layout">
        <div className="chart-section-full" id="tour-chart">
          {isLoading ? (
            <div className="chart-loading-state"></div>
          ) : (
            <TradingViewWidget symbol={selectedInstrument} />
          )}
        </div>

        {/* Mobile-only: tabs that switch which panel shows below the chart.
            Hidden while a trade or journal form has taken over the panel. */}
        {!showTradingForm && !showJournalForm && (
          <div className="market-tabbar" role="tablist" aria-label="Trade panels">
            {[
              ["trade", "Trade"],
              ["watchlist", "Watchlist"],
              ["bias", "Bias"],
              ["news", "News"],
            ].map(([key, label]) => (
              <button
                key={key}
                role="tab"
                aria-selected={mobileTab === key}
                className={`market-tab ${mobileTab === key ? "active" : ""}`}
                onClick={() => setMobileTab(key)}
              >
                {label}
              </button>
            ))}
          </div>
        )}

        <div className={`widgets-sidebar tab-${mobileTab}`}>
          {showJournalForm && completedTrade ? (
            <TradeJournalForm
              tradeData={completedTrade}
              onSubmit={handleJournalSubmit}
              onSkip={handleSkipJournal}
            />
          ) : showTradingForm ? (
            <TradingForm
              onCancel={handleCancelTrade}
              onTradeCompleted={handleTradeCompleted}
              onChallengeEnd={handleChallengeEnd}
              symbol={selectedInstrument}
              initialOrderType={initialOrderType}
            />
          ) : (
            <>
              <div className="widget price-widget-compact tabgroup-trade">
                <h3 className="widget-title">Current price</h3>
                <div className="price-ticker-container">
                  {!isLoading && (
                    <PriceTickerWidget symbol={selectedInstrument} />
                  )}
                </div>
              </div>

              <div className="widget trading-widget-compact tabgroup-trade" id="tour-quick-trade">
                <h3 className="widget-title">Quick trade</h3>
                <div className="trade-buttons">
                  <button
                    className="trade-btn trade-btn-buy"
                    onClick={() => handleTradeClick("buy")}
                  >
                    Buy
                  </button>
                  <button
                    className="trade-btn trade-btn-sell"
                    onClick={() => handleTradeClick("sell")}
                  >
                    Sell
                  </button>
                </div>
              </div>

              <div className="widget watchlist-widget tabgroup-watchlist" id="tour-watchlist">
                <h3 className="widget-title">Watchlist</h3>
                <WatchlistWidget
                  selected={selectedInstrument}
                  onSelect={setSelectedInstrument}
                />
              </div>

              <div className="widget ml-indicators-widget tabgroup-bias" id="tour-ml-indicators">
                <h3 className="widget-title">Daily bias</h3>
                <DailyBiasDashboard symbol={selectedInstrument} />
              </div>

              <div className="widget news-widget tabgroup-news" id="tour-news">
                <ForexNewsAlert symbol={selectedInstrument} />
              </div>
            </>
          )}
        </div>
      </main>

      {challengeResult && (
        <div className="challenge-modal-overlay">
          <div className={`challenge-modal ${challengeResult === "passed" ? "challenge-passed" : "challenge-failed"}`}>
            <div className="challenge-modal-icon">
              {challengeResult === "passed" ? "🏆" : "📉"}
            </div>
            <h2 className="challenge-modal-title">
              {challengeResult === "passed" ? "Challenge Passed!" : "Challenge Failed"}
            </h2>
            <p className="challenge-modal-text">
              {challengeResult === "passed"
                ? "Congratulations! You hit your profit target. A confirmation email has been sent to you."
                : "You hit the maximum loss limit. An email has been sent with details. You can select a new challenge to try again."}
            </p>
            <button
              className="challenge-modal-btn"
              onClick={handleChallengeAcknowledge}
            >
              {challengeResult === "passed" ? "Start New Challenge" : "Try Again"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
