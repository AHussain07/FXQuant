import { useState, useEffect, useRef } from "react";

const API_BASE = "http://localhost:8000";
// Poll interval: 60 seconds (server caches for 1 hour anyway)
const POLL_INTERVAL = 60_000;
// Faster retry while erroring — handles the startup race where the React app
// mounts before the FastAPI ML server has finished booting.
const ERROR_RETRY_INTERVAL = 3_000;

// Module-level cache: survives component unmounts within the same browser session
// TTL matches the server's 1-hour cache
const BIAS_CACHE_TTL_MS = 60 * 60 * 1000;
const _biasCache = {};

export default function DailyBiasDashboard({ symbol = "GBPUSD" }) {
  const [latestPrediction, setLatestPrediction] = useState(null);
  const [status, setStatus] = useState("loading"); // "loading" | "live" | "error"
  const [error, setError] = useState(null);
  const timerRef = useRef(null);

  useEffect(() => {
    let cancelled = false;

    function scheduleNext(intervalMs) {
      if (cancelled) return;
      clearTimeout(timerRef.current);
      timerRef.current = setTimeout(fetchBias, intervalMs);
    }

    async function fetchBias() {
      // Return cached result if still valid
      const cached = _biasCache[symbol];
      if (cached && Date.now() < cached.expiresAt) {
        setLatestPrediction(cached.prediction);
        setStatus("live");
        setError(null);
        scheduleNext(POLL_INTERVAL);
        return;
      }

      try {
        const res = await fetch(`${API_BASE}/api/bias/${symbol.toLowerCase()}`);
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.detail || `HTTP ${res.status}`);
        }
        const data = await res.json();
        if (cancelled) return;

        // Map REST response to the shape the UI expects
        const prediction = {
          signal: data.bias === "Bullish" ? "Bullish Bias" : "Bearish Bias",
          probability_bullish: data.probability_bullish,
          key_driver: data.key_driver,
          timestamp: new Date(data.timestamp).toLocaleTimeString(),
          session: data.session,
        };

        _biasCache[symbol] = { prediction, expiresAt: Date.now() + BIAS_CACHE_TTL_MS };
        setLatestPrediction(prediction);
        setStatus("live");
        setError(null);
        scheduleNext(POLL_INTERVAL);
      } catch (err) {
        if (cancelled) return;
        console.error("[DailyBiasDashboard] Fetch error:", err.message);
        setError(err.message);
        setStatus("error");
        scheduleNext(ERROR_RETRY_INTERVAL);
      }
    }

    // Show cached data immediately on re-mount to avoid "Loading..." flash
    const cached = _biasCache[symbol];
    if (cached && Date.now() < cached.expiresAt) {
      setLatestPrediction(cached.prediction);
      setStatus("live");
      setError(null);
    } else {
      // Reset state when symbol changes and no cache available
      setLatestPrediction(null);
      setStatus("loading");
      setError(null);
    }

    fetchBias();

    return () => {
      cancelled = true;
      clearTimeout(timerRef.current);
    };
  }, [symbol]);

  const [infoOpen, setInfoOpen] = useState(false);

  const isBullish = latestPrediction?.signal === "Bullish Bias";
  const probPct = latestPrediction
    ? (latestPrediction.probability_bullish * 100).toFixed(1)
    : null;

  return (
    <div className="bias-dashboard">
      {/* Connection status pill */}
      <div className="bias-status-row">
        <span
          className={`bias-dot ${
            status === "live"
              ? "bias-dot-live"
              : status === "error"
              ? "bias-dot-offline"
              : "bias-dot-offline"
          }`}
        />
        <span className="bias-status-text">
          {status === "live"
            ? `Live · ${symbol}`
            : status === "error"
            ? `Error · ${symbol}`
            : `Loading · ${symbol}`}
        </span>
      </div>

      {latestPrediction ? (
        <>
          {/* Current signal card */}
          <div
            className={`bias-signal-card ${
              isBullish ? "bias-bullish" : "bias-bearish"
            }`}
          >
            <div className="bias-signal-label-row">
              <div className="bias-signal-label">Intraday Bias</div>
              {/* Info icon with tooltip */}
              <div
                className="bias-info-icon"
                onMouseEnter={() => setInfoOpen(true)}
                onMouseLeave={() => setInfoOpen(false)}
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="8" x2="12" y2="8" strokeWidth="2.5" />
                  <line x1="12" y1="12" x2="12" y2="16" />
                </svg>
                {infoOpen && (
                  <div className="bias-tooltip">
                    <p><strong>Bullish Bias:</strong> the model expects price to move upwards during the session.</p>
                    <p><strong>Bearish Bias:</strong> the model expects price to move downwards during the session.</p>
                  </div>
                )}
              </div>
            </div>
            <div className="bias-signal-value">{latestPrediction.signal}</div>

            {/* Probability bar */}
            <div className="bias-prob-bar-wrap">
              <div
                className="bias-prob-bar"
                style={{ width: `${probPct}%` }}
              />
            </div>
            <div className="bias-prob-label">
              {probPct}% Bullish Probability
            </div>

          </div>

          {/* Disclaimer warning */}
          <div className="bias-warning-row">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="bias-warning-icon">
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
              <line x1="12" y1="9" x2="12" y2="13" />
              <line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
            <span>Predictions are not guaranteed. Always apply your own analysis.</span>
          </div>
        </>
      ) : (
        <div className="bias-awaiting">
          {status === "error"
            ? `ML server error: ${error}`
            : "Loading prediction…"}
        </div>
      )}
    </div>
  );
}
