const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const helmet = require("helmet");
require("dotenv").config();

// const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/users');
const tradeRoutes = require('./routes/trades');
const journalRoutes = require('./routes/journal');
const priceRoutes = require('./routes/prices');
const dashboardRoutes = require('./routes/dashboard');
const emailAuthRoutes = require('./routes/emailAuth');

const app = express();

// Render terminates TLS at its proxy, so without this every request appears to
// come from the proxy's address and the auth rate limiters would share a single
// bucket across all users. One hop: Render's load balancer.
app.set("trust proxy", 1);

// Standard hardening headers (HSTS, nosniff, frameguard, ...). This is a JSON
// API, so the CSP -- which only governs page rendering -- is not needed.
app.use(helmet({ contentSecurityPolicy: false }));

// Lock CORS to the deployed frontend in production. Set ALLOWED_ORIGINS to a
// comma-separated list (e.g. "https://your-app.vercel.app"). Defaults to the
// local dev origin so `npm run dev` keeps working with no extra config.
const allowedOrigins = (process.env.ALLOWED_ORIGINS || "http://localhost:3000")
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);
app.use(
  cors({
    origin: (origin, callback) => {
      // Allow non-browser requests (curl, health checks) that send no Origin.
      if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
      return callback(new Error(`Origin ${origin} not allowed by CORS`));
    },
  })
);
// Every payload this API accepts is a small JSON object; the cap stops a large
// body from being used to exhaust memory.
app.use(express.json({ limit: "100kb" }));

// Routes
// app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/trades', tradeRoutes);
app.use('/api/journal', journalRoutes);
app.use('/api/prices', priceRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/email-auth', emailAuthRoutes);

app.get("/api/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

mongoose
  .connect(process.env.MONGODB_URI)
  .then(() => {
    console.log("Connected to MongoDB");
  })
  .catch((err) => {
    console.error("MongoDB connection error:", err);
  });

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
