/**
 * Unit tests for services/challengeService.js
 *
 * Covers prop-firm challenge pass/fail tracking.
 * The email service is mocked so no SMTP is attempted.
 *
 * Requirements covered:
 *   FR19 — Prop firm challenge tracking (profit target + max drawdown)
 */

jest.mock("../services/emailService", () => ({
  sendChallengeFailed: jest.fn(),
  sendChallengePassed: jest.fn(),
}));

const {
  evaluateChallengeOutcome,
  resetChallengeAccount,
} = require("../services/challengeService");
const emailService = require("../services/emailService");

const makeUser = (overrides = {}) => ({
  userId: "u-1",
  gmail: "a@b.com",
  accountType: "prop_100k",
  accountBalance: 100_000,
  initialBalance: 100_000,
  profitTarget: 6_000,
  maxLoss: 4_000,
  challengeStartedAt: new Date(),
  save: jest.fn().mockResolvedValue(undefined),
  ...overrides,
});

beforeEach(() => jest.clearAllMocks());

describe("challengeService — evaluateChallengeOutcome [FR19]", () => {
  it("should return null for a live (non-challenge) account [FR19]", async () => {
    const user = makeUser({ accountType: "live", profitTarget: null, maxLoss: null });
    expect(await evaluateChallengeOutcome(user)).toBeNull();
    expect(emailService.sendChallengeFailed).not.toHaveBeenCalled();
    expect(emailService.sendChallengePassed).not.toHaveBeenCalled();
  });

  it("should flag 'passed' when balance hits initial + profit target [FR19]", async () => {
    const user = makeUser({ accountBalance: 106_000 });
    const result = await evaluateChallengeOutcome(user);
    expect(result).toBe("passed");
    expect(emailService.sendChallengePassed).toHaveBeenCalledWith(
      "a@b.com",
      "$100K",
      106_000,
      6_000
    );
    expect(user.accountType).toBeNull();
    expect(user.save).toHaveBeenCalled();
  });

  it("should flag 'failed' when balance falls to initial - max loss [FR19]", async () => {
    const user = makeUser({ accountBalance: 96_000 });
    const result = await evaluateChallengeOutcome(user);
    expect(result).toBe("failed");
    expect(emailService.sendChallengeFailed).toHaveBeenCalled();
    expect(user.accountType).toBeNull();
  });

  it("should return null when balance is inside the acceptable band [FR19]", async () => {
    const user = makeUser({ accountBalance: 101_000 });
    expect(await evaluateChallengeOutcome(user)).toBeNull();
    expect(user.save).not.toHaveBeenCalled();
  });

  it("should treat the profit threshold as inclusive (balance == target) [FR19]", async () => {
    const user = makeUser({ accountBalance: 106_000 }); // exactly 100k + 6k
    expect(await evaluateChallengeOutcome(user)).toBe("passed");
  });

  it("should treat the loss threshold as inclusive (balance == floor) [FR19]", async () => {
    const user = makeUser({ accountBalance: 96_000 }); // exactly 100k - 4k
    expect(await evaluateChallengeOutcome(user)).toBe("failed");
  });

  it("should resolve to null if challenge fields are incomplete [FR19]", async () => {
    const user = makeUser({ profitTarget: null });
    expect(await evaluateChallengeOutcome(user)).toBeNull();
  });

  it("should resolve each prop size to its human-readable label [FR19]", async () => {
    const cases = [
      { accountType: "prop_50k",  balance: 53_000,  target: 3_000,  label: "$50K" },
      { accountType: "prop_100k", balance: 106_000, target: 6_000,  label: "$100K" },
      { accountType: "prop_150k", balance: 159_000, target: 9_000,  label: "$150K" },
    ];
    for (const c of cases) {
      emailService.sendChallengePassed.mockClear();
      const user = makeUser({
        accountType: c.accountType,
        accountBalance: c.balance,
        initialBalance: c.balance - c.target,
        profitTarget: c.target,
        maxLoss: 4_000,
      });
      await evaluateChallengeOutcome(user);
      expect(emailService.sendChallengePassed).toHaveBeenCalledWith(
        "a@b.com",
        c.label,
        c.balance,
        c.target
      );
    }
  });
});

describe("challengeService — resetChallengeAccount [FR19, FR20]", () => {
  it("should null out every challenge-related field [FR19]", async () => {
    const user = makeUser();
    await resetChallengeAccount(user);
    expect(user.accountType).toBeNull();
    expect(user.accountBalance).toBeNull();
    expect(user.initialBalance).toBeNull();
    expect(user.profitTarget).toBeNull();
    expect(user.maxLoss).toBeNull();
    expect(user.challengeStartedAt).toBeNull();
    expect(user.save).toHaveBeenCalled();
  });
});
