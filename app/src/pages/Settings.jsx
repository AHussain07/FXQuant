import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import Nav from "../components/layout/Nav";
import {
  resetTradingAccount,
  resetFullAccount,
  deleteAccount,
} from "../services/api";
import "../styles/settings.css";

function Settings() {
  const { currentUser, logout, refreshUserData } = useAuth();
  const navigate = useNavigate();

  const [confirmAction, setConfirmAction] = useState(null);
  const [confirmText, setConfirmText] = useState("");
  const [loading, setLoading] = useState(false);
  const [successMessage, setSuccessMessage] = useState("");

  if (!currentUser) {
    navigate("/");
    return null;
  }

  const actions = [
    {
      id: "reset-trading",
      title: "Reset Trading Account",
      description:
        "Resets your trading account as if you just logged in for the first time. Closes any open trades and clears your account balance and challenge progress. Your trade history and journal entries are preserved.",
      confirmWord: "RESET",
      buttonLabel: "Reset Trading Account",
      color: "warning",
    },
    {
      id: "reset-full",
      title: "Reset Full Account",
      description:
        "Wipes everything and starts fresh. All trades, journal entries, account balance, and challenge progress will be permanently deleted. Your login credentials remain intact.",
      confirmWord: "WIPE",
      buttonLabel: "Reset Full Account",
      color: "danger",
    },
    {
      id: "delete-account",
      title: "Delete Account",
      description:
        "Permanently deletes your account and all associated data including trades, journal entries, and user profile. This action cannot be undone. You will be signed out immediately.",
      confirmWord: "DELETE",
      buttonLabel: "Delete Account",
      color: "danger",
    },
  ];

  const handleAction = async () => {
    if (!confirmAction) return;

    const action = actions.find((a) => a.id === confirmAction);
    if (confirmText !== action.confirmWord) return;

    setLoading(true);
    try {
      if (confirmAction === "reset-trading") {
        await resetTradingAccount(currentUser.uid);
        await refreshUserData();
        setSuccessMessage("Trading account has been reset successfully.");
      } else if (confirmAction === "reset-full") {
        await resetFullAccount(currentUser.uid);
        await refreshUserData();
        setSuccessMessage("Full account has been reset successfully.");
      } else if (confirmAction === "delete-account") {
        await deleteAccount(currentUser.uid);
        await logout();
        navigate("/");
        return;
      }
    } catch (error) {
      console.error("Settings action error:", error);
      setSuccessMessage("");
      alert("An error occurred: " + error.message);
    } finally {
      setLoading(false);
      setConfirmAction(null);
      setConfirmText("");
    }
  };

  const openConfirm = (actionId) => {
    setConfirmAction(actionId);
    setConfirmText("");
    setSuccessMessage("");
  };

  const closeConfirm = () => {
    setConfirmAction(null);
    setConfirmText("");
  };

  const currentAction = actions.find((a) => a.id === confirmAction);

  return (
    <div className="settings-page">
      <Nav />
      <div className="settings-container">
        <div className="settings-header">
          <h1>Settings</h1>
          <p className="settings-subtitle">
            Manage your account and trading preferences
          </p>
        </div>

        {successMessage && (
          <div className="settings-success">{successMessage}</div>
        )}

        <div className="settings-section">
          <h2 className="settings-section-title">Account Actions</h2>
          <div className="settings-cards">
            {actions.map((action) => (
              <div key={action.id} className={`settings-card settings-card-${action.color}`}>
                <div className="settings-card-content">
                  <h3>{action.title}</h3>
                  <p>{action.description}</p>
                </div>
                <button
                  className={`settings-action-btn settings-btn-${action.color}`}
                  onClick={() => openConfirm(action.id)}
                >
                  {action.buttonLabel}
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>

      {confirmAction && currentAction && (
        <div className="settings-modal-overlay" onClick={closeConfirm}>
          <div
            className="settings-modal"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="settings-modal-title">{currentAction.title}</h3>
            <p className="settings-modal-desc">{currentAction.description}</p>
            <p className="settings-modal-confirm-label">
              Type <strong>{currentAction.confirmWord}</strong> to confirm:
            </p>
            <input
              type="text"
              className="settings-modal-input"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder={currentAction.confirmWord}
              autoFocus
            />
            <div className="settings-modal-actions">
              <button
                className="settings-modal-cancel"
                onClick={closeConfirm}
                disabled={loading}
              >
                Cancel
              </button>
              <button
                className={`settings-modal-confirm settings-btn-${currentAction.color}`}
                onClick={handleAction}
                disabled={
                  confirmText !== currentAction.confirmWord || loading
                }
              >
                {loading ? "Processing..." : "Confirm"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default Settings;
