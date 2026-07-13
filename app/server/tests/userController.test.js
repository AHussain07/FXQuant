/**
 * Unit tests for controllers/userController.js
 *
 * Covers OAuth user creation (idempotency), onboarding account setup,
 * and reset / delete flows from settings.
 *
 * Requirements covered:
 *   FR1  — Users can register / sign in via Google OAuth (create-on-first-login)
 *   FR3  — Onboarding: account type and starting balance configured
 *   FR19 — Prop-firm challenge fields derived from account type
 *   FR20 — Reset-trading, reset-full, and delete-account flows
 */

// The controller signs a session token on every successful login, and
// utils/appToken refuses to sign without a secret rather than falling back to a
// predictable default. Set before requiring the controller.
process.env.JWT_SECRET = "test-secret";

// Sign-in identity comes from a Firebase ID token that the server verifies
// itself -- the caller no longer gets to assert who it is. Stub the verifier so
// the suite stays offline; that it is *called at all* is the security property
// under test here.
jest.mock("../utils/firebaseToken", () => ({
  verifyFirebaseIdToken: jest.fn(),
}));

jest.mock("../models/User", () => {
  const ctor = jest.fn().mockImplementation(function (fields) {
    Object.assign(this, fields);
    this.save = jest.fn().mockImplementation(function () {
      return Promise.resolve(this);
    });
  });
  ctor.findOne = jest.fn();
  ctor.findOneAndUpdate = jest.fn();
  ctor.deleteOne = jest.fn();
  return ctor;
});

jest.mock("../models/Trade", () => ({
  find: jest.fn(),
  updateMany: jest.fn().mockResolvedValue({ modifiedCount: 0 }),
  deleteMany: jest.fn().mockResolvedValue({ deletedCount: 0 }),
}));

jest.mock("../models/JournalEntry", () => ({
  deleteMany: jest.fn().mockResolvedValue({ deletedCount: 0 }),
}));

const User = require("../models/User");
const Trade = require("../models/Trade");
const JournalEntry = require("../models/JournalEntry");
const { verifyFirebaseIdToken } = require("../utils/firebaseToken");
const controller = require("../controllers/userController");

const makeRes = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

beforeEach(() => jest.clearAllMocks());

// ─────────────────────────────────────────────────────────────────────────
// createOrGetUser — first login vs repeat login [FR1]
// ─────────────────────────────────────────────────────────────────────────
describe("createOrGetUser [FR1]", () => {
  // What a valid Firebase ID token decodes to once the signature checks out.
  const asVerified = (uid, email) =>
    verifyFirebaseIdToken.mockResolvedValue({ uid, email });

  it("should create a new user on first Google OAuth login [FR1]", async () => {
    asVerified("google-xyz", "u@g.com");
    User.findOne.mockResolvedValue(null);
    const res = makeRes();

    await controller.createOrGetUser({ body: { idToken: "valid.id.token" } }, res);

    expect(res.status).toHaveBeenCalledWith(201);
    const body = res.json.mock.calls[0][0];
    expect(body.isNewUser).toBe(true);
    expect(body.user.gmail).toBe("u@g.com");
    expect(body.token).toEqual(expect.any(String));
  });

  it("should return the existing user on a repeat Google OAuth login [FR1]", async () => {
    asVerified("google-xyz", "u@g.com");
    User.findOne.mockResolvedValue({ userId: "google-xyz", gmail: "u@g.com" });
    const res = makeRes();

    await controller.createOrGetUser({ body: { idToken: "valid.id.token" } }, res);

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ isNewUser: false })
    );
  });

  it("should 400 when no idToken is supplied [FR1]", async () => {
    const res = makeRes();
    await controller.createOrGetUser({ body: {} }, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(verifyFirebaseIdToken).not.toHaveBeenCalled();
  });

  it("should 401 when the idToken fails verification [FR1]", async () => {
    verifyFirebaseIdToken.mockRejectedValue(new Error("signature mismatch"));
    const res = makeRes();

    await controller.createOrGetUser({ body: { idToken: "forged.id.token" } }, res);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(User.findOne).not.toHaveBeenCalled();
  });

  it("should take the identity from the verified token, never from the body [FR1]", async () => {
    // The body claims to be the victim; the token says otherwise. The token wins.
    asVerified("attacker-uid", "attacker@evil.com");
    User.findOne.mockResolvedValue(null);
    const res = makeRes();

    await controller.createOrGetUser(
      { body: { idToken: "valid.id.token", userId: "victim-uid", gmail: "victim@g.com" } },
      res
    );

    const body = res.json.mock.calls[0][0];
    expect(body.user.userId).toBe("attacker-uid");
    expect(body.user.gmail).toBe("attacker@evil.com");
  });
});

// ─────────────────────────────────────────────────────────────────────────
// setupAccount — prop & live onboarding [FR3, FR19]
// ─────────────────────────────────────────────────────────────────────────
describe("setupAccount [FR3, FR19]", () => {
  it("should configure a prop_50k challenge with the correct starting balance & limits [FR3, FR19]", async () => {
    const user = { userId: "u1", save: jest.fn().mockResolvedValue(undefined) };
    User.findOne.mockResolvedValue(user);

    const res = makeRes();
    await controller.setupAccount(
      { params: { userId: "u1" }, body: { accountType: "prop_50k" } },
      res
    );

    expect(user.accountType).toBe("prop_50k");
    expect(user.accountBalance).toBe(50_000);
    expect(user.initialBalance).toBe(50_000);
    expect(user.profitTarget).toBe(3_000);   // 6%
    expect(user.maxLoss).toBe(2_000);        // 4%
    expect(user.challengeStartedAt).toBeInstanceOf(Date);
    expect(user.save).toHaveBeenCalled();
  });

  it("should configure a prop_100k challenge [FR19]", async () => {
    const user = { save: jest.fn().mockResolvedValue(undefined) };
    User.findOne.mockResolvedValue(user);
    const res = makeRes();
    await controller.setupAccount(
      { params: { userId: "u1" }, body: { accountType: "prop_100k" } },
      res
    );
    expect(user.accountBalance).toBe(100_000);
    expect(user.profitTarget).toBeCloseTo(6_000);
    expect(user.maxLoss).toBeCloseTo(4_000);
  });

  it("should configure a prop_150k challenge [FR19]", async () => {
    const user = { save: jest.fn().mockResolvedValue(undefined) };
    User.findOne.mockResolvedValue(user);
    const res = makeRes();
    await controller.setupAccount(
      { params: { userId: "u1" }, body: { accountType: "prop_150k" } },
      res
    );
    expect(user.accountBalance).toBe(150_000);
    expect(user.profitTarget).toBeCloseTo(9_000);
    expect(user.maxLoss).toBeCloseTo(6_000);
  });

  it("should configure a live account with user-supplied balance & no pass/fail limits [FR3]", async () => {
    const user = { save: jest.fn().mockResolvedValue(undefined) };
    User.findOne.mockResolvedValue(user);

    const res = makeRes();
    await controller.setupAccount(
      { params: { userId: "u1" }, body: { accountType: "live", balance: 25_000 } },
      res
    );

    expect(user.accountType).toBe("live");
    expect(user.accountBalance).toBe(25_000);
    expect(user.profitTarget).toBeNull();
    expect(user.maxLoss).toBeNull();
  });

  it("should reject a live account setup with a non-positive balance [FR3]", async () => {
    User.findOne.mockResolvedValue({ save: jest.fn() });
    const res = makeRes();
    await controller.setupAccount(
      { params: { userId: "u1" }, body: { accountType: "live", balance: 0 } },
      res
    );
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it("should reject unknown account types [FR3]", async () => {
    User.findOne.mockResolvedValue({ save: jest.fn() });
    const res = makeRes();
    await controller.setupAccount(
      { params: { userId: "u1" }, body: { accountType: "premium_1m" } },
      res
    );
    expect(res.status).toHaveBeenCalledWith(400);
  });
});

// ─────────────────────────────────────────────────────────────────────────
// reset & delete [FR20]
// ─────────────────────────────────────────────────────────────────────────
describe("resetTradingAccount [FR20]", () => {
  it("should force-close open/pending trades and clear challenge fields [FR20]", async () => {
    const user = {
      _id: "u-oid",
      userId: "u1",
      accountType: "prop_100k",
      accountBalance: 99_000,
      save: jest.fn().mockResolvedValue(undefined),
    };
    User.findOne.mockResolvedValue(user);

    const res = makeRes();
    await controller.resetTradingAccount({ params: { userId: "u1" } }, res);

    expect(Trade.updateMany).toHaveBeenCalledWith(
      { userId: "u-oid", status: { $in: ["open", "pending"] } },
      expect.objectContaining({ status: "closed", closeReason: "manual" })
    );
    expect(user.accountType).toBeNull();
    expect(user.accountBalance).toBeNull();
    expect(user.save).toHaveBeenCalled();
  });
});

describe("resetFullAccount [FR20]", () => {
  it("should delete all trades + journal entries and clear challenge fields [FR20]", async () => {
    const user = { _id: "u-oid", userId: "u1", save: jest.fn().mockResolvedValue(undefined) };
    User.findOne.mockResolvedValue(user);

    const res = makeRes();
    await controller.resetFullAccount({ params: { userId: "u1" } }, res);

    expect(Trade.deleteMany).toHaveBeenCalledWith({ userId: "u-oid" });
    expect(JournalEntry.deleteMany).toHaveBeenCalledWith({ userId: "u1" });
    expect(user.accountType).toBeNull();
  });
});

describe("deleteAccount [FR20]", () => {
  it("should delete the user and their trades + journal entries [FR20]", async () => {
    User.findOne.mockResolvedValue({ _id: "u-oid", userId: "u1" });
    User.deleteOne.mockResolvedValue({ deletedCount: 1 });

    const res = makeRes();
    await controller.deleteAccount({ params: { userId: "u1" } }, res);

    expect(Trade.deleteMany).toHaveBeenCalledWith({ userId: "u-oid" });
    expect(JournalEntry.deleteMany).toHaveBeenCalledWith({ userId: "u1" });
    expect(User.deleteOne).toHaveBeenCalledWith({ userId: "u1" });
  });

  it("should 404 when deleting a user that doesn't exist [FR20]", async () => {
    User.findOne.mockResolvedValue(null);
    const res = makeRes();
    await controller.deleteAccount({ params: { userId: "ghost" } }, res);
    expect(res.status).toHaveBeenCalledWith(404);
  });
});
