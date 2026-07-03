from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import numpy as np
import pandas as pd
import xgboost as xgb
import requests
import os
from datetime import datetime, timedelta, timezone

app = FastAPI()

# Enable CORS so your React app can communicate with this API.
# In production set ALLOWED_ORIGINS to a comma-separated list of the deployed
# frontend origin(s), e.g. "https://your-app.vercel.app". Defaults to the local
# dev origins so `npm run dev` keeps working with no extra config.
_allowed_origins = os.environ.get(
    "ALLOWED_ORIGINS", "http://localhost:3000,http://127.0.0.1:3000"
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in _allowed_origins.split(",") if o.strip()],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- Configuration ---
# API token comes from the environment in deployment; the committed value is only
# a local-dev fallback and should be rotated (it has been exposed in git history).
TIINGO_API_TOKEN = os.environ.get(
    "TIINGO_API_TOKEN", "05bd307a417a7061890cabea66937953d20994c2"
)
PAIRS = {
    'EURUSD': 'eurusd',
    'USDJPY': 'usdjpy',
    'GBPUSD': 'gbpusd',
    'AUDUSD': 'audusd',
    'USDCAD': 'usdcad'
}
TIMEFRAMES = {'1D': '1day', '4H': '4hour', '1H': '1hour', '15M': '15min'}

# Session windows (UTC hours) — must match the notebook exactly
ASIA_START   = 0
ASIA_END     = 7
LONDON_START = 7
LONDON_END   = 12
NY_START     = 12
NY_END       = 17

# --- File layout ---
# Historical price CSVs live under ./data, trained XGBoost model files
# under ./models. Both directories are created on demand.
_MODULE_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(_MODULE_DIR, "data")
MODELS_DIR = os.path.join(_MODULE_DIR, "models")
os.makedirs(DATA_DIR, exist_ok=True)
os.makedirs(MODELS_DIR, exist_ok=True)

# --- In-memory cache (1-hour TTL) ---
_bias_cache: dict = {}  # key: ticker, value: {"result": dict, "expires": datetime}
CACHE_TTL = timedelta(hours=1)
TRAIN_RATIO = 0.8
RANDOM_STATE = 42


# =========================================================================
# 0. fetch_pair_data — download CSVs from Tiingo for a single pair
# =========================================================================

def fetch_pair_data(ticker: str):
    """Download all timeframe CSVs for a pair if they don't already exist."""
    start_date = (datetime.now() - timedelta(days=5*365)).strftime('%Y-%m-%d')
    for tf_name, tf_tiingo in TIMEFRAMES.items():
        filename = os.path.join(DATA_DIR, f"{ticker}_{tf_name}.csv")
        if os.path.exists(filename) and os.path.getsize(filename) > 0:
            print(f"  {filename} already exists, skipping")
            continue

        print(f"  Downloading {filename} from Tiingo...")
        url = f"https://api.tiingo.com/tiingo/fx/{ticker}/prices"
        params = {
            'token': TIINGO_API_TOKEN,
            'resampleFreq': tf_tiingo,
            'startDate': start_date,
            'format': 'csv'
        }
        response = requests.get(url, params=params)
        if response.status_code == 200:
            with open(filename, 'w') as f:
                f.write(response.text)
            print(f"  OK {filename} downloaded")
        else:
            raise RuntimeError(f"Failed to download {filename}: {response.status_code} {response.text}")


# =========================================================================
# 0b. train_model — full training pipeline from CSVs → saved model
# =========================================================================

def train_model(ticker: str) -> str:
    """
    Run the full feature-engineering + XGBoost training pipeline.
    Returns the path to the saved model file.
    """
    model_path = os.path.join(MODELS_DIR, f"{ticker}_model.json")
    print(f"\n{'='*60}")
    print(f"Training model for {ticker.upper()}...")
    print(f"{'='*60}")

    # ── 1. Load data ──
    df_15m = load_ohlc(os.path.join(DATA_DIR, f"{ticker}_15M.csv"), '15M')
    df_1h  = load_ohlc(os.path.join(DATA_DIR, f"{ticker}_1H.csv"),  '1H')
    df_4h  = load_ohlc(os.path.join(DATA_DIR, f"{ticker}_4H.csv"),  '4H')
    df_d   = load_ohlc(os.path.join(DATA_DIR, f"{ticker}_1D.csv"),  '1D')

    # ── 2. Feature engineering ──
    df_4h  = compute_close_only_structure(df_4h)
    df_d   = compute_close_only_structure(df_d)
    df_15m = compute_delivery_state(df_15m, df_d, df_4h)
    df_1h  = compute_fvg_states(df_1h)
    df_15m = compute_fvg_states(df_15m)
    df_15m = add_session_and_momentum(df_15m)
    df_final = merge_htf_into_15m(df_15m, df_4h, df_1h, df_d)

    # ── 3. Build target (daily close direction) ──
    df_final['date'] = df_final['datetime'].dt.date
    df_final['hour'] = df_final['datetime'].dt.hour

    # Filter to London + NY sessions only (07:00–17:00 UTC)
    session_mask = (df_final['hour'] >= LONDON_START) & (df_final['hour'] < NY_END)
    df_final = df_final[session_mask].reset_index(drop=True)

    daily = df_d[['datetime', 'open', 'close']].copy()
    daily['date'] = daily['datetime'].dt.date
    daily['daily_bullish'] = (daily['close'] > daily['open']).astype(int)
    target_map = dict(zip(daily['date'], daily['daily_bullish']))

    df_final['target'] = df_final['date'].map(target_map)
    df_final = df_final.dropna(subset=['target']).reset_index(drop=True)
    df_final['target'] = df_final['target'].astype(int)

    print(f"Training rows: {len(df_final):,}")
    print(f"Target balance: {df_final['target'].value_counts().to_dict()}")

    # ── 4. Select features ──
    exclude = {
        'datetime', 'date', 'open', 'high', 'low', 'close', 'volume',
        'hour', 'target',
        'pdh', 'pdl', 'asia_high', 'asia_low',
        '4h_swing_high', '4h_swing_low',
        'day_high_so_far', 'day_low_so_far',
        'any_bsl_sweep', 'any_ssl_sweep',
        'timeframe',
    }
    df_final = df_final.loc[:, ~df_final.columns.duplicated()].copy()
    numerical = df_final.select_dtypes(include=np.number).columns.tolist()
    feature_cols = [c for c in numerical if c not in exclude]

    df_final[feature_cols] = df_final[feature_cols].fillna(0)

    print(f"Feature count: {len(feature_cols)}")

    # ── 5. Train/test split (time-based) ──
    split_idx = int(len(df_final) * TRAIN_RATIO)
    train = df_final.iloc[:split_idx]
    test  = df_final.iloc[split_idx:]

    X_train = train[feature_cols].values
    y_train = train['target'].values
    X_test  = test[feature_cols].values
    y_test  = test['target'].values

    # ── 6. Train XGBoost ──
    n_neg = (y_train == 0).sum()
    n_pos = (y_train == 1).sum()
    scale_ratio = n_neg / n_pos if n_pos > 0 else 1.0

    model = xgb.XGBClassifier(
        n_estimators=600,
        max_depth=5,
        learning_rate=0.03,
        subsample=0.8,
        colsample_bytree=0.7,
        min_child_weight=15,
        gamma=0.1,
        scale_pos_weight=scale_ratio,
        random_state=RANDOM_STATE,
        eval_metric='logloss',
        early_stopping_rounds=30,
        verbosity=0,
        n_jobs=-1,
    )

    model.fit(
        X_train, y_train,
        eval_set=[(X_test, y_test)],
        verbose=False,
    )

    print(f"Best iteration: {model.best_iteration}")

    # ── 7. Save model ──
    model.save_model(model_path)
    print(f"Model saved to {model_path}")

    return model_path


# =========================================================================
# 1. load_ohlc — reads a Tiingo CSV into the format the notebook expects
# =========================================================================

def load_ohlc(path: str, timeframe: str) -> pd.DataFrame:
    """
    Load OHLC CSV downloaded from Tiingo, clean placeholders,
    sort chronologically. Handles both Tiingo column names
    (date, fxOpen, …) and pre-cleaned names (datetime, open, …).
    """
    df = pd.read_csv(path)
    df.columns = [c.strip() for c in df.columns]

    # Tiingo FX CSVs use 'date', 'fxOpen', 'fxHigh', 'fxLow', 'fxClose'
    rename_map = {}
    if 'date' in df.columns and 'datetime' not in df.columns:
        rename_map['date'] = 'datetime'
    for tiingo_col, std_col in [('fxOpen', 'open'), ('fxHigh', 'high'),
                                 ('fxLow', 'low'), ('fxClose', 'close')]:
        if tiingo_col in df.columns:
            rename_map[tiingo_col] = std_col
    if rename_map:
        df.rename(columns=rename_map, inplace=True)

    # Normalise column names to lowercase
    df.columns = [c.lower() for c in df.columns]

    df['datetime'] = pd.to_datetime(df['datetime'])
    df = df.sort_values('datetime').reset_index(drop=True)
    df = df.drop_duplicates(subset='datetime')

    # Remove placeholder bars where O=H=L=C (no price movement — bad data)
    mask = ((df['open'] == df['high']) & (df['high'] == df['low']) &
            (df['low'] == df['close']))
    removed = mask.sum()
    if removed > 0:
        print(f"  Removed {removed} placeholder bars from {timeframe}")
    df = df[~mask].reset_index(drop=True)

    df = df.ffill().bfill()
    return df


# =========================================================================
# 2. compute_close_only_structure — applied to 4H and 1D
# =========================================================================

def compute_close_only_structure(df: pd.DataFrame, swing_len: int = 5) -> pd.DataFrame:
    """
    V3 FEATURE A: Close-only market structure.
    Uses CLOSE prices to detect swing points (line-chart style).

    Outputs: close_trend, close_hh/hl/lh/ll, last_close_bos_dir,
             dist_from_close_bos, close_bos_net_10.
    """
    df = df.copy()
    closes = df['close']

    # Swing points from closes — shifted by 1 to avoid lookahead
    df['swing_high_close'] = closes.rolling(swing_len, min_periods=swing_len).max().shift(1)
    df['swing_low_close']  = closes.rolling(swing_len, min_periods=swing_len).min().shift(1)

    prev_swing_h = df['swing_high_close'].shift(swing_len)
    prev_swing_l = df['swing_low_close'].shift(swing_len)

    df['close_hh'] = (df['swing_high_close'] > prev_swing_h).astype(int)
    df['close_hl'] = (df['swing_low_close']  > prev_swing_l).astype(int)
    df['close_lh'] = (df['swing_high_close'] < prev_swing_h).astype(int)
    df['close_ll'] = (df['swing_low_close']  < prev_swing_l).astype(int)

    df['close_trend'] = np.select(
        [
            (df['close_hh'] == 1) & (df['close_hl'] == 1),
            (df['close_lh'] == 1) & (df['close_ll'] == 1),
        ],
        [1, -1],
        default=0
    )

    # BOS on close: price closes beyond previous close-swing
    df['close_bos_bull'] = (closes > df['swing_high_close']).astype(int)
    df['close_bos_bear'] = (closes < df['swing_low_close']).astype(int)

    # Track last BOS direction (sequential — state persists)
    n = len(df)
    last_dir = np.zeros(n)
    dist_bos = np.zeros(n)
    cur_dir  = 0
    last_idx = 0
    for i in range(n):
        if df['close_bos_bull'].iat[i] == 1:
            cur_dir  = 1
            last_idx = i
        elif df['close_bos_bear'].iat[i] == 1:
            cur_dir  = -1
            last_idx = i
        last_dir[i] = cur_dir
        dist_bos[i] = i - last_idx

    df['last_close_bos_dir']  = last_dir
    df['dist_from_close_bos'] = dist_bos

    df['close_bos_net_10'] = (
        df['close_bos_bull'].rolling(10, min_periods=1).sum() -
        df['close_bos_bear'].rolling(10, min_periods=1).sum()
    )

    return df


# =========================================================================
# 3. compute_delivery_state — applied to 15M (needs 1D + 4H)
# =========================================================================

def compute_delivery_state(df_15m: pd.DataFrame,
                            df_daily: pd.DataFrame,
                            df_4h: pd.DataFrame) -> pd.DataFrame:
    """
    V3 FEATURE B: Delivery-from-liquidity state machine.
    Detects PDH/PDL sweeps and 4H swing sweeps; tracks persistent state.

    Outputs: swept_pdh/pdl, swept_4h_high/low, delivering_from,
             bars_since_sweep, dist_to_pdh/pdl.
    """
    df = df_15m.copy()
    df['date'] = df['datetime'].dt.date

    # ── PDH / PDL from previous daily bar ──
    daily = df_daily[['datetime', 'high', 'low']].copy()
    daily['date'] = daily['datetime'].dt.date
    daily = daily.sort_values('date')
    daily['pdh'] = daily['high'].shift(1)
    daily['pdl'] = daily['low'].shift(1)
    pdh_map = dict(zip(daily['date'], daily['pdh']))
    pdl_map = dict(zip(daily['date'], daily['pdl']))

    df['pdh'] = df['date'].map(pdh_map)
    df['pdl'] = df['date'].map(pdl_map)

    # ── 4H swing levels via merge_asof ──
    swing_4h = df_4h[['datetime', 'swing_high_close', 'swing_low_close']].dropna().copy()
    swing_4h = swing_4h.sort_values('datetime')
    df = df.sort_values('datetime')

    df = pd.merge_asof(
        df, swing_4h, on='datetime', direction='backward',
        suffixes=('', '_4h')
    )
    df.rename(columns={
        'swing_high_close': '4h_swing_high',
        'swing_low_close':  '4h_swing_low'
    }, inplace=True)

    # ── Sweep detection ──
    df['swept_pdh']     = (df['high'] > df['pdh']).astype(int)
    df['swept_pdl']     = (df['low']  < df['pdl']).astype(int)
    df['swept_4h_high'] = (df['high'] > df['4h_swing_high']).astype(int)
    df['swept_4h_low']  = (df['low']  < df['4h_swing_low']).astype(int)

    df['any_bsl_sweep'] = ((df['swept_pdh'] == 1) | (df['swept_4h_high'] == 1)).astype(int)
    df['any_ssl_sweep'] = ((df['swept_pdl'] == 1) | (df['swept_4h_low']  == 1)).astype(int)

    # ── State machine (sequential — state persists until flipped) ──
    n             = len(df)
    state         = np.zeros(n, dtype=int)
    bars_in_state = np.zeros(n, dtype=int)
    current_state = 0
    bar_count     = 0
    bsl = df['any_bsl_sweep'].values
    ssl = df['any_ssl_sweep'].values

    for i in range(n):
        if bsl[i] == 1:
            current_state = 1    # BSL swept → expect sell delivery
            bar_count     = 0
        elif ssl[i] == 1:
            current_state = -1   # SSL swept → expect buy delivery
            bar_count     = 0
        bar_count       += 1
        state[i]         = current_state
        bars_in_state[i] = bar_count

    df['delivering_from']  = state
    df['bars_since_sweep'] = bars_in_state

    # Distance to PDH/PDL in pips
    df['dist_to_pdh'] = (df['pdh'] - df['close']) / df['close'] * 10000
    df['dist_to_pdl'] = (df['close'] - df['pdl']) / df['close'] * 10000

    return df


# =========================================================================
# 4. compute_fvg_states — applied to 1H and 15M
# =========================================================================

def compute_fvg_states(df: pd.DataFrame, max_age: int = 40) -> pd.DataFrame:
    """
    V3 FEATURE C: FVG respect/disrespect as conditional states.

    Tracks active bullish/bearish FVG count, this-bar interactions
    (respected vs disrespected), nearest FVG distance, and rolling ratio.
    """
    df = df.copy()
    n  = len(df)

    bull_fvg_active       = np.zeros(n, dtype=int)
    bear_fvg_active       = np.zeros(n, dtype=int)
    bull_respected_now    = np.zeros(n, dtype=int)
    bull_disrespected_now = np.zeros(n, dtype=int)
    bear_respected_now    = np.zeros(n, dtype=int)
    bear_disrespected_now = np.zeros(n, dtype=int)
    nearest_bull_fvg_dist = np.full(n, np.nan)
    nearest_bear_fvg_dist = np.full(n, np.nan)

    highs  = df['high'].values
    lows   = df['low'].values
    closes = df['close'].values

    active_fvgs = []

    for i in range(2, n):
        # ── Detect new FVGs (standard 3-candle pattern) ──
        if lows[i] > highs[i - 2]:   # Bullish FVG
            active_fvgs.append({
                'top': lows[i], 'bottom': highs[i - 2],
                'type': 'bullish', 'born': i
            })
        if highs[i] < lows[i - 2]:   # Bearish FVG
            active_fvgs.append({
                'top': lows[i - 2], 'bottom': highs[i],
                'type': 'bearish', 'born': i
            })

        # ── Evaluate each active FVG against THIS bar ──
        still_active = []
        b_resp = 0; b_dis = 0; r_resp = 0; r_dis = 0

        for fvg in active_fvgs:
            if fvg['born'] == i:
                still_active.append(fvg)
                continue

            if fvg['type'] == 'bullish':
                if lows[i] <= fvg['top']:            # Price entered FVG zone
                    if closes[i] > fvg['bottom']:
                        b_resp += 1                   # Respected
                        still_active.append(fvg)
                    else:
                        b_dis += 1                    # Disrespected — invalidated
                else:
                    still_active.append(fvg)
            else:  # bearish
                if highs[i] >= fvg['bottom']:
                    if closes[i] < fvg['top']:
                        r_resp += 1
                        still_active.append(fvg)
                    else:
                        r_dis += 1
                else:
                    still_active.append(fvg)

        # Expire old FVGs
        active_fvgs = [f for f in still_active if (i - f['born']) <= max_age]

        bulls = [f for f in active_fvgs if f['type'] == 'bullish']
        bears = [f for f in active_fvgs if f['type'] == 'bearish']

        bull_fvg_active[i]       = len(bulls)
        bear_fvg_active[i]       = len(bears)
        bull_respected_now[i]    = min(b_resp, 1)
        bull_disrespected_now[i] = min(b_dis, 1)
        bear_respected_now[i]    = min(r_resp, 1)
        bear_disrespected_now[i] = min(r_dis, 1)

        # Distance to nearest FVG (pips)
        if bulls:
            dists = (
                [(f['top'] - closes[i]) * 10000 for f in bulls if f['top'] >= closes[i]] +
                [(closes[i] - f['bottom']) * 10000 for f in bulls if f['bottom'] > closes[i]]
            )
            if dists:
                nearest_bull_fvg_dist[i] = min(abs(d) for d in dists)
        if bears:
            dists = (
                [(f['top'] - closes[i]) * 10000 for f in bears if f['top'] >= closes[i]] +
                [(closes[i] - f['bottom']) * 10000 for f in bears if f['bottom'] > closes[i]]
            )
            if dists:
                nearest_bear_fvg_dist[i] = min(abs(d) for d in dists)

    df['bull_fvg_active']           = bull_fvg_active
    df['bear_fvg_active']           = bear_fvg_active
    df['bull_fvg_respected_now']    = bull_respected_now
    df['bull_fvg_disrespected_now'] = bull_disrespected_now
    df['bear_fvg_respected_now']    = bear_respected_now
    df['bear_fvg_disrespected_now'] = bear_disrespected_now
    df['nearest_bull_fvg_dist']     = nearest_bull_fvg_dist
    df['nearest_bear_fvg_dist']     = nearest_bear_fvg_dist
    df['fvg_net_active']            = bull_fvg_active - bear_fvg_active

    # Rolling respect ratio (last 20 bars)
    resp_total = (
        pd.Series(bull_respected_now + bear_respected_now)
        .rolling(20, min_periods=1).sum()
    )
    dis_total = (
        pd.Series(bull_disrespected_now + bear_disrespected_now)
        .rolling(20, min_periods=1).sum()
    )
    df['fvg_respect_ratio_20'] = resp_total / (resp_total + dis_total + 1e-8)

    return df


# =========================================================================
# 5. add_session_and_momentum — applied to 15M
# =========================================================================

def add_session_and_momentum(df_15m: pd.DataFrame) -> pd.DataFrame:
    """
    V3 FEATURE D: Session labelling, candle direction, momentum,
    body ratio, Asia range features, and day-range position.
    """
    df       = df_15m.copy()
    df['hour'] = df['datetime'].dt.hour
    df['date'] = df['datetime'].dt.date

    # Session ID: 0=Asia, 1=London, 2=NY, 3=Other
    df['session_id'] = np.select(
        [
            (df['hour'] >= ASIA_START)   & (df['hour'] < ASIA_END),
            (df['hour'] >= LONDON_START) & (df['hour'] < LONDON_END),
            (df['hour'] >= NY_START)     & (df['hour'] < NY_END),
        ],
        [0, 1, 2],
        default=3
    )

    # Candle direction and momentum
    df['candle_dir']  = np.where(df['close'] > df['open'], 1, -1)
    df['momentum_3']  = df['candle_dir'].rolling(3, min_periods=1).sum()
    df['momentum_5']  = df['candle_dir'].rolling(5, min_periods=1).sum()

    # Body ratio (conviction)
    rng  = df['high'] - df['low']
    body = (df['close'] - df['open']).abs()
    df['body_ratio'] = np.where(rng > 0, body / rng, 0)

    # ── Asia range per day (bars 00:00–07:00 UTC) ──
    asia_mask  = (df['hour'] >= ASIA_START) & (df['hour'] < ASIA_END)
    asia_highs = df[asia_mask].groupby('date')['high'].max().rename('asia_high')
    asia_lows  = df[asia_mask].groupby('date')['low'].min().rename('asia_low')
    asia_ranges = pd.DataFrame({'asia_high': asia_highs, 'asia_low': asia_lows})
    asia_ranges['asia_range_pips'] = (asia_ranges['asia_high'] - asia_ranges['asia_low']) * 10000

    df = df.merge(asia_ranges, left_on='date', right_index=True, how='left')

    asia_width = df['asia_high'] - df['asia_low']
    df['pos_in_asia_range'] = np.where(
        asia_width > 0,
        (df['close'] - df['asia_low']) / asia_width,
        0.5
    )

    df['broke_asia_high'] = (df['high'] > df['asia_high']).astype(int)
    df['broke_asia_low']  = (df['low']  < df['asia_low']).astype(int)

    # ── Developing day range position ──
    df['day_high_so_far'] = df.groupby('date')['high'].cummax()
    df['day_low_so_far']  = df.groupby('date')['low'].cummin()
    day_range = df['day_high_so_far'] - df['day_low_so_far']
    df['pos_in_day_range'] = np.where(
        day_range > 0,
        (df['close'] - df['day_low_so_far']) / day_range,
        0.5
    )

    # Time fraction (how far into the 24h day)
    df['time_frac'] = (df['hour'] * 60 + df['datetime'].dt.minute) / (24 * 60)

    return df


# =========================================================================
# 6. merge_htf_into_15m — brings 4H, 1H, and 1D features into each 15M row
# =========================================================================

def merge_htf_into_15m(df_15m: pd.DataFrame,
                        df_4h: pd.DataFrame,
                        df_1h: pd.DataFrame,
                        df_1d: pd.DataFrame) -> pd.DataFrame:
    """
    Merge higher-timeframe features into every 15M row.
    Uses merge_asof (backward) so each bar only sees past HTF data.
    """
    df = df_15m.copy().sort_values('datetime')

    # ── 4H structure features ──
    htf_4h_cols = [
        'datetime',
        'close_trend', 'close_hh', 'close_ll', 'close_lh', 'close_hl',
        'last_close_bos_dir', 'dist_from_close_bos', 'close_bos_net_10',
    ]
    htf_4h = df_4h[[c for c in htf_4h_cols if c in df_4h.columns]].copy()
    htf_4h = htf_4h.sort_values('datetime').dropna()

    df = pd.merge_asof(
        df, htf_4h, on='datetime', direction='backward',
        suffixes=('', '_4h')
    )
    # Rename merged columns to have _4h suffix
    for col in [c for c in htf_4h.columns if c != 'datetime']:
        if col in df.columns and f'{col}_4h' not in df.columns:
            df.rename(columns={col: f'{col}_4h'}, inplace=True)

    # ── 1H FVG features ──
    fvg_1h_cols = [
        'datetime',
        'bull_fvg_active', 'bear_fvg_active',
        'bull_fvg_respected_now', 'bull_fvg_disrespected_now',
        'bear_fvg_respected_now', 'bear_fvg_disrespected_now',
        'fvg_net_active', 'fvg_respect_ratio_20',
        'nearest_bull_fvg_dist', 'nearest_bear_fvg_dist',
    ]
    fvg_1h = df_1h[[c for c in fvg_1h_cols if c in df_1h.columns]].copy()
    fvg_1h = fvg_1h.sort_values('datetime').dropna(subset=['bull_fvg_active'])

    df = pd.merge_asof(
        df, fvg_1h, on='datetime', direction='backward',
        suffixes=('', '_1h')
    )
    for col in [c for c in fvg_1h.columns if c != 'datetime']:
        old = col if col in df.columns else f'{col}_1h'
        new = f'{col}_1h'
        if old in df.columns and old != new:
            df.rename(columns={old: new}, inplace=True)

    # ── 1D structure features ──
    daily_cols = ['datetime', 'close_trend', 'last_close_bos_dir', 'close_bos_net_10']
    from_daily = df_1d[[c for c in daily_cols if c in df_1d.columns]].copy()
    from_daily = from_daily.sort_values('datetime').dropna()

    df = pd.merge_asof(
        df, from_daily, on='datetime', direction='backward',
        suffixes=('', '_1d')
    )
    for col in [c for c in from_daily.columns if c != 'datetime']:
        if col in df.columns and f'{col}_1d' not in df.columns:
            df.rename(columns={col: f'{col}_1d'}, inplace=True)

    return df


# =========================================================================
# Helper: derive the human-readable key driver from features
# =========================================================================

def derive_key_driver(row: pd.Series) -> str:
    """Pick the most relevant SMC event happening on this bar."""
    checks = [
        ('swept_pdh',                        'PDH Swept (BSL)'),
        ('swept_pdl',                        'PDL Swept (SSL)'),
        ('swept_4h_high',                    '4H High Swept (BSL)'),
        ('swept_4h_low',                     '4H Low Swept (SSL)'),
        ('bull_fvg_disrespected_now_1h',     '1H Bullish FVG Disrespected'),
        ('bear_fvg_disrespected_now_1h',     '1H Bearish FVG Disrespected'),
        ('bull_fvg_respected_now_1h',        '1H Bullish FVG Respected'),
        ('bear_fvg_respected_now_1h',        '1H Bearish FVG Respected'),
        ('broke_asia_high',                  'Asia High Broken'),
        ('broke_asia_low',                   'Asia Low Broken'),
    ]
    for col, label in checks:
        if col in row.index and row[col] == 1:
            return label

    trend = row.get('close_trend_4h', 0)
    if trend == 1:
        return '4H Bullish Structure'
    if trend == -1:
        return '4H Bearish Structure'
    return 'No Key Event'


# =========================================================================
# API Endpoints
# =========================================================================

@app.post("/api/data/update")
async def update_market_data():
    """
    Checks for CSVs. If missing or empty, fetches 5 years of data from Tiingo.
    """
    start_date = (datetime.now() - timedelta(days=5*365)).strftime('%Y-%m-%d')
    results = []

    for pair_name, ticker in PAIRS.items():
        for tf_name, tf_tiingo in TIMEFRAMES.items():
            filename = os.path.join(DATA_DIR, f"{ticker}_{tf_name}.csv")

            if os.path.exists(filename) and os.path.getsize(filename) > 0:
                results.append({"file": filename, "status": "exists", "action": "skipped"})
                continue

            url = f"https://api.tiingo.com/tiingo/fx/{ticker}/prices"
            params = {
                'token': TIINGO_API_TOKEN,
                'resampleFreq': tf_tiingo,
                'startDate': start_date,
                'format': 'csv'
            }

            response = requests.get(url, params=params)

            if response.status_code == 200:
                with open(filename, 'w') as f:
                    f.write(response.text)
                results.append({"file": filename, "status": "success", "action": "downloaded"})
            else:
                results.append({"file": filename, "status": "error", "message": response.text})

    return {"message": "Data update complete", "details": results}


@app.get("/api/bias/{ticker}")
async def get_daily_bias(ticker: str):
    """
    Runs the full ML pipeline on the latest downloaded CSVs and
    returns the current intraday bias. Results are cached for 1 hour.
    """
    ticker = ticker.lower()
    if ticker.upper() not in PAIRS:
        raise HTTPException(status_code=400, detail="Invalid ticker")

    # ── Check cache ──
    now = datetime.now(timezone.utc)
    cached = _bias_cache.get(ticker)
    if cached and now < cached["expires"]:
        return cached["result"]

    # ── Ensure CSVs exist (download if missing) ──
    model_path = os.path.join(MODELS_DIR, f"{ticker}_model.json")
    try:
        fetch_pair_data(ticker)
    except RuntimeError as e:
        raise HTTPException(status_code=502, detail=str(e))

    # ── Train model if it doesn't exist ──
    if not os.path.exists(model_path):
        try:
            train_model(ticker)
        except Exception as e:
            raise HTTPException(
                status_code=500,
                detail=f"Auto-training failed: {e}"
            )

    try:
        # ── 1. Load Data ──
        df_15m = load_ohlc(os.path.join(DATA_DIR, f"{ticker}_15M.csv"), '15M')
        df_1h  = load_ohlc(os.path.join(DATA_DIR, f"{ticker}_1H.csv"),  '1H')
        df_4h  = load_ohlc(os.path.join(DATA_DIR, f"{ticker}_4H.csv"),  '4H')
        df_d   = load_ohlc(os.path.join(DATA_DIR, f"{ticker}_1D.csv"),  '1D')

        # ── 2. Feature Engineering Pipeline ──
        # (a) Close-only structure on HTFs
        df_4h = compute_close_only_structure(df_4h)
        df_d  = compute_close_only_structure(df_d)

        # (b) Delivery state on 15M (uses 1D PDH/PDL + 4H swing levels)
        df_15m = compute_delivery_state(df_15m, df_d, df_4h)

        # (c) FVG states on 1H and 15M
        df_1h  = compute_fvg_states(df_1h)
        df_15m = compute_fvg_states(df_15m)

        # (d) Session context & momentum on 15M
        df_15m = add_session_and_momentum(df_15m)

        # (e) Merge all HTF features into 15M
        df_final = merge_htf_into_15m(df_15m, df_4h, df_1h, df_d)

        # ── 3. Prepare features for the latest candle ──
        latest = df_final.iloc[-1:]

        # Drop metadata / raw price / target columns — keep only features
        exclude = {
            'datetime', 'date', 'open', 'high', 'low', 'close', 'volume',
            'hour', 'target',
            'pdh', 'pdl', 'asia_high', 'asia_low',
            '4h_swing_high', '4h_swing_low',
            'day_high_so_far', 'day_low_so_far',
            'any_bsl_sweep', 'any_ssl_sweep',
        }
        latest = latest.loc[:, ~latest.columns.duplicated()].copy()
        numerical = latest.select_dtypes(include=np.number).columns.tolist()
        feature_cols = [c for c in numerical if c not in exclude]

        X_live = latest[feature_cols].fillna(0)

        # ── 4. Predict ──
        model = xgb.XGBClassifier()
        model.load_model(model_path)

        proba_bullish = float(model.predict_proba(X_live)[:, 1][0])
        bias = "Bullish" if proba_bullish > 0.5 else "Bearish"

        # ── 5. Derive key driver and session name ──
        key_driver = derive_key_driver(latest.iloc[0])

        session_map = {0: 'Asia', 1: 'London', 2: 'New York', 3: 'Between Sessions'}
        session_id = int(latest['session_id'].values[0])
        current_session = session_map.get(session_id, 'Unknown')

        result = {
            "ticker":               ticker.upper(),
            "timestamp":            datetime.now(timezone.utc).isoformat(),
            "session":              current_session,
            "bias":                 bias,
            "probability_bullish":  round(proba_bullish, 4),
            "probability_bearish":  round(1.0 - proba_bullish, 4),
            "key_driver":           key_driver,
        }

        # ── Cache for 1 hour ──
        _bias_cache[ticker] = {"result": result, "expires": now + CACHE_TTL}

        return result

    except FileNotFoundError as e:
        raise HTTPException(
            status_code=404,
            detail=f"CSV data not found: {e}. Call POST /api/data/update first."
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# =========================================================================
# News calendar — weekly CSV cache
# =========================================================================

NEWS_CSV = os.path.join(DATA_DIR, "weekly_news.csv")
_news_cache: dict = {}   # {"iso_week": str, "rows": list[dict]}

try:
    from zoneinfo import ZoneInfo
    _london_tz = ZoneInfo("Europe/London")
except ImportError:
    import pytz as _pytz
    _london_tz = _pytz.timezone("Europe/London")


def _current_iso_week() -> str:
    """Return 'YYYY-WW' for the current London-time week."""
    now_london = datetime.now(_london_tz)
    return now_london.strftime("%G-%V")


def _scrape_and_cache() -> list[dict]:
    """
    Fetch this week's High-impact events from Forex Factory, write to CSV,
    and return all rows as a list of dicts with an ISO timestamp field.
    """
    url = "https://nfs.faireconomy.media/ff_calendar_thisweek.json"
    headers = {
        "User-Agent": (
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
            "AppleWebKit/537.36 (KHTML, like Gecko) "
            "Chrome/124.0.0.0 Safari/537.36"
        ),
        "Accept": "application/json, */*",
    }
    resp = requests.get(url, headers=headers, timeout=10)
    if resp.status_code != 200:
        raise RuntimeError(f"Forex Factory returned HTTP {resp.status_code}")

    data = resp.json()
    target_currencies = {'AUD', 'CAD', 'EUR', 'GBP', 'JPY', 'USD'}

    rows = []
    for event in data:
        currency = event.get("country", "")
        impact   = event.get("impact", "")
        if currency not in target_currencies or impact != "High":
            continue

        raw_date = event.get("date", "")
        try:
            dt_obj    = datetime.fromisoformat(raw_date)
            dt_london = dt_obj.astimezone(_london_tz)
        except ValueError:
            continue

        rows.append({
            "date":      dt_london.strftime("%b %d, %Y"),
            "time":      dt_london.strftime("%I:%M %p"),
            "currency":  currency,
            "event":     event.get("title", "Unknown Event"),
            "impact":    "High",
            "timestamp": dt_obj.isoformat(),
        })

    import csv as _csv
    with open(NEWS_CSV, "w", newline="", encoding="utf-8") as f:
        writer = _csv.DictWriter(
            f, fieldnames=["date", "time", "currency", "event", "impact", "timestamp"]
        )
        writer.writeheader()
        writer.writerows(rows)

    return rows


def _load_news_rows() -> list[dict]:
    """
    Return this week's news rows, using the in-memory cache first,
    then the CSV on disk, re-scraping only when the ISO week changes.
    """
    week = _current_iso_week()

    # 1. In-memory cache hit
    if _news_cache.get("iso_week") == week:
        return _news_cache["rows"]

    # 2. Try reading from CSV (valid if it contains data from the current week)
    import csv as _csv, os as _os
    if _os.path.exists(NEWS_CSV) and _os.path.getsize(NEWS_CSV) > 0:
        try:
            with open(NEWS_CSV, "r", encoding="utf-8") as f:
                rows = list(_csv.DictReader(f))
            # Check the first row's timestamp belongs to the current week
            if rows:
                first_ts   = datetime.fromisoformat(rows[0]["timestamp"])
                first_week = first_ts.astimezone(_london_tz).strftime("%G-%V")
                if first_week == week:
                    _news_cache["iso_week"] = week
                    _news_cache["rows"]     = rows
                    return rows
        except Exception:
            pass   # fall through to re-scrape

    # 3. Scrape fresh data
    rows = _scrape_and_cache()
    _news_cache["iso_week"] = week
    _news_cache["rows"]     = rows
    return rows


@app.get("/api/news/{symbol}")
async def get_forex_news(symbol: str):
    """
    Returns today's high-impact news events for the two currencies in the given forex pair.
    Data is scraped once per week and cached; the CSV is reused across restarts.
    Times are returned as timezone-aware ISO strings so the frontend can convert to local time.
    """
    symbol = symbol.upper()
    if len(symbol) != 6:
        raise HTTPException(status_code=400, detail="Symbol must be 6 characters, e.g. EURUSD")

    base  = symbol[:3]
    quote = symbol[3:]
    target_currencies = {base, quote}

    try:
        all_rows = _load_news_rows()
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Failed to load news data: {e}")

    today_london = datetime.now(_london_tz).date()

    events = []
    for row in all_rows:
        if row.get("currency") not in target_currencies:
            continue
        try:
            dt_london = datetime.fromisoformat(row["timestamp"]).astimezone(_london_tz)
            if dt_london.date() != today_london:
                continue
        except (ValueError, KeyError):
            continue

        events.append({
            "currency":  row["currency"],
            "event":     row["event"],
            "timestamp": row["timestamp"],
        })

    events.sort(key=lambda e: e["timestamp"])

    return {
        "symbol": symbol,
        "events": events,
        "today":  today_london.isoformat(),
    }


@app.get("/health")
async def health():
    return {"status": "ok"}
