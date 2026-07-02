import React, { useState, useRef, useEffect } from "react";
import { useNavigate, useLocation, Link } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";

export function Nav({ showLinks = true }) {
  const { currentUser, dbUser, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [imgError, setImgError] = useState(false);

  const userTimeoutRef = useRef(null);

  useEffect(() => {
    setImgError(false);
  }, [currentUser?.photoURL]);

  // Close the mobile menu whenever the route changes
  useEffect(() => {
    setIsMobileMenuOpen(false);
  }, [location.pathname]);

  const handleLogout = async () => {
    try {
      setIsMobileMenuOpen(false);
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

            {/* Hamburger — only on small screens (CSS-controlled) */}
            {showLinks && (
              <button
                className={`nav-mobile-toggle ${isMobileMenuOpen ? "is-open" : ""}`}
                aria-label="Toggle navigation menu"
                aria-expanded={isMobileMenuOpen}
                onClick={() => setIsMobileMenuOpen((open) => !open)}
              >
                <span className="nav-mobile-toggle-bar" />
                <span className="nav-mobile-toggle-bar" />
                <span className="nav-mobile-toggle-bar" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Mobile slide-down menu */}
      {showLinks && isMobileMenuOpen && (
        <div className="nav-mobile-menu">
          {/* Account balance pinned to the top of the menu */}
          {currentUser && dbUser && dbUser.accountBalance != null && (
            <>
              <div className="nav-mobile-balance">
                <span className="balance-label">Balance</span>
                <span className="balance-amount">
                  $
                  {dbUser.accountBalance?.toLocaleString(undefined, {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}
                </span>
              </div>
              <div className="nav-mobile-divider" />
            </>
          )}

          <Link
            to="/dashboard"
            className={`nav-mobile-link ${location.pathname === "/dashboard" ? "nav-mobile-link-active" : ""}`}
          >
            Dashboard
          </Link>
          <Link
            to="/market"
            className={`nav-mobile-link ${location.pathname === "/market" ? "nav-mobile-link-active" : ""}`}
          >
            Trade
          </Link>
          <Link
            to="/history"
            className={`nav-mobile-link ${location.pathname === "/history" ? "nav-mobile-link-active" : ""}`}
          >
            Trade History
          </Link>

          <div className="nav-mobile-divider" />

          {currentUser ? (
            <>
              <button
                className="nav-mobile-link"
                onClick={() => navigate("/settings")}
              >
                Settings
              </button>
              <button
                className="nav-mobile-link nav-mobile-link-danger"
                onClick={handleLogout}
              >
                Sign Out
              </button>
            </>
          ) : (
            <>
              <Link to="/login" className="nav-mobile-link">
                Log In
              </Link>
              <Link to="/signup" className="nav-mobile-link nav-mobile-link-primary">
                Get Started
              </Link>
            </>
          )}
        </div>
      )}
    </nav>
  );
}

export default Nav;
