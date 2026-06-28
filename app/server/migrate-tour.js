/**
 * One-time migration: set hasSeenTutorial = true for all existing users.
 * Run with: node migrate-tour.js
 */
require("dotenv").config();
const mongoose = require("mongoose");
const User = require("./models/User");

async function migrate() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log("Connected to MongoDB");

  const result = await User.updateMany(
    { hasSeenTutorial: { $ne: true } },
    { $set: { hasSeenTutorial: true } }
  );

  console.log(`Updated ${result.modifiedCount} user(s)`);
  await mongoose.disconnect();
}

migrate().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
