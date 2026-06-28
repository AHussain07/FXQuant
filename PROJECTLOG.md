# Project Log

Please regularly update this file to record your project progress. You should be updating the project log _at least_ once a fortnight.

---

## Week 1: w/c 15th December 2025
### Google Authentication, Landing Page & TradingView Charts

**Frontend**
- Built landing page with Google OAuth sign-in flow using Google Identity Services.
- Integrated TradingView chart widgets into the market/trading page.
- Updated navigation bar layout and routing.

**Backend**
- Connected frontend Google Auth flow to backend token verification.
- Restructured project files into `my-app` folder for cleaner organisation.

---

## Week 2: w/c 5th January 2026
### Demo Trading, Trade Journal & Trade History

**Frontend**
- Built fully working demo trading interface (place, modify, cancel trades).
- Implemented trade journal form with entry creation and viewing.
- Added a Learn/Education tab to the application.
- Built trade history page to browse past trades.
- Created initial dashboard page layout.
- Implemented edit functionality for existing journal entries.

**Backend**
- Created MongoDB schemas: `Trade`, `JournalEntry`, `User`.
- Implemented controllers for trades, journal entries, price data, and users.
- Configured database connection and set up all server routes.

---

## Week 3: w/c 10th February 2026
### Dashboard

**Frontend**
- Implemented the main dashboard with trading statistics and account overview.
- Refined `TradingForm`, `TradeJournalForm`, and `JournalModal` components.
- Extended market page and trade journal styles.

**Backend**
- Updated `JournalEntry` model.

---

## Weeks 4–15: w/c 10th February 2026 to 6th April 2026
### Machine Learning Model Research & Development

This period was dedicated to researching, developing, and iterating on the machine learning model for market prediction. Work included:

- Researching suitable ML approaches for short-term forex price direction prediction.
- Collecting and processing historical OHLCV data (e.g., AUDUSD 15-minute candles) using `yfinance` and other data sources.
- Feature engineering: developing and evaluating technical indicators and derived features as model inputs.
- Training and evaluating multiple model architectures to improve predictive accuracy and confidence scores.
- Iterating on model design, documented in a Jupyter notebook (`GBPUSD_Daily_Bias_V3.ipynb`).
- Building a FastAPI ML microservice (`main.py`) to serve predictions via a `/predict` endpoint.

---

## Week 16: w/c 7th April 2026
### ML Integration, Email Auth, Account Onboarding & Trade Logic Overhaul

**Frontend**
- Integrated ML model predictions into the trading interface via a new `DailyBiasDashboard` component showing daily bias and market analysis.
- Added `WatchlistWidget` component.
- Overhauled `TradingForm` with updated trade logic and expanded forex pairs options.
- Updated `AuthContext` to support email-based login alongside Google OAuth.
- Refactored navigation bar, dashboard page, and landing page styling.

**Backend**
- Implemented email/password authentication (`emailAuthController`, `emailAuth` routes, `emailService` using Nodemailer).
- Added onboarding flow: new users can configure a prop firm challenge or live account on first login.
- Updated `User` and `Trade` models with new fields.
- Extended `tradeController` and `dashboardController` with improved trade logic.
- Wired up backend communication with the ML microservice.

---

## Week 17: w/c 8th April 2026
### Economic Calendar, Tutorial Mode & Quality of Life Updates

**Frontend**
- Added an economic calendar component to the trading interface.
- Implemented an interactive onboarding tour for new users (`useOnboardingTour` hook).
- Added `ForexNewsAlert` and `InfoTooltip` components.
- Updated `OpenTrades`, `TradeHistory`, `TradeJournalForm`, and `TradingForm` with quality-of-life improvements.
- Added a `Settings` page and improved `StatCard` styling.

**Backend**
- Extended `userController` and `tradeDataController` with additional endpoints.
- Updated `User` model and added a migration script for onboarding tour state.

**Machine Learning**
- Updated ML service (`main.py`) and weekly news sentiment data.

---

## Week 17 (continued): w/c 13th April 2026
### Export Trade History, Visual Bug Fixes & Project Restructure

**Frontend**
- Implemented export of trade history to spreadsheet (CSV) from the `TradeHistory` component.
- Fixed multiple visual and layout bugs across `OpenTrades`, `TradingForm`, `TradingViewWidget`, `PriceTickerWidget`, `ForexNewsAlert`, `InfoTooltip`, `DailyBiasDashboard`, and the market page.
- CSS variable and styling refinements.

**Backend**
- Bug fixes in `dashboardController` and `tradeController`.

**Project Structure**
- Renamed files and reorganised folder layout across the app and ML directories for improved readability.

---

## Week 18: w/c 21st April 2026
### Unit Tests, Bug Fixes & Extended ML Data

**Frontend**
- Fixed `DailyBiasDashboard` to retry automatically when the ML analysis widget fails to load.
- Improved formatting of the exported trade history CSV spreadsheet.

**Backend**
- Set up Jest testing framework (`jest.config.js`) and wrote unit tests covering all major backend components: `challengeService`, `dashboardController`, `emailAuthController`, `journalController`, `tradeCalculations`, `tradeController`, `tradeEngine`, and `userController`.
- Extracted `tradeCalculations.js`, `tradeEngine.js`, and `challengeService.js` as dedicated service modules to improve testability and separation of concerns.
- Bug fixes: atomic trade-close operations, gap-aware price fills, environment variable key guard, and removal of dead route handlers.
- Updated `priceController` and `tradeController` with the above fixes.

**Machine Learning**
- Added Python unit tests for the ML microservice (`tests/test_ml_service.py`).
- Extended training and inference data with multi-timeframe OHLCV CSVs for additional forex pairs (AUDUSD, EURUSD, USDCAD, USDJPY) across 15 M, 1 H, 4 H, and 1 D timeframes.
