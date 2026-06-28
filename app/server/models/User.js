const mongoose = require("mongoose");

const UserSchema = new mongoose.Schema(
  {
    userId: {
      type: String,
      required: true,
      unique: true,
    },
    gmail: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    accountBalance: {
      type: Number,
      default: null,
    },
    accountType: {
      type: String,
      enum: ["prop_50k", "prop_100k", "prop_150k", "live", null],
      default: null,
    },
    initialBalance: {
      type: Number,
      default: null,
    },
    profitTarget: {
      type: Number,
      default: null,
    },
    maxLoss: {
      type: Number,
      default: null,
    },
    challengeStartedAt: {
      type: Date,
      default: null,
    },
    hasSeenTutorial: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("User", UserSchema);
