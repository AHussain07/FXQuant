import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Nav } from "../components/layout/Nav";
import { Footer } from "../components/layout/Footer";
import { useAuth } from "../context/AuthContext";
import { sendEmailCode, verifyEmailCode } from "../services/api";

export default function Home() {
  const { currentUser, loginWithGoogle, loginWithEmail } = useAuth();
  const navigate = useNavigate();

  const [showEmailModal, setShowEmailModal] = useState(false);
  const [emailStep, setEmailStep] = useState("email"); // "email" or "code"
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [emailError, setEmailError] = useState("");
  const [emailLoading, setEmailLoading] = useState(false);

  React.useEffect(() => {
    if (currentUser) {
      navigate("/dashboard");
    }
  }, [currentUser, navigate]);

  const handleGoogleSignIn = async () => {
    try {
      await loginWithGoogle();
      navigate("/dashboard");
    } catch (error) {
      console.error("Google sign-in failed:", error);
    }
  };

  const handleSendCode = async (e) => {
    e.preventDefault();
    setEmailError("");
    setEmailLoading(true);
    try {
      await sendEmailCode(email);
      setEmailStep("code");
    } catch (error) {
      setEmailError(error.message);
    } finally {
      setEmailLoading(false);
    }
  };

  const handleVerifyCode = async (e) => {
    e.preventDefault();
    setEmailError("");
    setEmailLoading(true);
    try {
      const response = await verifyEmailCode(email, code);
      loginWithEmail(response.user, response.isNewUser);
      setShowEmailModal(false);
      navigate("/dashboard");
    } catch (error) {
      setEmailError(error.message);
    } finally {
      setEmailLoading(false);
    }
  };

  const openEmailModal = () => {
    setShowEmailModal(true);
    setEmailStep("email");
    setEmail("");
    setCode("");
    setEmailError("");
  };

  return (
    <div className="container">
      <Nav showLinks={false} />

      {showEmailModal && (
        <div className="email-modal-overlay" onClick={() => setShowEmailModal(false)}>
          <div className="email-modal" onClick={(e) => e.stopPropagation()}>
            <button className="email-modal-close" onClick={() => setShowEmailModal(false)}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>

            <h2 className="email-modal-title">
              {emailStep === "email" ? "Sign in with Email" : "Enter Verification Code"}
            </h2>
            <p className="email-modal-subtitle">
              {emailStep === "email"
                ? "We'll send a verification code to your email"
                : `A 6-digit code has been sent to your email`}
            </p>

            {emailStep === "email" ? (
              <form onSubmit={handleSendCode}>
                <input
                  type="email"
                  className="email-modal-input"
                  placeholder="Enter your email address"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoFocus
                />
                {emailError && <p className="email-modal-error">{emailError}</p>}
                <button
                  type="submit"
                  className="email-modal-submit"
                  disabled={emailLoading}
                >
                  {emailLoading ? "Sending..." : "Send One Time Password"}
                </button>
              </form>
            ) : (
              <form onSubmit={handleVerifyCode}>
                <input
                  type="text"
                  className="email-modal-input email-modal-code-input"
                  value={code}
                  onChange={(e) => setCode(e.target.value.toUpperCase())}
                  maxLength={6}
                  required
                  autoFocus
                />
                {emailError && <p className="email-modal-error">{emailError}</p>}
                <button
                  type="submit"
                  className="email-modal-submit"
                  disabled={emailLoading}
                >
                  {emailLoading ? "Verifying..." : "Verify & Sign In"}
                </button>
                <button
                  type="button"
                  className="email-modal-resend"
                  onClick={handleSendCode}
                  disabled={emailLoading}
                >
                  Resend Code
                </button>
              </form>
            )}
          </div>
        </div>
      )}

      <main className="main">
        {/* Hero Section */}
        <section className="hero-section">
          <div className="gradient-mesh" />

          <div className="hero-content">
            <div className="hero-inner">
              <h1 className="hero-title">
                <span className="hero-title-normal">
                  Master Forex Trading,
                </span>
                <br />
                <span className="hero-title-gradient">Without the Risk</span>
              </h1>

              <p className="hero-description">
                Practise forex trading with live market prices and none of the
                risk. Take on funded-account challenges, journal every trade, and
                sharpen your edge with data-driven bias predictions on the major
                pairs.
              </p>

              <div className="hero-cta">
                <button
                  className="button button-lg button-google"
                  onClick={handleGoogleSignIn}
                >
                  <svg
                    width="20"
                    height="20"
                    viewBox="0 0 24 24"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                  >
                    <path
                      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                      fill="#4285F4"
                    />
                    <path
                      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                      fill="#34A853"
                    />
                    <path
                      d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                      fill="#FBBC05"
                    />
                    <path
                      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                      fill="#EA4335"
                    />
                  </svg>
                  Sign in with Google
                </button>
                <button
                  className="button button-lg button-email"
                  onClick={openEmailModal}
                >
                  <svg
                    width="20"
                    height="20"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    xmlns="http://www.w3.org/2000/svg"
                  >
                    <rect x="2" y="4" width="20" height="16" rx="2" />
                    <path d="M22 4L12 13L2 4" />
                  </svg>
                  Sign in with Email
                </button>
              </div>
            </div>
          </div>

          <div className="decorative-grid" />
        </section>

        {/* Features Section */}
        <section id="features" className="features-section">
          <div className="features-container">
            <div className="features-header">
              <h2 className="features-title">Everything You Need to Succeed</h2>
              <p className="features-description">
                A complete forex practice environment, from live-price paper
                trading and funded-account challenges to bias predictions, a
                trade journal, and performance analytics.
              </p>
            </div>

            <div className="features-grid">
              <div className="feature-card">
                <div className="feature-icon feature-icon-primary">
                  <svg
                    width="24"
                    height="24"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="#3b82f6"
                    strokeWidth="2"
                  >
                    <polyline points="23 6 13.5 15.5 8.5 10.5 1 18"></polyline>
                    <polyline points="17 6 23 6 23 12"></polyline>
                  </svg>
                </div>
                <h3 className="feature-title">Paper Trading</h3>
                <p className="feature-description">
                  Buy and sell major currency pairs against real-time prices from
                  Alpaca and Finnhub, with no real money at risk.
                </p>
              </div>

              <div className="feature-card">
                <div className="feature-icon feature-icon-accent">
                  <svg
                    width="24"
                    height="24"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="#06b6d4"
                    strokeWidth="2"
                  >
                    <circle cx="12" cy="8" r="7"></circle>
                    <polyline points="8.21 13.89 7 23 12 20 17 23 15.79 13.88"></polyline>
                  </svg>
                </div>
                <h3 className="feature-title">Funded Challenges</h3>
                <p className="feature-description">
                  Take on $50K, $100K, or $150K prop-firm challenges with real
                  profit targets and drawdown limits, or trade a rule-free demo
                  account.
                </p>
              </div>

              <div className="feature-card">
                <div className="feature-icon feature-icon-primary">
                  <svg
                    width="24"
                    height="24"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="#3b82f6"
                    strokeWidth="2"
                  >
                    <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"></polyline>
                  </svg>
                </div>
                <h3 className="feature-title">ML Bias Predictions</h3>
                <p className="feature-description">
                  XGBoost models forecast daily directional bias for EURUSD,
                  GBPUSD, USDJPY, AUDUSD, and USDCAD to inform your decisions.
                </p>
              </div>

              <div className="feature-card">
                <div className="feature-icon feature-icon-accent">
                  <svg
                    width="24"
                    height="24"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="#06b6d4"
                    strokeWidth="2"
                  >
                    <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"></path>
                    <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"></path>
                  </svg>
                </div>
                <h3 className="feature-title">Trade Journal</h3>
                <p className="feature-description">
                  Document every trade with detailed notes and a full edit
                  history so you can learn from your wins and losses.
                </p>
              </div>

              <div className="feature-card">
                <div className="feature-icon feature-icon-primary">
                  <svg
                    width="24"
                    height="24"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="#3b82f6"
                    strokeWidth="2"
                  >
                    <line x1="18" y1="20" x2="18" y2="10"></line>
                    <line x1="12" y1="20" x2="12" y2="4"></line>
                    <line x1="6" y1="20" x2="6" y2="14"></line>
                    <line x1="3" y1="20" x2="21" y2="20"></line>
                  </svg>
                </div>
                <h3 className="feature-title">Live Charts</h3>
                <p className="feature-description">
                  Analyse the market on interactive TradingView charts with
                  multiple timeframes, trendlines, and price levels.
                </p>
              </div>

              <div className="feature-card">
                <div className="feature-icon feature-icon-accent">
                  <svg
                    width="24"
                    height="24"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="#06b6d4"
                    strokeWidth="2"
                  >
                    <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
                    <line x1="16" y1="2" x2="16" y2="6"></line>
                    <line x1="8" y1="2" x2="8" y2="6"></line>
                    <line x1="3" y1="10" x2="21" y2="10"></line>
                  </svg>
                </div>
                <h3 className="feature-title">News Calendar</h3>
                <p className="feature-description">
                  Stay ahead of high-impact economic events pulled weekly from
                  Forex Factory before they move the market.
                </p>
              </div>

              <div className="feature-card">
                <div className="feature-icon feature-icon-primary">
                  <svg
                    width="24"
                    height="24"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="#3b82f6"
                    strokeWidth="2"
                  >
                    <path d="M21.21 15.89A10 10 0 1 1 8 2.83"></path>
                    <path d="M22 12A10 10 0 0 0 12 2v10z"></path>
                  </svg>
                </div>
                <h3 className="feature-title">Performance Analytics</h3>
                <p className="feature-description">
                  Track your win rate, equity curve, and most-traded pairs on a
                  dashboard that turns your history into insight.
                </p>
              </div>
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
