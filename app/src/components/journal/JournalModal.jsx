import React, { useState, useEffect, useCallback } from "react";
import {
  getJournalEntry,
  createJournalEntry,
  updateJournalEntry,
  getTradeById,
} from "../../services/api";
import "../../styles/journalModal.css";

const CONFLUENCES = [
  "Liquidity Sweep",
  "Break of Structure (BOS)",
  "Fair Value Gap (FVG)",
  "Inversion FVG",
  "SMT Divergence",
  "Equilibrium / Premium vs Discount",
  "Fib Extension",
];

function JournalModal({ tradeId, onClose }) {
  const [journal, setJournal] = useState(null);
  const [trade, setTrade] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isEditing, setIsEditing] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [formData, setFormData] = useState({
    notes: "",
    confluences: [],
  });

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const [journalData, tradeData] = await Promise.all([
        getJournalEntry(tradeId),
        getTradeById(tradeId),
      ]);
      setJournal(journalData);
      setTrade(tradeData);

      if (journalData) {
        setFormData({
          notes: journalData.notes || "",
          confluences: journalData.confluences || [],
        });
      }

      if (!journalData) {
        setIsCreating(true);
      }
    } catch (err) {
      setError("Failed to load data");
    } finally {
      setLoading(false);
    }
  }, [tradeId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleConfluenceToggle = (confluence) => {
    setFormData((prev) => ({
      ...prev,
      confluences: prev.confluences.includes(confluence)
        ? prev.confluences.filter((c) => c !== confluence)
        : [...prev.confluences, confluence],
    }));
  };

  const handleSave = async () => {
    if (!formData.notes.trim()) {
      alert("Please add some notes");
      return;
    }

    try {
      const payload = {
        userId: trade.userId,
        tradeId: trade.tradeId,
        symbol: trade.symbol,
        profitLoss: trade.profit,
        notes: formData.notes,
        confluences: formData.confluences,
      };

      if (isCreating) {
        await createJournalEntry(payload);
      } else {
        await updateJournalEntry(tradeId, payload);
      }

      await fetchData();
      setIsEditing(false);
      setIsCreating(false);
    } catch (err) {
      console.error("Failed to save journal:", err);
      alert("Failed to save journal entry");
    }
  };

  const formatProfitLoss = (profit) => {
    const absValue = Math.abs(profit).toFixed(2);
    return profit >= 0 ? `+$${absValue}` : `-$${absValue}`;
  };

  if (loading) {
    return (
      <div className="journal-modal-overlay" onClick={onClose}>
        <div
          className="journal-modal-content"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="journal-loading">Loading...</div>
        </div>
      </div>
    );
  }

  if (isEditing || isCreating) {
    return (
      <div className="journal-modal-overlay" onClick={onClose}>
        <div
          className="journal-modal-content"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="journal-modal-header">
            <h2>{isCreating ? "Add" : "Edit"} Trade Journal</h2>
            <button className="journal-modal-close" onClick={onClose}>
              ×
            </button>
          </div>

          <div className="journal-modal-body">
            <div className="form-section">
              <label className="form-label">Notes</label>
              <textarea
                value={formData.notes}
                onChange={(e) =>
                  setFormData({ ...formData, notes: e.target.value })
                }
                placeholder="What did you see? Did you follow your plan?"
                rows="6"
                className="form-textarea"
              />
            </div>

            <div className="form-section">
              <label className="form-label">Confluences</label>
              <div className="confluences-grid">
                {CONFLUENCES.map((confluence) => (
                  <label
                    key={confluence}
                    className={`confluence-checkbox ${
                      formData.confluences.includes(confluence)
                        ? "selected"
                        : ""
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={formData.confluences.includes(confluence)}
                      onChange={() => handleConfluenceToggle(confluence)}
                    />
                    <span className="confluence-text">{confluence}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>

          <div className="journal-modal-footer">
            <button
              className="journal-close-btn"
              onClick={() => {
                setIsEditing(false);
                setIsCreating(false);
                if (journal) {
                  setFormData({
                    notes: journal.notes || "",
                    confluences: journal.confluences || [],
                  });
                }
              }}
            >
              Cancel
            </button>
            <button className="journal-submit-btn" onClick={handleSave}>
              Save
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="journal-modal-overlay" onClick={onClose}>
      <div
        className="journal-modal-content"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="journal-modal-header">
          <h2>Trade Journal</h2>
          <button className="journal-modal-close" onClick={onClose}>
            ×
          </button>
        </div>

        <div className="journal-modal-body">
          {error ? (
            <div className="journal-error">{error}</div>
          ) : !journal ? (
            <div className="journal-empty">
              <svg
                width="64"
                height="64"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
                <line x1="12" y1="18" x2="12" y2="12" />
                <line x1="9" y1="15" x2="15" y2="15" />
              </svg>
              <h3>No Journal Entry</h3>
              <p>No journal was created for this trade.</p>
            </div>
          ) : (
            <>
              <div className="journal-section">
                <h3>Trade Information</h3>
                <div className="journal-info-grid">
                  <div className="journal-info-item">
                    <label>Symbol</label>
                    <span>{journal.symbol}</span>
                  </div>
                  <div className="journal-info-item">
                    <label>Profit/Loss</label>
                    <span
                      className={
                        journal.profitLoss >= 0 ? "text-green" : "text-red"
                      }
                    >
                      {formatProfitLoss(journal.profitLoss)}
                    </span>
                  </div>
                </div>
              </div>

              <div className="journal-section">
                <h3>Notes</h3>
                <div className="journal-notes">{journal.notes}</div>
              </div>

              {journal.confluences && journal.confluences.length > 0 && (
                <div className="journal-section">
                  <h3>Confluences Used</h3>
                  <div className="journal-confluences">
                    {journal.confluences.map((confluence, index) => (
                      <span key={index} className="confluence-tag">
                        {confluence}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              <div className="journal-section">
                <label className="journal-date">
                  Created: {new Date(journal.createdAt).toLocaleString()}
                </label>
              </div>
            </>
          )}
        </div>

        <div className="journal-modal-footer">
          {journal ? (
            <button
              className="journal-edit-btn"
              onClick={() => setIsEditing(true)}
            >
              Edit
            </button>
          ) : (
            <button
              className="journal-edit-btn"
              onClick={() => setIsCreating(true)}
            >
              Add Journal
            </button>
          )}
          <button className="journal-close-btn" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

export default JournalModal;
