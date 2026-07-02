# FXQuant

Forex trading journal + ML daily-bias app. Three processes run together in development:
a React frontend, an Express/MongoDB API, and a FastAPI machine-learning service.

## Commands

Run each command from the directory shown. On the first run in a fresh clone, install
dependencies first (`npm install` in both `app/` and `app/server/`, and ensure the Python
deps for the ML service — `fastapi uvicorn xgboost pandas numpy requests` — are installed).

| Service            | Directory                 | Command                                            | Port | URL                     |
| ------------------ | ------------------------- | -------------------------------------------------- | ---- | ----------------------- |
| React frontend     | `app/`                    | `npm start`                                         | 3000 | http://localhost:3000   |
| Express API        | `app/server/`             | `npm run server` (nodemon) or `npm start` (node)   | 5000 | http://localhost:5000/api |
| FastAPI ML service | `machine-learning-model/` | `python -m uvicorn main:app --host 0.0.0.0 --port 8000` | 8000 | http://localhost:8000   |

### Run everything at once

From `app/server/`:

```bash
npm run dev
```

This uses `concurrently` to start the Express API, the React frontend, and the FastAPI ML
service together (named `express`, `react`, `ml`).

### Notes

- The frontend reads `REACT_APP_API_URL` (default `http://localhost:5000/api`) from `app/.env`.
- The Express API needs `MONGODB_URI` set (see `app/server/.env`); it still boots and serves
  routes if MongoDB is unavailable, logging a connection error.
- The FastAPI service downloads ~5 years of price CSVs from Tiingo on the first `/api/bias/{ticker}`
  request and trains an XGBoost model on demand, so that first call is slow.

## Visual verification

The Playwright MCP server is configured in `.mcp.json` (shared with the repo). After making
frontend changes, use the Playwright MCP tools to navigate to the affected page(s), take a
screenshot, and confirm the result renders correctly before reporting the work as done.
