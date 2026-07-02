const { createProxyMiddleware } = require("http-proxy-middleware");

// In development the CRA dev server (port 3000) proxies API calls to the two
// backends, so the whole app is reachable through a SINGLE origin.
//
// Why this matters: a phone can then reach everything via one URL — the LAN IP
// (http://<pc-ip>:3000) for email login, or an HTTPS tunnel for Google sign-in
// (Google OAuth only runs on HTTPS or localhost, never a bare IP). It also means
// only port 3000 needs to be reachable from other devices.
module.exports = function (app) {
  // FastAPI ML service — these /api paths are served by uvicorn on :8000
  app.use(
    ["/api/bias", "/api/news", "/api/data"],
    createProxyMiddleware({ target: "http://localhost:8000", changeOrigin: true })
  );

  // Express API — everything else under /api is served by node on :5000
  app.use(
    "/api",
    createProxyMiddleware({ target: "http://localhost:5000", changeOrigin: true })
  );
};
