import React, { useState, useRef, useEffect } from "react";
import { useNavigate, useLocation, Link } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";

export function Nav({ showLinks = true }) {
  const { currentUser, dbUser, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [imgError, setImgError] = useState(false);

  const userTimeoutRef = useRef(null);

  useEffect(() => {
    setImgError(false);
  }, [currentUser?.photoURL]);

  const handleLogout = async () => {
    try {
      await logout();
      navigate("/");
    } catch (error) {
      console.error("Logout failed:", error);
    }
  };

  const handleUserEnter = () => {
    if (userTimeoutRef.current) {
      clearTimeout(userTimeoutRef.current);
    }
    setIsDropdownOpen(true);
  };

  const handleUserLeave = () => {
    userTimeoutRef.current = setTimeout(() => {
      setIsDropdownOpen(false);
    }, 200);
  };

  useEffect(() => {
    return () => {
      if (userTimeoutRef.current) clearTimeout(userTimeoutRef.current);
    };
  }, []);

  return (
    <nav className="nav">
      <div className="nav-container">
        <div className="nav-content">
          {/* Use Link instead of a tag for SPA navigation */}
          <Link to="/" className="logo">
            <div className="logo-text">
              <span className="logo-text-normal">FX</span>
              <span className="logo-text-primary">Quant</span>
            </div>
          </Link>

          {showLinks && (
            <div className="nav-links" id="tour-nav-links">
              <Link
                to="/dashboard"
                className={`nav-link ${location.pathname === "/dashboard" ? "nav-link-active" : ""}`}
                id="tour-nav-dashboard"
              >
                Dashboard
              </Link>
              <Link
                to="/market"
                className={`nav-link ${location.pathname === "/market" ? "nav-link-active" : ""}`}
                id="tour-nav-trade"
              >
                Trade
              </Link>

              <Link
                to="/history"
                className={`nav-link ${location.pathname === "/history" ? "nav-link-active" : ""}`}
                id="tour-nav-history"
              >
                Trade History
              </Link>
            </div>
          )}

          <div className="nav-actions">
            {currentUser ? (
              <>
                {/* Account Balance Display */}
                {dbUser && dbUser.accountBalance != null && (
                  <div className="nav-balance" id="tour-nav-balance">
                    <span className="balance-label">Balance</span>
                    <span className="balance-amount">
                      $
                      {dbUser.accountBalance?.toLocaleString(undefined, {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}
                    </span>
                  </div>
                )}

                <div
                  className="user-menu-container"
                  onMouseEnter={handleUserEnter}
                  onMouseLeave={handleUserLeave}
                >
                  <div className="user-avatar-btn">
                    {currentUser.photoURL && !imgError ? (
                      <img
                        src={currentUser.photoURL}
                        alt="Profile"
                        className="nav-user-avatar"
                        onError={(e) => {
                          e.target.onerror = null;
                          setImgError(true);
                        }}
                      />
                    ) : (
                      <div className="nav-user-avatar-placeholder">
                        {currentUser.displayName
                          ? currentUser.displayName[0].toUpperCase()
                          : currentUser.email
                          ? currentUser.email[0].toUpperCase()
                          : "U"}
                      </div>
                    )}
                  </div>

                  {isDropdownOpen && (
                    <div className="user-dropdown">
                      <div className="user-dropdown-header">
                        <span className="user-dropdown-name">
                          {currentUser.displayName || "User"}
                        </span>
                        <span className="user-dropdown-email">
                          {currentUser.email}
                        </span>
                      </div>
                      <div className="dropdown-divider"></div>
                      <button
                        className="dropdown-item"
                        onClick={() => navigate("/settings")}
                      >
                        Settings
                      </button>
                      <button
                        className="dropdown-item text-red"
                        onClick={handleLogout}
                      >
                        Sign Out
                      </button>
                    </div>
                  )}
                </div>
              </>
            ) : (
              showLinks && (
                <>
                  <Link to="/login" className="nav-button nav-button-ghost">
                    Log In
                  </Link>
                  <Link to="/signup" className="nav-button nav-button-primary">
                    Get Started
                  </Link>
                </>
              )
            )}
          </div>
        </div>
      </div>
    </nav>
  );
}

export default Nav;
