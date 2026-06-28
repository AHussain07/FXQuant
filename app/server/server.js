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

app.use(cors());
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
