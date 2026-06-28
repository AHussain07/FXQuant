/**
 * Unit tests for controllers/emailAuthController.js
 *
 * Covers the email-OTP registration / sign-in flow. Nodemailer and the
 * User model are mocked so no SMTP or DB calls happen.
 *
 * Requirements covered:
 *   FR2 — Register / sign in via email + OTP code
 *   NFR5 — No raw passwords; userId is a SHA-256-derived hash of the email
 */

const mockSendMail = jest.fn().mockResolvedValue({ accepted: ["a@b.com"] });

jest.mock("nodemailer", () => ({
  createTransport: jest.fn(() => ({ sendMail: mockSendMail })),
}));

jest.mock("../models/User", () => {
  const save = jest.fn().mockImplementation(function () {
    return Promise.resolve(this);
  });
  const ctor = jest.fn().mockImplementation(function (fields) {
    Object.assign(this, fields);
    this.save = save;
  });
  ctor.findOne = jest.fn();
  return ctor;
});

const User = require("../models/User");
const { sendVerificationCode, verifyCode } = require("../controllers/emailAuthController");

const makeRes = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

beforeEach(() => {
  jest.clearAllMocks();
});

// ─────────────────────────────────────────────────────────────────────────
// sendVerificationCode [FR2]
// ─────────────────────────────────────────────────────────────────────────
describe("sendVerificationCode [FR2]", () => {
  it("should send an OTP email for a valid address [FR2]", async () => {
    const res = makeRes();
    await sendVerificationCode({ body: { email: "user@example.com" } }, res);

    expect(mockSendMail).toHaveBeenCalledTimes(1);
    const call = mockSendMail.mock.calls[0][0];
    expect(call.to).toBe("user@example.com");
    expect(call.subject).toMatch(/verification code/i);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ message: expect.any(String) }));
  });

  it("should 400 when email is missing [FR2]", async () => {
    const res = makeRes();
    await sendVerificationCode({ body: {} }, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it("should embed a 6-character hex code in the HTML body [FR2]", async () => {
    const res = makeRes();
    await sendVerificationCode({ body: { email: "user@example.com" } }, res);
    const { html } = mockSendMail.mock.calls[0][0];
    expect(html).toMatch(/[A-F0-9]{6}/);
  });
});

// ─────────────────────────────────────────────────────────────────────────
// verifyCode [FR2, NFR5]
// ─────────────────────────────────────────────────────────────────────────
describe("verifyCode [FR2, NFR5]", () => {
  const submit = async (email, code) => {
    const res = makeRes();
    await verifyCode({ body: { email, code } }, res);
    return res;
  };

  const getEmittedCode = () => {
    const html = mockSendMail.mock.calls[mockSendMail.mock.calls.length - 1][0].html;
    const match = html.match(/([A-F0-9]{6})/);
    return match[1];
  };

  it("should create a new user on first successful verify [FR2]", async () => {
    User.findOne.mockResolvedValue(null);
    const reqRes = makeRes();
    await sendVerificationCode({ body: { email: "new@example.com" } }, reqRes);
    const code = getEmittedCode();

    const res = await submit("new@example.com", code);
    expect(res.json).toHaveBeenCalled();
    const body = res.json.mock.calls[0][0];
    expect(body.isNewUser).toBe(true);
    expect(body.user.gmail).toBe("new@example.com");
  });

  it("should derive a deterministic userId from the email (no raw password stored) [NFR5]", async () => {
    User.findOne.mockResolvedValue(null);
    await sendVerificationCode({ body: { email: "stable@example.com" } }, makeRes());
    const code = getEmittedCode();
    const res = await submit("stable@example.com", code);
    const body = res.json.mock.calls[0][0];
    expect(body.user.userId).toMatch(/^email_[a-f0-9]{20}$/);
  });

  it("should reach the same userId for upper- and lower-case input of the same email [NFR5]", async () => {
    User.findOne.mockResolvedValue(null);

    await sendVerificationCode({ body: { email: "MixedCase@Example.com" } }, makeRes());
    const code1 = getEmittedCode();
    const r1 = await submit("MixedCase@Example.com", code1);
    const id1 = r1.json.mock.calls[0][0].user.userId;

    await sendVerificationCode({ body: { email: "mixedcase@example.com" } }, makeRes());
    const code2 = getEmittedCode();
    const r2 = await submit("mixedcase@example.com", code2);
    const id2 = r2.json.mock.calls[0][0].user.userId;

    expect(id1).toBe(id2);
  });

  it("should reject an invalid code [FR2]", async () => {
    User.findOne.mockResolvedValue(null);
    await sendVerificationCode({ body: { email: "bad@example.com" } }, makeRes());
    const res = await submit("bad@example.com", "000000");
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json.mock.calls[0][0].message).toMatch(/invalid verification code/i);
  });

  it("should refuse a verify with no prior send-code [FR2]", async () => {
    const res = await submit("noprior@example.com", "AAAAAA");
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json.mock.calls[0][0].message).toMatch(/no verification code found/i);
  });

  it("should burn the code on first successful use (one-shot) [FR2]", async () => {
    User.findOne.mockResolvedValue(null);
    await sendVerificationCode({ body: { email: "once@example.com" } }, makeRes());
    const code = getEmittedCode();

    await submit("once@example.com", code);         // first use: OK
    const r = await submit("once@example.com", code); // second use: gone
    expect(r.status).toHaveBeenCalledWith(400);
    expect(r.json.mock.calls[0][0].message).toMatch(/no verification code found/i);
  });

  it("should return the existing user on a repeat login (idempotent) [FR2]", async () => {
    User.findOne.mockResolvedValue({ userId: "email_fixed", gmail: "back@example.com" });
    await sendVerificationCode({ body: { email: "back@example.com" } }, makeRes());
    const code = getEmittedCode();
    const res = await submit("back@example.com", code);
    const body = res.json.mock.calls[0][0];
    expect(body.isNewUser).toBe(false);
    expect(body.user.gmail).toBe("back@example.com");
  });

  it("should 400 when email or code are missing [FR2]", async () => {
    const r = makeRes();
    await verifyCode({ body: {} }, r);
    expect(r.status).toHaveBeenCalledWith(400);
  });
});
