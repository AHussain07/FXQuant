import { useState, useEffect, useRef } from "react";
import { ML_URL as API_BASE } from "../../config";


// Module-level cache: survives component unmounts within the same browser session
const NEWS_CACHE_TTL_MS = 15 * 60 * 1000; // 15 minutes
const _newsCache = {};

// Faster retry while erroring — handles the startup race where the React app
// mounts before the FastAPI ML server has finished booting.
const ERROR_RETRY_INTERVAL = 3_000;

export default function ForexNewsAlert({ symbol = "EURUSD" }) {
  const [events, setEvents] = useState([]);
  const [status, setStatus] = useState("loading"); // "loading" | "ok" | "error"
  const timerRef = useRef(null);

  useEffect(() => {
    let cancelled = false;

    function scheduleRetry() {
      if (cancelled) return;
      clearTimeout(timerRef.current);
      timerRef.current = setTimeout(fetchNews, ERROR_RETRY_INTERVAL);
    }

    async function fetchNews() {
      // Return cached result if still valid
      const cached = _newsCache[symbol];
      if (cached && Date.now() < cached.expiresAt) {
        setEvents(cached.events);
        setStatus("ok");
        return;
      }

      try {
        const res = await fetch(`${API_BASE}/api/news/${symbol.toLowerCase()}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        if (cancelled) return;
        const events = data.events || [];
        _newsCache[symbol] = { events, expiresAt: Date.now() + NEWS_CACHE_TTL_MS };
        setEvents(events);
        setStatus("ok");
      } catch (err) {
        if (cancelled) return;
        setStatus("error");
        scheduleRetry();
      }
    }

    // Show cached data immediately on re-mount to avoid "Loading..." flash
    const cached = _newsCache[symbol];
    if (cached && Date.now() < cached.expiresAt) {
      setEvents(cached.events);
      setStatus("ok");
    } else {
      setEvents([]);
      setStatus("loading");
    }
    fetchNews();

    return () => {
      cancelled = true;
      clearTimeout(timerRef.current);
    };
  }, [symbol]);

  // Convert an ISO timestamp (timezone-aware) to the user's local time string
  function toLocalTime(isoString) {
    try {
      return new Date(isoString).toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return isoString;
    }
  }

  return (
    <div className="news-alert-widget">
      <div className="news-alert-header">
        <span className="news-alert-title">Economic News</span>
      </div>

      {status === "loading" && (
        <p className="news-alert-loading">Checking for news…</p>
      )}

      {status === "error" && (
        <p className="news-alert-loading">Unable to load news data.</p>
      )}

      {status === "ok" && events.length === 0 && (
        <div className="news-alert-clear">
          <span className="news-clear-dot" />
          <span className="news-clear-text">No high-impact news today</span>
        </div>
      )}

      {status === "ok" && events.length > 0 && (
        <div className="news-alert-warning">
          <div className="news-warning-banner">
            High-impact news is scheduled. Avoid trading around these times
          </div>
          <ul className="news-event-list">
            {events.map((ev, i) => (
              <li key={i} className="news-event-item">
                <div className="news-event-top">
                  <span className="news-event-currency">{ev.currency}</span>
                  <span className="news-event-time">{toLocalTime(ev.timestamp)}</span>
                </div>
                <div className="news-event-name">{ev.event}</div>
              </li>
            ))}
          </ul>
          <p className="news-event-advice">
            Recommend avoiding trading before each event.
          </p>
        </div>
      )}
    </div>
  );
}
