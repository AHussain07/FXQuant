"""
Unit tests for machine-learning-model/main.py

Covers the ML microservice's public surface: the bias endpoint, its 1-hour
result cache, input validation, feature-engineering pure functions, and the
Forex Factory news calendar cache.

External collaborators (Tiingo, Forex Factory, XGBoost model training /
inference, filesystem CSVs) are mocked so the suite runs fully offline.

Requirements covered
--------------------
FR15 — Daily bullish/bearish/neutral bias prediction per pair
FR16 — Confidence score + primary driver returned alongside the bias
FR17 — Economic calendar sourced from Forex Factory
NFR2 — ML predictions cached for one hour to reduce Tiingo API load

Run with:
    cd machine-learning-model
    pip install pytest pytest-asyncio httpx fastapi
    pytest tests/
"""

from __future__ import annotations

import os
import sys
from datetime import datetime, timedelta, timezone
from unittest.mock import patch, MagicMock

import numpy as np
import pandas as pd
import pytest
from fastapi.testclient import TestClient

# Make the `main` module importable regardless of where pytest is run from.
HERE = os.path.dirname(os.path.abspath(__file__))
MODULE_ROOT = os.path.abspath(os.path.join(HERE, ".."))
if MODULE_ROOT not in sys.path:
    sys.path.insert(0, MODULE_ROOT)

# main refuses to import without a token. Tiingo is mocked throughout, so the
# value only has to exist.
os.environ.setdefault("TIINGO_API_TOKEN", "test-token")

import main  # noqa: E402  (path manipulation must precede import)


client = TestClient(main.app)


# ─────────────────────────────────────────────────────────────────────────
# Fixtures
# ─────────────────────────────────────────────────────────────────────────

@pytest.fixture(autouse=True)
def reset_caches():
    """Wipe module-level caches between tests so each starts clean."""
    main._bias_cache.clear()
    main._news_cache.clear()
    yield
    main._bias_cache.clear()
    main._news_cache.clear()


@pytest.fixture
def fake_bias_result():
    """A representative payload as would be produced by the full pipeline."""
    return {
        "ticker": "EURUSD",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "session": "London",
        "bias": "Bullish",
        "probability_bullish": 0.73,
        "probability_bearish": 0.27,
        "key_driver": "PDH Swept (BSL)",
    }


def _mock_bias_pipeline(fake_bias_result):
    """
    Patch every heavy collaborator so /api/bias/{ticker} runs end-to-end
    without touching disk, Tiingo, or XGBoost.

    Returns a context-manager-like `with` chain.
    """
    def fake_predict_proba(X):
        p = fake_bias_result["probability_bullish"]
        return np.array([[1 - p, p]])

    fake_model = MagicMock()
    fake_model.load_model = MagicMock()
    fake_model.predict_proba.side_effect = fake_predict_proba

    # A latest-row DataFrame shaped like merge_htf_into_15m output.
    fake_latest = pd.DataFrame([{
        "datetime":       pd.Timestamp("2026-04-16 10:00", tz="UTC"),
        "open":           1.10, "high": 1.11, "low": 1.099, "close": 1.1095,
        "session_id":     1,
        "swept_pdh":      1,
        "swept_pdl":      0,
        "close_trend_4h": 1,
        "bull_fvg_active_1h": 2,
        "bear_fvg_active_1h": 1,
    }])

    def fake_pipeline(*_a, **_kw):
        return fake_latest

    patches = [
        patch.object(main, "fetch_pair_data", MagicMock()),
        patch.object(main, "train_model",     MagicMock()),
        patch.object(main, "load_ohlc",       MagicMock(return_value=pd.DataFrame())),
        patch.object(main, "compute_close_only_structure", fake_pipeline),
        patch.object(main, "compute_delivery_state",       fake_pipeline),
        patch.object(main, "compute_fvg_states",           fake_pipeline),
        patch.object(main, "add_session_and_momentum",     fake_pipeline),
        patch.object(main, "merge_htf_into_15m",           fake_pipeline),
        patch.object(main.os.path, "exists", MagicMock(return_value=True)),
        patch.object(main.xgb, "XGBClassifier", MagicMock(return_value=fake_model)),
    ]
    return patches


# =========================================================================
# /api/bias/{ticker} — happy path [FR15, FR16]
# =========================================================================

class TestBiasEndpoint:
    """FR15: daily bullish/bearish bias per pair."""

    def test_returns_bias_for_valid_ticker(self, fake_bias_result):
        """[FR15] Endpoint returns a structured bias payload for EURUSD."""
        with patch.multiple(main, _bias_cache={}):
            for p in _mock_bias_pipeline(fake_bias_result):
                p.start()
            try:
                response = client.get("/api/bias/eurusd")
                assert response.status_code == 200
                body = response.json()
                assert body["ticker"] == "EURUSD"
                assert body["bias"] in ("Bullish", "Bearish")
            finally:
                patch.stopall()

    def test_includes_confidence_score_and_key_driver(self, fake_bias_result):
        """[FR16] Response includes confidence (probability) and primary driver."""
        for p in _mock_bias_pipeline(fake_bias_result):
            p.start()
        try:
            response = client.get("/api/bias/eurusd")
            body = response.json()
            assert 0.0 <= body["probability_bullish"] <= 1.0
            assert 0.0 <= body["probability_bearish"] <= 1.0
            assert abs(body["probability_bullish"] + body["probability_bearish"] - 1.0) < 1e-6
            assert isinstance(body["key_driver"], str)
            assert body["key_driver"] != ""
        finally:
            patch.stopall()

    def test_rejects_unsupported_ticker(self):
        """[FR15] Only the 5 supported pairs are accepted."""
        response = client.get("/api/bias/xauusd")
        assert response.status_code == 400
        assert "Invalid ticker" in response.json()["detail"]

    def test_supports_each_of_the_five_pairs(self, fake_bias_result):
        """[FR15] EURUSD, USDJPY, GBPUSD, AUDUSD, USDCAD are all served."""
        for pair in ("eurusd", "usdjpy", "gbpusd", "audusd", "usdcad"):
            main._bias_cache.clear()
            for p in _mock_bias_pipeline(fake_bias_result):
                p.start()
            try:
                response = client.get(f"/api/bias/{pair}")
                assert response.status_code == 200
                assert response.json()["ticker"] == pair.upper()
            finally:
                patch.stopall()


# =========================================================================
# 1-hour cache [NFR2]
# =========================================================================

class TestBiasCache:
    """NFR2: Bias predictions are cached for one hour to reduce Tiingo load."""

    def test_second_call_within_ttl_returns_cached_payload(self, fake_bias_result):
        """[NFR2] Two calls within the TTL produce one pipeline run."""
        fetch_mock = MagicMock()
        load_mock  = MagicMock(return_value=pd.DataFrame())

        pipeline_patches = _mock_bias_pipeline(fake_bias_result)
        for p in pipeline_patches:
            p.start()

        with patch.object(main, "fetch_pair_data", fetch_mock), \
             patch.object(main, "load_ohlc",       load_mock):
            try:
                r1 = client.get("/api/bias/eurusd")
                r2 = client.get("/api/bias/eurusd")
                assert r1.status_code == 200
                assert r2.status_code == 200
                assert r1.json() == r2.json()
                assert fetch_mock.call_count == 1, (
                    "fetch_pair_data should run exactly once; "
                    "second call must hit the in-memory cache"
                )
            finally:
                patch.stopall()

    def test_expired_entry_triggers_refresh(self, fake_bias_result):
        """[NFR2] When the cached entry has expired, pipeline runs again."""
        fetch_mock = MagicMock()
        for p in _mock_bias_pipeline(fake_bias_result):
            p.start()
        with patch.object(main, "fetch_pair_data", fetch_mock):
            try:
                client.get("/api/bias/eurusd")
                # Fast-forward by replacing the cached expiry with the past.
                main._bias_cache["eurusd"]["expires"] = (
                    datetime.now(timezone.utc) - timedelta(minutes=1)
                )
                client.get("/api/bias/eurusd")
                assert fetch_mock.call_count == 2
            finally:
                patch.stopall()

    def test_cache_ttl_is_one_hour(self):
        """[NFR2] CACHE_TTL is exactly 1 hour, per spec."""
        assert main.CACHE_TTL == timedelta(hours=1)

    def test_each_ticker_has_an_independent_cache_slot(self, fake_bias_result):
        """[NFR2] Caching EURUSD does not serve GBPUSD from the same entry."""
        for p in _mock_bias_pipeline(fake_bias_result):
            p.start()
        try:
            client.get("/api/bias/eurusd")
            client.get("/api/bias/gbpusd")
            assert "eurusd" in main._bias_cache
            assert "gbpusd" in main._bias_cache
            assert main._bias_cache["eurusd"] is not main._bias_cache["gbpusd"]
        finally:
            patch.stopall()


# =========================================================================
# derive_key_driver [FR16]
# =========================================================================

class TestKeyDriver:
    """FR16: The bias payload exposes a primary driver feature."""

    @pytest.mark.parametrize("col, expected", [
        ("swept_pdh",                       "PDH Swept (BSL)"),
        ("swept_pdl",                       "PDL Swept (SSL)"),
        ("swept_4h_high",                   "4H High Swept (BSL)"),
        ("swept_4h_low",                    "4H Low Swept (SSL)"),
        ("bull_fvg_disrespected_now_1h",    "1H Bullish FVG Disrespected"),
        ("bear_fvg_respected_now_1h",       "1H Bearish FVG Respected"),
        ("broke_asia_high",                 "Asia High Broken"),
    ])
    def test_pick_matching_label_when_flag_is_set(self, col, expected):
        """[FR16] derive_key_driver returns a human-readable label for each flag."""
        row = pd.Series({col: 1})
        assert main.derive_key_driver(row) == expected

    def test_falls_back_to_4h_bullish_structure(self):
        """[FR16] When no event fires, the 4H trend label is used."""
        row = pd.Series({"close_trend_4h": 1})
        assert main.derive_key_driver(row) == "4H Bullish Structure"

    def test_falls_back_to_4h_bearish_structure(self):
        row = pd.Series({"close_trend_4h": -1})
        assert main.derive_key_driver(row) == "4H Bearish Structure"

    def test_reports_no_event_when_row_is_empty(self):
        """[FR16] With no events and neutral trend, returns 'No Key Event'."""
        assert main.derive_key_driver(pd.Series({})) == "No Key Event"


# =========================================================================
# Pure feature-engineering helpers (fast, deterministic)
# =========================================================================

class TestFeatureEngineering:
    """Sanity checks on the pure feature functions that feed the model."""

    def test_compute_close_only_structure_adds_expected_columns(self):
        df = pd.DataFrame({
            "datetime": pd.date_range("2026-01-01", periods=30, freq="4h", tz="UTC"),
            "open":     np.linspace(1.0, 1.1, 30),
            "high":     np.linspace(1.01, 1.11, 30),
            "low":      np.linspace(0.99, 1.09, 30),
            "close":    np.linspace(1.005, 1.105, 30),
        })
        out = main.compute_close_only_structure(df)
        for col in ("close_trend", "close_hh", "close_ll",
                    "last_close_bos_dir", "dist_from_close_bos"):
            assert col in out.columns

    def test_add_session_and_momentum_labels_sessions_correctly(self):
        rows = []
        for hr in (2, 9, 14, 20):  # Asia, London, NY, Other
            rows.append({
                "datetime": pd.Timestamp(f"2026-01-01 {hr:02d}:00", tz="UTC"),
                "open":  1.0, "high": 1.001, "low": 0.999, "close": 1.0005,
            })
        df = pd.DataFrame(rows)
        out = main.add_session_and_momentum(df)
        assert out["session_id"].tolist() == [0, 1, 2, 3]


# =========================================================================
# /api/news/{symbol} — Forex Factory calendar [FR17]
# =========================================================================

class TestForexFactoryNews:
    """FR17: Economic calendar scraped from Forex Factory (cached weekly)."""

    def test_rejects_malformed_symbol(self):
        """[FR17] Symbols must be 6 characters (base + quote)."""
        assert client.get("/api/news/EUR").status_code == 400

    def test_filters_events_to_the_two_currencies_in_the_pair(self):
        """[FR17] /api/news/EURUSD returns only EUR and USD high-impact events."""
        today = datetime.now(main._london_tz).date()
        iso = datetime.combine(today, datetime.min.time()).replace(
            hour=13, tzinfo=main._london_tz
        ).isoformat()

        cached_rows = [
            {"currency": "EUR", "event": "ECB Rate", "timestamp": iso,
             "date": "x", "time": "x", "impact": "High"},
            {"currency": "USD", "event": "NFP",       "timestamp": iso,
             "date": "x", "time": "x", "impact": "High"},
            {"currency": "JPY", "event": "BoJ",       "timestamp": iso,
             "date": "x", "time": "x", "impact": "High"},
            {"currency": "GBP", "event": "BoE",       "timestamp": iso,
             "date": "x", "time": "x", "impact": "High"},
        ]
        with patch.object(main, "_load_news_rows", return_value=cached_rows):
            response = client.get("/api/news/EURUSD")
        assert response.status_code == 200
        currencies = {e["currency"] for e in response.json()["events"]}
        assert currencies.issubset({"EUR", "USD"})
        assert "JPY" not in currencies
        assert "GBP" not in currencies

    def test_scrape_and_cache_calls_forex_factory(self):
        """[FR17] _scrape_and_cache hits the Forex Factory JSON endpoint."""
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = []

        with patch("main.requests.get", return_value=mock_response) as mock_get, \
             patch("builtins.open", MagicMock()):
            main._scrape_and_cache()

        called_url = mock_get.call_args[0][0]
        assert "faireconomy.media" in called_url or "forexfactory" in called_url.lower()

    def test_scrape_propagates_error_on_non_200(self):
        """[FR17] A non-200 response from Forex Factory is surfaced as an error."""
        mock_response = MagicMock()
        mock_response.status_code = 503
        mock_response.text = "service down"
        with patch("main.requests.get", return_value=mock_response):
            with pytest.raises(RuntimeError, match="Forex Factory"):
                main._scrape_and_cache()


# =========================================================================
# /health
# =========================================================================

def test_health_endpoint():
    assert client.get("/health").json() == {"status": "ok"}
