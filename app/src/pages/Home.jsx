import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Nav } from "../components/layout/Nav";
import { Footer } from "../components/layout/Footer";
import { useAuth } from "../context/AuthContext";
import { sendEmailCode, verifyEmailCode } from "../services/api";

// The pairs the bias model is actually trained on (machine-learning-model/main.py).
// Prices are illustrative; the panel is labelled as an example, not a live feed.
const PAIRS = [
  { symbol: "EUR/USD", price: "1.0847", bias: "Bullish" },
  { symbol: "GBP/USD", price: "1.2691", bias: "Bullish" },
  { symbol: "USD/JPY", price: "151.24", bias: "Bearish" },
  { symbol: "AUD/USD", price: "0.6583", bias: "Neutral" },
  { symbol: "USD/CAD", price: "1.3612", bias: "Bearish" },
];

// One lap of the ticker, repeated so it is wider than any viewport. The track
// renders this twice and slides by exactly half its width, so the second lap
// lands where the first began and the loop is seamless.
const TICKER_LAP = [...PAIRS, ...PAIRS, ...PAIRS, ...PAIRS];

// The habit loop the whole product is built around.
const STEPS = [
  { title: "Trade", body: "Live prices and real order mechanics. Nothing at stake." },
  { title: "Journal", body: "Log why you took it, while the reason is still fresh." },
  { title: "Review", body: "See which reasons make money. Drop the ones that don't." },
];

const CARDS = [
  {
    title: "Trade journal",
    body: "Record your confluences on every entry, with the full edit history.",
  },
  {
    title: "Performance analytics",
    body: "Win rate, equity curve, average risk to reward, most traded pairs.",
  },
  {
    title: "Funded challenges",
    body: "Optional structure when you want it. $50K to $150K, 6% target, 4% max loss.",
  },
  {
    title: "Economic calendar",
    body: "High impact releases for both currencies in your pair, in your local time.",
  },
];

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

  const authButtons = (
    <div className="lp-cta">
      <button className="lp-btn lp-btn-primary" onClick={handleGoogleSignIn}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
          <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
          <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
          <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
        </svg>
        Continue with Google
      </button>
      <button className="lp-btn lp-btn-ghost" onClick={openEmailModal}>
        Continue with email
      </button>
    </div>
  );

  return (
    <div className="lp">
      <Nav showLinks={false} />

      {showEmailModal && (
        <div className="email-modal-overlay" onClick={() => setShowEmailModal(false)}>
          <div className="email-modal" onClick={(e) => e.stopPropagation()}>
            <button
              className="email-modal-close"
              aria-label="Close"
              onClick={() => setShowEmailModal(false)}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>

            <h2 className="email-modal-title">
              {emailStep === "email" ? "Sign in with email" : "Enter your code"}
            </h2>
            <p className="email-modal-subtitle">
              {emailStep === "email"
                ? "We'll send you a six character code. No password needed."
                : `Sent to ${email}. It expires in 10 minutes.`}
            </p>

            {emailStep === "email" ? (
              <form onSubmit={handleSendCode}>
                <input
                  type="email"
                  className="email-modal-input"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoFocus
                />
                {emailError && <p className="email-modal-error">{emailError}</p>}
                <button type="submit" className="email-modal-submit" disabled={emailLoading}>
                  {emailLoading ? "Sending" : "Send code"}
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
                <button type="submit" className="email-modal-submit" disabled={emailLoading}>
                  {emailLoading ? "Verifying" : "Verify and sign in"}
                </button>
                <button
                  type="button"
                  className="email-modal-resend"
                  onClick={handleSendCode}
                  disabled={emailLoading}
                >
                  Send a new code
                </button>
              </form>
            )}
          </div>
        </div>
      )}

      <main>
        {/* ───────────────────────────── Hero ───────────────────────────── */}
        <section className="lp-hero">
          <div className="lp-grid-field" aria-hidden="true" />

          <div className="lp-shell lp-hero-inner">
            <div className="lp-hero-copy">
              <span className="lp-eyebrow">Paper trading · Live FX prices</span>

              <h1 className="lp-title">
                Build the habits.
                <br />
                <span className="lp-title-quiet">Then risk the money.</span>
              </h1>

              {authButtons}

              <p className="lp-fineprint">No card. No deposit. Nothing real at risk.</p>
            </div>

            {/* Signature: the habit loop paying off. An equity curve, the numbers
                behind it, and the journalled reason that produced them. */}
            <aside className="lp-panel" aria-label="Example performance">
              <header className="lp-panel-head">
                <div>
                  <span className="lp-panel-tag">Your performance</span>
                  <span className="lp-panel-sub">Example account</span>
                </div>
                <span className="lp-chip">90 days</span>
              </header>

              <div className="lp-equity">
                <div className="lp-equity-figure">
                  <span className="lp-equity-value">$103,720</span>
                  <span className="lp-equity-delta">+$3,720</span>
                </div>

                <svg
                  className="lp-curve"
                  viewBox="0 0 320 96"
                  preserveAspectRatio="none"
                  aria-hidden="true"
                >
                  <defs>
                    <linearGradient id="lp-fill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#3D7BFF" stopOpacity="0.28" />
                      <stop offset="100%" stopColor="#3D7BFF" stopOpacity="0" />
                    </linearGradient>
                  </defs>
                  <path
                    className="lp-curve-fill"
                    d="M0,74 L26,70 L52,78 L78,62 L104,66 L130,52 L156,58 L182,40 L208,46 L234,30 L260,36 L286,20 L320,14 L320,96 L0,96 Z"
                    fill="url(#lp-fill)"
                  />
                  <path
                    className="lp-curve-line"
                    d="M0,74 L26,70 L52,78 L78,62 L104,66 L130,52 L156,58 L182,40 L208,46 L234,30 L260,36 L286,20 L320,14"
                    fill="none"
                    stroke="#3D7BFF"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </div>

              <div className="lp-panel-foot">
                <span className="lp-foot-cell">
                  <span className="lp-foot-label">Win rate</span>
                  <span className="lp-foot-value">61.4%</span>
                </span>
                <span className="lp-foot-cell">
                  <span className="lp-foot-label">Avg R:R</span>
                  <span className="lp-foot-value">1:1.9</span>
                </span>
                <span className="lp-foot-cell">
                  <span className="lp-foot-label">Trades</span>
                  <span className="lp-foot-value">44</span>
                </span>
              </div>

              <div className="lp-insight">
                <span className="lp-insight-label">Your best setup</span>
                <span className="lp-insight-value">London session sweep</span>
                <span className="lp-insight-meta">68% win rate across 19 trades</span>
              </div>
            </aside>
          </div>
        </section>

        {/* ─────────────────────── Pairs the model covers ─────────────────────── */}
        <section className="lp-rail-strip" aria-label="Pairs covered by the daily bias">
          <div className="lp-marquee">
            <div className="lp-marquee-track" aria-hidden="true">
              {[...TICKER_LAP, ...TICKER_LAP].map((p, i) => (
                <div className="lp-tick" key={`${p.symbol}-${i}`}>
                  <span className="lp-tick-symbol">{p.symbol}</span>
                  <span className="lp-tick-price">{p.price}</span>
                  <span className={`lp-tick-bias lp-bias-${p.bias.toLowerCase()}`}>{p.bias}</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ───────────────────────── The loop ───────────────────────── */}
        <section className="lp-section">
          <div className="lp-shell">
            <header className="lp-section-head">
              <span className="lp-eyebrow">The loop</span>
              <h2 className="lp-h2">Trade. Journal. Review.</h2>
            </header>

            <ol className="lp-steps">
              {STEPS.map((step, i) => (
                <li className="lp-step" key={step.title}>
                  <span className="lp-step-num">{String(i + 1).padStart(2, "0")}</span>
                  <h3 className="lp-step-title">{step.title}</h3>
                  <p className="lp-step-body">{step.body}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* ───────────────────────── Capabilities ───────────────────────── */}
        <section className="lp-section lp-section-alt">
          <div className="lp-shell">
            <header className="lp-section-head">
              <span className="lp-eyebrow">Built in</span>
              <h2 className="lp-h2">Everything the loop needs</h2>
            </header>

            <div className="lp-bento">
              <article className="lp-card lp-card-wide">
                <span className="lp-eyebrow">Daily bias</span>
                <h3 className="lp-card-title">A second opinion, every morning</h3>
                <p className="lp-card-body">
                  Machine learning reads years of price history and calls the day on five
                  major pairs.
                </p>
                <div className="lp-verdict">
                  <span className="lp-verdict-pair">EUR/USD</span>
                  <span className="lp-verdict-call">Bullish</span>
                  <span className="lp-verdict-conf">72% confidence</span>
                  <span className="lp-verdict-driver">London session momentum</span>
                </div>
              </article>

              {CARDS.map((card) => (
                <article className="lp-card" key={card.title}>
                  <h3 className="lp-card-title">{card.title}</h3>
                  <p className="lp-card-body">{card.body}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        {/* ───────────────────────── Closing CTA ───────────────────────── */}
        <section className="lp-close">
          <div className="lp-shell lp-close-inner">
            <h2 className="lp-h2">Start the habit</h2>
            {authButtons}
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
