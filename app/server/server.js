const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
require("dotenv").config();

// const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/users');
const tradeRoutes = require('./routes/trades');
const journalRoutes = require('./routes/journal');
const priceRoutes = require('./routes/prices');
const dashboardRoutes = require('./routes/dashboard');
const emailAuthRoutes = require('./routes/emailAuth');

const app = express();

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
app.use(express.json());

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
