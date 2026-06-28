/**
 * Prop-firm style "challenge" logic.
 *
 * After every trade close we check whether the user has either blown past
 * their max-loss threshold or reached their profit target. Either outcome
 * ends the challenge: we email the user and reset their account fields so
 * they have to set up a new challenge before trading again.
 */

const { sendChallengeFailed, sendChallengePassed } = require("./emailService");

const ACCOUNT_SIZE_LABELS = {
  prop_50k: "$50K",
  prop_100k: "$100K",
  prop_150k: "$150K",
};

/**
 * Wipe all challenge-related fields on a user so they return to a
 * "no active account" state. Does not touch trade history.
 *
 * @param {import('mongoose').Document} user
 */
const resetChallengeAccount = async (user) => {
  user.accountType = null;
  user.accountBalance = null;
  user.initialBalance = null;
  user.profitTarget = null;
  user.maxLoss = null;
  user.challengeStartedAt = null;
  await user.save();
  console.log(`[Challenge] Account reset for user ${user.userId}`);
};

/**
 * After a trade close, check whether the user has passed or failed their
 * challenge. If so, email them and reset the account.
 *
 * Returns 'passed' | 'failed' | null so callers can surface the outcome
 * in their HTTP response (e.g. front-end can show a congrats / sorry toast).
 *
 * @param {import('mongoose').Document} user
 * @returns {Promise<'passed'|'failed'|null>}
 */
const evaluateChallengeOutcome = async (user) => {
  if (!user.accountType || user.accountType === "live") return null;
  if (!user.initialBalance || !user.profitTarget || !user.maxLoss) return null;

  const lossThreshold = user.initialBalance - user.maxLoss;
  const profitThreshold = user.initialBalance + user.profitTarget;
  const accountLabel = ACCOUNT_SIZE_LABELS[user.accountType] || user.accountType;

  if (user.accountBalance <= lossThreshold) {
    sendChallengeFailed(user.gmail, accountLabel, user.accountBalance, user.maxLoss);
    await resetChallengeAccount(user);
    return "failed";
  }

  if (user.accountBalance >= profitThreshold) {
    sendChallengePassed(user.gmail, accountLabel, user.accountBalance, user.profitTarget);
    await resetChallengeAccount(user);
    return "passed";
  }

  return null;
};

module.exports = {
  ACCOUNT_SIZE_LABELS,
  resetChallengeAccount,
  evaluateChallengeOutcome,
};
