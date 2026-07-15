import React, { useState } from "react";
import "../../styles/tradeJournal.css";
import InfoTooltip from "../common/InfoTooltip";

const CONFLUENCES = [
  {
    label: "Liquidity Sweep",
    description:
      "When price briefly moves past a key level (like a recent high or low) to trigger stop-loss orders placed by other traders, then reverses. Think of it as price hunting for orders before making its real move.",
  },
  {
    label: "Break of Structure (BOS)",
    description:
      "When price breaks through a previous swing high or low, signalling the market is likely changing direction. A break above a recent high suggests buyers are taking control; a break below a recent low suggests sellers are.",
  },
  {
    label: "Fair Value Gap (FVG)",
    description:
      "A price gap or imbalance on the chart where price moved so quickly in one direction that it left an unfilled area of trading activity. Price often comes back to fill this gap before continuing its move.",
  },
  {
    label: "Inversion FVG",
    description:
      "A Fair Value Gap that has already been filled and switched its role. An area that previously acted as support now acts as resistance, or the other way around.",
  },
  {
    label: "SMT Divergence",
    description:
      "When two closely related markets (like Gold and Silver, or two currency pairs) fail to reach the same highs or lows at the same time. This disagreement can signal a fake-out move or a potential reversal.",
  },
  {
    label: "Equilibrium / Premium vs Discount",
    description:
      "A way of measuring where price sits within a range. The midpoint of a range is equilibrium. Above it is a premium (expensive area) and below it is a discount (cheap area). Traders look to buy in a discount and sell in a premium.",
  },
  {
    label: "Fib Extension",
    description:
      "A tool that uses a mathematical sequence (Fibonacci numbers) to predict how far price might travel after pulling back. Common targets are the 1.272, 1.618, and 2.618 levels beyond the initial move.",
  },
];

function TradeJournalForm({ tradeData, onSubmit, onSkip }) {
  const [notes, setNotes] = useState("");
  const [selectedConfluences, setSelectedConfluences] = useState([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");

  const handleConfluenceToggle = (label) => {
    setSelectedConfluences((prev) =>
      prev.includes(label)
        ? prev.filter((c) => c !== label)
        : [...prev, label]
    );
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!notes.trim()) {
      setError("Please briefly describe why you took this trade.");
      return;
    }

    setIsSubmitting(true);
    setError("");

    try {
      console.log("Submitting Journal Entry with Trade Data:", tradeData);

      const journalPayload = {
        notes: notes.trim(),
        confluences: selectedConfluences,
        tradeId: tradeData.tradeId,
        symbol: tradeData.symbol,

        profitLoss:
          tradeData.profitLoss !== undefined ? tradeData.profitLoss : 0,
        entryPrice: tradeData.entryPrice,
        exitPrice: tradeData.exitPrice,
        outcome: (tradeData.profitLoss || 0) >= 0 ? "win" : "loss",
      };

      await onSubmit(journalPayload);
    } catch (err) {
      console.error(err);
      setError("Failed to save journal entry. Please try again.");
      setIsSubmitting(false);
    }
  };

  const profitLossClass = tradeData.profitLoss >= 0 ? "profit" : "loss";

  return (
    <div className="journal-form-container">
      <div className="journal-header">
        <h3 className="journal-title">Review & Journal</h3>
      </div>

      {/* 1. Main Outcome Banner */}
      <div className={`trade-outcome ${profitLossClass}`}>
        <span className="outcome-label">
          {tradeData.profitLoss >= 0 ? "Profit Realized" : "Loss Realized"}
        </span>
        <span className="outcome-amount">
          {tradeData.profitLoss >= 0 ? "+" : ""}$
          {tradeData.profitLoss?.toFixed(2)}
        </span>
      </div>

      {/* 2. Trade Details Summary Grid */}
      <div className="trade-summary">
        <div className="summary-item">
          <span className="summary-label">Symbol / Type</span>
          <span className="summary-value">
            {tradeData.symbol} <span style={{ opacity: 0.5 }}>|</span>{" "}
            {tradeData.orderType?.toUpperCase() ||
              tradeData.type?.toUpperCase()}
          </span>
        </div>
        <div className="summary-item">
          <span className="summary-label">Prices</span>
          <span className="summary-value">
            {tradeData.entryPrice?.toFixed(5)}{" "}
            <span style={{ color: "var(--dimmer)" }}>➜</span>{" "}
            {tradeData.exitPrice?.toFixed(5)}
          </span>
        </div>
        {/* Can add Date or Duration here if available */}
      </div>

      {error && (
        <div className="error-message">
          <span>⚠️</span> {error}
        </div>
      )}

      {/* 3. Journal Entry Form */}
      <form onSubmit={handleSubmit} className="journal-form">
        <div className="form-section">
          <label className="form-label">Review your setup</label>
          <textarea
            className="journal-textarea"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="What did you see? Did you follow your plan? What emotions did you feel?"
            disabled={isSubmitting}
          />
        </div>

        <div className="form-section">
          <label className="form-label">Confluences Present</label>
          <div className="confluences-grid">
            {CONFLUENCES.map(({ label, description }) => {
              const isSelected = selectedConfluences.includes(label);
              return (
                <label
                  key={label}
                  className={`confluence-checkbox ${
                    isSelected ? "selected" : ""
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => handleConfluenceToggle(label)}
                    disabled={isSubmitting}
                  />
                  <span className="confluence-text">{label}</span>
                  <InfoTooltip text={description} />
                </label>
              );
            })}
          </div>
        </div>

        <div className="form-actions">
          <button type="submit" className="btn-submit" disabled={isSubmitting}>
            {isSubmitting ? "Saving..." : "Save"}
          </button>
          <button type="button"className="btn-skip" onClick={onSkip} disabled={isSubmitting}>
            Skip
          </button>
        </div>
      </form>
    </div>
  );
}

export default TradeJournalForm;
