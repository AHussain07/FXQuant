/**
 * HTTP handlers for the /api/users endpoints.
 *
 * Covers user lookup / create-on-first-login, prop-challenge account setup,
 * balance updates, partial and full resets, deletion, and the onboarding
 * tour flag.
 */

const User = require("../models/User");
const Trade = require("../models/Trade");
const JournalEntry = require("../models/JournalEntry");
const { signAppToken } = require("../utils/appToken");
const { verifyFirebaseIdToken } = require("../utils/firebaseToken");

// Prop-firm challenge account sizes (USD starting balance).
const PROP_ACCOUNT_BALANCES = {
  prop_50k: 50000,
  prop_100k: 100000,
  prop_150k: 150000,
};

// Challenge rules: 6% profit target to pass, 4% drawdown to fail.
const PROFIT_TARGET_PCT = 0.06;
const MAX_LOSS_PCT = 0.04;

/**
 * Wipe every challenge-related field on a user doc. Does not save; caller
 * should `await user.save()` after (kept out here so we can batch changes).
 */
const clearChallengeFields = (user) => {
  user.accountType = null;
  user.accountBalance = null;
  user.initialBalance = null;
  user.profitTarget = null;
  user.maxLoss = null;
  user.challengeStartedAt = null;
};

/** GET /api/users/:userId */
const getUser = async (req, res) => {
  try {
    const user = await User.findOne({ userId: req.params.userId });
    if (!user) return res.status(404).json({ message: "User not found" });
    res.json(user);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

/**
 * POST /api/users/auth
 * The Google sign-in exchange. The client sends the ID token Firebase issued
 * it; we verify that token's signature and take the identity from it. The
 * identity is never taken from the request body -- that would let a caller
 * claim any account.
 *
 * Idempotent: returns the existing user if already registered, otherwise
 * creates one. Responds with a session token used by every other route.
 */
const createOrGetUser = async (req, res) => {
  try {
    const { idToken } = req.body;
    if (!idToken) {
      return res.status(400).json({ message: "idToken is required" });
    }

    let uid, email;
    try {
      ({ uid, email } = await verifyFirebaseIdToken(idToken));
    } catch (error) {
      console.error("Firebase token verification failed:", error.message);
      return res.status(401).json({ message: "Invalid authentication token" });
    }

    const existing = await User.findOne({ userId: uid });
    if (existing) {
      return res.json({
        user: existing,
        isNewUser: false,
        token: signAppToken(uid),
        message: "User authenticated successfully",
      });
    }

    const user = await new User({ userId: uid, gmail: email }).save();
    res.status(201).json({
      user,
      isNewUser: true,
      token: signAppToken(uid),
      message: "New user created successfully",
    });
  } catch (error) {
    console.error("Create/Get user error:", error);
    res.status(500).json({ message: error.message });
  }
};

/** PATCH /api/users/:userId/balance — direct balance override. */
const updateBalance = async (req, res) => {
  try {
    const { accountBalance } = req.body;
    const user = await User.findOneAndUpdate(
      { userId: req.params.userId },
      { accountBalance },
      { new: true }
    );
    if (!user) return res.status(404).json({ message: "User not found" });
    res.json(user);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

/**
 * POST /api/users/:userId/account
 * Set up a new trading account for the user. Either a prop-firm challenge
 * (fixed balance + profit target + max loss) or a live account (caller-supplied
 * balance, no pass/fail logic).
 */
const setupAccount = async (req, res) => {
  try {
    const { accountType, balance } = req.body;
    const { userId } = req.params;

    const user = await User.findOne({ userId });
    if (!user) return res.status(404).json({ message: "User not found" });

    if (PROP_ACCOUNT_BALANCES[accountType]) {
      const startingBalance = PROP_ACCOUNT_BALANCES[accountType];
      user.accountType = accountType;
      user.accountBalance = startingBalance;
      user.initialBalance = startingBalance;
      user.profitTarget = startingBalance * PROFIT_TARGET_PCT;
      user.maxLoss = startingBalance * MAX_LOSS_PCT;
      user.challengeStartedAt = new Date();
    } else if (accountType === "live") {
      const customBalance = parseFloat(balance);
      if (!customBalance || customBalance <= 0) {
        return res.status(400).json({ message: "Valid balance is required for live accounts" });
      }
      user.accountType = "live";
      user.accountBalance = customBalance;
      user.initialBalance = customBalance;
      user.profitTarget = null;
      user.maxLoss = null;
      user.challengeStartedAt = new Date();
    } else {
      return res.status(400).json({ message: "Invalid account type" });
    }

    await user.save();
    res.json({ user, message: "Account set up successfully" });
  } catch (error) {
    console.error("Setup account error:", error);
    res.status(500).json({ message: error.message });
  }
};

/**
 * POST /api/users/:userId/reset-trading
 * Soft reset: force-close any open/pending trades and wipe challenge fields,
 * but keep the user's trade history and journal entries.
 */
const resetTradingAccount = async (req, res) => {
  try {
    const user = await User.findOne({ userId: req.params.userId });
    if (!user) return res.status(404).json({ message: "User not found" });

    await Trade.updateMany(
      { userId: user._id, status: { $in: ["open", "pending"] } },
      { status: "closed", closeReason: "manual", closedAt: new Date() }
    );

    clearChallengeFields(user);
    await user.save();

    res.json({ message: "Trading account reset successfully", user });
  } catch (error) {
    console.error("Reset trading account error:", error);
    res.status(500).json({ message: error.message });
  }
};

/**
 * POST /api/users/:userId/reset-full
 * Hard reset: delete every trade + journal entry belonging to the user and
 * clear their challenge fields. The user record itself is preserved.
 */
const resetFullAccount = async (req, res) => {
  try {
    const user = await User.findOne({ userId: req.params.userId });
    if (!user) return res.status(404).json({ message: "User not found" });

    await Trade.deleteMany({ userId: user._id });
    await JournalEntry.deleteMany({ userId: req.params.userId });

    clearChallengeFields(user);
    await user.save();

    res.json({ message: "Full account reset successfully", user });
  } catch (error) {
    console.error("Reset full account error:", error);
    res.status(500).json({ message: error.message });
  }
};

/** DELETE /api/users/:userId — nuke the user plus all their data. */
const deleteAccount = async (req, res) => {
  try {
    const user = await User.findOne({ userId: req.params.userId });
    if (!user) return res.status(404).json({ message: "User not found" });

    await Trade.deleteMany({ userId: user._id });
    await JournalEntry.deleteMany({ userId: req.params.userId });
    await User.deleteOne({ userId: req.params.userId });

    res.json({ message: "Account deleted successfully" });
  } catch (error) {
    console.error("Delete account error:", error);
    res.status(500).json({ message: error.message });
  }
};

/** POST /api/users/:userId/tour-complete — flip hasSeenTutorial to true. */
const markTourComplete = async (req, res) => {
  try {
    const user = await User.findOneAndUpdate(
      { userId: req.params.userId },
      { hasSeenTutorial: true },
      { new: true }
    );
    if (!user) return res.status(404).json({ message: "User not found" });
    res.json(user);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

module.exports = {
  getUser,
  createOrGetUser,
  updateBalance,
  setupAccount,
  resetTradingAccount,
  resetFullAccount,
  deleteAccount,
  markTourComplete,
};
